const {test,before}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {build}=require('esbuild');
let api,fabric,environment;
before(async()=>{
 fabric=await import('fabric');environment=(await import('fabric/node')).getEnv();fabric.setEnv(environment);
 fabric.FabricObject.customProperties=[...new Set([...fabric.FabricObject.customProperties,'id','visroName','visroLine','visroMetadata'])];
 const output=await build({entryPoints:[path.join(__dirname,'../src/line-editing.ts')],bundle:true,platform:'node',format:'esm',external:['fabric'],write:false});
 const temporary=path.join(__dirname,`line-editing-build-${process.pid}.mjs`);await fs.writeFile(temporary,output.outputFiles[0].text);
 try{api=await import(pathToFileURL(temporary).href);}finally{await fs.unlink(temporary);}
});
const near=(a,b,label,tolerance=.00001)=>assert.ok(Math.abs(a-b)<tolerance,`${label}: ${a} ≈ ${b}`);
function pointNear(a,b,label,tolerance){near(a.x,b.x,`${label}.x`,tolerance);near(a.y,b.y,`${label}.y`,tolerance);}
function endpointsNear(object,expected,tolerance){const result=api.getLineEndpoints(object);pointNear(result.start,expected.start,'start',tolerance);pointNear(result.end,expected.end,'end',tolerance);}
function line(){const object=new fabric.Line([0,0,240,90],{left:100,top:80,angle:31,scaleX:1.4,scaleY:.7,skewX:13,flipX:true,stroke:'#ed325d',strokeWidth:5,strokeLineCap:'round',strokeDashArray:[13,5],opacity:.65});object.id='line-kept-id';object.visroName='An actual connector';object.visroMetadata={altText:'Useful line'};return object;}
function surface(){return new fabric.Canvas(environment.document.createElement('canvas'),{width:800,height:600,enableRetinaScaling:false,renderOnAddRemove:false});}
function paint(canvas){canvas.renderAll();return canvas.getContext().getImageData(0,0,800,600).data;}

test('plain-line conversion preserves affine scene endpoints, ID and native paint appearance',async()=>{
 const object=line(),expected=api.getLineEndpoints(object),canvas=surface();canvas.add(object);const original=paint(canvas);
 const converted=api.updateLineObject(object,{route:'straight'});assert.ok(converted instanceof fabric.Group);canvas.remove(object);canvas.add(converted);const actual=paint(canvas);
 endpointsNear(converted,expected);assert.equal(converted.id,object.id);assert.equal(converted.visroName,object.visroName);assert.deepEqual(converted.visroMetadata,object.visroMetadata);assert.equal(converted.opacity,.65);assert.deepEqual(converted.strokeDashArray,[13,5]);
 let delta=0,pixels=0;for(let index=0;index<original.length;index++)if(original[index]!==actual[index])delta++;for(let index=3;index<actual.length;index+=4)if(actual[index])pixels++;
 assert.ok(pixels>500,'the canvas must actually contain the line');assert.ok(delta<100,`unmarked conversion must retain actual paint; delta=${delta}; pixels=${pixels}`);await canvas.dispose();
});

test('all marker and route choices retain transformed endpoints, remain native paths and paint distinguishable geometry',async()=>{
 const canvas=surface(),object=new fabric.Line([140,200,520,330],{stroke:'#ed325d',strokeWidth:6,strokeLineCap:'round'});let connector=api.updateLineObject(object,{route:'straight'});canvas.add(connector);const expected=api.getLineEndpoints(connector),paintKeys=new Set();
 for(const marker of api.LINE_MARKERS){connector=api.updateLineObject(connector,{startMarker:marker.id,endMarker:marker.id});endpointsNear(connector,expected);assert.ok(connector.getObjects().every(child=>child instanceof fabric.Path));const bitmap=paint(canvas);let hash=0;for(let i=0;i<bitmap.length;i++)hash=(hash*31+bitmap[i])|0;paintKeys.add(hash);}
 assert.equal(paintKeys.size,api.LINE_MARKERS.length,'each marker must change actual pixels');
 for(const item of api.LINE_ROUTES){const same=api.updateLineObject(connector,{route:item.id});assert.equal(same,connector,'editing keeps the current native target');endpointsNear(connector,expected);assert.ok(connector.getObjects()[0].path.length>=2);}
 await canvas.dispose();
});

