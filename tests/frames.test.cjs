const test=require('node:test');
const assert=require('node:assert/strict');
const {Path}=require('fabric');
const catalog=import('../src/frames.ts');
const near=(a,b,message)=>assert.ok(Math.abs(a-b)<1e-7,message||`${a} != ${b}`);

test('frame catalog preserves legacy masks and offers 36 silhouettes plus 24 photo grids',async()=>{
 const {FRAME_LIBRARY,FRAME_GRIDS,FRAME_ITEMS,FRAMES_PROVENANCE,getFrameDefinition,getGridDefinition,getFrameLibraryItem}=await catalog;
 assert.equal(FRAME_LIBRARY.length,36);assert.equal(FRAME_GRIDS.length,24);assert.equal(FRAME_ITEMS.length,60);
 assert.equal(new Set(FRAME_ITEMS.map(item=>item.id)).size,60);assert.equal(new Set(FRAME_ITEMS.map(item=>item.name)).size,60);
 for(const id of ['circle','rounded','arch','diamond'])assert.equal(getFrameDefinition(id).kind,'frame');
 assert.equal(getFrameDefinition('rounded').path,'M15 0 H85 Q100 0 100 15 V85 Q100 100 85 100 H15 Q0 100 0 85 V15 Q0 0 15 0 Z');
 assert.equal(getFrameDefinition('arch').path,'M0 100 L0 50 Q0 0 50 0 Q100 0 100 50 L100 100 Z');
 assert.equal(getFrameDefinition('diamond').path,'M50 0 L100 50 L50 100 L0 50 Z');
 assert.equal(new Set(FRAME_LIBRARY.map(item=>`${item.path}|${item.aspectRatio}`)).size,36);
 for(const item of FRAME_ITEMS){assert.equal(getFrameLibraryItem(item.id),item);assert.equal(item.kind==='frame'?getFrameDefinition(item.id):getGridDefinition(item.id),item);assert.ok(item.tags.length>=2);assert.ok(Number.isFinite(item.aspectRatio)&&item.aspectRatio>=.5&&item.aspectRatio<=2);}
 assert.equal(getFrameLibraryItem('unknown-frame'),undefined);assert.equal(getGridDefinition('circle'),undefined);assert.equal(getFrameDefinition('grid-single'),undefined);
 assert.equal(FRAMES_PROVENANCE.networkRequired,false);assert.equal(FRAMES_PROVENANCE.license,'AGPL-3.0-only');
});

test('all clip masks parse as finite nonempty native Fabric paths inside normalized bounds',async()=>{
 const {FRAME_LIBRARY}=await catalog;
 for(const frame of FRAME_LIBRARY){
  assert.match(frame.path,/^M/);assert.ok(!/[^MmLlHhVvCcSsQqTtAaZz\d+.,\s-]/.test(frame.path),frame.id);assert.ok(['nonzero','evenodd'].includes(frame.fillRule));
  const path=new Path(frame.path,{fillRule:frame.fillRule}),left=path.pathOffset.x-path.width/2,top=path.pathOffset.y-path.height/2;
  assert.ok([left,top,path.width,path.height].every(Number.isFinite),frame.id);assert.ok(path.width>40&&path.height>40,frame.id);
  assert.ok(left>=-.01&&top>=-.01&&left+path.width<=100.01&&top+path.height<=100.01,frame.id);
 }
});

test('photo grids partition their complete area without overlap and cover 1 through 9 slots',async()=>{
 const {FRAME_GRIDS}=await catalog;
 assert.deepEqual([...new Set(FRAME_GRIDS.map(grid=>grid.slots.length))].sort((a,b)=>a-b),[1,2,3,4,5,6,7,8,9]);
 assert.equal(new Set(FRAME_GRIDS.map(grid=>`${JSON.stringify(grid.slots)}|${grid.aspectRatio}`)).size,24);
 for(const grid of FRAME_GRIDS){
  near(grid.slots.reduce((sum,s)=>sum+s.width*s.height,0),1,grid.id);
  for(const slot of grid.slots){assert.ok([slot.x,slot.y,slot.width,slot.height].every(Number.isFinite));assert.ok(slot.x>=0&&slot.y>=0&&slot.width>0&&slot.height>0&&slot.x+slot.width<=1+1e-8&&slot.y+slot.height<=1+1e-8,grid.id);}
  for(let i=0;i<grid.slots.length;i++)for(let j=i+1;j<grid.slots.length;j++){const a=grid.slots[i],b=grid.slots[j],overlapX=Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x),overlapY=Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y);assert.ok(overlapX<=1e-8||overlapY<=1e-8,`${grid.id} overlaps slots${i}/${j}`);}
 }
});

