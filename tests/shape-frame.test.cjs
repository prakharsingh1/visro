const {test,before}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {build}=require('esbuild');
let fabric,environment,convertShapeToFrameObject,getShapeFramePlaceholder;
before(async()=>{
 fabric=await import('fabric');environment=(await import('fabric/node')).getEnv();fabric.setEnv(environment);
 const result=await build({entryPoints:[path.join(__dirname,'../src/shape-frame.ts')],bundle:true,platform:'node',format:'esm',external:['fabric'],write:false}),temporary=path.join(__dirname,`shape-frame-build-${process.pid}.mjs`);await fs.writeFile(temporary,result.outputFiles[0].text);
 try{({convertShapeToFrameObject,getShapeFramePlaceholder}=await import(pathToFileURL(temporary).href));}finally{await fs.unlink(temporary);}
});
const near=(a,b,label)=>assert.ok(Math.abs(a-b)<1e-6,`${label}: ${a} ≈ ${b}`);
function sample(canvas,x,y){return[...canvas.getContext('2d').getImageData(Math.round(x),Math.round(y),1,1).data];}
function canvas(width=500,height=500){return new fabric.StaticCanvas(environment.document.createElement('canvas'),{width,height,enableRetinaScaling:false,renderOnAddRemove:false});}
const customProps=['id','visroName','visroFrame','visroEmptyFrame','visroMetadata'];

test('shared frame placeholder is one original local raster with decoded sky/hill pixels',async()=>{
 const first=getShapeFramePlaceholder(),second=getShapeFramePlaceholder();assert.equal(first,second);const data=await first;assert.ok(data.startsWith('data:image/png;base64,'));const image=await fabric.FabricImage.fromURL(data);assert.equal(image.width,1000);assert.equal(image.height,1000);
 const target=environment.document.createElement('canvas');target.width=1000;target.height=1000;target.getContext('2d').drawImage(image.getElement(),0,0);assert.deepEqual(sample(target,20,20),[190,217,236,255]);assert.deepEqual(sample(target,500,970),[86,125,101,255]);
});

test('actual transformed native path, polygon and circle retain geometry, affine center and editable clip after conversion',async()=>{
 const definitions=[new fabric.Path('M0 0 H140 V35 L90 90 H0 Z'),new fabric.Polygon([{x:0,y:0},{x:130,y:20},{x:100,y:110},{x:20,y:85}]),new fabric.Circle({radius:70})];
 for(const[ index,shape]of definitions.entries()){
  shape.set({left:117.25,top:93.5,angle:27,skewX:11,skewY:4,scaleX:1.3,scaleY:.8,flipX:true,fill:'#ff0000',strokeWidth:0,opacity:.7});shape.id='shape'+index;shape.visroName='Custom';shape.visroMetadata={altText:'Keep this',link:'https://example.com'};const before=JSON.stringify(shape.toObject(customProps)),matrix=shape.calcTransformMatrix(),center=shape.getCenterPoint();
  const frame=await convertShapeToFrameObject(shape),factor=frame.width/shape.width,effective=fabric.util.multiplyTransformMatrices(frame.calcTransformMatrix(),[factor,0,0,factor,0,0]);
  assert.equal(frame.id,shape.id);assert.equal(frame.visroFrame,'custom-shape');assert.equal(frame.visroEmptyFrame,true);assert.equal(frame.opacity,.7);assert.equal(frame.flipX,true);assert.equal(frame.clipPath.type,shape.type);assert.equal(frame.clipPath.fillRule,shape.fillRule);assert.deepEqual(frame.visroMetadata,shape.visroMetadata);assert.equal(JSON.stringify(shape.toObject(customProps)),before,'conversion never mutates its source');
  effective.forEach((value,i)=>near(value,matrix[i],'scene matrix'));near(frame.getCenterPoint().x,center.x,'centerX');near(frame.getCenterPoint().y,center.y,'centerY');
  if(shape instanceof fabric.Path)assert.deepEqual(frame.clipPath.path,shape.path);if(shape instanceof fabric.Polygon)assert.deepEqual(frame.clipPath.points,shape.points);
 }
});

