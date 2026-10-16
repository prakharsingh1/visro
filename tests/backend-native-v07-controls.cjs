const {test}=require('node:test');
const assert=require('node:assert/strict');
const {lineSceneEndpoints,deliveredPointerToScene,assertNativeVector,prepareNativeEffectClick}=require('../electron/native-v07-controls.cjs');
const native=(patch={})=>({type:'Group',originX:'center',originY:'center',left:300,top:200,width:100,height:30,scaleX:2,scaleY:.5,angle:90,skewX:0,skewY:0,visroLine:{start:{x:-20,y:-10},end:{x:30,y:15}},...patch});

test('native endpoint gesture coordinates account for saved rotation, unequal scale and flips',()=>{
 const points=lineSceneEndpoints(native());assert.ok(Math.abs(points.start.x-305)<1e-9);assert.ok(Math.abs(points.start.y-160)<1e-9);assert.ok(Math.abs(points.end.x-292.5)<1e-9);assert.ok(Math.abs(points.end.y-260)<1e-9);
 const flipped=lineSceneEndpoints(native({flipX:true,flipY:true}));assert.ok(Math.abs(flipped.start.x-295)<1e-9);assert.ok(Math.abs(flipped.start.y-240)<1e-9);
});

test('the endpoint oracle rejects unsupported or invalid fixture transforms instead of guessing',()=>{
 for(const patch of [{originX:'left'},{originY:'top'},{skewX:10},{skewY:-3},{visroLine:{start:{x:Infinity,y:0},end:{x:1,y:2}}}])assert.throws(()=>lineSceneEndpoints(native(patch)));
});

test('endpoint acceptance maps rounded DOM coordinates through the actual delivered page box',()=>{
 const page={left:482,top:186,width:548,height:548,sourceWidth:1080,sourceHeight:1080},actual=deliveredPointerToScene({x:811,y:436,page});
 assert.equal(actual.x,329*1080/548);assert.equal(actual.y,250*1080/548);
 const requested=deliveredPointerToScene({x:811.68,y:436.5,page});assert.ok(Math.abs(requested.x-actual.x)>1,'the oracle must not substitute requested fractional CDP coordinates');
 assert.throws(()=>deliveredPointerToScene(null),/actual DOM/);assert.throws(()=>deliveredPointerToScene({x:811,y:436,page:{...page,width:0}}),/positive/);
});

test('native vector acceptance rejects raster substitutes and invalid saved geometry at every depth',()=>{
 const path={type:'Path',left:0,top:0,width:50,height:20,scaleX:1,scaleY:1,path:[['M',0,0],['C',1,2,3,4,5,6]]};assert.doesNotThrow(()=>assertNativeVector(native({objects:[path]})));
 assert.throws(()=>assertNativeVector(native({objects:[{...path,type:'Image'}]})),/editable native vectors/);
 for(const value of [null,NaN,Infinity])assert.throws(()=>assertNativeVector(native({objects:[{...path,width:value}]})),/finite/);
 assert.throws(()=>assertNativeVector(native({objects:[{...path,path:[['M',0,NaN]]}]})),/finite/);
});

test('native effect input waits for centered layout and checks the actual nested hit before dispatch',async()=>{
 const originalDocument=global.document,originalRAF=global.requestAnimationFrame;
 let frames=0,alignment,hitPoint;
 const child={},overlay={},tile={getAttribute:()=> 'Apply Midnight effect',scrollIntoView(value){alignment=value;},getBoundingClientRect(){return{left:308,top:frames>=2?420:777,width:102,height:126};},contains:node=>node===child,closest:()=>({scrollTop:472})};
 global.document={querySelectorAll:()=>[tile],elementFromPoint(x,y){hitPoint={x,y};return y>=831?overlay:child;}};
 global.requestAnimationFrame=job=>queueMicrotask(()=>{frames++;job();});
 try{
  const snapshot=await prepareNativeEffectClick('Apply Midnight effect');
  assert.deepEqual(snapshot.point,{x:359,y:483});assert.deepEqual(hitPoint,snapshot.point);
  assert.equal(alignment.block,'center');assert.equal(snapshot.scrollTop,472);
 }finally{global.document=originalDocument;global.requestAnimationFrame=originalRAF;}
});

test('native effect input rejects a sticky footer hit instead of clicking an obscured tile',async()=>{
 const originalDocument=global.document,originalRAF=global.requestAnimationFrame;
 const tile={getAttribute:()=> 'Apply Midnight effect',scrollIntoView(){},getBoundingClientRect:()=>({left:308,top:777,width:102,height:126}),contains:()=>false};
 global.document={querySelectorAll:()=>[tile],elementFromPoint:()=>({className:'shape-effects-footer'})};global.requestAnimationFrame=job=>queueMicrotask(job);
 try{await assert.rejects(prepareNativeEffectClick('Apply Midnight effect'),/does not receive the pointer: Apply Midnight effect/);}
 finally{global.document=originalDocument;global.requestAnimationFrame=originalRAF;}
});
