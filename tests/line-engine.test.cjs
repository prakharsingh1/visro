const{test,before}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),{pathToFileURL}=require('node:url'),{build}=require('esbuild');
let StudioEditor,api,installEditorAccess,fabric,environment;
before(async()=>{
 fabric=await import('fabric');environment=(await import('fabric/node')).getEnv();fabric.setEnv(environment);
 const output=await build({stdin:{contents:"export{StudioEditor}from'./src/editor.ts';export*from'./src/line-editing.ts';export{installEditorAccess}from'./src/editor-access.ts';",resolveDir:path.join(__dirname,'..')},bundle:true,platform:'node',format:'esm',external:['fabric'],write:false});const temporary=path.join(__dirname,`line-engine-build-${process.pid}.mjs`);await fs.writeFile(temporary,output.outputFiles[0].text);try{api=await import(pathToFileURL(temporary).href);({StudioEditor,installEditorAccess}=api);}finally{await fs.unlink(temporary);}
});
const near=(a,b,label,tolerance=.02)=>assert.ok(Math.abs(a-b)<tolerance,`${label}: ${a} ≈ ${b}`),pointNear=(a,b,label)=>{near(a.x,b.x,label+' X');near(a.y,b.y,label+' Y')};
const endpointsNear=(object,expected)=>{const after=api.getLineEndpoints(object);pointNear(after.start,expected.start,'start');pointNear(after.end,expected.end,'end')};
const studio=()=>new StudioEditor(environment.document.createElement('canvas'),{width:800,height:600});

test('line toolbar style conversion is one Undo, preserves ID/endpoints, and redo/reopen retain editable native geometry',async()=>{
 const editor=studio(),reopened=studio();try{
 editor.addShape('line');const native=editor.canvas.getActiveObject(),id=native.id,before=api.getLineEndpoints(native),history=editor.historyIndex;
 assert.equal(editor.selected.type,'line');assert.equal(editor.selected.strokeOnly,true);assert.ok(native.controls.start&&native.controls.end);
 editor.updateLineStyle({route:'curved',startMarker:'bar',endMarker:'circle-outline'});const connector=editor.canvas.getActiveObject();assert.ok(connector instanceof fabric.Group);assert.equal(connector.id,id);endpointsNear(connector,before);assert.equal(editor.historyIndex,history+1);assert.deepEqual(editor.selected.lineStyle,{route:'curved',startMarker:'bar',endMarker:'circle-outline'});
 await editor.undo();const undone=editor.canvas.getActiveObject();assert.ok(undone instanceof fabric.Line);assert.equal(undone.id,id);endpointsNear(undone,before);assert.ok(undone.controls.start&&undone.controls.end);
 await editor.redo();const restored=editor.canvas.getActiveObject();assert.ok(restored instanceof fabric.Group);assert.equal(restored.id,id);endpointsNear(restored,before);
 await reopened.loadProject(editor.serialize());const loaded=reopened.canvas.getObjects()[0];reopened.canvas.setActiveObject(loaded);assert.deepEqual(reopened.selected.lineStyle,editor.selected.lineStyle);assert.ok(loaded.controls.start&&loaded.controls.end);endpointsNear(loaded,before);
 const svg=await reopened.exportImage({format:'svg'}),png=await reopened.exportImage({format:'png'});assert.ok((svg.match(/<path/g)||[]).length>=3);assert.ok(png.startsWith('data:image/png;base64,')&&png.length>1000);
 }finally{editor.destroy();reopened.destroy();}
});