test('nested-group line conversion, route/marker edits and endpoint movement preserve the opposite scene anchor and unrelated siblings',()=>{
 const object=line(),sibling=new fabric.Rect({left:430,top:170,width:80,height:60,fill:'#123456'}),inner=new fabric.Group([object,sibling],{left:180,top:120,angle:17,scaleX:.8,scaleY:1.6,skewX:9}),outer=new fabric.Group([inner],{left:70,top:40,angle:-12,scaleX:1.3,scaleY:.9,flipY:true});
 const expected=api.getLineEndpoints(object),siblingBefore=sibling.calcTransformMatrix(),connector=api.updateLineObject(object,{route:'curved',endMarker:'triangle'});
 // The caller replaces the old parent slot. Keep the group's fixed transform
 // while installing the already-parent-plane replacement, as the editor does.
 inner.layoutManager.dispose();inner.layoutManager=new fabric.LayoutManager(new fabric.FixedLayout());const index=inner.getObjects().indexOf(object);inner.remove(object);inner.insertAt(index,connector);
 endpointsNear(connector,expected);assert.deepEqual(sibling.calcTransformMatrix(),siblingBefore);
 const same=api.updateLineObject(connector,{route:'elbow',startMarker:'circle-outline'});assert.equal(same,connector);endpointsNear(connector,expected);
 const target=expected.end.add(new fabric.Point(47,-35));assert.equal(api.moveLineEndpoint(connector,'end',target),true);const moved=api.getLineEndpoints(connector);pointNear(moved.start,expected.start,'stationary anchor');pointNear(moved.end,target,'dragged endpoint');assert.deepEqual(sibling.calcTransformMatrix(),siblingBefore);assert.equal(outer.getObjects()[0],inner);
});

test('native JSON reopen preserves editable metadata, endpoint geometry, dashes and marker SVG/PNG export',async()=>{
 const original=line(),connector=api.updateLineObject(original,{route:'curved',startMarker:'circle',endMarker:'diamond-outline'}),canvas=surface();canvas.add(connector);const expected=api.getLineEndpoints(connector),before=paint(canvas),json=canvas.toJSON(),svg=canvas.toSVG();
 assert.match(svg,/<path/);assert.ok((svg.match(/<path/g)||[]).length>=3);assert.match(svg,/stroke-dasharray: 13 5/);const png=canvas.toDataURL({format:'png'});assert.ok(png.length>3000);
 await canvas.loadFromJSON(json);const restored=canvas.getObjects()[0];api.installLineControls(restored);assert.ok(restored instanceof fabric.Group);assert.equal(restored.id,connector.id);assert.deepEqual(api.getLineStyle(restored),{route:'curved',startMarker:'circle',endMarker:'diamond-outline'});endpointsNear(restored,expected,.03);assert.deepEqual(restored.strokeDashArray,[13,5]);
 const after=paint(canvas);let difference=0;for(let i=0;i<before.length;i++)if(before[i]!==after[i])difference++;assert.ok(difference<1000,`native reopen should retain actual paint after Fabric four-decimal rounding; difference=${difference}`);assert.ok(restored.controls.start&&restored.controls.end);await canvas.dispose();
});

test('endpoint controls preserve native-line ID/opposite endpoint and produce only one final modification for a complete drag',async()=>{
 const object=line(),canvas=surface();canvas.add(object);canvas.setActiveObject(object);api.installLineControls(object);const expected=api.getLineEndpoints(object),control=object.controls.end;let modified=0;canvas.on('object:modified',()=>modified++);
 const transform={target:object,action:'modifyLine',actionPerformed:false,corner:'end',original:{left:object.left,top:object.top}};
 for(const offset of [8,16,24,32]){const changed=control.actionHandler({},transform,expected.end.x+offset,expected.end.y-10);transform.actionPerformed ||= changed;assert.equal(modified,0);}
 pointNear(api.getLineEndpoints(object).start,expected.start,'fixed native anchor');pointNear(api.getLineEndpoints(object).end,expected.end.add(new fabric.Point(32,-10)),'moved native endpoint');assert.equal(object.id,'line-kept-id');canvas._currentTransform=transform;canvas._finalizeCurrentTransform({});assert.equal(modified,1);assert.ok(object instanceof fabric.Line);await canvas.dispose();
});

test('connector endpoint controls use parent-plane pointer coordinates and viewport-space handle positions',()=>{
 const connector=api.updateLineObject(line(),{endMarker:'diamond',route:'curved'}),parent=new fabric.Group([connector],{left:180,top:140,angle:23,scaleX:1.5,scaleY:.7,skewX:11});api.installLineControls(connector);const before=api.getLineEndpoints(connector),target=before.start.add(new fabric.Point(-41,19)),pointer=target.transform(fabric.util.invertTransform(parent.calcTransformMatrix()));
 assert.equal(connector.controls.start.actionHandler({}, {target:connector},pointer.x,pointer.y),true);const after=api.getLineEndpoints(connector);pointNear(after.start,target,'start endpoint');pointNear(after.end,before.end,'fixed end endpoint');
 const position=connector.controls.start.positionHandler(new fabric.Point(0,0),[1,0,0,1,0,0],connector,{});pointNear(position,target,'control scene position');
});

