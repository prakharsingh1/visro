const {test,before}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),{pathToFileURL}=require('node:url'),{build}=require('esbuild');
let api,fabric,environment;
before(async()=>{
 fabric=await import('fabric');environment=(await import('fabric/node')).getEnv();fabric.setEnv(environment);fabric.FabricObject.customProperties=[...new Set([...fabric.FabricObject.customProperties,'id','visroLine'])];
 const output=await build({entryPoints:[path.join(__dirname,'../src/line-editing.ts')],bundle:true,platform:'node',format:'esm',external:['fabric'],write:false}),file=path.join(__dirname,`line-pointer-build-${process.pid}.mjs`);await fs.writeFile(file,output.outputFiles[0].text);try{api=await import(pathToFileURL(file).href);}finally{await fs.unlink(file);}
});
const near=(actual,expected,message,tolerance=1e-5)=>assert.ok(actual.distanceFrom(expected)<tolerance,`${message}: ${JSON.stringify(actual)} versus ${JSON.stringify(expected)}`);
function drag(canvas,scene,dx,dy){
 const pointer=scene.transform(canvas.viewportTransform),event=(type,x,y,buttons)=>new environment.window.MouseEvent(type,{clientX:x,clientY:y,button:0,buttons,bubbles:true});
 canvas.upperCanvasEl.dispatchEvent(event('mousedown',pointer.x,pointer.y,1));
 for(let step=1;step<=6;step++)environment.document.dispatchEvent(event('mousemove',pointer.x+dx*step/6,pointer.y+dy*step/6,1));
 environment.document.dispatchEvent(event('mouseup',pointer.x+dx,pointer.y+dy,0));
}

test('real DOM endpoint gestures on a transformed nested connector retain identity, siblings and one final modification',async()=>{
 const canvas=new fabric.Canvas(environment.document.createElement('canvas'),{width:900,height:700,enableRetinaScaling:false,renderOnAddRemove:false}),line=new fabric.Line([0,0,180,70],{stroke:'#c52969',strokeWidth:7}),connector=api.updateLineObject(line,{route:'curved',startMarker:'bar',endMarker:'triangle'});connector.id='real-nested-connector';
 const sibling=new fabric.Rect({left:250,top:120,width:50,height:40,fill:'#236ab0'}),inner=new fabric.Group([connector,sibling],{left:90,top:70,angle:13,scaleX:1.2,scaleY:.8,skewX:7}),outer=new fabric.Group([inner],{left:60,top:50,angle:-7,scaleX:.9,scaleY:1.1});
 canvas.add(outer);canvas.setViewportTransform([.8,0,0,.8,30,20]);api.installLineControls(connector);canvas.setActiveObject(connector);canvas.renderAll();
 const before=api.getLineEndpoints(connector),siblingMatrix=sibling.calcTransformMatrix(),id=connector.id;let modified=0;canvas.on('object:modified',()=>modified++);
 try{
  for(let count=0;count<20;count++){
   const endpoint=api.getLineEndpoints(connector).end,dx=count%2?-12:12,dy=count%2?-8:8;drag(canvas,endpoint,dx,dy);
   const after=api.getLineEndpoints(connector);near(after.start,before.start,'The opposite scene anchor cannot move');near(after.end,endpoint.add(new fabric.Point(dx/.8,dy/.8)),'The actual mouse gesture must move the chosen endpoint');
   assert.equal(canvas.getActiveObject(),connector);assert.equal(connector.id,id);assert.equal(connector.getObjects().length,3,'Rebuilding marker paint cannot accumulate native children');assert.equal(modified,count+1,'Each complete pointer gesture must emit one modification');
   sibling.calcTransformMatrix().forEach((value,index)=>assert.ok(Math.abs(value-siblingMatrix[index])<1e-5,'Endpoint gestures cannot move unrelated siblings'));
  }
  const json=canvas.toJSON(),svg=canvas.toSVG();assert.match(svg,/<path/);assert.ok((svg.match(/<path/g)||[]).length>=3);
  await canvas.loadFromJSON(json);const find=object=>object.id===id?object:object instanceof fabric.Group?object.getObjects().map(find).find(Boolean):undefined,loaded=canvas.getObjects().map(find).find(Boolean);assert.ok(loaded instanceof fabric.Group);api.installLineControls(loaded);assert.ok(loaded.controls.start&&loaded.controls.end);near(api.getLineEndpoints(loaded).start,before.start,'Reopened start',.1);near(api.getLineEndpoints(loaded).end,before.end,'Reopened end',.1);
  canvas.renderAll();const pixels=canvas.getContext().getImageData(0,0,900,700).data;let ink=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]>100)ink++;assert.ok(ink>300,'The repeated gesture/reopen workflow must still paint real native artwork');
 }finally{await canvas.dispose();}
});