test('line weight/color/dash/cap updates preserve scene endpoints and propagate to native marker paint with one Undo',async()=>{
 const editor=studio();try{
 editor.addShape('line');const native=editor.canvas.getActiveObject(),before=api.getLineEndpoints(native);editor.updateSelected({strokeWidth:8,stroke:'#ed325d'});endpointsNear(native,before);
 editor.updateLineStyle({endMarker:'triangle',startMarker:'circle-outline'});const object=editor.canvas.getActiveObject(),old=api.getLineEndpoints(object),history=editor.historyIndex;
 editor.updateSelected({stroke:'#125eaa',strokeWidth:10,strokeDashArray:[8,4],strokeLineCap:'square',opacity:.4});endpointsNear(object,old);assert.equal(editor.historyIndex,history+1);assert.equal(editor.selected.fill,'#125eaa');assert.equal(editor.selected.stroke,'#125eaa');assert.equal(editor.selected.strokeOnly,true);
 for(const child of object.getObjects()){assert.equal(child.stroke,'#125eaa');assert.equal(child.strokeWidth,10);assert.equal(child.strokeLineCap,'square');}assert.deepEqual(object.getObjects()[0].strokeDashArray,[8,4]);assert.equal(object.getObjects()[1].strokeDashArray,null);
 await editor.undo();const undone=editor.canvas.getActiveObject();assert.equal(undone.stroke,'#ed325d');assert.equal(undone.strokeWidth,8);assert.equal(undone.opacity,1);endpointsNear(undone,old);
 }finally{editor.destroy();}
});

test('actual Fabric endpoint control finalization creates one engine Undo and preserves the opposite anchor',async()=>{
 const editor=studio();try{
 editor.addShape('line');editor.updateLineStyle({route:'elbow',endMarker:'arrow'});const object=editor.canvas.getActiveObject(),id=object.id,before=api.getLineEndpoints(object),savedBefore=editor.serialize(),history=editor.historyIndex,transform={target:object,action:'modifyLine',actionPerformed:false,corner:'end',original:{left:object.left,top:object.top}};
 for(const offset of [10,20,30,40]){transform.actionPerformed ||= object.controls.end.actionHandler({},transform,before.end.x+offset,before.end.y+20);if(offset>10)object.controls.end.actionHandler({},transform,before.end.x+offset,before.end.y+20);assert.equal(editor.historyIndex,history,'intermediate mousemove must not create Undo');}
 editor.canvas._currentTransform=transform;editor.canvas._finalizeCurrentTransform({});assert.equal(editor.historyIndex,history+1);pointNear(api.getLineEndpoints(object).start,before.start,'stationary start');pointNear(api.getLineEndpoints(object).end,before.end.add(new fabric.Point(40,20)),'moved end');
 await editor.undo();const undone=editor.canvas.getActiveObject();assert.equal(undone.id,id);endpointsNear(undone,before);assert.ok(undone.controls.end);assert.deepEqual(editor.serialize(),savedBefore,'one Undo retains exact native parts/IDs/metadata');await editor.redo();pointNear(api.getLineEndpoints(editor.canvas.getActiveObject()).end,before.end.add(new fabric.Point(40,20)),'redo end');
 }finally{editor.destroy();}
});

test('native duplicate and clipboard paste retain connector controls/metadata with distinct IDs',async()=>{
 const editor=studio();try{
 editor.addShape('line');editor.updateLineStyle({route:'curved',startMarker:'bar',endMarker:'diamond'});const original=editor.canvas.getActiveObject(),before=api.getLineEndpoints(original);await editor.duplicate();const duplicate=editor.canvas.getActiveObject();assert.notEqual(duplicate.id,original.id);assert.deepEqual(api.getLineStyle(duplicate),api.getLineStyle(original));assert.ok(duplicate.controls.start&&duplicate.controls.end);pointNear(api.getLineEndpoints(duplicate).start,before.start.add(new fabric.Point(24,24)),'duplicate scene offset');await editor.copy();await editor.paste();const pasted=editor.canvas.getActiveObject();assert.notEqual(pasted.id,duplicate.id);assert.ok(pasted.controls.start&&pasted.controls.end);assert.deepEqual(api.getLineStyle(pasted),api.getLineStyle(original));assert.equal(new Set(editor.canvas.getObjects().map(object=>object.id)).size,3);
 }finally{editor.destroy();}
});