test('swap changes marker roles without moving world endpoints; generic appearance edits repaint all native children',async()=>{
 const connector=api.updateLineObject(line(),{startMarker:'circle',endMarker:'triangle'}),expected=api.getLineEndpoints(connector);api.swapLineObjectEnds(connector);assert.deepEqual(api.getLineStyle(connector),{route:'straight',startMarker:'triangle',endMarker:'circle'});endpointsNear(connector,expected);
 connector.set({stroke:'#125eaa',strokeWidth:9,strokeDashArray:[2,9],strokeLineCap:'square',opacity:.4});api.syncLineAppearance(connector);endpointsNear(connector,expected);assert.equal(connector.opacity,.4);for(const child of connector.getObjects()){assert.equal(child.stroke,'#125eaa');assert.ok(child.strokeWidth>0);assert.equal(child.strokeLineCap,'square');}assert.equal(connector.getObjects()[0].strokeWidth,9);for(const marker of connector.getObjects().slice(1)){const matrix=marker.calcTransformMatrix();for(const[index,expected]of[[0,1],[1,0],[2,0],[3,1]])near(matrix[index],expected,'marker paint remains in scene units');}assert.deepEqual(connector.getObjects()[0].strokeDashArray,[2,9]);assert.equal(connector.getObjects()[1].strokeDashArray,null);
});

test('invalid serialized connector geometry and locked endpoint drags cannot change objects',()=>{
 const object=line();assert.equal(api.sanitizeLineGeometry({version:1,start:{x:NaN,y:0},end:{x:2,y:3},route:'straight',startMarker:'none',endMarker:'none'}),undefined);assert.throws(()=>api.updateLineObject(object,{route:'made-up'}),/supported/);const before=api.getLineEndpoints(object);object.visroLocked=true;assert.equal(api.moveLineEndpoint(object,'start',{x:100,y:100}),false);endpointsNear(object,before);assert.equal(api.moveLineEndpoint(object,'start',{x:Infinity,y:0}),false);
});

test('moving a nested endpoint beyond its former group bounds paints the new endpoint without clipping',async()=>{
 const native=new fabric.Line([30,80,180,80],{stroke:'#ed325d',strokeWidth:8}),connector=api.updateLineObject(native,{endMarker:'circle'}),parent=new fabric.Group([connector],{left:100,top:140}),canvas=surface();canvas.add(parent);paint(canvas);const initial=api.getLineEndpoints(connector),target=initial.end.add(new fabric.Point(300,160));api.moveLineEndpoint(connector,'end',target);const bitmap=paint(canvas);let painted=0;for(let y=Math.floor(target.y)-12;y<=Math.ceil(target.y)+12;y++)for(let x=Math.floor(target.x)-20;x<=Math.ceil(target.x)+8;x++){if(bitmap[(y*800+x)*4+3]>20)painted++;}assert.ok(painted>40,`nested endpoint is clipped at its old group cache (${painted} pixels), target=${JSON.stringify(target)}, after=${JSON.stringify(api.getLineEndpoints(connector))}, parentBounds=${JSON.stringify(parent.getBoundingRect())}`);await canvas.dispose();
});

test('hollow endpoint markers have genuinely transparent interiors rather than painting the line through them',async()=>{
 const canvas=surface(),native=new fabric.Line([150,200,450,200],{stroke:'#ed325d',strokeWidth:6,strokeLineCap:'round'}),connector=api.updateLineObject(native,{endMarker:'circle-outline'});canvas.add(connector);let bitmap=paint(canvas);const end=api.getLineEndpoints(connector).end,x=Math.round(end.x-9),y=Math.round(end.y);assert.equal(bitmap[(y*800+x)*4+3],0,'the hollow circle center must remain transparent');api.updateLineObject(connector,{endMarker:'circle'});bitmap=paint(canvas);assert.ok(bitmap[(y*800+x)*4+3]>200,'filled circle center must paint');await canvas.dispose();
});

