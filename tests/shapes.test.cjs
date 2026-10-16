const test=require('node:test');
const assert=require('node:assert/strict');
const shapes=import('../src/shapes.ts');

test('shape library covers distinct editable shape families and retains every existing shape ID',async()=>{
 const {SHAPE_LIBRARY,SHAPE_CATEGORIES,getShapeDefinition}=await shapes;
 assert.ok(SHAPE_LIBRARY.length>=50);assert.equal(new Set(SHAPE_LIBRARY.map(shape=>shape.id)).size,SHAPE_LIBRARY.length);
 assert.deepEqual([...new Set(SHAPE_LIBRARY.map(shape=>shape.category))],SHAPE_CATEGORIES);
 for(const id of ['rect','circle','triangle','line','star','ellipse','diamond','pentagon','hexagon','arrow','heart','blob'])assert.ok(getShapeDefinition(id),`${id} must remain compatible.`);
 assert.equal(getShapeDefinition('unknown'),undefined);
});

test('all native shape geometries parse as Fabric vectors and retain finite editable/exportable bounds after roundtrip',async()=>{
 const {SHAPE_LIBRARY,getShapeGeometry}=await shapes,{Path,Polygon,Line,util}=await import('fabric/node');
 for(const entry of SHAPE_LIBRARY){
  const shape=getShapeGeometry(entry.id),options={left:20,top:30,fill:shape.filled?'#ab3377':'transparent',stroke:shape.filled?undefined:'#ab3377',strokeWidth:shape.strokeWidth,strokeDashArray:shape.dash?[...shape.dash]:undefined,strokeLineCap:shape.lineCap||'round'};
  const object=shape.kind==='polygon'?new Polygon(shape.points,options):shape.kind==='line'?new Line(shape.points,options):new Path(shape.path,options);
  object.set({scaleX:2.4,scaleY:1.8,angle:13});object.setCoords();
  const bounds=object.getBoundingRect();for(const value of Object.values(bounds))assert.ok(Number.isFinite(value),`${entry.id} finite bounds`);assert.ok(bounds.width>0&&bounds.height>0,entry.id);
  assert.match(object.toSVG(),/^<g|^<svg/);assert.doesNotMatch(object.toSVG(),/NaN|Infinity|<image|https?:\/\/|<script/);
  const [restored]=await util.enlivenObjects([object.toObject()]);assert.equal(restored.type,object.type);assert.ok(Math.abs(restored.getBoundingRect().width-bounds.width)<.001,`${entry.id} preserved width`);
  restored.set('fill','#336699');assert.equal(restored.fill,'#336699');
 }
});

test('polygons and stars have intentional vertices, arrow direction, and independently mutable points',async()=>{
 const {getShapeGeometry}=await shapes;
 for(const [id,count]of[['pentagon',5],['hexagon',6],['heptagon',7],['octagon',8],['decagon',10],['dodecagon',12],['star',10],['star4',8],['star6',12],['star16',32],['burst24',48]])assert.equal(getShapeGeometry(id).points.length,count,id);
 const right=getShapeGeometry('arrow'),left=getShapeGeometry('left-arrow');
 assert.deepEqual(left.points,right.points.map(point=>({x:100-point.x,y:point.y})));
 const original=getShapeGeometry('star');original.points[0].x=-500;assert.notEqual(getShapeGeometry('star').points[0].x,-500);
 for(const id of ['line','dashed-line','dotted-line','arrow-line','curved-line','wavy-line'])assert.equal(getShapeGeometry(id).filled,false,id);
 assert.deepEqual(getShapeGeometry('dashed-line').dash,[10,7]);assert.deepEqual(getShapeGeometry('dotted-line').dash,[.1,8]);
 assert.throws(()=>getShapeGeometry('remote-image'),/Unknown shape/);
});

test('native raster paint proves ring holes, filled silhouettes, dashed gaps, and preview markup safety',async()=>{
 const {getShapeGeometry,shapePreviewSVG}=await shapes,{StaticCanvas,Path,Line}=await import('fabric/node');
 const canvas=new StaticCanvas(undefined,{width:140,height:140,renderOnAddRemove:false});
 try{
  const ring=getShapeGeometry('donut');canvas.add(new Path(ring.path,{originX:'left',originY:'top',left:20,top:20,fill:'#ff0000',strokeWidth:0}));canvas.renderAll();
  let data=canvas.getContext().getImageData(0,0,140,140).data;
  assert.equal(data[(70*140+70)*4+3],0,'ring center is genuinely transparent');assert.equal(data[(70*140+25)*4+3],255,'ring edge is filled');
  canvas.clear();const line=getShapeGeometry('dashed-line');canvas.add(new Line(line.points,{originX:'left',originY:'top',left:20,top:60,stroke:'#ff0000',strokeWidth:3,strokeDashArray:[...line.dash]}));canvas.renderAll();data=canvas.getContext().getImageData(0,0,140,140).data;
  const alpha=x=>data[(61*140+x)*4+3];assert.ok(alpha(25)>0);assert.equal(alpha(33),0,'dash gap must stay transparent');
  assert.match(shapePreviewSVG('arrow','#112233'),/<path/);assert.match(shapePreviewSVG('dotted-line'),/stroke-dasharray="0.1 8"/);
  assert.throws(()=>shapePreviewSVG('star','red" onload="alert(1)'),/solid preview/);
 }finally{await canvas.dispose();}
});