test('grid gap geometry keeps outside edges flush and uses document pixels without mutation',async()=>{
 const {FRAME_GRIDS,getGridDefinition,resolveGridSlots}=await catalog;
 const grid=getGridDefinition('grid-four-square'),original=JSON.stringify(grid),slots=resolveGridSlots(grid,1000,800,20);
 assert.deepEqual(slots,[{x:0,y:0,width:490,height:390},{x:510,y:0,width:490,height:390},{x:0,y:410,width:490,height:390},{x:510,y:410,width:490,height:390}]);
 assert.equal(JSON.stringify(grid),original);
 for(const grid of FRAME_GRIDS)for(const ratio of [1,1.6]){const slots=resolveGridSlots(grid,1200,1200/ratio,16);for(const slot of slots)assert.ok(slot.width>0&&slot.height>0&&slot.x>=0&&slot.y>=0&&slot.x+slot.width<=1200+1e-7&&slot.y+slot.height<=1200/ratio+1e-7,grid.id);}
 const zero=resolveGridSlots(grid,1000,800,0);near(zero.reduce((sum,s)=>sum+s.width*s.height,0),800000);
 assert.deepEqual(resolveGridSlots(getGridDefinition('grid-single'),320,180,20),[{x:0,y:0,width:320,height:180}]);
 for(const [width,height,gap]of[[0,500,10],[100,-5,10],[NaN,500,10],[100,200,-1],[100,200,Infinity],[10,10,100]])assert.throws(()=>resolveGridSlots(grid,width,height,gap));
});

test('search combines meaningful tags and categories, including empty results',async()=>{
 const {searchFrames}=await catalog;
 assert.equal(searchFrames().length,60);assert.equal(searchFrames('frame').length,36);assert.equal(searchFrames('','Photo grids').length,24);
 assert.equal(searchFrames('HEART')[0].id,'heart');assert.equal(searchFrames('3 photos').filter(item=>item.kind==='grid').length,5);
 assert.equal(searchFrames('circle','Organic').length,0);assert.equal(searchFrames('unlikely-nonexistent-query').length,0);
 assert.ok(searchFrames('hero left').some(item=>item.id==='grid-two-feature'));
});

test('previews are local SVG with correct aspect ratios, explicit clip rules and safe labels',async()=>{
 const {FRAME_ITEMS,FRAME_LIBRARY,FRAME_PLACEHOLDER_ART,framePreviewSVG}=await catalog;
 assert.ok(FRAME_PLACEHOLDER_ART.includes('<path')&&!/<image|<text|href=|onload=/.test(FRAME_PLACEHOLDER_ART));
 for(const item of FRAME_ITEMS){const svg=framePreviewSVG(item,'test');assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));assert.ok(svg.includes(`viewBox="0 0 100 ${100/item.aspectRatio}"`));assert.ok(!/<(?:image|script|foreignObject|use|style|text)\b|(?:href|onload)=/i.test(svg),item.id);if(item.kind==='frame'){assert.ok(svg.includes(`clip-rule="${item.fillRule}"`));assert.ok(svg.includes(`d="${item.path}"`));}else assert.equal((svg.match(/<svg /g)||[]).length,item.slots.length+1);}
 const svg=framePreviewSVG({...FRAME_LIBRARY[0],name:'A <tag> & "quote"'});assert.ok(svg.includes('A &lt;tag&gt; &amp; &quot;quote&quot;'));assert.ok(!svg.includes('<tag>'));
});
