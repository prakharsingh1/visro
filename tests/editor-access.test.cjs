const {test,before}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {build}=require('esbuild');
let StudioEditor,installEditorAccess,EDITOR_MUTATIONS,environment;
before(async()=>{
 const browserFabric=await import('fabric'),nativeFabric=await import('fabric/node');environment=nativeFabric.getEnv();browserFabric.setEnv(environment);
 const result=await build({stdin:{contents:"export {StudioEditor} from './src/editor'; export {installEditorAccess,EDITOR_MUTATIONS} from './src/editor-access';",resolveDir:path.join(__dirname,'..'),loader:'ts'},bundle:true,platform:'node',format:'esm',external:['fabric'],write:false});
 const file=path.join(__dirname,`editor-access-build-${process.pid}.mjs`);await fs.writeFile(file,result.outputFiles[0].text);try{({StudioEditor,installEditorAccess,EDITOR_MUTATIONS}=await import(pathToFileURL(file).href));}finally{await fs.unlink(file);}
});
function studio(){return new StudioEditor(environment.document.createElement('canvas'),{width:500,height:500});}

test('Viewing and Commenting block every registered document mutation while navigation and export stay available',async()=>{
 const editor=studio(),access=installEditorAccess(editor);
 try{
  editor.addShape('circle');await editor.addPage();editor.addText('body');const pages=editor.state.pages;
  for(const mode of ['viewing','commenting']){
   await access.setMode(mode);assert.equal(access.getMode(),mode);assert.equal(editor.canvas.selection,false);assert.equal(editor.canvas.skipTargetFind,true);assert.equal(editor.selected,null);
   const document=editor.serialize(),revision=editor.state.revision;
   for(const name of EDITOR_MUTATIONS){assert.equal(typeof editor[name],'function',`${name} must stay in the guard registry`);await editor[name]();}
   assert.deepEqual(editor.serialize(),document);assert.equal(editor.state.revision,revision);
   editor.pan(10,-12);editor.setZoom(.6);assert.equal(editor.state.zoom,.6);assert.match(await editor.exportImage(),/^data:image\/png/);assert.match(await editor.previewPage(pages[0].id,.15),/^data:image\//);
   await editor.setPage(pages[0].id);editor.canvas.renderAll();assert.equal(editor.canvas.skipTargetFind,true);assert.equal(editor.canvas.selection,false);assert.equal(editor.selected,null);
  }
  await access.setMode('editing');assert.equal(editor.canvas.selection,true);assert.equal(editor.canvas.skipTargetFind,false);const count=editor.canvas.getObjects().length;editor.addShape('rect');assert.equal(editor.canvas.getObjects().length,count+1);editor.nudge(10,0);editor.flushPendingChanges();assert.ok(editor.selected);
 }finally{access.dispose();editor.destroy();}
});

test('Readonly view blocks real canvas drag and text entry, then restores pointer editing',async()=>{
 const editor=studio(),access=installEditorAccess(editor);
 try{
  editor.addShape('rect');const object=editor.canvas.getActiveObject(),id=object.id;editor.updateSelected({left:100,top:100,width:100,height:100});editor.setZoom(1);const snapshot=editor.serialize();
  await access.setMode('viewing');editor.canvas.renderAll();const v=editor.canvas.viewportTransform,x=150+v[4],y=150+v[5],event=(type,x,y,buttons)=>new environment.window.MouseEvent(type,{clientX:x,clientY:y,buttons,button:0,bubbles:true});
  editor.canvas.upperCanvasEl.dispatchEvent(event('mousedown',x,y,1));environment.document.dispatchEvent(event('mousemove',x+80,y+40,1));environment.document.dispatchEvent(event('mouseup',x+80,y+40,0));
  assert.deepEqual(editor.serialize(),snapshot);assert.equal(editor.selected,null);assert.equal(editor.editSelectedText(),false);
  await access.setMode('editing');editor.selectLayer(id);editor.nudge(13,7);editor.flushPendingChanges();assert.equal(editor.selected.left,113);assert.equal(editor.selected.top,107);
 }finally{access.dispose();editor.destroy();}
});

test('Space pan release cannot reopen pointer editing between frames in Viewing or Commenting',async()=>{
 const editor=studio(),access=installEditorAccess(editor);
 try{
  editor.addShape('rect');editor.updateSelected({left:100,top:100,width:100,height:100});editor.setZoom(1);
  const object=editor.canvas.getActiveObject(),snapshot=editor.serialize(),revision=editor.state.revision;
  const drag=()=>{const v=editor.canvas.viewportTransform,x=150+v[4],y=150+v[5],event=(type,x,y,buttons)=>new environment.window.MouseEvent(type,{clientX:x,clientY:y,buttons,button:0,bubbles:true});editor.canvas.upperCanvasEl.dispatchEvent(event('mousedown',x,y,1));environment.document.dispatchEvent(event('mousemove',x+80,y+40,1));environment.document.dispatchEvent(event('mouseup',x+80,y+40,0));};
  for(const mode of ['viewing','commenting']){
   await access.setMode(mode);editor.canvas.renderAll();
   editor.setPanMode(true);editor.setPanMode(false);
   // No render, await, or animation frame is allowed between release and drag.
   assert.equal(editor.canvas.selection,false);assert.equal(editor.canvas.skipTargetFind,true);drag();
   assert.deepEqual(editor.serialize(),snapshot);assert.equal(editor.state.revision,revision);assert.equal(editor.selected,null);
  }
  await access.setMode('editing');editor.canvas.renderAll();editor.setPanMode(true);editor.setPanMode(false);drag();
  assert.equal(object.left,180);assert.equal(object.top,140);assert.equal(editor.selected.id,object.id);
 }finally{access.dispose();editor.destroy();}
});

test('rapid mode changes apply the last choice and disposal restores original methods',async()=>{
 const editor=studio(),original=editor.addShape,originalPan=editor.setPanMode,access=installEditorAccess(editor);
 try{await Promise.all([access.setMode('viewing'),access.setMode('commenting'),access.setMode('editing')]);assert.equal(access.getMode(),'editing');assert.equal(editor.canvas.skipTargetFind,false);editor.addShape('circle');assert.ok(editor.selected);await access.setMode('viewing');access.dispose();assert.equal(editor.addShape,original);assert.equal(editor.setPanMode,originalPan);}finally{editor.destroy();}
});
