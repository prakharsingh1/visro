const {test,before}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {build}=require('esbuild');
let StudioEditor,environment,fabric,FRAME_LIBRARY,FRAME_GRIDS;
before(async()=>{
 fabric=await import('fabric');environment=(await import('fabric/node')).getEnv();fabric.setEnv(environment);
 ({FRAME_LIBRARY,FRAME_GRIDS}=await import('../src/frames.ts'));
 const output=await build({entryPoints:[path.join(__dirname,'../src/editor.ts')],bundle:true,platform:'node',format:'esm',external:['fabric'],write:false});
 const temporary=path.join(__dirname,`frame-engine-build-${process.pid}.mjs`);await fs.writeFile(temporary,output.outputFiles[0].text);
 try{({StudioEditor}=await import(pathToFileURL(temporary).href));}finally{await fs.unlink(temporary);}
});
const editor=options=>new StudioEditor(environment.document.createElement('canvas'),options);
function png(width=600,height=200,colors=['#ff0000','#00ff00','#0000ff']){const canvas=environment.document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');colors.forEach((color,i)=>{ctx.fillStyle=color;ctx.fillRect(i*width/colors.length,0,width/colors.length,height);});return canvas.toDataURL();}
const near=(a,b,label)=>assert.ok(Math.abs(a-b)<.0001,`${label||''}: ${a} ≈ ${b}`);
const bounds=object=>{object.setCoords();return object.getCoords().map(p=>({x:p.x,y:p.y}));};
const compareBounds=(actual,expected)=>actual.forEach((point,i)=>{near(point.x,expected[i].x,'cornerX');near(point.y,expected[i].y,'cornerY');});
const source={id:'commons:123',title:'File:Original.jpg',artist:'Public-domain contributor',license:'CC0',licenseUrl:'https://creativecommons.org/publicdomain/zero/1.0/',sourceUrl:'https://commons.wikimedia.org/wiki/File:Original.jpg'};

test('all36 masks insert as portable empty native-image frames with correct normalized offsets',async()=>{
 const studio=editor({width:800,height:600});
 try{
  for(const definition of FRAME_LIBRARY){
   await studio.insertFrame(definition.id,{center:{x:430.25,y:288.75},pageId:studio.state.activePageId});
   const object=studio.canvas.getActiveObject(),mask=object.clipPath;
   assert.ok(object instanceof fabric.FabricImage);assert.equal(object.visroFrame,definition.id);assert.equal(object.visroEmptyFrame,true);assert.ok(object.getSrc().startsWith('data:image/png;base64,'));
   assert.equal(mask.type.toLowerCase(),'path');assert.equal(mask.fillRule,definition.fillRule);
   near(mask.left,(mask.pathOffset.x-50)*object.width/100);near(mask.top,(mask.pathOffset.y-50)*object.height/100);
   near(object.getCenterPoint().x,430.25);near(object.getCenterPoint().y,288.75);near(object.getScaledWidth()/object.getScaledHeight(),definition.aspectRatio);
   for(const value of Object.values(object.getBoundingRect()))assert.ok(Number.isFinite(value));
   if(definition.id==='circle')assert.equal(studio.frameAt({x:430.25,y:288.75}),object.id);
  }
  const saved=JSON.parse(JSON.stringify(studio.serialize()));await studio.loadProject(saved);
  assert.equal(studio.canvas.getObjects().length,36);assert.ok(studio.canvas.getObjects().every(object=>object.visroFrame&&object.visroEmptyFrame&&object.clipPath));
 }finally{studio.destroy();}
});

test('all24 photo grids insert complete native child frames in one Undo and reopen with stable IDs',async()=>{
 for(const definition of FRAME_GRIDS){
  const studio=editor({width:800,height:600});try{
   await studio.insertFrame(definition.id,{center:{x:432.5,y:291.25}});const group=studio.canvas.getActiveObject();
   assert.equal(group.visroGridId,definition.id);assert.equal(group.getObjects().length,definition.slots.length);assert.ok(group.getObjects().every(child=>child instanceof fabric.FabricImage&&child.visroFrame==='square'&&child.visroEmptyFrame));
   const ids=group.getObjects().map(child=>child.id);assert.equal(new Set([group.id,...ids]).size,ids.length+1);near(group.getCenterPoint().x,432.5);near(group.getCenterPoint().y,291.25);
   await studio.undo();assert.equal(studio.canvas.getObjects().length,0);await studio.redo();assert.deepEqual(studio.canvas.getObjects()[0].getObjects().map(child=>child.id),ids);
   const saved=JSON.parse(JSON.stringify(studio.serialize()));await studio.loadProject(saved);assert.equal(studio.canvas.getObjects()[0].visroGridId,definition.id);
  }finally{studio.destroy();}
 }
});

test('photo fill preserves frame identity, transform, mask and z-order with cover crop and source provenance',async()=>{
 const studio=editor({width:600,height:600});try{
  studio.addShape('rect');await studio.insertFrame('arch');const frame=studio.canvas.getActiveObject(),id=frame.id;
  studio.updateSelected({left:103.25,top:72.5,width:190,height:245,angle:27});studio.flip('horizontal');studio.canvas.getActiveObject().set({skewX:11,skewY:4});
  studio.updateSelected({opacity:.73});const beforeRatio=frame.width/frame.height,before=bounds(frame),count=studio.canvas.getObjects().length,index=studio.canvas.getObjects().indexOf(frame),maskBefore=frame.clipPath.calcOwnMatrix();
  await studio.addImage(png(),'Wide source',{targetFrameId:id,pageId:studio.state.activePageId,source});
  assert.equal(studio.canvas.getActiveObject(),frame);assert.equal(frame.id,id);assert.equal(frame.visroFrame,'arch');assert.equal(frame.visroEmptyFrame,false);assert.equal(studio.canvas.getObjects().length,count);assert.equal(studio.canvas.getObjects().indexOf(frame),index);
  compareBounds(bounds(frame),before);assert.equal(frame.flipX,true);assert.equal(frame.opacity,.73);assert.ok(frame.cropX>0&&frame.cropY===0);near(frame.width/frame.height,beforeRatio);assert.deepEqual(frame.visroMetadata.source,source);
  const after=JSON.parse(JSON.stringify(studio.serialize()));await studio.undo();const empty=studio.canvas.getObjects()[index];assert.equal(empty.id,id);assert.equal(empty.visroEmptyFrame,true);compareBounds(bounds(empty),before);await studio.redo();assert.deepEqual(studio.serialize(),after);
  const reopened=editor();try{await reopened.loadProject(after);const image=reopened.canvas.getObjects()[index];assert.equal(image.id,id);assert.equal(image.visroFrame,'arch');assert.deepEqual(image.visroMetadata.source,source);compareBounds(bounds(image),before);}finally{reopened.destroy();}
 }finally{studio.destroy();}
});

test('nested rotated grid slots hit-test and fill in place without changing their parent or siblings',async()=>{
 const studio=editor({width:800,height:600});try{
  await studio.insertFrame('grid-three-feature-left');const group=studio.canvas.getActiveObject();studio.updateSelected({angle:24,left:280,top:190});
  const [frame,sibling]=group.getObjects(),frameId=frame.id,center=frame.getCenterPoint(),parentMatrix=group.calcTransformMatrix(),siblingMatrix=sibling.calcTransformMatrix(),before=bounds(frame);
  studio.canvas.renderAll();assert.equal(studio.frameAt(center),frameId);
  await studio.addImage(png(),'Nested source',{targetFrameId:frameId,source});
  assert.equal(group.getObjects()[0],frame);assert.deepEqual(group.calcTransformMatrix(),parentMatrix);assert.deepEqual(sibling.calcTransformMatrix(),siblingMatrix);compareBounds(bounds(frame),before);assert.equal(frame.visroEmptyFrame,false);
  const saved=JSON.parse(JSON.stringify(studio.serialize()));await studio.loadProject(saved);const restored=studio.canvas.getObjects()[0].getObjects()[0];assert.equal(restored.id,frameId);assert.deepEqual(restored.visroMetadata.source,source);
  studio.canvas.getObjects()[0].visroLocked=true;assert.equal(studio.frameAt(center),null);await assert.rejects(studio.replaceImageById(frameId,png()),/locked/);
 }finally{studio.destroy();}
});

test('captured replacement targets survive selection changes, but deletion, cancellation and origin-page changes reject late work',async()=>{
 const studio=editor({width:600,height:600});const original=fabric.FabricImage.fromURL;
 try{
  await studio.insertFrame('circle');const first=studio.canvas.getActiveObject();await studio.insertFrame('diamond');const second=studio.canvas.getActiveObject(),secondSource=second.getSrc();
  const replacement=studio.replaceImageById(first.id,png(),source);studio.selectLayer(second.id);await replacement;assert.notEqual(first.getSrc(),secondSource);assert.equal(second.getSrc(),secondSource);assert.deepEqual(first.visroMetadata.source,source);
  let release,started;const entered=new Promise(resolve=>started=resolve),gate=new Promise(resolve=>release=resolve);
  fabric.FabricImage.fromURL=async(...args)=>{started();await gate;return original.apply(fabric.FabricImage,args);};
  const pending=studio.addImage(png(),'Deleted target',{targetFrameId:second.id});await entered;studio.selectLayer(second.id);studio.remove();release();await assert.rejects(pending,/removed|available/);assert.ok(!studio.canvas.getObjects().includes(second));fabric.FabricImage.fromURL=original;
  const cancel=new AbortController();cancel.abort();await assert.rejects(studio.addImage(png(),'Cancelled',{targetFrameId:first.id,signal:cancel.signal}),{name:'AbortError'});
  const moving=studio.addPage(),late=studio.addImage(png(),'Old page',{targetFrameId:first.id});await moving;await assert.rejects(late,/page changed/);assert.equal(studio.canvas.getObjects().length,0);
 }finally{fabric.FabricImage.fromURL=original;studio.destroy();}
});

test('Undo and Redo preserve custom viewport and surviving single/multiple selections',async()=>{
 const studio=editor({width:600,height:600});try{
  studio.addShape('rect');const first=studio.selected.id;studio.addShape('circle');const second=studio.selected.id;studio.selectAll();studio.updateSelected({opacity:.4});studio.setZoom(1.75);studio.pan(-137.25,88.5);const viewport=[...studio.canvas.viewportTransform];
  await studio.undo();assert.deepEqual(studio.canvas.viewportTransform,viewport);assert.deepEqual(studio.canvas.getActiveObjects().map(o=>o.id).sort(),[first,second].sort());
  await studio.redo();assert.deepEqual(studio.canvas.viewportTransform,viewport);assert.deepEqual(studio.canvas.getActiveObjects().map(o=>o.id).sort(),[first,second].sort());
  studio.selectLayer(first);studio.updateSelected({fill:'#123456'});await studio.undo();assert.equal(studio.selected.id,first);assert.deepEqual(studio.canvas.viewportTransform,viewport);
 }finally{studio.destroy();}
});

test('offscreen page previews retain live selection, viewport, dirty state and revision and paint neighbor content',async()=>{
 const studio=editor({width:600,height:400});try{
  studio.addShape('heart');const first=studio.state.activePageId,id=studio.selected.id;studio.setBackground('#bb2244');await studio.addPage();const second=studio.state.activePageId;studio.addShape('circle');studio.setBackground('#114499');await studio.setPage(first);studio.selectLayer(id);studio.setZoom(1.4);studio.pan(-27,61);studio.markSaved();
  const active=studio.canvas.getActiveObject(),before=studio.serialize(),state=studio.state,viewport=[...studio.canvas.viewportTransform],image=await studio.previewPage(second,.5);
  assert.ok(image.startsWith('data:image/png;base64,'));assert.equal(studio.canvas.getActiveObject(),active);assert.deepEqual(studio.canvas.viewportTransform,viewport);assert.deepEqual(studio.serialize(),before);assert.equal(studio.state.revision,state.revision);assert.equal(studio.state.dirty,false);
  const decoded=await fabric.FabricImage.fromURL(image);assert.equal(decoded.width,300);assert.equal(decoded.height,200);
  const canvas=environment.document.createElement('canvas');canvas.width=decoded.width;canvas.height=decoded.height;canvas.getContext('2d').drawImage(decoded.getElement(),0,0);assert.deepEqual([...canvas.getContext('2d').getImageData(5,5,1,1).data],[17,68,153,255]);
  const cancel=new AbortController();cancel.abort();await assert.rejects(studio.previewPage(second,.5,cancel.signal),{name:'AbortError'});
 }finally{studio.destroy();}
});

test('page reorder and insert-after preserve page metadata and have one Undo boundary',async()=>{
 const studio=editor();try{
  const first=studio.state.activePageId;studio.setPageMetadata({notes:'Keep me',duration:7});await studio.addPage();const second=studio.state.activePageId;await studio.addPage();const third=studio.state.activePageId;
  studio.movePage(third,-1);assert.deepEqual(studio.state.pages.map(p=>p.id),[first,third,second]);assert.equal(studio.serialize().pages[0].metadata.notes,'Keep me');await studio.undo();assert.deepEqual(studio.state.pages.map(p=>p.id),[first,second,third]);
  await studio.addPageAfter(first);assert.equal(studio.state.pages.length,4);assert.equal(studio.state.pages[1].id,studio.state.activePageId);await studio.undo();assert.deepEqual(studio.state.pages.map(p=>p.id),[first,second,third]);
 }finally{studio.destroy();}
});

test('shape replacement retains ID, rendered placement, style and layer order with one Undo',async()=>{
 const studio=editor({width:700,height:500});try{
  studio.addShape('rect');const object=studio.canvas.getActiveObject();studio.updateSelected({left:117.25,top:93.5,width:230,height:160,angle:31,fill:'#114488',opacity:.65});studio.flip('horizontal');const id=object.id,before=bounds(object),source=studio.serialize();
  studio.replaceShape('heart');const replacement=studio.canvas.getActiveObject();assert.equal(replacement.id,id);assert.equal(replacement.visroShapeType,'heart');assert.equal(replacement.fill,'#114488');assert.equal(replacement.opacity,.65);assert.equal(replacement.flipX,true);compareBounds(bounds(replacement),before);assert.equal(studio.canvas.getObjects().length,1);
  await studio.undo();assert.deepEqual(studio.serialize(),source);assert.equal(studio.selected.id,id);await studio.redo();assert.equal(studio.selected.shapeType,'heart');
  studio.setLayerLocked(id,true);assert.throws(()=>studio.replaceShape('circle'),/unlocked/);
 }finally{studio.destroy();}
});

test('text helpers integrate selected-range styles and list actions as single history edits',async()=>{
 const studio=editor();try{
  studio.addText();studio.updateSelected({text:'Alpha\nBeta',fontWeight:500});const text=studio.canvas.getActiveObject(),id=text.id;assert.equal(studio.selected.fontWeight,500);
  text.enterEditing();text.selectionStart=0;text.selectionEnd=5;studio.updateSelectedTextStyle({fontWeight:600,fill:'#123456'});assert.equal(studio.selected.fontWeight,600);assert.equal(studio.selected.fill,'#123456');assert.equal(text.fontWeight,500);text.exitEditing();
  studio.formatSelectedText({type:'list',style:'numbered'});assert.equal(text.text,'1. Alpha\n2. Beta');await studio.undo();assert.equal(studio.selected.id,id);assert.equal(studio.canvas.getActiveObject().text,'Alpha\nBeta');
  studio.setLayerLocked(id,true);assert.equal(studio.formatSelectedText({type:'case',value:'upper'}),false);
 }finally{studio.destroy();}
});

test('actual filled masks cover-crop source pixels and preserve transparent silhouette cutouts',async()=>{
 for(const id of ['circle','ring']){
  const studio=editor({width:200,height:200});try{
   await studio.insertFrame(id,{center:{x:100,y:100}});const frame=studio.canvas.getActiveObject();await studio.addImage(png(),'Crop test',{targetFrameId:frame.id});
   const data=await studio.exportImage({transparent:true}),image=await fabric.FabricImage.fromURL(data),canvas=environment.document.createElement('canvas');canvas.width=200;canvas.height=200;const context=canvas.getContext('2d');context.drawImage(image.getElement(),0,0);
   const center=[...context.getImageData(100,100,1,1).data];if(id==='circle')assert.deepEqual(center,[0,255,0,255]);else assert.equal(center[3],0,'evenodd ring keeps its hole transparent');
   assert.equal(context.getImageData(56,56,1,1).data[3],0,'outside-circle corners remain transparent');
  }finally{studio.destroy();}
 }
});

test('nested frame deletion removes that slot and aborts a delayed fill without touching siblings',async()=>{
 const studio=editor(),original=fabric.FabricImage.fromURL;try{
  await studio.insertFrame('grid-four-square');const group=studio.canvas.getActiveObject(),frame=group.getObjects()[0],siblingIds=group.getObjects().slice(1).map(o=>o.id);
  let release,entered;const gate=new Promise(resolve=>release=resolve),started=new Promise(resolve=>entered=resolve);fabric.FabricImage.fromURL=async(...args)=>{entered();await gate;return original.apply(fabric.FabricImage,args);};
  const fill=studio.addImage(png(),'Late nested fill',{targetFrameId:frame.id});await started;studio.selectLayer(frame.id);studio.remove();release();await assert.rejects(fill,/removed|available/);assert.deepEqual(group.getObjects().map(o=>o.id),siblingIds);assert.equal(studio.canvas.getObjects().length,1);
 }finally{fabric.FabricImage.fromURL=original;studio.destroy();}
});

test('dash styles and display-pixel corner radii serialize, undo and retain rounded masks on fill',async()=>{
 const studio=editor();try{
  studio.addShape('rect');studio.updateSelected({width:300,height:150,stroke:'#123456',strokeWidth:4,strokeDashArray:[12,8],strokeLineCap:'round'});studio.setCornerRadius(24);assert.equal(studio.selected.cornerRadius,24);assert.deepEqual(studio.selected.strokeDashArray,[12,8]);assert.equal(studio.selected.strokeLineCap,'round');
  const rect=studio.canvas.getActiveObject();near(rect.rx*Math.abs(rect.scaleX),24);near(rect.ry*Math.abs(rect.scaleY),24);const id=rect.id,saved=studio.serialize();await studio.loadProject(saved);studio.selectLayer(id);assert.ok(Math.abs(studio.selected.cornerRadius-24)<.001,'Fabric JSON radius rounding stays below one thousandth of a pixel');
  assert.throws(()=>studio.updateSelected({strokeDashArray:[NaN]}),/dash lengths/);assert.throws(()=>studio.updateSelected({strokeLineCap:'invalid'}),/line cap/);
  await studio.addImage(png());const image=studio.canvas.getActiveObject();studio.updateSelected({width:300,height:100});studio.setCornerRadius(18);assert.equal(studio.selected.frameId,'rounded');near(studio.selected.cornerRadius,18);const before=bounds(image);
  await studio.replaceImageById(image.id,png(100,500));compareBounds(bounds(image),before);near(image.clipPath.rx*Math.abs(image.clipPath.scaleX*image.scaleX),18);near(image.clipPath.ry*Math.abs(image.clipPath.scaleY*image.scaleY),18);
  studio.setCornerRadius(0);assert.equal(image.clipPath,undefined);assert.equal(studio.selected.frameId,undefined);await studio.undo();assert.equal(studio.selected.frameId,'rounded');assert.ok(Math.abs(studio.selected.cornerRadius-18)<.01,'serialized clip scaling preserves radius within one hundredth of a pixel');
 }finally{studio.destroy();}
});
