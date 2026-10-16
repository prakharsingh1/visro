const{test,before}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),{pathToFileURL}=require('node:url'),{build}=require('esbuild');
let fabric,environment,api;
before(async()=>{
 fabric=await import('fabric');environment=(await import('fabric/node')).getEnv();fabric.setEnv(environment);
 const bundle=await build({stdin:{contents:"export{StudioEditor}from'./src/editor';export{installEditorAccess}from'./src/editor-access';export{getLineEndpoints,isEditableLine}from'./src/line-editing';export{getShapeEffectBase}from'./src/shape-effects';",resolveDir:path.join(__dirname,'..')},bundle:true,platform:'node',format:'esm',external:['fabric'],write:false}),file=path.join(__dirname,`document-resize-engine-build-${process.pid}.mjs`);await fs.writeFile(file,bundle.outputFiles[0].text);try{api=await import(pathToFileURL(file).href);}finally{await fs.unlink(file);}
});
const studio=()=>new api.StudioEditor(environment.document.createElement('canvas'),{width:800,height:600});
const near=(a,b,label,tolerance=.001)=>assert.ok(Math.abs(a-b)<tolerance,`${label}: ${a} ≈ ${b}`);
const matrixNear=(actual,expected,label)=>actual.forEach((value,index)=>near(value,expected[index],`${label}[${index}]`,.03));
const keys=['left','top','width','height','originX','originY','angle','scaleX','scaleY','skewX','skewY','flipX','flipY','strokeWidth','strokeUniform'];
function own(raw){const shell=new fabric.FabricObject(Object.fromEntries(keys.filter(key=>raw[key]!==undefined).map(key=>[key,raw[key]])));try{return shell.calcOwnMatrix();}finally{shell.dispose();}}
function maybeRaw(objects,id,parent=[1,0,0,1,0,0]){for(const raw of objects){const matrix=fabric.util.multiplyTransformMatrices(parent,own(raw));if(raw.id===id)return{raw,matrix,parent};if(raw.objects){const nested=maybeRaw(raw.objects,id,matrix);if(nested)return nested;}}}
function rawTarget(objects,id){const result=maybeRaw(objects,id);assert.ok(result,`serialized ${id}`);return result;}
function rawEndpoints(found){return{start:new fabric.Point(found.raw.visroLine.start).transform(found.matrix),end:new fabric.Point(found.raw.visroLine.end).transform(found.matrix)};}
function endpointsScaled(actual,before,matrix,label,tolerance=.03){for(const end of['start','end']){const expected=before[end].transform(matrix);near(actual[end].x,expected.x,`${label} ${end} X`,tolerance);near(actual[end].y,expected.y,`${label} ${end} Y`,tolerance);}}
function prefixIds(raw,prefix){if(raw.id)raw.id=prefix+raw.id;if(raw.objects)raw.objects.forEach(child=>prefixIds(child,prefix));}
async function fixture(editor){
 editor.addShape('line',{center:{x:260,y:260}});editor.updateSelected({strokeWidth:6});editor.updateLineStyle({startMarker:'circle-outline',endMarker:'circle'});const line=editor.canvas.getActiveObject(),lineId=line.id;
 editor.addShape('rect',{center:{x:430,y:330}});const sibling=editor.canvas.getActiveObject(),siblingId=sibling.id;editor.canvas.discardActiveObject();editor.canvas.remove(line,sibling);
 const inner=new fabric.Group([line,sibling],{left:100,top:90,angle:27,scaleX:1.2,scaleY:.8}),outer=new fabric.Group([inner],{left:110,top:80,angle:-13,skewX:9});inner.id='resize-inner';outer.id='resize-outer';editor.canvas.add(outer);
 editor.addShape('rect',{center:{x:620,y:430}});await editor.setShapeEffect({preset:'echo'});editor.updateSelected({angle:31,opacity:.6});const effect=editor.canvas.getActiveObject(),effectId=effect.id;
 const project=editor.serialize(),inactive=structuredClone(project.pages[0]);inactive.id='resize-inactive';inactive.name='Inactive connectors';inactive.canvas.objects.forEach(raw=>prefixIds(raw,'inactive-'));
 const raster=environment.document.createElement('canvas');raster.width=2;raster.height=2;raster.getContext('2d').fillRect(0,0,2,2);const photo=new fabric.FabricImage(raster,{left:510,top:240,scaleX:12,scaleY:9,angle:19});photo.id='unloadable-photo';const savedPhoto=photo.toObject(fabric.FabricObject.customProperties);savedPhoto.src='https://invalid.example.test/never-decode-this-photo.png';photo.dispose();inactive.canvas.objects[0].objects[0].objects.push(savedPhoto);
 project.pages.push(inactive);await editor.loadProject(project);return{lineId,siblingId,effectId,photoId:savedPhoto.id};
}
async function assertRawMarkersRound(found){
 const[connector]=await fabric.util.enlivenObjects([found.raw]);try{fabric.util.applyTransformToObject(connector,found.matrix);for(const marker of connector.getObjects().slice(1)){
  const copy=await marker.clone();fabric.util.applyTransformToObject(copy,marker.calcTransformMatrix());copy.setPositionByOrigin(new fabric.Point(64,64),'center','center');copy.set({objectCaching:false});const canvas=new fabric.StaticCanvas(environment.document.createElement('canvas'),{width:128,height:128,enableRetinaScaling:false,renderOnAddRemove:false});try{canvas.add(copy);canvas.renderAll();const pixels=canvas.getContext().getImageData(0,0,128,128).data;let x1=128,y1=128,x2=-1,y2=-1,count=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>70){const pixel=(i-3)/4,x=pixel%128,y=Math.floor(pixel/128);x1=Math.min(x1,x);x2=Math.max(x2,x);y1=Math.min(y1,y);y2=Math.max(y2,y);count++;}assert.ok(count>20,'native marker must paint');assert.ok(Math.abs(x2-x1-y2+y1)<=1,`resized marker pixels must be round: ${x2-x1+1}×${y2-y1+1}`);}finally{await canvas.dispose();}
 }}finally{connector.dispose();}
}
async function raster(data){const image=environment.document.createElement('img');await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=data;});const canvas=environment.document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const context=canvas.getContext('2d');context.drawImage(image,0,0);return context.getImageData(0,0,canvas.width,canvas.height).data;}

