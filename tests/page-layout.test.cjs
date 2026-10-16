const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const {transformSync}=require('esbuild');
const value={exports:{}};
new Function('module','exports',transformSync(readFileSync(join(__dirname,'../src/page-layout.ts'),'utf8'),{loader:'ts',format:'cjs',target:'es2022'}).code)(value,value.exports);
const {pageStackLayout,pageStackPosition,stackScrollForPage,stackZoomScroll,visibleStackPage,visibleStackRange}=value.exports;

test('continuous pages keep a54px gap and enough heading space at every zoom',()=>{
  for(const zoom of [.02,.35,1,8]){
    const layout=pageStackLayout(1080,1920,zoom,1000,700,20);
    assert.ok(Math.abs(layout.pitch-layout.pageHeight-54)<.00001);assert.ok(layout.paddingY>=64);assert.ok(layout.paddingX>=48);
    assert.ok(layout.contentHeight>=layout.paddingY*2+20*layout.pageHeight+19*54);
  }
});

test('native scroll translates scene coordinates exactly without changing page geometry',()=>{
  const layout=pageStackLayout(800,600,.7,1100,700,4);
  const first=pageStackPosition(layout,0,15,300),second=pageStackPosition(layout,1,15,300);
  assert.equal(second.top-first.top,layout.pitch);assert.equal(first.left,layout.paddingX-15);
  const moved=pageStackPosition(layout,1,45,420);assert.equal(moved.left-second.left,-30);assert.equal(moved.top-second.top,-120);
  assert.equal(layout.pageWidth,560);assert.equal(layout.pageHeight,420);
});

test('footer visible page follows the viewport center while a boundary can show two pages',()=>{
  const layout=pageStackLayout(1000,1000,.5,1000,700,3);
  assert.equal(visibleStackPage(layout,0),0);
  const boundary=layout.paddingY+layout.pageHeight+layout.gap/2-layout.viewportHeight/2;
  const first=pageStackPosition(layout,0,0,boundary),second=pageStackPosition(layout,1,0,boundary);
  assert.ok(first.top+layout.pageHeight>0&&second.top<layout.viewportHeight,'both adjacent pages must remain visible');
  assert.equal(visibleStackPage(layout,boundary-1),0);assert.equal(visibleStackPage(layout,boundary+1),1);
});

test('explicit page navigation centers each page and clamps to valid native scroll extent',()=>{
  const layout=pageStackLayout(1080,1080,.4,1100,700,5);
  for(let index=0;index<5;index++){
    const scroll=stackScrollForPage(layout,index),position=pageStackPosition(layout,index,0,scroll);
    assert.ok(scroll>=0&&scroll<=layout.contentHeight-layout.viewportHeight);
    assert.equal(visibleStackPage(layout,scroll),index);
    assert.ok(Math.abs(position.top+layout.pageHeight/2-layout.viewportHeight/2)<.0001);
  }
  assert.equal(stackScrollForPage(layout,0),0);
});

test('low-zoom ranges include every intersecting page and heading, plus at most one neighbour per side',()=>{
  for(const zoom of [.02,.1,.35,1,8]){
    const layout=pageStackLayout(1080,1080,zoom,1368,628,12);
    for(const scroll of [0,stackScrollForPage(layout,5),layout.contentHeight-layout.viewportHeight]){
      const visible=Array.from({length:12},(_,index)=>index).filter(index=>{const top=layout.paddingY+index*layout.pitch;return top+layout.pageHeight>scroll&&top-32<scroll+layout.viewportHeight;});
      const range=visibleStackRange(layout,scroll);
      for(const index of visible)assert.ok(index>=range.start&&index<=range.end,`zoom${zoom}: visible page${index+1} cannot be virtualized away`);
      assert.ok(range.end-range.start+1<=visible.length+2,'overscan cannot grow the DOM beyond one page per side');
    }
  }
  const tiny=pageStackLayout(1080,1080,.02,1368,628,12),range=visibleStackRange(tiny,400,0);
  assert.ok(range.end-range.start+1>=8,'2% zoom must render the many pages visible at once');
});

test('a heading entering the viewport renders its page before its artwork surface appears',()=>{
  const layout=pageStackLayout(1080,1080,.1,1368,628,12),index=7,pageTop=layout.paddingY+index*layout.pitch;
  const scroll=pageTop-20-layout.viewportHeight,range=visibleStackRange(layout,scroll,0);
  assert.ok(pageTop>scroll+layout.viewportHeight,'the artwork itself is below the viewport');assert.ok(range.end>=index,'its visible heading must still be rendered');
});

test('Ctrl-wheel anchors an inactive eighth-page point without scaling fixed page gaps',()=>{
  const previous=pageStackLayout(1080,1080,.1,1208,448,12),next=pageStackLayout(1080,1080,.1*Math.exp(.24),1208,448,12),index=7;
  const left=previous.paddingX-(previous.viewportWidth-previous.pageWidth)/2,top=1000;
  const point={x:previous.paddingX+previous.pageWidth*.75-left,y:previous.paddingY+index*previous.pitch+previous.pageHeight*.5-top};
  const scroll=stackZoomScroll(previous,next,left,top,point);
  assert.ok(Math.abs(next.paddingX+next.pageWidth*.75-scroll.left-point.x)<.00001);
  assert.ok(Math.abs(next.paddingY+index*next.pitch+next.pageHeight*.5-scroll.top-point.y)<.00001);
});

test('zoom preserves CSS offsets inside a page gap instead of scaling the gap',()=>{
  const previous=pageStackLayout(1080,1080,.1,1208,448,12),next=pageStackLayout(1080,1080,.2,1208,448,12),index=4,top=600;
  const point={x:604,y:previous.paddingY+index*previous.pitch+previous.pageHeight+28-top};
  const scroll=stackZoomScroll(previous,next,previous.paddingX+previous.pageWidth/2-604,top,point);
  assert.ok(Math.abs(next.paddingY+index*next.pitch+next.pageHeight+28-scroll.top-point.y)<.00001);
});

test('narrow pages retain horizontal workspace for off-centre pointer zoom',()=>{
  const previous=pageStackLayout(1080,1080,.02,1368,628,12),next=pageStackLayout(1080,1080,.05,1368,628,12);
  const left=previous.paddingX-(previous.viewportWidth-previous.pageWidth)/2,point={x:(previous.viewportWidth-previous.pageWidth)/2+previous.pageWidth*.2,y:314};
  const scroll=stackZoomScroll(previous,next,left,0,point);assert.ok(scroll.left>0);
  assert.ok(Math.abs(next.paddingX+next.pageWidth*.2-scroll.left-point.x)<.00001,'narrow-page zoom cannot snap every point back to the horizontal centre');
});