test('nested connector conversion/style/drag preserve world endpoints and siblings; locked ancestors and viewing mode reject edits',async()=>{
 const editor=studio(),access=installEditorAccess(editor);try{
 editor.addShape('line');const line=editor.canvas.getActiveObject();editor.canvas.discardActiveObject();editor.canvas.remove(line);const sibling=new fabric.Rect({left:520,top:280,width:40,height:40}),parent=new fabric.Group([line,sibling],{left:80,top:30,angle:23,scaleX:1.5,scaleY:.8});parent.id='outer-line-test';editor.canvas.add(parent);editor.canvas.setActiveObject(line);const before=api.getLineEndpoints(line),siblingBefore=sibling.calcTransformMatrix();editor.updateLineStyle({endMarker:'triangle',route:'elbow'});const connector=editor.canvas.getActiveObject();assert.equal(connector.group,parent);endpointsNear(connector,before);for(let i=0;i<6;i++)near(sibling.calcTransformMatrix()[i],siblingBefore[i],'sibling matrix '+i);
 parent.visroLocked=true;const snapshot=JSON.stringify(editor.serialize());editor.updateLineStyle({route:'curved'});editor.swapSelectedLineEnds();assert.equal(api.moveLineEndpoint(connector,'end',{x:100,y:100}),false);assert.equal(JSON.stringify(editor.serialize()),snapshot);parent.visroLocked=false;
 await access.setMode('viewing');editor.canvas.setActiveObject(connector);const view=JSON.stringify(editor.serialize());editor.updateLineStyle({route:'curved'});editor.swapSelectedLineEnds();assert.equal(JSON.stringify(editor.serialize()),view);await access.setMode('editing');editor.canvas.setActiveObject(connector);editor.swapSelectedLineEnds();assert.equal(editor.selected.lineStyle.startMarker,'triangle');assert.equal(editor.selected.lineStyle.endMarker,'none');
 }finally{access.dispose();editor.destroy();}
});

test('only recognized thin connector catalog entries gain endpoints and selecting the same style does not create history',()=>{
 const editor=studio();try{
 for(const[id,route]of[['line','straight'],['dashed-line','straight'],['dotted-line','straight'],['arrow-line','straight'],['double-arrow-line','straight'],['elbow-line','elbow'],['curved-line','curved']]){editor.addShape(id);const object=editor.canvas.getActiveObject();assert.equal(editor.selected.lineStyle.route,route);assert.equal(editor.selected.type,'line');assert.ok(object.controls.start&&object.controls.end);const history=editor.historyIndex;editor.updateLineStyle({...editor.selected.lineStyle});assert.equal(editor.historyIndex,history);const count=editor.canvas.getObjects().length;editor.ungroup();assert.equal(editor.canvas.getObjects().length,count,'connectors remain single elements');}
 editor.addShape('wavy-line');assert.equal(editor.selected.lineStyle,undefined,'decorative paths retain their actual shape');
 }finally{editor.destroy();}
});

test('new lines use native unit scales and circle markers remain round after dimension edits and exact Undo/reopen',async()=>{
 const editor=studio(),second=studio();try{
 editor.addShape('line');const native=editor.canvas.getActiveObject();assert.equal(native.scaleX,1);assert.equal(native.scaleY,1);editor.updateLineStyle({startMarker:'circle-outline',endMarker:'circle'});let object=editor.canvas.getActiveObject();const before=editor.serialize();editor.updateSelected({width:500});object=editor.canvas.getActiveObject();near(object.getScaledWidth(),500,'Position painted width');for(const marker of object.getObjects().slice(1)){const m=marker.calcTransformMatrix();near(m[0],1,'resized marker scene scaleX',.0001);near(m[3],1,'resized marker scene scaleY',.0001);}
 const saved=editor.serialize();await second.loadProject(saved);const reopened=second.canvas.getObjects()[0];for(const marker of reopened.getObjects().slice(1)){const m=marker.calcTransformMatrix();near(m[0],1,'reopened marker scaleX',.001);near(m[3],1,'reopened marker scaleY',.001);}
 await editor.undo();assert.deepEqual(editor.serialize(),before,'one dimension Undo restores exact native geometry');editor.canvas.setActiveObject(editor.canvas.getObjects()[0]);editor.resizeSelection(40,0);editor.flushPendingChanges();for(const marker of editor.canvas.getActiveObject().getObjects().slice(1)){const m=marker.calcTransformMatrix();near(m[0],1,'keyboard resize marker scaleX',.0001);near(m[3],1,'keyboard resize marker scaleY',.0001);}
 }finally{editor.destroy();second.destroy();}
});