test('anisotropic Resize design transforms active/inactive nested connectors in world space without decoding sibling photos; one Undo/Redo and reopen are exact',async(t)=>{
 const editor=studio(),reopened=studio();try{
  const ids=await fixture(editor),before=editor.serialize(),liveEndpoints=api.getLineEndpoints(editor.findObject(ids.lineId)),history=editor.historyIndex,scale=[1.5,0,0,.6,0,0],beforePhoto=rawTarget(before.pages[1].canvas.objects,ids.photoId),originalImageLoader=fabric.FabricImage.fromObject;let imageDecodes=0;
  fabric.FabricImage.fromObject=function(...args){imageDecodes++;return Reflect.apply(originalImageLoader,this,args);};
  try{await editor.resizeDesign(1200,360,{scaleContent:true});}finally{fabric.FabricImage.fromObject=originalImageLoader;}
  assert.equal(imageDecodes,0,'inactive missing image must not be decoded');assert.equal(editor.historyIndex,history+1);endpointsScaled(api.getLineEndpoints(editor.findObject(ids.lineId)),liveEndpoints,scale,'active native precision',.001);const resized=editor.serialize();assert.equal(resized.width,1200);assert.equal(resized.height,360);
  for(const[pageIndex,prefix]of[[0,''],[1,'inactive-']]){
   const source=before.pages[pageIndex].canvas.objects,result=resized.pages[pageIndex].canvas.objects,previous=rawTarget(source,prefix+ids.lineId),current=rawTarget(result,prefix+ids.lineId);endpointsScaled(rawEndpoints(current),rawEndpoints(previous),scale,`page${pageIndex}`);await assertRawMarkersRound(current);
   const siblingBefore=rawTarget(source,prefix+ids.siblingId),siblingAfter=rawTarget(result,prefix+ids.siblingId);matrixNear(siblingAfter.matrix,fabric.util.multiplyTransformMatrices(scale,siblingBefore.matrix),'sibling world matrix');
   const effectBefore=rawTarget(source,prefix+ids.effectId),effectAfter=rawTarget(result,prefix+ids.effectId);matrixNear(effectAfter.matrix,fabric.util.multiplyTransformMatrices(scale,effectBefore.matrix),'effect world matrix');assert.deepEqual(effectAfter.raw.objects,effectBefore.raw.objects,'effect offsets and native paint stay in their wrapper');assert.deepEqual(effectAfter.raw.visroShapeEffectBase,effectBefore.raw.visroShapeEffectBase,'original caching metadata stays exact');
  }
  const photoAfter=rawTarget(resized.pages[1].canvas.objects,ids.photoId);matrixNear(photoAfter.matrix,fabric.util.multiplyTransformMatrices(scale,beforePhoto.matrix),'photo world matrix');for(const key of Object.keys(beforePhoto.raw).filter(key=>!keys.includes(key)))assert.deepEqual(photoAfter.raw[key],beforePhoto.raw[key],`unrelated photo ${key}`);
  const pixels=await raster(await editor.exportImage({format:'png',scale:.3}));await reopened.loadProject(resized);assert.equal(JSON.stringify(reopened.serialize()),JSON.stringify(resized),'native JSON survives reopening');const restoredPixels=await raster(await reopened.exportImage({format:'png',scale:.3}));assert.equal(restoredPixels.length,pixels.length);let changed=0,totalError=0;for(let i=0;i<pixels.length;i+=4){let difference=0;for(let channel=0;channel<4;channel++)difference=Math.max(difference,Math.abs(pixels[i+channel]-restoredPixels[i+channel]));if(difference>8)changed++;totalError+=difference;}t.diagnostic(`reopened raster: ${changed} materially changed pixels of ${pixels.length/4}, mean channel error ${totalError/(pixels.length/4)}`);assert.ok(changed<pixels.length/4*.005,'native geometry must preserve painted area after reopening');assert.ok(totalError/(pixels.length/4)<.2,'rounded native JSON may change antialiasing, not visible artwork');
  await editor.undo();assert.equal(JSON.stringify(editor.serialize()),JSON.stringify(before),'one complete Resize Undo');await editor.redo();assert.equal(JSON.stringify(editor.serialize()),JSON.stringify(resized),'one complete Resize Redo');
 }finally{editor.destroy();reopened.destroy();}
});

