const {test,before}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {build}=require('esbuild');
let StudioEditor,environment,fabric,SHAPE_LIBRARY,getShapeGeometry,GRAPHICS;
before(async()=>{
 fabric=await import('fabric');environment=(await import('fabric/node')).getEnv();fabric.setEnv(environment);
 ({SHAPE_LIBRARY,getShapeGeometry}=await import('../src/shapes.ts'));({GRAPHICS}=await import('../src/graphics-library.ts'));
 const output=await build({entryPoints:[path.join(__dirname,'../src/editor.ts')],bundle:true,platform:'node',format:'esm',external:['fabric'],write:false});
 const temporary=path.join(__dirname,`element-library-build-${process.pid}.mjs`);await fs.writeFile(temporary,output.outputFiles[0].text);
 try{({StudioEditor}=await import(pathToFileURL(temporary).href));}finally{await fs.unlink(temporary);}
});
const editor=options=>new StudioEditor(environment.document.createElement('canvas'),options);
const near=(actual,expected,label)=>assert.ok(Math.abs(actual-expected)<.00001,`${label}: ${actual} ≈ ${expected}`);
function finiteBounds(object,label){const bounds=object.getBoundingRect();for(const value of Object.values(bounds))assert.ok(Number.isFinite(value),`${label} finite bounds`);assert.ok(bounds.width>0&&bounds.height>0,`${label} visible bounds`);return bounds;}
function flattened(object){return object.type.toLowerCase()==='group'?object.getObjects().flatMap(flattened):[object];}

test('all 56 shape insertions remain finite native vectors centered at the pointer and match thumbnail proportions',async()=>{
 const studio=editor({width:1000,height:800}),ids=new Set(),center={x:730.5,y:412.25};
 try{
  for(const definition of SHAPE_LIBRARY){
   studio.addShape(definition.id,{center,pageId:studio.getState().activePageId});
   const object=studio.canvas.getActiveObject(),bounds=finiteBounds(object,definition.id),point=object.getCenterPoint();
   near(point.x,center.x,`${definition.id} centerX`);near(point.y,center.y,`${definition.id} centerY`);
   assert.ok(bounds.width<500&&bounds.height<500,`${definition.id} bounded insertion size`);assert.ok(!ids.has(object.id));ids.add(object.id);
   assert.ok(['rect','circle','ellipse','triangle','polygon','path','line'].includes(object.type.toLowerCase()),`${definition.id} is a native editable vector`);
   if(definition.kind!=='line'){
    const geometry=getShapeGeometry(definition.id),native=geometry.kind==='polygon'?new fabric.Polygon(geometry.points,{strokeWidth:0}):new fabric.Path(geometry.path,{strokeWidth:0});
    if(native.height>0&&geometry.filled){const expected=native.width/native.height*geometry.aspectRatio;near(object.width*object.scaleX/(object.height*object.scaleY),expected,`${definition.id} visible thumbnail ratio`);}
   }else assert.ok(bounds.height<12,`${definition.id} is a flat line, not a filled rectangle`);
  }
  assert.equal(studio.canvas.getObjects().length,56);assert.equal(studio.serialize().pages[0].canvas.objects.length,56);
  await studio.undo();assert.equal(studio.canvas.getObjects().length,55,'one Undo removes only the most recent shape');
  await studio.redo();assert.equal(studio.canvas.getObjects().length,56);
  const before=studio.serialize(),revision=studio.getState().revision;
  assert.throws(()=>studio.addShape('star',{center,pageId:'departed-page'}),/page changed/);assert.deepEqual(studio.serialize(),before);assert.equal(studio.getState().revision,revision);
 }finally{studio.destroy();}
});

