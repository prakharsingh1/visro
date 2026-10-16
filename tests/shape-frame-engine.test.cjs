const {test,before}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {build}=require('esbuild');
let StudioEditor,installEditorAccess,EDITOR_MUTATIONS,fabric,environment;
before(async()=>{
 fabric=await import('fabric');environment=(await import('fabric/node')).getEnv();fabric.setEnv(environment);
 const result=await build({stdin:{contents:"export {StudioEditor} from './src/editor';export {installEditorAccess,EDITOR_MUTATIONS} from './src/editor-access';",resolveDir:path.join(__dirname,'..'),loader:'ts'},bundle:true,platform:'node',format:'esm',external:['fabric'],write:false}),temporary=path.join(__dirname,`shape-frame-engine-build-${process.pid}.mjs`);await fs.writeFile(temporary,result.outputFiles[0].text);
 try{({StudioEditor,installEditorAccess,EDITOR_MUTATIONS}=await import(pathToFileURL(temporary).href));}finally{await fs.unlink(temporary);}
});
const studio=()=>new StudioEditor(environment.document.createElement('canvas'),{width:600,height:500});
const near=(a,b,label)=>assert.ok(Math.abs(a-b)<.0001,`${label}: ${a} ≈ ${b}`);
const matrixNear=(actual,expected)=>actual.forEach((value,index)=>near(value,expected[index],`matrix${index}`));
// Fabric normalizes omitted no-stroke/no-dash values to null when enlivening JSON.
function paintDefaults(value){if(Array.isArray(value))return value.map(paintDefaults);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key,item])=>!(item===null&&['stroke','strokeDashArray'].includes(key))).map(([key,item])=>[key,paintDefaults(item)]));return typeof value==='number'&&Object.is(value,-0)?0:value;}
function stripedPhoto(){const canvas=environment.document.createElement('canvas');canvas.width=600;canvas.height=200;const ctx=canvas.getContext('2d');['#ff0000','#00ff00','#0000ff'].forEach((color,index)=>{ctx.fillStyle=color;ctx.fillRect(index*200,0,200,200);});return canvas.toDataURL();}
const provenance={id:'commons:123',title:'File:Example.jpg',artist:'Original contributor',license:'CC0',licenseUrl:'https://creativecommons.org/publicdomain/zero/1.0/',sourceUrl:'https://commons.wikimedia.org/wiki/File:Example.jpg'};
function frameWithID(editor,id){const find=objects=>{for(const object of objects){if(object.id===id)return object;if(object instanceof fabric.Group){const child=find(object.getObjects());if(child)return child;}}};return find(editor.canvas.getObjects());}

// These tests intentionally wait for the root's real queued engine API. They do
// not substitute a helper call or manually add its result to the live canvas.
test('queued shape conversion preserves ID, order, paint style, metadata and viewport as one Undo',async()=>{
 const editor=studio();try{
  assert.equal(typeof editor.convertSelectedShapeToFrame,'function');
  editor.addShape('rect');const back=editor.selected.id;editor.addShape('heart');const source=editor.canvas.getActiveObject(),id=source.id;source.set('shadow',new fabric.Shadow({color:'#11223388',blur:8,offsetX:3,offsetY:5}));editor.updateSelected({left:137.25,top:98.5,width:215,height:180,angle:23,opacity:.63});editor.setElementMetadata({altText:'Original custom shape',link:'https://example.com'});editor.flip('horizontal');editor.addShape('circle');const front=editor.selected.id;editor.selectLayer(id);editor.setZoom(1.6);editor.pan(-73.25,46.5);
  const before=editor.serialize(),viewport=[...editor.canvas.viewportTransform],revision=editor.state.revision,sourceObject=JSON.stringify(source.toObject(['id','visroMetadata'])),sourceMatrix=source.calcTransformMatrix(),sourceShadow=source.shadow.toObject();
  await editor.convertSelectedShapeToFrame();const frame=editor.canvas.getActiveObject();
  assert.ok(frame instanceof fabric.FabricImage);assert.equal(frame.id,id);assert.deepEqual(editor.canvas.getObjects().map(o=>o.id),[back,id,front]);assert.equal(frame.visroFrame,'custom-shape');assert.equal(frame.visroEmptyFrame,true);assert.equal(frame.opacity,.63);assert.deepEqual(frame.shadow.toObject(),sourceShadow);assert.deepEqual(frame.visroMetadata,source.visroMetadata);assert.deepEqual(editor.canvas.viewportTransform,viewport);assert.equal(editor.state.revision,revision+1);assert.equal(JSON.stringify(source.toObject(['id','visroMetadata'])),sourceObject);
  const ratio=frame.width/source.width;matrixNear(fabric.util.multiplyTransformMatrices(frame.calcTransformMatrix(),[ratio,0,0,ratio,0,0]),sourceMatrix);
  const converted=editor.serialize();await editor.undo();assert.deepEqual(paintDefaults(editor.serialize()),paintDefaults(before));assert.equal(editor.selected.id,id);assert.deepEqual(editor.canvas.viewportTransform,viewport);await editor.redo();assert.deepEqual(paintDefaults(editor.serialize()),paintDefaults(converted));assert.equal(editor.selected.id,id);assert.deepEqual(editor.canvas.viewportTransform,viewport);
 }finally{editor.destroy();}
});

