const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const Module=require('node:module');
const {build}=require('esbuild');
let React,createRoot,ContinuousPages,window,document;
const views=new Set();
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
before(async()=>{
  const fabric=await import('fabric/node');({window,document}=fabric.getEnv());
  Object.assign(global,{window,document,HTMLElement:window.HTMLElement,Node:window.Node,IS_REACT_ACT_ENVIRONMENT:true,requestAnimationFrame:job=>setTimeout(()=>job(performance.now()),0),cancelAnimationFrame:clearTimeout});
  global.IntersectionObserver=class{constructor(callback){this.callback=callback;}observe(target){queueMicrotask(()=>this.callback([{target,isIntersecting:true,intersectionRect:{width:150,height:96}}]));}disconnect(){}};
  React=require('react');({createRoot}=require('react-dom/client'));
  const result=await build({entryPoints:[path.join(__dirname,'../src/ContinuousPages.tsx')],bundle:true,platform:'node',format:'cjs',external:['react','react-dom'],loader:{'.css':'empty'},write:false});
  const filename=path.join(__dirname,'continuous-idle-build.cjs'),module=new Module(filename);module.filename=filename;module.paths=Module._nodeModulePaths(__dirname);module._compile(result.outputFiles[0].text,filename);({ContinuousPages}=module.exports);
});
after(()=>{for(const view of views)view.close();});
function fixture(prefix='page'){
  const state={width:1080,height:1080,revision:1,activePageId:`${prefix}-3`,pages:[1,2,3].map(n=>({id:`${prefix}-${n}`,name:`Page ${n}`}))},calls=[],published=[],canvas=document.createElement('canvas'),thumbnail=document.createElement('canvas');
  thumbnail.width=thumbnail.height=2;const context=thumbnail.getContext('2d');context.fillStyle='#F26B3A';context.fillRect(0,0,2,2);const image=thumbnail.toDataURL('image/png');
  const renders=new Set(),studio={width:1080,height:1080,activePageId:state.activePageId,canvas:{lowerCanvasEl:canvas,viewportTransform:[1,0,0,1,0,0],on(event,handler){if(event==='after:render')renders.add(handler);return()=>renders.delete(handler);},requestRenderAll:()=>{},emitRender(){for(const handler of renders)handler({ctx:{canvas}});}},pan(x,y){this.canvas.viewportTransform[4]+=x;this.canvas.viewportTransform[5]+=y;},async previewPage(id,scale,signal){calls.push({id,scale,signal});return image;}};
  return{state,studio,calls,published};
}
async function mount(initial,interacting={current:false}){
  let current=initial;
  const main=document.createElement('main'),viewport=document.createElement('div'),strip=document.createElement('div'),container=document.createElement('div');
  viewport.className='canvas-viewport';strip.className='page-strip';viewport.append(container);main.append(viewport,strip);document.body.append(main);
  Object.defineProperties(viewport,{clientWidth:{value:1368},clientHeight:{value:628}});
  const root=createRoot(container),getEditor=()=>current.studio,viewportRef={current:viewport};
  const render=async(next,key='one')=>{current=next;strip.replaceChildren(...next.state.pages.map(page=>{const node=document.createElement('button');node.dataset.previewPageId=page.id;return node;}));await React.act(async()=>{root.render(React.createElement(ContinuousPages,{getEditor,viewportRef,state:next.state,enabled:true,projectKey:key,interacting,thumbnails:{},onVisiblePage:()=>{},onNotify:()=>{},onPreview:(...args)=>next.published.push(args)}));await sleep(0);});};
  const view={viewport,interacting,render,async wait(ms){await React.act(async()=>{await sleep(ms);});},release(event='pointerup'){interacting.current=false;window.dispatchEvent(new window.Event(event));},close(){React.act(()=>root.unmount());main.remove();views.delete(view);}};
  views.add(view);await render(initial);return view;
}

test('a Space-pan held past warm-up resumes cold visible previews on release without a document change',async()=>{
  const data=fixture(),interaction={current:true},view=await mount(data,interaction);
  try{
    const before=JSON.stringify(data.state);
    await view.wait(700);assert.equal(data.calls.length,0,'held gestures must not start a preview');
    view.release();view.release('mouseup');await view.wait(250);
    assert.deepEqual(new Set(data.calls.map(call=>call.id)),new Set(data.state.pages.map(page=>page.id)),'release must resume every pending visible page');
    assert.equal(data.calls.length,3,'pointerup plus mouseup must coalesce into one batch');
    assert.ok(data.published.some(([id])=>id==='page-1'),'the cold footer-only page must publish without activation');
    assert.equal(JSON.stringify(data.state),before,'preview recovery cannot edit the document or revision');
  }finally{view.close();}
});

