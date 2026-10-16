const {test,before}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {build}=require('esbuild');
let StudioEditor,installEditorAccess,environment,fabric,MOCKUPS;
before(async()=>{
 fabric=await import('fabric');environment=(await import('fabric/node')).getEnv();fabric.setEnv(environment);
 const output=await build({stdin:{contents:"export {StudioEditor} from './src/editor';export {installEditorAccess} from './src/editor-access';export {MOCKUPS} from './src/mockups';",resolveDir:path.join(__dirname,'..')},bundle:true,platform:'node',format:'esm',external:['fabric'],write:false});
 const temporary=path.join(__dirname,`mockups-engine-build-${process.pid}.mjs`);await fs.writeFile(temporary,output.outputFiles[0].text);
 try{({StudioEditor,installEditorAccess,MOCKUPS}=await import(pathToFileURL(temporary).href));}finally{await fs.unlink(temporary);}
});
const editor=()=>new StudioEditor(environment.document.createElement('canvas'),{width:1000,height:800});
function png(){const canvas=environment.document.createElement('canvas');canvas.width=600;canvas.height=300;const ctx=canvas.getContext('2d');ctx.fillStyle='#ff3344';ctx.fillRect(0,0,300,300);ctx.fillStyle='#22aa66';ctx.fillRect(300,0,300,300);return canvas.toDataURL();}
const near=(a,b)=>assert.ok(Math.abs(a-b)<.0001,`${a} differs from ${b}`);
const json=studio=>JSON.parse(JSON.stringify(studio.serialize()));

test('every original mockup is a native editable group with one real image frame and one history step',async()=>{
 assert.ok(MOCKUPS.length>=12);assert.equal(new Set(MOCKUPS.map(item=>item.id)).size,MOCKUPS.length);
 for(const item of MOCKUPS){
  const studio=editor();try{
   await studio.insertMockup(item.id,{center:{x:501.25,y:390.75},pageId:studio.activePageId});
   const group=studio.canvas.getActiveObject(),children=group.getObjects(),images=children.filter(child=>child instanceof fabric.FabricImage);
   assert.ok(group instanceof fabric.Group);assert.equal(group.visroMockupId,item.id);assert.equal(images.length,1);
   assert.ok(children.filter(child=>!(child instanceof fabric.FabricImage)).every(child=>child instanceof fabric.Path));
   const frame=images[0];assert.equal(frame.visroFrame,'custom-shape');assert.equal(frame.visroEmptyFrame,true);assert.ok(frame.clipPath instanceof fabric.Rect);
   assert.equal(new Set([group.id,...children.map(child=>child.id)]).size,children.length+1);
   near(group.getCenterPoint().x,501.25);near(group.getCenterPoint().y,390.75);
   studio.canvas.renderAll();assert.equal(studio.frameAt(frame.getCenterPoint()),frame.id);
   for(const value of Object.values(group.getBoundingRect()))assert.ok(Number.isFinite(value));
   const saved=json(studio);await studio.undo();assert.equal(studio.canvas.getObjects().length,0);await studio.redo();assert.deepEqual(json(studio),saved);
   await studio.loadProject(saved);assert.deepEqual(json(studio),saved);assert.equal(studio.canvas.getObjects()[0].visroMockupId,item.id);
  }finally{studio.destroy();}
 }
});

test('a photo fills a rotated mockup in place while preserving the device, mask, siblings and exact history',async()=>{
 const studio=editor();try{
  await studio.insertMockup('phone-portrait');const group=studio.canvas.getActiveObject();studio.updateSelected({left:320.25,top:140.5,angle:23});
  const frame=group.getObjects().find(child=>child instanceof fabric.FabricImage),siblings=group.getObjects().filter(child=>child!==frame),id=frame.id,parent=[...group.calcTransformMatrix()],siblingMatrices=siblings.map(child=>child.calcTransformMatrix()),corners=frame.getCoords().map(point=>({x:point.x,y:point.y})),empty=json(studio);
  studio.canvas.renderAll();assert.equal(studio.frameAt(frame.getCenterPoint()),id);
  await studio.addImage(png(),'Mockup source',{targetFrameId:id,pageId:studio.activePageId});
  assert.equal(frame.id,id);assert.equal(frame.visroEmptyFrame,false);assert.deepEqual(group.calcTransformMatrix(),parent);assert.deepEqual(siblings.map(child=>child.calcTransformMatrix()),siblingMatrices);
  frame.getCoords().forEach((point,index)=>{near(point.x,corners[index].x);near(point.y,corners[index].y);});
  const filled=json(studio);await studio.undo();assert.deepEqual(json(studio),empty);await studio.redo();assert.deepEqual(json(studio),filled);
  await studio.loadProject(filled);assert.deepEqual(json(studio),filled);const reopened=studio.canvas.getObjects()[0];assert.equal(reopened.visroMockupId,'phone-portrait');assert.equal(reopened.getObjects().find(child=>child instanceof fabric.FabricImage).id,id);
 }finally{studio.destroy();}
});

test('view and comment modes reject mockup insertion including an already-queued request',async()=>{
 const studio=editor(),access=installEditorAccess(studio);try{
  for(const mode of ['viewing','commenting']){await access.setMode(mode);const before=json(studio);await studio.insertMockup('laptop');assert.deepEqual(json(studio),before);}
  await access.setMode('editing');let release;studio.asyncQueue=new Promise(resolve=>{release=resolve;});
  const pending=studio.insertMockup('browser-window'),changing=access.setMode('viewing');release();
  await assert.rejects(pending,/editable/);await changing;assert.equal(studio.canvas.getObjects().length,0);
 }finally{access.dispose();studio.destroy();}
});

test('invalid mockups and stale page placement do not create an undo boundary or native object',async()=>{
 const studio=editor();try{
  const before=json(studio),undo=studio.state.canUndo;await assert.rejects(studio.insertMockup('missing'),/Choose a mockup/);assert.deepEqual(json(studio),before);
  await assert.rejects(studio.insertMockup('laptop',{pageId:'departed-page'}),/page changed/);assert.deepEqual(json(studio),before);assert.equal(studio.state.canUndo,undo);
 }finally{studio.destroy();}
});