test('exported native SVG reopens as visible vector marker and connector geometry',async()=>{
 const canvas=surface(),object=api.updateLineObject(new fabric.Line([150,150,560,350],{stroke:'#ed325d',strokeWidth:8,opacity:.7}),{route:'curved',startMarker:'circle-outline',endMarker:'triangle'});canvas.add(object);const original=paint(canvas),svg=canvas.toSVG(),parsed=await fabric.loadSVGFromString(svg),reopened=surface();reopened.add(...parsed.objects.filter(Boolean));const result=paint(reopened);
 const stats=data=>{let sum=0,x=0,y=0;for(let index=3;index<data.length;index+=4){sum+=data[index];x+=((index-3)/4%800)*data[index];y+=Math.floor((index-3)/4/800)*data[index];}return{sum,x:x/sum,y:y/sum};},before=stats(original),after=stats(result);assert.ok(after.sum>100000,'SVG must reopen with actual visible stroke and marker pixels');assert.ok(Math.abs(after.sum/before.sum-1)<.04,'SVG retains the visible ink area');near(after.x,before.x,'SVG centroid X',.5);near(after.y,before.y,'SVG centroid Y',.5);await canvas.dispose();await reopened.dispose();
});

async function isolatedMarkerBounds(marker){const canvas=surface(),copy=await marker.clone();copy.set('objectCaching',false);fabric.util.applyTransformToObject(copy,marker.calcTransformMatrix());canvas.add(copy);const bitmap=paint(canvas);let left=800,right=-1,top=600,bottom=-1,ink=0;for(let index=3;index<bitmap.length;index+=4)if(bitmap[index]>50){const pixel=(index-3)/4,x=pixel%800,y=Math.floor(pixel/800);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);ink+=bitmap[index];}await canvas.dispose();return{width:right-left+1,height:bottom-top+1,ink,left,right,top,bottom};}

test('filled and outlined circle markers paint round on legacy stretched and skewed native lines, including reopen',async()=>{
 for(const transform of[{scaleX:3.888,scaleY:.972,angle:0,skewX:0},{scaleX:2.6,scaleY:.5,angle:27,skewX:17}]){
  const native=new fabric.Line([-50,0,50,0],{originX:'center',originY:'center',left:400,top:300,stroke:'#ed325d',strokeWidth:6,...transform}),expected=api.getLineEndpoints(native),connector=api.updateLineObject(native,{startMarker:'circle',endMarker:'circle-outline'});endpointsNear(connector,expected);
  const ids=connector.getObjects().map(child=>child.id),canvas=surface();canvas.add(connector);
  for(const marker of connector.getObjects().slice(1)){const bounds=await isolatedMarkerBounds(marker);assert.ok(bounds.ink>1000);assert.ok(Math.abs(bounds.width-bounds.height)<=1,`affine circle must be round: ${JSON.stringify(bounds)}`);}
  await canvas.loadFromJSON(canvas.toJSON());const reopened=canvas.getObjects()[0];endpointsNear(reopened,expected,.03);assert.deepEqual(reopened.getObjects().map(child=>child.id),ids);
  for(const marker of reopened.getObjects().slice(1)){const bounds=await isolatedMarkerBounds(marker);assert.ok(Math.abs(bounds.width-bounds.height)<=1,`reopened affine circle stays round: ${JSON.stringify(bounds)}`);}
  await canvas.dispose();
 }
});

test('nested affine markers retain round painted geometry, meet the trimmed body and preserve endpoints',async()=>{
 const native=new fabric.Line([-40,0,40,0],{originX:'center',originY:'center',left:120,top:110,scaleX:3.8,scaleY:.9,stroke:'#ed325d',strokeWidth:6}),parent=new fabric.Group([native],{left:350,top:240,angle:23,scaleX:1.2,scaleY:.7,skewX:14}),expected=api.getLineEndpoints(native),converted=api.updateLineObject(native,{startMarker:'circle-outline',endMarker:'circle'});parent.layoutManager.dispose();parent.layoutManager=new fabric.LayoutManager(new fabric.FixedLayout());parent.remove(native);parent.add(converted);endpointsNear(converted,expected);
 for(const marker of converted.getObjects().slice(1)){const bounds=await isolatedMarkerBounds(marker);assert.ok(bounds.ink>500,`nested circle visible: ${JSON.stringify({bounds,points:api.getLineEndpoints(converted),matrix:marker.calcTransformMatrix()})}`);assert.ok(Math.abs(bounds.width-bounds.height)<=1,`nested affine circle remains round: ${JSON.stringify(bounds)}`);}
 const moved=expected.end.add(new fabric.Point(32,17));api.moveLineEndpoint(converted,'end',moved);pointNear(api.getLineEndpoints(converted).end,moved,'nested moved endpoint');pointNear(api.getLineEndpoints(converted).start,expected.start,'nested fixed endpoint');for(const marker of converted.getObjects().slice(1)){const bounds=await isolatedMarkerBounds(marker);assert.ok(Math.abs(bounds.width-bounds.height)<=1);}
});