test('a gesture interrupting a running batch resumes the remaining pages sequentially',async()=>{
  const data=fixture();let first=true,releaseFirst;const original=data.studio.previewPage.bind(data.studio);
  data.studio.previewPage=async(...args)=>{const output=await original(...args);if(first){first=false;return new Promise(resolve=>{releaseFirst=()=>resolve(output);});}return output;};
  const view=await mount(data);
  try{
    await view.wait(700);assert.equal(data.calls.length,1);view.interacting.current=true;
    await React.act(async()=>{releaseFirst();await sleep(20);});assert.equal(data.calls.length,1,'a held gesture must pause before the next page');
    view.release('pointercancel');await view.wait(250);
    assert.equal(data.calls.length,3);assert.equal(new Set(data.calls.map(call=>call.id)).size,3,'cached completed work cannot be rendered twice on resume');
  }finally{view.close();}
});

test('switching projects cancels a paused batch and prevents stale previews from publishing',async()=>{
  const old=fixture('old'),next=fixture('new'),interaction={current:true},view=await mount(old,interaction);
  try{
    await view.wait(700);assert.equal(old.calls.length,0);
    await view.render(next,'two');view.release('blur');await view.wait(850);
    assert.equal(old.calls.length,0,'the released old project cannot restart');
    assert.equal(old.published.length,0);
    assert.deepEqual(new Set(next.calls.map(call=>call.id)),new Set(next.state.pages.map(page=>page.id)));
    assert.ok(next.published.every(([, ,projectKey])=>projectKey==='two'));
  }finally{view.close();}
});

test('unmounting while held removes the resume task and all release listeners',async()=>{
  const data=fixture(),view=await mount(data,{current:true});await view.wait(700);view.close();
  window.dispatchEvent(new window.Event('pointerup'));window.dispatchEvent(new window.Event('blur'));await sleep(200);
  assert.equal(data.calls.length,0);assert.equal(data.published.length,0);
});

test('a completed old preview resolving after project replacement cannot publish into the new project',async()=>{
  const old=fixture('old-result'),next=fixture('next-result');let resolveOld;
  old.studio.previewPage=(id,scale,signal)=>{old.calls.push({id,scale,signal});return new Promise(resolve=>{resolveOld=resolve;});};
  const view=await mount(old);
  try{
    await view.wait(700);assert.equal(old.calls.length,1);
    await view.render(next,'replacement');assert.equal(old.calls[0].signal.aborted,true);
    await React.act(async()=>{resolveOld('data:image/png;base64,AA==');await sleep(20);});
    await view.wait(850);assert.equal(old.published.length,0);
    assert.deepEqual(new Set(next.calls.map(call=>call.id)),new Set(next.state.pages.map(page=>page.id)));
    assert.ok(next.published.every(([, ,projectKey])=>projectKey==='replacement'));
  }finally{view.close();}
});

test('replacing a panned project preserves the incoming fit before synchronizing native page scroll',async()=>{
  const old=fixture('departing'),next=fixture('incoming');
  old.studio.canvas.viewportTransform=[.5,0,0,.5,1268,44];
  next.state.pages=next.state.pages.slice(0,1);next.state.activePageId=next.studio.activePageId=next.state.pages[0].id;
  next.studio.canvas.viewportTransform=[.5,0,0,.5,414,44];
  const view=await mount(old,{current:true});
  try{
    await React.act(async()=>{old.studio.canvas.emitRender();await sleep(0);});
    assert.equal(view.viewport.scrollLeft,100,'the departing project starts with a genuine off-center native viewport');
    const fit=[...next.studio.canvas.viewportTransform],document=JSON.stringify(next.state);
    await view.render(next,'incoming-project');
    assert.deepEqual(next.studio.canvas.viewportTransform,fit,'a new project must retain its fitted viewport, rather than inherit the previous horizontal scroll');
    assert.equal(view.viewport.scrollLeft,954,'native scroll must be derived from the incoming fit');
    assert.equal(JSON.stringify(next.state),document);
  }finally{view.close();}
});