test('queued Resize design rejects an intervening project load and viewing mode blocks async resize',async()=>{
 const editor=studio(),access=api.installEditorAccess(editor);try{
  editor.addShape('line');editor.updateLineStyle({endMarker:'circle'});const destination=editor.serialize();destination.name='Destination unchanged';destination.width=640;destination.height=480;
  const loading=editor.loadProject(destination),stale=editor.resizeDesign(1400,400,{scaleContent:true});await loading;await assert.rejects(stale,/editable/);assert.deepEqual(editor.serialize(),destination);
  await access.setMode('viewing');const before=editor.serialize();await editor.resizeDesign(1600,300,{scaleContent:true});assert.deepEqual(editor.serialize(),before);
 }finally{access.dispose();editor.destroy();}
});

test('changing access while inactive geometry prepares cancels the whole resize before any page is mutated',async()=>{
 const editor=studio(),access=api.installEditorAccess(editor);let release,original=fabric.Group.fromObject;try{
  await fixture(editor);const before=editor.serialize();let entered;const started=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve);fabric.Group.fromObject=async function(...args){entered();await gate;return Reflect.apply(original,this,args);};
  const pending=editor.resizeDesign(1200,360,{scaleContent:true});await started;const viewing=access.setMode('viewing');release();await assert.rejects(pending,/editable/);await viewing;assert.deepEqual(editor.serialize(),before,'cancellation leaves every page and native vector unchanged');
 }finally{fabric.Group.fromObject=original;release?.();access.dispose();editor.destroy();}
});

test('changing a rotated nonuniform shape to a catalog arrow rebuilds its marker under the final world transform in one Undo',async()=>{
 const editor=studio();try{
  editor.addShape('rect');editor.updateSelected({width:420,height:150,angle:27,opacity:.65});const before=editor.serialize(),source=editor.canvas.getActiveObject(),center=source.getCenterPoint(),id=source.id,history=editor.historyIndex;await editor.replaceShape('arrow-line');const connector=editor.canvas.getActiveObject();assert.equal(connector.id,id);assert.ok(api.isEditableLine(connector));assert.equal(editor.historyIndex,history+1);near(connector.opacity,.65,'source opacity');const endpoints=api.getLineEndpoints(connector);near((endpoints.start.x+endpoints.end.x)/2,center.x,'world anchor X');near((endpoints.start.y+endpoints.end.y)/2,center.y,'world anchor Y');
  const marker=connector.getObjects().at(-1),matrix=marker.calcTransformMatrix();for(const[index,value]of[[0,1],[1,0],[2,0],[3,1]])near(matrix[index],value,'marker uses world-space geometry');assert.ok(marker.path.some(command=>command[0]==='L'),'the native arrow must paint real paths');await editor.undo();assert.equal(JSON.stringify(editor.serialize()),JSON.stringify(before),'one shape replacement Undo restores exact source');
 }finally{editor.destroy();}
});