test('converted custom frames accept cover fill and crop with one Undo each and portable reopen',async()=>{
 const editor=studio();try{
  editor.addShape('circle');editor.updateSelected({left:150,top:130,width:180,height:180});const id=editor.selected.id;await editor.convertSelectedShapeToFrame();const empty=editor.serialize(),frame=editor.canvas.getActiveObject(),center=frame.getCenterPoint();editor.canvas.renderAll();assert.equal(editor.frameAt(center),id);
  await editor.addImage(stripedPhoto(),'Public image',{targetFrameId:id,source:provenance});assert.equal(frameWithID(editor,id),frame);assert.equal(frame.visroEmptyFrame,false);assert.equal(frame.visroFrame,'custom-shape');assert.ok(frame.cropX>0);assert.deepEqual(frame.visroMetadata.source,provenance);const filled=editor.serialize();
  const output=await editor.exportImage({transparent:true,scale:1}),decoded=await fabric.FabricImage.fromURL(output),canvas=environment.document.createElement('canvas');canvas.width=600;canvas.height=500;canvas.getContext('2d').drawImage(decoded.getElement(),0,0);assert.deepEqual([...canvas.getContext('2d').getImageData(Math.round(center.x),Math.round(center.y),1,1).data],[0,255,0,255]);
  editor.cropSelectedImage({left:210,top:20,width:160,height:160});assert.equal(frame.id,id);assert.equal(frame.clipPath.type.toLowerCase(),'circle');await editor.undo();assert.deepEqual(editor.serialize(),filled);await editor.undo();assert.deepEqual(editor.serialize(),empty);await editor.redo();assert.deepEqual(editor.serialize(),filled);
  const saved=JSON.parse(JSON.stringify(editor.serialize())),reopened=studio();try{await reopened.loadProject(saved);const restored=frameWithID(reopened,id);assert.ok(restored.getSrc().startsWith('data:image/png;base64,'));assert.equal(restored.visroFrame,'custom-shape');assert.equal(restored.clipPath.type.toLowerCase(),'circle');assert.deepEqual(restored.visroMetadata.source,provenance);reopened.selectLayer(id);await reopened.addImage(stripedPhoto(),'Second image',{targetFrameId:id});assert.equal(reopened.canvas.getObjects().length,1);assert.equal(reopened.selected.id,id);}finally{reopened.destroy();}
 }finally{editor.destroy();}
});

test('grouped-child conversion retains the complete scene matrix and sibling placement',async()=>{
 const editor=studio();try{
  editor.addShape('heart');editor.updateSelected({left:70,top:90,width:140,height:125,angle:13});const id=editor.selected.id;editor.addShape('rect');editor.updateSelected({left:310,top:130,width:90,height:85});editor.selectAll();editor.group();editor.updateSelected({angle:27,left:160,top:110,width:440,height:230});const group=editor.canvas.getActiveObject(),groupId=group.id,source=frameWithID(editor,id),sibling=group.getObjects().find(o=>o.id!==id),sourceMatrix=source.calcTransformMatrix(),siblingMatrix=sibling.calcTransformMatrix();editor.selectLayer(id);
  await editor.convertSelectedShapeToFrame();const frame=frameWithID(editor,id);assert.ok(frame instanceof fabric.FabricImage);assert.equal(editor.canvas.getObjects().length,1);assert.equal(editor.canvas.getObjects()[0].id,groupId);assert.equal(frame.group,editor.canvas.getObjects()[0]);assert.equal(frame.group.getObjects().length,2);matrixNear(sibling.calcTransformMatrix(),siblingMatrix);const ratio=frame.width/source.width;matrixNear(fabric.util.multiplyTransformMatrices(frame.calcTransformMatrix(),[ratio,0,0,ratio,0,0]),sourceMatrix);
 }finally{editor.destroy();}
});