async function assertPaintedCirclesRound(connector){for(const marker of connector.getObjects().slice(1)){const copy=await marker.clone();fabric.util.applyTransformToObject(copy,marker.calcTransformMatrix());copy.set({objectCaching:false});copy.setPositionByOrigin(new fabric.Point(64,64),'center','center');const canvas=new fabric.StaticCanvas(environment.document.createElement('canvas'),{width:128,height:128,enableRetinaScaling:false,renderOnAddRemove:false});canvas.add(copy);canvas.renderAll();const pixels=canvas.getContext().getImageData(0,0,128,128).data;let left=128,right=-1,top=128,bottom=-1,ink=0;for(let index=3;index<pixels.length;index+=4)if(pixels[index]>60){const pixel=(index-3)/4,x=pixel%128,y=Math.floor(pixel/128);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);ink++;}assert.ok(ink>20,'marker must really paint');assert.ok(Math.abs((right-left)-(bottom-top))<=1,`parent-scaled circle is round: ${right-left+1}×${bottom-top+1}`);assert.ok(left>0&&top>0&&right<127&&bottom<127,'circle is not cropped by the test surface');await canvas.dispose();}}
function groupedFixture(editor,activeSelection=false){editor.addShape('line',{center:{x:300,y:300}});editor.updateLineStyle({startMarker:'circle-outline',endMarker:'circle'});const connector=editor.canvas.getActiveObject();editor.addShape('rect',{center:{x:540,y:360}});const sibling=editor.canvas.getActiveObject();editor.canvas.setActiveObject(new fabric.ActiveSelection([connector,sibling],{canvas:editor.canvas}));if(!activeSelection)editor.group();return{connector,sibling,target:editor.canvas.getActiveObject()};}

for(const activeSelection of[false,true])test(`parent ${activeSelection?'ActiveSelection':'Group'} Position and keyboard resizing preserve real circular marker paint and exact Undo`,async()=>{
 const editor=studio();try{
  const{connector}=groupedFixture(editor,activeSelection),id=connector.id,before=editor.serialize();editor.updateSelected({width:600,height:220});const current=editor.canvas.getActiveObject();near(current.getScaledWidth(),600,'parent Position width');near(current.getScaledHeight(),220,'parent Position height');await assertPaintedCirclesRound(connector);await editor.undo();assert.deepEqual(editor.serialize(),before,'parent Position resize is one complete Undo');
  const restoredLine=editor.findObject(id),all=editor.canvas.getObjects();editor.canvas.setActiveObject(activeSelection?new fabric.ActiveSelection(all,{canvas:editor.canvas}):all[0]);const keyboardBefore=editor.serialize();editor.resizeSelection(80,-25);editor.flushPendingChanges();await assertPaintedCirclesRound(restoredLine);await editor.undo();assert.deepEqual(editor.serialize(),keyboardBefore,'parent keyboard resize is one complete Undo');
 }finally{editor.destroy();}
});

for(const activeSelection of[false,true])test(`native ${activeSelection?'ActiveSelection':'Group'} scale finalization refreshes contained markers once without scene-anchor/sibling drift`,async()=>{
 const editor=studio();try{
  const{connector,sibling,target}=groupedFixture(editor,activeSelection),id=connector.id,before=editor.serialize(),history=editor.historyIndex;target.set({scaleX:target.scaleX*1.8,scaleY:target.scaleY*.6});target.setCoords();const expected=api.getLineEndpoints(connector),siblingMatrix=sibling.calcTransformMatrix();let modifications=0;editor.canvas.on('object:modified',()=>modifications++);editor.canvas._currentTransform={target,action:'scale',actionPerformed:true,original:{left:target.left,top:target.top}};editor.canvas._finalizeCurrentTransform({});
  assert.equal(modifications,1);assert.equal(editor.historyIndex,history+1);assert.equal(connector.id,id);endpointsNear(connector,expected);for(let index=0;index<6;index++)near(sibling.calcTransformMatrix()[index],siblingMatrix[index],'sibling scene matrix'+index,.0001);await assertPaintedCirclesRound(connector);await editor.undo();assert.deepEqual(editor.serialize(),before,'native group gesture restores exact source in one Undo');
 }finally{editor.destroy();}
});