test('custom masks paint the real silhouette, preserve evenodd holes and survive native JSON reopening',async()=>{
 for(const kind of ['circle','cutout-path','polygon']){
  const source=kind==='circle'?new fabric.Circle({radius:80}):kind==='cutout-path'?new fabric.Path('M0 0 H160 V160 H0 Z M50 50 H110 V110 H50 Z',{fillRule:'evenodd'}):new fabric.Polygon([{x:80,y:0},{x:160,y:160},{x:0,y:160}]);source.set({originX:'center',originY:'center',left:200,top:200,fill:'#123456',strokeWidth:0});source.id=kind;
  const frame=await convertShapeToFrameObject(source),surface=canvas();try{
   surface.add(frame);surface.renderAll();const context=surface.getElement();assert.equal(sample(context,121,121)[3],kind==='cutout-path'?255:0);
   if(kind==='cutout-path')assert.equal(sample(context,200,200)[3],0);else assert.equal(sample(context,200,200)[3],255);
   const saved=JSON.parse(JSON.stringify(surface.toObject(customProps))),restored=canvas();try{await restored.loadFromJSON(saved);restored.renderAll();const object=restored.getObjects()[0];assert.equal(object.id,kind);assert.equal(object.visroFrame,'custom-shape');assert.equal(object.clipPath.type,source.type);assert.deepEqual(sample(restored.getElement(),200,200),sample(context,200,200));}finally{await restored.dispose();}
  }finally{await surface.dispose();}
 }
});

test('nested shapes retain their complete scene transform without mutating their parent',async()=>{
 const source=new fabric.Polygon([{x:0,y:0},{x:140,y:0},{x:95,y:100},{x:20,y:80}],{left:20,top:30,angle:13,fill:'#123456',strokeWidth:0}),sibling=new fabric.Rect({width:100,height:100,left:200,top:50,fill:'#00ff00'}),group=new fabric.Group([source,sibling],{left:130,top:170,angle:31,scaleX:1.2,scaleY:.8,flipX:true});source.id='nested';const saved=JSON.stringify(group.toObject(customProps)),matrix=source.calcTransformMatrix(),frame=await convertShapeToFrameObject(source),factor=frame.width/source.width,effective=fabric.util.multiplyTransformMatrices(frame.calcTransformMatrix(),[factor,0,0,factor,0,0]);effective.forEach((value,i)=>near(value,matrix[i],'nested matrix'));assert.equal(JSON.stringify(group.toObject(customProps)),saved);assert.equal(frame.group,undefined);
});

test('relative native masks stay cloned and absolute masks are localized without losing scene placement',async()=>{
 for(const absolute of [false,true]){
  const source=new fabric.Rect({originX:'center',originY:'center',left:200,top:200,width:160,height:160,fill:'#123456',strokeWidth:0}),mask=new fabric.Circle({originX:'center',originY:'center',left:absolute?200:0,top:absolute?200:0,radius:50,fill:'#000000',strokeWidth:0,absolutePositioned:absolute});source.clipPath=mask;
  const frame=await convertShapeToFrameObject(source),surface=canvas();try{surface.add(frame);surface.renderAll();assert.equal(sample(surface.getElement(),200,200)[3],255);assert.equal(sample(surface.getElement(),125,125)[3],0);assert.equal(frame.clipPath.clipPath.absolutePositioned,false);assert.equal(source.clipPath.absolutePositioned,absolute);}finally{await surface.dispose();}
 }
});

test('text, groups, images, lines, empty strokes and cancelled conversions reject cleanly',async()=>{
 const image=await fabric.FabricImage.fromURL(await getShapeFramePlaceholder());for(const object of[new fabric.Textbox('Text'),new fabric.FabricText('SVG text'),new fabric.Group([]),image,new fabric.Line([0,0,100,100]),new fabric.Path('M0 0 L100 100',{fill:null,stroke:'#000000'})])await assert.rejects(convertShapeToFrameObject(object),/filled native shape/);
 const controller=new AbortController();controller.abort();await assert.rejects(convertShapeToFrameObject(new fabric.Circle({radius:50}),{signal:controller.signal}),{name:'AbortError'});
});