test('every bundled graphic preserves native parts, unique IDs, provenance, and editability across JSON reopen and ungroup',async()=>{
 assert.ok(GRAPHICS.length>=100);const ids=new Set();
 for(const graphic of GRAPHICS){
  const studio=editor({width:800,height:600}),center={x:523.25,y:371.75};
  try{
   studio.addGraphic(graphic.id,{center,pageId:studio.getState().activePageId});
   const group=studio.canvas.getActiveObject(),bounds=finiteBounds(group,graphic.id);
   assert.equal(group.type.toLowerCase(),'group');assert.equal(group.visroGraphicId,graphic.id);assert.equal(group.getObjects().length,graphic.parts.length);assert.ok(bounds.width<600&&bounds.height<600);
   near(group.getCenterPoint().x,center.x,`${graphic.id} centerX`);near(group.getCenterPoint().y,center.y,`${graphic.id} centerY`);
   for(const object of [group,...flattened(group)]){assert.ok(object.id&&!ids.has(object.id),`${graphic.id} unique element IDs`);ids.add(object.id);finiteBounds(object,graphic.id);}
   assert.ok(flattened(group).every(part=>part.type.toLowerCase()==='path'));assert.doesNotMatch(group.toSVG(),/<image|<script|NaN|Infinity/);
   const saved=JSON.parse(JSON.stringify(studio.serialize()));assert.equal(saved.pages[0].canvas.objects[0].visroGraphicId,graphic.id);
   await studio.loadProject(saved);const reopened=studio.canvas.getObjects()[0];assert.equal(reopened.id,group.id);assert.equal(reopened.visroGraphicId,graphic.id);assert.equal(reopened.getObjects().length,graphic.parts.length);
   studio.selectLayer(reopened.id);studio.ungroup();const parts=studio.canvas.getObjects();assert.equal(parts.length,graphic.parts.length,`${graphic.id} ungroups without rasterizing`);assert.ok(parts.every(part=>part.type.toLowerCase()==='path'));
   studio.selectLayer(parts[0].id);studio.updateSelected({fill:'#123456'});assert.equal(parts[0].fill,'#123456',`${graphic.id} parts remain independently editable`);
  }finally{studio.destroy();}
 }
});

test('graphic insert, palette replacement, lock, and page guard preserve the correct undo boundaries',async()=>{
 const studio=editor({width:600,height:600}),graphic=GRAPHICS.find(graphic=>graphic.palette.length>=3);
 try{
  studio.addGraphic(graphic.id);const first=studio.canvas.getActiveObject(),id=first.id;
  await studio.undo();assert.equal(studio.canvas.getObjects().length,0,'a complete graphic is one insertion step');await studio.redo();studio.selectLayer(id);
  const before=flattened(studio.canvas.getActiveObject()).map(part=>({id:part.id,fill:part.fill,stroke:part.stroke})),from=studio.selected.vectorColors[0],to='#123456';
  studio.setGraphicColor(from,to);
  const changed=flattened(studio.canvas.getActiveObject());
  changed.forEach((part,index)=>{for(const key of ['fill','stroke'])assert.equal(part[key],typeof before[index][key]==='string'&&before[index][key].toLowerCase()===from?to:before[index][key],`${key} replacement must preserve every other palette entry`);});
  assert.ok(studio.selected.vectorColors.includes(to));assert.ok(!studio.selected.vectorColors.includes(from));
  await studio.undo();studio.selectLayer(id);assert.deepEqual(flattened(studio.canvas.getActiveObject()).map(part=>({id:part.id,fill:part.fill,stroke:part.stroke})),before,'one Undo restores the complete original palette');
  studio.setLayerLocked(id,true);const revision=studio.getState().revision;studio.setGraphicColor(from,to);assert.equal(studio.getState().revision,revision,'locked graphics reject palette changes');
  const saved=studio.serialize();assert.throws(()=>studio.addGraphic(graphic.id,{pageId:'departed-page'}),/page changed/);assert.deepEqual(studio.serialize(),saved);
 }finally{studio.destroy();}
});

test('stroke-only graphic paints an open arrow without an accidental filled triangle',async()=>{
 const studio=editor({width:400,height:400});
 try{
  studio.resizeViewport(400,400);studio.setZoom(1);studio.addGraphic('graphic-arrow-right');studio.canvas.renderAll();
  const path=studio.canvas.getActiveObject().getObjects()[0],context=studio.canvas.getContext();assert.ok(!path.fill||path.fill==='none'||path.fill==='transparent');
  const pixel=(x,y)=>{const position=new fabric.Point(x-path.pathOffset.x,y-path.pathOffset.y).transform(path.calcTransformMatrix()).transform(studio.canvas.viewportTransform);return [...context.getImageData(Math.round(position.x),Math.round(position.y),1,1).data];};
  const interior=pixel(135,85),stroke=pixel(80,100);
  assert.ok(interior.slice(0,3).every(channel=>channel>245),'the open arrowhead interior must remain white');assert.ok(stroke[0]+stroke[1]+stroke[2]<500,'the shaft must visibly paint its stroke');
 }finally{studio.destroy();}
});
