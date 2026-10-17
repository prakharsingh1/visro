const {test}=require('node:test');
const assert=require('node:assert/strict');
const {installNativeInputIsolation,enableNativeInputIsolation}=require('../electron/native-smoke.cjs');
function target(){return{listeners:new Map(),addEventListener(type,fn,capture){assert.equal(capture,true);this.listeners.set(type,fn);}};}
function move(type,buttons,pointerType){return{type,buttons,pointerType,clientX:801,clientY:384,isTrusted:true,stopped:false,stopImmediatePropagation(){this.stopped=true;}};}
test('normal native acceptance never installs an external-input filter',()=>{const view=target();assert.equal(installNativeInputIsolation(view),false);assert.equal(view.listeners.size,0);assert.equal(view.__visroNativeInputIsolation,undefined);});
test('isolated automation retains genuine held moves and hover but excludes the observed unpressed interleaving stream',()=>{const view=target();assert.equal(installNativeInputIsolation(view,true),true);const state=view.__visroNativeInputIsolation,dispatch=e=>{view.listeners.get(e.type)(e);return e;};assert.equal(dispatch(move('mousemove',0)).stopped,false);state.heldButtons=1;assert.equal(dispatch(move('mousemove',1)).stopped,false);assert.equal(dispatch(move('mousemove',0)).stopped,true);assert.equal(dispatch(move('pointermove',0,'mouse')).stopped,true);assert.equal(dispatch(move('pointermove',0,'pen')).stopped,false);state.heldButtons=0;assert.equal(dispatch(move('mousemove',0)).stopped,false);assert.equal(state.excludedMoves,2);assert.deepEqual(state.samples.map(item=>[item.x,item.y,item.trusted]),[[801,384,true],[801,384,true]]);});
test('input-isolation reporting is bounded and reinstalling cannot duplicate listeners',()=>{const view=target();installNativeInputIsolation(view,true);const state=view.__visroNativeInputIsolation;state.heldButtons=1;for(let i=0;i<35;i++)view.listeners.get('mousemove')(move('mousemove',0));assert.equal(state.excludedMoves,35);assert.equal(state.samples.length,20);installNativeInputIsolation(view,true);assert.equal(view.__visroNativeInputIsolation,state);assert.equal(view.listeners.size,2);});

test('application-created unpressed moves remain visible to the renderer during an owned drag',()=>{const view=target();installNativeInputIsolation(view,true);view.__visroNativeInputIsolation.heldButtons=1;for(const type of ['mousemove','pointermove']){const event={...move(type,0,'mouse'),isTrusted:false};view.listeners.get(type)(event);assert.equal(event.stopped,false);}assert.equal(view.__visroNativeInputIsolation.excludedMoves,0);});

test('the isolated CDP bridge reinstalls after a document replacement and retains per-document reports',async()=>{
 const vm=require('node:vm');let view,context;const reset=()=>{view=target();view.window=view;context=vm.createContext(view);};reset();
 const renderer={evaluate:async expression=>vm.runInContext(expression,context),command:async(method)=>{if(method==='Page.reload')reset();return{};}};
 await enableNativeInputIsolation(renderer);
 for(let i=0;i<2;i++){
  await renderer.command('Input.dispatchMouseEvent',{type:'mousePressed',buttons:1});assert.equal(view.__visroNativeInputIsolation.heldButtons,1);
  const event=move('mousemove',0);view.listeners.get('mousemove')(event);assert.equal(event.stopped,true);
  await renderer.command('Input.dispatchMouseEvent',{type:'mouseReleased',buttons:0});assert.equal(view.__visroNativeInputIsolation.heldButtons,0);
  if(i===0)await renderer.command('Page.reload');
 }
 const report=await renderer.nativeInputIsolationReport();assert.equal(report.excludedMoves,2);assert.equal(report.samples.length,2);
});