async function decodeGate(){const original=fabric.FabricImage.fromURL;let release,enter;const gate=new Promise(resolve=>release=resolve),entered=new Promise(resolve=>enter=resolve);fabric.FabricImage.fromURL=async(...args)=>{enter();await gate;return original.apply(fabric.FabricImage,args);};return{entered,release,restore:()=>{fabric.FabricImage.fromURL=original;}};}
async function waitForGate(promise){let timer;try{await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('The conversion did not reach its image decoder.')),5000);})]);}finally{clearTimeout(timer);}}

test('delayed conversions reject deletion and lock changes without restoring or converting a stale target',async()=>{
 for(const action of ['delete','lock']){
  const editor=studio();let gate;try{
   editor.addShape('circle');const id=editor.selected.id;gate=await decodeGate();const converting=editor.convertSelectedShapeToFrame();converting.catch(()=>{});await waitForGate(gate.entered);
   if(action==='delete')editor.remove();else editor.setLayerLocked(id,true);const guardedState=editor.serialize(),revision=editor.state.revision;gate.release();await assert.rejects(converting,/removed|available|locked|changed/);assert.deepEqual(editor.serialize(),guardedState);assert.equal(editor.state.revision,revision);assert.equal(action==='delete'?frameWithID(editor,id):frameWithID(editor,id)?.visroFrame,undefined);
  }finally{gate?.release();gate?.restore();editor.destroy();}
 }
});

test('queued conversion rejects a departed origin page and already locked or unsupported sources',async()=>{
 const editor=studio();try{
  editor.addShape('circle');const id=editor.selected.id;editor.setLayerLocked(id,true);await assert.rejects(editor.convertSelectedShapeToFrame(),/unlocked|locked|shape/);editor.setLayerLocked(id,false);
  const origin=editor.state.activePageId,pageChange=editor.addPage(),converting=editor.convertSelectedShapeToFrame();converting.catch(()=>{});await pageChange;await assert.rejects(converting,/page changed|origin|shape|available/);assert.equal(editor.canvas.getObjects().length,0);assert.equal(editor.serialize().pages.find(page=>page.id===origin).canvas.objects[0].visroFrame,undefined);
  editor.addText();await assert.rejects(editor.convertSelectedShapeToFrame(),/shape|Text/);
 }finally{editor.destroy();}
});

test('Viewing and Commenting deny the asynchronous conversion entry point without mutating the source',async()=>{
 const editor=studio(),access=installEditorAccess(editor);try{
  assert.ok(EDITOR_MUTATIONS.includes('convertSelectedShapeToFrame'));
  editor.addShape('heart');for(const mode of ['viewing','commenting']){await access.setMode(mode);const before=editor.serialize(),revision=editor.state.revision,result=editor.convertSelectedShapeToFrame();assert.equal(typeof result?.then,'function','blocked async mutation retains its Promise contract');await result;assert.deepEqual(editor.serialize(),before);assert.equal(editor.state.revision,revision);}
 }finally{access.dispose();editor.destroy();}
});

test('ungrouped SVG-style plain text supports whole-label styles and case without IText-only list handlers',async()=>{
 const editor=studio();try{
  const label=new fabric.FabricText('Alpha\nBeta',{left:100,top:110,fontSize:30,fontWeight:500,fill:'#000000'});label.id='plain-svg-label';editor.canvas.add(label);editor.selectLayer(label.id);editor.updateSelected({text:label.text});
  assert.equal(editor.updateSelectedTextStyle({fill:'#123456',fontWeight:600}),true);assert.equal(label.fill,'#123456');assert.equal(editor.selected.fontWeight,600);
  const beforeEnter=editor.serialize(),revision=editor.state.revision;assert.equal(editor.editSelectedText(),false);assert.deepEqual(editor.serialize(),beforeEnter);assert.equal(editor.state.revision,revision);
  assert.equal(editor.formatSelectedText({type:'case',value:'upper'}),true);assert.equal(label.text,'ALPHA\nBETA');assert.equal(editor.continueSelectedTextList(),false);assert.equal(editor.indentSelectedTextList(1),false);await editor.undo();assert.equal(editor.selected.id,label.id);assert.equal(editor.canvas.getActiveObject().text,'Alpha\nBeta');
 }finally{editor.destroy();}
});
