'use strict';

// This explicit smoke runner launches a built desktop renderer and drives CDP
// using only Node's native fetch/WebSocket and an isolated Chromium profile.
// Project fixtures and autosaves remain inside that disposable profile.
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { rasterPointForFill, gestureDeltaBounds } = require('./native-geometry.cjs');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The isolated automation window must not mix a user's unpressed OS motion
// into a CDP-owned drag. This never runs in the shipped application or in a
// normal-window acceptance run. All commanded inputs and position assertions
// remain real Chromium input; excluded events are reported separately.
function installNativeInputIsolation(target, enabled = false) {
  if (!enabled) return false;
  if (target.__visroNativeInputIsolation) return true;
  const state = { heldButtons: 0, excludedMoves: 0, samples: [] };
  target.__visroNativeInputIsolation = state;
  const filter = event => {
    if (!event.isTrusted || !state.heldButtons || event.buttons !== 0 || event.pointerType && event.pointerType !== 'mouse') return;
    state.excludedMoves++;
    state.samples.push({ type: event.type, x: event.clientX, y: event.clientY, buttons: event.buttons, trusted: event.isTrusted, pointerType: event.pointerType || 'mouse' });
    if (state.samples.length > 20) state.samples.shift();
    event.stopImmediatePropagation();
  };
  target.addEventListener('mousemove', filter, true);
  target.addEventListener('pointermove', filter, true);
  return true;
}

async function enableNativeInputIsolation(renderer) {
  const source = `(${installNativeInputIsolation.toString()})(window,true)`;
  await renderer.command('Page.addScriptToEvaluateOnNewDocument', { source });
  await renderer.evaluate(source);
  const original = renderer.command.bind(renderer), snapshots = [];
  renderer.command = async (method, params = {}) => {
    if (method === 'Page.reload') snapshots.push(await renderer.evaluate('window.__visroNativeInputIsolation||null'));
    if (method === 'Input.dispatchMouseEvent' && params.type === 'mousePressed') await renderer.evaluate(`${source};window.__visroNativeInputIsolation.heldButtons=${Number(params.buttons) || 1}`);
    const result = await original(method, params);
    if (method === 'Input.dispatchMouseEvent' && params.type === 'mouseReleased') await renderer.evaluate(`${source};window.__visroNativeInputIsolation.heldButtons=${Number(params.buttons) || 0}`);
    return result;
  };
  renderer.nativeInputIsolationReport = async () => {
    const reports = [...snapshots, await renderer.evaluate('window.__visroNativeInputIsolation||null')].filter(Boolean);
    return { mode: 'exclude unpressed external moves during CDP-owned mouse drags', excludedMoves: reports.reduce((sum, item) => sum + item.excludedMoves, 0), samples: reports.flatMap(item => item.samples).slice(-20) };
  };
}

async function removeSmokeProfile(profile, remove = fs.rm) {
  // Chromium helpers can finish writing shader/cache files just after the main
  // process exits. Node retries ENOTEMPTY/EBUSY/EPERM rather than hiding failures.
  await remove(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
}

async function connectCDP(endpoint) {
  const socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The native renderer debugger did not connect.')), 10000);
    socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('The native renderer debugger did not connect.')); }, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  const events = new Map();
  const listeners = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (message.method) for (const listener of listeners.get(message.method) || []) listener(message.params);
    if (message.method && events.has(message.method)) {
      const item = events.get(message.method); events.delete(message.method); clearTimeout(item.timer); item.resolve(message.params);
    }
    if (!pending.has(message.id)) return;
    const { resolve, reject, timer } = pending.get(message.id);
    pending.delete(message.id);
    clearTimeout(timer);
    if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
  });
  function command(method, params = {}) {
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Native smoke command timed out: ${method}.`)); }, 15000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  function once(method, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { events.delete(method); reject(new Error(`Native smoke event timed out: ${method}.`)); }, timeoutMs);
      events.set(method, { resolve, reject, timer });
    });
  }
  function on(method, listener) {
    const handlers = listeners.get(method) || new Set(); handlers.add(listener); listeners.set(method, handlers);
    return () => { handlers.delete(listener); if (!handlers.size) listeners.delete(method); };
  }
  return { command, evaluate, once, on, close: () => socket.close() };
}

async function nativeClick(renderer, expression) {
  const point = await renderer.evaluate(`(()=>{const element=${expression};if(!element)throw new Error('The native click target is missing.');element.scrollIntoView({block:'nearest'});const r=element.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await renderer.command('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 });
  await renderer.command('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: 1 });
}

async function nativeLibraryDrag(renderer, expression, targetExpression = "document.querySelector('.canvas-viewport')") {
  const points = await renderer.evaluate(`(async()=>{const element=${expression};element.scrollIntoView({block:'center'});await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const source=element.getBoundingClientRect(),target=(${targetExpression}).getBoundingClientRect();return{from:{x:source.x+source.width/2,y:source.y+source.height/2},to:{x:target.x+target.width/2,y:target.y+target.height/2}};})()`);
  await renderer.command('Input.setInterceptDrags', { enabled: true });
  const intercepted = renderer.once('Input.dragIntercepted'); intercepted.catch(() => {});
  try {
    await renderer.command('Input.dispatchMouseEvent', { type: 'mouseMoved', ...points.from });
    await renderer.command('Input.dispatchMouseEvent', { type: 'mousePressed', ...points.from, button: 'left', buttons: 1, clickCount: 1 });
    for (let step = 1; step <= 6; step++) await renderer.command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: points.from.x + (points.to.x - points.from.x) * step / 6, y: points.from.y + (points.to.y - points.from.y) * step / 6, button: 'left', buttons: 1 });
    const drag = await intercepted;
    for (const type of ['dragEnter', 'dragOver', 'drop']) await renderer.command('Input.dispatchDragEvent', { type, ...points.to, data: drag.data });
    return drag.data.items.map(item => ({ mimeType: item.mimeType, data: item.data }));
  } finally {
    await renderer.command('Input.dispatchMouseEvent', { type: 'mouseReleased', ...points.to, button: 'left', buttons: 0, clickCount: 1 });
    await renderer.command('Input.setInterceptDrags', { enabled: false });
  }
}

async function nativeKey(renderer, key, code, modifiers = 0) {
  const number = {Enter:13,Escape:27,Tab:9,Home:36,End:35,ArrowLeft:37,ArrowUp:38,ArrowRight:39,ArrowDown:40,Backspace:8,Delete:46}[key] || (key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0);
  const data = {key,code,modifiers,windowsVirtualKeyCode:number};
  await renderer.command('Input.dispatchKeyEvent', {type:'rawKeyDown',...data});
  await renderer.command('Input.dispatchKeyEvent', {type:'keyUp',...data});
}

/** Actual DOM controls, Chromium input and autosaved public document data only.
 * This deliberately avoids private editor instances or React component hooks. */
async function runNativeControlsRegression(renderer, fixturePath, screenshotPath, onProgress = () => {}, {panIdle=false} = {}) {
  const originalId = await renderer.evaluate("localStorage.getItem('visro-active-design')"), report = {};
  renderer.controlsTrace=[];
  const progress=stage=>{renderer.controlsTrace.push({stage,time:Date.now()});onProgress(stage);};
  const saved = () => renderer.evaluate(readSavedProject);
  const sameDisplayBox=(actual,expected)=>{
    // Fabric serializes each source dimension and scale to four decimals. The
    // product error is bounded by half a decimal unit for each saved factor;
    // its runtime geometry is checked independently by the frame engine tests.
    for(const [dimension,scale] of [['width','scaleX'],['height','scaleY']]){
      const tolerance=.00005*(Math.abs(actual[dimension])+Math.abs(actual[scale])+Math.abs(expected[dimension])+Math.abs(expected[scale]))+1e-8;
      assert.ok(Math.abs(actual[dimension]*actual[scale]-expected[dimension]*expected[scale])<=tolerance,`Saved frame ${dimension} changed beyond its four-decimal serialization error bound.`);
    }
  };
  const objects = `(async()=>{const record=await ${readSavedProject};return record?.project.pages.flatMap(page=>page.canvas.objects||[])||[];})()`;
  const toolbarButton = label => `Array.from(document.querySelectorAll('.context-toolbar button')).find(button=>button.textContent.trim()===${JSON.stringify(label)}||button.getAttribute('aria-label')===${JSON.stringify(label)})`;
  const history = async redo => {
    await nativeClick(renderer, `document.querySelector('.topbar button[aria-label="${redo?'Redo (⌘⇧Z)':'Undo (⌘Z)'}"],.topbar button[title="${redo?'Redo (⌘⇧Z)':'Undo (⌘Z)'}"]')`);
    await waitForRenderer(renderer, "!document.querySelector('.canvas-loading,.busy-toast')", 'The native history operation did not settle.');
  };
  const createDesign = async name => {
    const before = await renderer.evaluate("localStorage.getItem('visro-active-design')");
    await nativeClick(renderer, "document.querySelector('.desktop-new-tab')");
    await waitForRenderer(renderer, `localStorage.getItem('visro-active-design')!==${JSON.stringify(before)}&&!document.querySelector('.home-shell,.canvas-loading,.busy-toast')`, 'A fresh control acceptance design did not open.');
    await renderer.evaluate("(()=>{const input=document.querySelector('input[aria-label=\"Design name\"]');input.focus();input.select();})()");
    await renderer.command('Input.insertText', {text:name});
    await renderer.evaluate("document.activeElement.blur()");
    await waitForRenderer(renderer, `(async()=>{const record=await ${readSavedProject};return record?.name===${JSON.stringify(name)};})()`, 'The control acceptance design name did not autosave.');
  };
  const pointOnPage = (x=.5,y=.5) => renderer.evaluate(`(()=>{const page=document.querySelector('.continuous-page.active'),box=page.getBoundingClientRect();return{x:box.x+box.width*${x},y:box.y+box.height*${y}};})()`);
  const waitForCenteredRectangle=()=>waitForRenderer(renderer,`(()=>{const source=document.querySelector('.lower-canvas'),page=document.querySelector('.continuous-page.active');if(!source?.width||!page)return false;const r=source.getBoundingClientRect(),p=page.getBoundingClientRect(),v=document.querySelector('.canvas-viewport').getBoundingClientRect(),sample=document.createElement('canvas');if(Math.abs(p.left+p.width/2-v.left-v.width/2)>2||Math.abs(p.top+p.height/2-v.top-v.height/2)>2)return false;sample.width=640;sample.height=Math.max(1,Math.round(source.height/source.width*640));const context=sample.getContext('2d',{willReadFrequently:true});context.drawImage(source,0,0,sample.width,sample.height);try{const point=(${rasterPointForFill.toString()})(context.getImageData(0,0,sample.width,sample.height).data,sample.width,sample.height,{left:r.left,top:r.top,width:r.width,height:r.height},'#F26B3A');return Math.abs(point.x-(p.left+p.width/2))<4&&Math.abs(point.y-(p.top+p.height/2))<4;}catch{return false;}})()`,'The page surface and actual centered rectangle paint did not settle after navigation/Fit.');
  const clickPoint = async point => {
    await renderer.command('Input.dispatchMouseEvent', {type:'mousePressed',...point,button:'left',buttons:1,clickCount:1});
    await renderer.command('Input.dispatchMouseEvent', {type:'mouseReleased',...point,button:'left',buttons:0,clickCount:1});
  };
  const focusCanvas = () => renderer.evaluate("(()=>{document.activeElement?.blur();const canvas=document.querySelector('.upper-canvas');canvas.tabIndex=0;canvas.focus({preventScroll:true});})()");
  const chooseRail = async name => {
    await renderer.evaluate(`(()=>{const button=Array.from(document.querySelectorAll('.rail-button')).find(button=>button.textContent.trim()===${JSON.stringify(name)});if(!button.classList.contains('selected'))button.click();})()`);
    await waitForRenderer(renderer, "Boolean(document.querySelector('.asset-panel:not(.hidden)'))", 'The requested native library did not open.');
  };
  const capture = async suffix => {
    if(!screenshotPath)return;
    await renderer.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const shot=await renderer.command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    await fs.mkdir(path.dirname(path.resolve(screenshotPath)),{recursive:true});
    await fs.writeFile(path.resolve(screenshotPath).replace(/\.png$/i,`-${suffix}.png`),Buffer.from(shot.data,'base64'));
  };
  const reloadDesign=async name=>{
    const previousOrigin=await renderer.evaluate('performance.timeOrigin');
    await renderer.command('Page.reload');
    // Page.reload acknowledges navigation before the old document disappears.
    // Wait for a different document instead of accidentally inspecting old IDB
    // state while Chromium has started painting the new, temporarily blank tab.
    await waitForRenderer(renderer,`performance.timeOrigin!==${previousOrigin}&&document.readyState==='complete'&&Boolean(document.querySelector('#root')?.textContent?.trim())&&!document.querySelector('.canvas-loading')`,'The reloaded workspace did not finish its new document.');
    await openHomeDesign(renderer,name);
    await waitForRenderer(renderer,"Boolean(document.querySelector('.lower-canvas,.continuous-page.active'))&&!document.querySelector('.canvas-loading,.busy-toast,.home-shell')",'The reloaded canvas did not finish opening.');
  };
  try {
    progress('checking native continuous page scrolling and selection');
    await createDesign('Native continuous page acceptance');
    await focusCanvas(); await nativeKey(renderer,'r','KeyR');
    await waitForRenderer(renderer, `(async()=>{const list=await ${objects};return list.length===1&&list[0].visroShapeType==='rect';})()`, 'R must add the native first-page rectangle.');
    const firstPage = (await saved()).project.pages[0].id;
    await nativeClick(renderer, "document.querySelector('.continuous-page.active button[aria-label=\"Add page after page 1\"]')");
    await waitForRenderer(renderer, "document.querySelectorAll('.continuous-page').length===2&&document.querySelector('.continuous-page.active')?.getAttribute('aria-label').startsWith('Page 2:')", 'Adding a page must expose a real two-page document stack.');
    await focusCanvas(); await nativeKey(renderer,'c','KeyC');
    await waitForRenderer(renderer, `(async()=>{const list=await ${objects};return list.length===2&&list.some(object=>object.visroShapeType==='circle');})()`, 'C must add the native second-page circle.');
    await nativeClick(renderer, "document.querySelector('.continuous-page-preview[aria-label=\"Edit page 1\"]')");
    await waitForRenderer(renderer, `document.querySelector('.continuous-page.active')?.dataset.pageId===${JSON.stringify(firstPage)}`, 'The first page must activate without replacing the stack.');
    await nativeClick(renderer, "document.querySelector('.zoom-label')");
    await waitForCenteredRectangle();
    renderer.controlsTrace.push(await renderer.evaluate("(()=>{const node=document.querySelector('.canvas-viewport'),rect=element=>{if(!element)return null;const r=element.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};};return{phase:'before-first-page-selection',zoom:document.querySelector('.zoom-label')?.textContent,viewport:{...rect(node),scrollLeft:node.scrollLeft,scrollTop:node.scrollTop,clientWidth:node.clientWidth,clientHeight:node.clientHeight},lower:rect(document.querySelector('.lower-canvas')),plane:rect(document.querySelector('.canvas-interaction-plane')),pages:Array.from(document.querySelectorAll('.continuous-page')).map(page=>({id:page.dataset.pageId,active:page.classList.contains('active'),...rect(page)}))};})()"));
    await clickPoint(await pointOnPage());
    await waitForRenderer(renderer, "document.querySelector('.canvas-footer')?.textContent.includes('Element selected')", 'The first-page rectangle must be selected before scrolling.');
    await waitForRenderer(renderer, `(async()=>{const record=await ${readSavedProject};return record?.project.activePageId===${JSON.stringify(firstPage)};})()`, 'Explicit first-page navigation must finish autosaving before the scroll-only baseline.');
    const documentBefore = JSON.stringify((await saved()).project);
    const scrollState = `(()=>{const node=document.querySelector('.canvas-viewport'),r=node.getBoundingClientRect();return{scroll:node.scrollTop,zoom:document.querySelector('.zoom-label').textContent,counter:Array.from(document.querySelectorAll('.zoom-controls>span')).at(-1)?.textContent.trim(),active:document.querySelector('.continuous-page.active')?.dataset.pageId,selected:document.querySelector('.canvas-footer').textContent.includes('Element selected'),undo:document.querySelector('.topbar button[title="Undo (⌘Z)"]')?.disabled,redo:document.querySelector('.topbar button[title="Redo (⌘⇧Z)"]')?.disabled,pages:Array.from(document.querySelectorAll('.continuous-page')).map(page=>{const b=page.getBoundingClientRect();return{id:page.dataset.pageId,top:b.top,bottom:b.bottom,visible:b.bottom>r.top&&b.top<r.bottom};}),point:{x:r.right-24,y:r.top+r.height/2}};})()`;
    const initial = await renderer.evaluate(scrollState);
    await renderer.command('Input.dispatchMouseEvent', {type:'mouseWheel',...initial.point,deltaX:0,deltaY:Math.round(initial.pages[0].bottom-initial.point.y-80)});
    await waitForRenderer(renderer, "(()=>{const node=document.querySelector('.canvas-viewport'),r=node.getBoundingClientRect();return Array.from(document.querySelectorAll('.continuous-page')).filter(page=>{const b=page.getBoundingClientRect();return b.bottom>r.top&&b.top<r.bottom;}).length===2;})()", 'A normal native wheel must expose both adjacent pages together.');
    const boundary = await renderer.evaluate(scrollState); await capture('continuous-pages');
    await renderer.command('Input.dispatchMouseEvent', {type:'mouseWheel',...boundary.point,deltaX:0,deltaY:800});
    await waitForRenderer(renderer, "Array.from(document.querySelectorAll('.zoom-controls>span')).at(-1)?.textContent.trim()==='2 / 2'", 'The footer must follow the page visible after native scrolling.');
    const scrolled = await renderer.evaluate(scrollState);
    assert.equal(scrolled.active,firstPage,'Wheel scrolling must preserve the active editing page.');
    assert.equal(scrolled.selected,true,'Wheel scrolling must preserve its selected element.');
    assert.equal(scrolled.zoom,initial.zoom,'Ordinary wheel scrolling must not change zoom.');
    assert.equal(scrolled.undo,initial.undo);assert.equal(scrolled.redo,initial.redo);
    assert.equal(JSON.stringify((await saved()).project),documentBefore,'Scrolling must not create a document edit.');
    await renderer.command('Input.dispatchMouseEvent',{type:'mouseWheel',...scrolled.point,deltaX:0,deltaY:-2500});
    await waitForRenderer(renderer,"Array.from(document.querySelectorAll('.zoom-controls>span')).at(-1)?.textContent.trim()==='1 / 2'",'Scrolling back must reveal the first page.');
    const beforeZoom=await renderer.evaluate(scrollState);
    await renderer.command('Input.dispatchMouseEvent',{type:'mouseWheel',...beforeZoom.point,deltaX:0,deltaY:-70,modifiers:2});
    await waitForRenderer(renderer,`document.querySelector('.zoom-label').textContent!==${JSON.stringify(beforeZoom.zoom)}`,'Control-wheel must zoom the native canvas.');
    assert.equal(JSON.stringify((await saved()).project),documentBefore,'Modifier-wheel zoom must not create document history.');
    report.continuous={bothPagesVisible:true,counterFollowsViewport:true,activePagePreserved:true,selectionPreserved:true,historyPreserved:true,controlWheelZoom:true,initialScroll:initial.scroll,boundaryScroll:boundary.scroll,secondPageScroll:scrolled.scroll};

    progress('checking native viewing and commenting edit guards');
    const setMode=async mode=>{await nativeClick(renderer,"document.querySelector('.editing-mode-trigger')");await nativeClick(renderer,`document.querySelector('.editing-mode-menu button[data-mode="${mode}"]')`);await waitForRenderer(renderer,`document.querySelector('.editing-mode-trigger span').textContent.toLowerCase()===${JSON.stringify(mode)}`,'The editing mode did not change.');};
    for(const mode of ['viewing','commenting']){
      await setMode(mode);
      if(mode==='viewing'){
        await nativeClick(renderer,"document.querySelector('.topbar button[aria-label=\"View all comments\"]')");
        await waitForRenderer(renderer,"Boolean(document.querySelector('.comments-panel .comments-content:disabled'))",'Viewing must open readable comments with mutation controls disabled.');
        await nativeClick(renderer,"document.querySelector('.comments-panel button[aria-label=\"Close comments\"]')");
        await waitForRenderer(renderer,"!document.querySelector('.comments-panel')",'The comments close button must work in Viewing mode.');
      }
      await focusCanvas();
      const baselineRecord=await saved(),baseline=JSON.stringify(baselineRecord.project);
      for(const [key,code,modifiers] of [['r','KeyR',0],['t','KeyT',0],['d','KeyD',4],['Delete','Delete',0],['ArrowRight','ArrowRight',0],[' ','Space',0]])await nativeKey(renderer,key,code,modifiers);
      const point=await pointOnPage();
      await renderer.command('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1});
      await renderer.command('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x+40,y:point.y+30,button:'left',buttons:1});
      await renderer.command('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x+40,y:point.y+30,button:'left',buttons:0,clickCount:1});
      // App's document autosave is debounced by800ms. A shorter wait could read
      // the old record even if an edit leaked through a mode's guards.
      await delay(1400);
      const after=await saved();
      assert.equal(JSON.stringify(after.project),baseline,`${mode} mode must prevent native object shortcuts and drags from mutating the project.`);
      assert.equal(after.updated,baselineRecord.updated,`${mode} mode must not schedule a document autosave.`);
      assert.equal(await renderer.evaluate("document.querySelector('.tool-rail').inert&&document.querySelector('input[aria-label=\"Design name\"]').readOnly"),true);
      assert.equal(await renderer.evaluate("document.querySelector('.topbar button[title=\"Undo (⌘Z)\"]').disabled"),true);
    }
    await setMode('editing');await focusCanvas();await nativeKey(renderer,'r','KeyR');
    await waitForRenderer(renderer,`(async()=>{const list=await ${objects};return list.length===3;})()`,'Restoring Editing must allow a real object insertion.');
    await history(false);await waitForRenderer(renderer,`(async()=>{const list=await ${objects};return list.length===2;})()`,'A single Undo must remove the edit made after restoring Editing.');
    report.modes={viewingBlocksEdits:true,commentingBlocksEdits:true,viewingCommentsReadableAndClosable:true,editingRestored:true,undoAfterRestore:true};

    progress('checking native frame insertion, photo drag fill, crop and reopen');
    await createDesign('Native frame crop acceptance');
    await chooseRail('Elements');
    const search="document.querySelector('.elements-panel .search-box input')";
    await renderer.evaluate(`(()=>{const input=${search};input.focus();input.select();})()`);await renderer.command('Input.insertText',{text:'Circle'});
    await renderer.evaluate("Array.from(document.querySelectorAll('.elements-filter-tabs button')).find(button=>button.textContent==='Frames').click()");
    await waitForRenderer(renderer,"Boolean(document.querySelector('.frame-library-add[aria-label=\"Add Circle frame\"]'))",'The Frames destination must expose the Circle frame.');
    await nativeClick(renderer,"document.querySelector('.frame-library-add[aria-label=\"Add Circle frame\"]')");
    await waitForRenderer(renderer,`(async()=>{const list=await ${objects};return list.length===1&&list[0].visroFrame==='circle'&&list[0].visroEmptyFrame===true;})()`,'A frame click must create one editable, empty native frame.');
    const empty=(await saved()).project.pages[0].canvas.objects[0];
    const fixture=path.resolve(fixturePath);await fs.access(fixture);
    const {root:documentNode}=await renderer.command('DOM.getDocument'),{nodeId}=await renderer.command('DOM.querySelector',{nodeId:documentNode.nodeId,selector:'input[type="file"][accept^="image/"]'});
    assert.ok(nodeId);await renderer.command('DOM.setFileInputFiles',{nodeId,files:[fixture]});
    await waitForRenderer(renderer,`(async()=>{const list=await ${objects};return list.length===2;})()`,'The isolated photo fixture must upload successfully.');
    await history(false);await waitForRenderer(renderer,`(async()=>{const list=await ${objects};return list.length===1&&list[0].visroEmptyFrame;})()`,'Undo must remove the loose uploaded photo while retaining its reusable upload tile.');
    await chooseRail('Uploads');
    await waitForRenderer(renderer,"Boolean(document.querySelector('.upload-grid button img'))",'The uploaded local image must appear in Uploads.');
    const drag=await nativeLibraryDrag(renderer,"document.querySelector('.upload-grid button')","document.querySelector('.continuous-page.active')");
    assert.ok(drag.some(item=>item.mimeType==='text/visro-asset'&&JSON.parse(item.data).kind==='image'),'The photo fill must use an actual uploaded-image drag payload.');
    await waitForRenderer(renderer,`(async()=>{const list=await ${objects};return list.length===1&&list[0].id===${JSON.stringify(empty.id)}&&list[0].visroEmptyFrame===false&&list[0].src!==${JSON.stringify(empty.src)};})()`,'Dropping a photo inside a frame must fill that same frame rather than adding a loose image.');
    const filled=(await saved()).project.pages[0].canvas.objects[0];
    renderer.controlsTrace.push({frameFill:{before:{width:empty.width,height:empty.height,scaleX:empty.scaleX,scaleY:empty.scaleY},after:{width:filled.width,height:filled.height,scaleX:filled.scaleX,scaleY:filled.scaleY}}});
    for(const key of ['left','top'])assert.ok(Math.abs(filled[key]-empty[key])<.01,'Photo fill must preserve frame placement.');
    sameDisplayBox(filled,empty);
    assert.ok(filled.clipPath);assert.match(filled.src,/^data:image\//);
    await history(false);await waitForRenderer(renderer,`(async()=>{const list=await ${objects};return list.length===1&&list[0].visroEmptyFrame===true;})()`,'One Undo must restore the empty frame.');
    await history(true);await waitForRenderer(renderer,`(async()=>{const list=await ${objects};return list.length===1&&list[0].visroEmptyFrame===false;})()`,'One Redo must restore the photo inside its frame.');
    await clickPoint(await pointOnPage());await nativeClick(renderer,toolbarButton('Crop'));
    await waitForRenderer(renderer,"Boolean(document.querySelector('.crop-editor [aria-label=\"Resize crop se\"]'))",'The actual crop editor must open for a filled frame.');
    const handle=await renderer.evaluate("(()=>{const r=document.querySelector('.crop-handle.se').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()");
    await renderer.command('Input.dispatchMouseEvent',{type:'mousePressed',...handle,button:'left',buttons:1,clickCount:1});
    for(let step=1;step<=6;step++)await renderer.command('Input.dispatchMouseEvent',{type:'mouseMoved',x:handle.x-step*6,y:handle.y-step*6,button:'left',buttons:1});
    await renderer.command('Input.dispatchMouseEvent',{type:'mouseReleased',x:handle.x-36,y:handle.y-36,button:'left',buttons:0,clickCount:1});
    await nativeClick(renderer,"Array.from(document.querySelectorAll('.crop-editor-footer button')).find(button=>button.textContent==='Done')");
    await waitForRenderer(renderer,`(async()=>{const list=await ${objects};return !document.querySelector('.crop-editor')&&list[0].width<${filled.width}&&list[0].visroFrame==='circle';})()`,'A real crop handle gesture must change source pixels while retaining the frame.');
    const cropped=(await saved()).project.pages[0].canvas.objects[0];
    sameDisplayBox(cropped,filled);
    await history(false);await waitForRenderer(renderer,`(async()=>{const list=await ${objects};return Math.abs(list[0].width-${filled.width})<.01;})()`,'One Undo must restore the preceding frame crop.');
    await history(true);await waitForRenderer(renderer,`(async()=>{const list=await ${objects};return Math.abs(list[0].width-${cropped.width})<.01;})()`,'One Redo must restore the adjusted frame crop.');
    await reloadDesign('Native frame crop acceptance');
    const reopened=(await saved()).project.pages[0].canvas.objects[0];
    assert.equal(reopened.id,cropped.id);assert.equal(reopened.src,cropped.src);assert.deepEqual(reopened.clipPath,cropped.clipPath);assert.equal(reopened.cropX,cropped.cropX);assert.equal(reopened.width,cropped.width);
    const photoPaint=`(()=>{const source=document.querySelector('.lower-canvas'),page=document.querySelector('.continuous-page.active');if(!source?.width||!page)return null;const bounds=source.getBoundingClientRect(),p=page.getBoundingClientRect(),object=${JSON.stringify({left:reopened.left,top:reopened.top,width:reopened.width,height:reopened.height,scaleX:reopened.scaleX,scaleY:reopened.scaleY,originX:reopened.originX,originY:reopened.originY})},zoom=p.width/Number(page.dataset.pageWidth),width=object.width*object.scaleX,height=object.height*object.scaleY,left=object.left-(object.originX==='center'?width/2:0),top=object.top-(object.originY==='center'?height/2:0),ratio=source.width/bounds.width;const sample=document.createElement('canvas');sample.width=sample.height=128;const context=sample.getContext('2d',{willReadFrequently:true});context.drawImage(source,(p.left+left*zoom-bounds.left)*ratio,(p.top+top*zoom-bounds.top)*ratio,width*zoom*ratio,height*zoom*ratio,0,0,128,128);const data=context.getImageData(0,0,128,128).data,colors=new Set();for(let index=0;index<data.length;index+=4)if(data[index+3]>200)colors.add((data[index]>>4)*256+(data[index+1]>>4)*16+(data[index+2]>>4));const pixel=(x,y)=>Array.from(data.slice((y*128+x)*4,(y*128+x)*4+4)),corners=[[4,4],[123,4],[4,123],[123,123]].map(([x,y])=>pixel(x,y));return{colors:colors.size,center:pixel(64,64),corners,whiteCorners:corners.every(value=>value[3]>240&&value.slice(0,3).every(channel=>channel>245))};})()`;
    await waitForRenderer(renderer,`(()=>{const pixels=${photoPaint};return pixels?.colors>40&&pixels.whiteCorners;})()`,'The reloaded native canvas must actually paint the embedded photo through its circle clip.');
    const paint=await renderer.evaluate(photoPaint);assert.ok(paint.colors>40&&paint.whiteCorners);
    const thumbnailPaint=`(()=>{const image=document.querySelector('.page-mini img');if(!image?.complete||!image.naturalWidth)return null;const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0,128,128);const data=context.getImageData(0,0,128,128).data,colors=new Set();let nonWhite=0;for(let index=0;index<data.length;index+=4)if(data[index+3]>200){colors.add((data[index]>>4)*256+(data[index+1]>>4)*16+(data[index+2]>>4));if(data[index]<240||data[index+1]<240||data[index+2]<240)nonWhite++;}return{complete:image.complete,width:image.naturalWidth,height:image.naturalHeight,embedded:image.src.startsWith('data:image/'),colors:colors.size,nonWhite,interacting:document.querySelector('.canvas-viewport').classList.contains('interacting')};})()`;
    await waitForRenderer(renderer,`(()=>{const pixels=${thumbnailPaint};return pixels?.embedded&&pixels.colors>40&&pixels.nonWhite>300&&!pixels.interacting;})()`,'The idle bottom page thumbnail must paint the reopened photo without a stuck interaction state.');
    const thumbnail=await renderer.evaluate(thumbnailPaint);
    await capture('frame-crop');
    report.frame={nativeInsert:true,realPhotoDrag:true,sameObjectFilled:true,fillUndoRedo:true,realCropGesture:true,cropUndoRedo:true,displayBoxPreserved:true,embeddedPhotoReopened:true,reloadedCanvasPaint:paint,idlePageThumbnail:thumbnail};

    progress('checking native selected-text formatting, casing and list typing');
    await createDesign('Native text formatting acceptance');
    await focusCanvas();await nativeKey(renderer,'t','KeyT');await nativeKey(renderer,'Enter','Enter');
    await waitForRenderer(renderer,"document.activeElement?.tagName==='TEXTAREA'&&document.activeElement.getAttribute('data-fabric')==='textarea'",'Enter must begin genuine Fabric text editing.');
    await renderer.command('Input.insertText',{text:'alpha beta\ngamma'});
    await waitForRenderer(renderer,`(async()=>{const list=await ${objects};return list[0]?.text===${JSON.stringify('alpha beta\ngamma')};})()`,'The native text fixture must autosave typed paragraphs.');
    for(let i=0;i<16;i++)await nativeKey(renderer,'ArrowLeft','ArrowLeft');
    for(let i=0;i<5;i++)await nativeKey(renderer,'ArrowRight','ArrowRight',8);
    await nativeClick(renderer,toolbarButton('Bold'));await nativeClick(renderer,toolbarButton('Strikethrough'));
    await nativeClick(renderer,toolbarButton('Uppercase'));
    await waitForRenderer(renderer,`(async()=>{const list=await ${objects};return list[0]?.text===${JSON.stringify('ALPHA beta\ngamma')};})()`,'Uppercase must affect only the genuinely selected text range.');
    const styled=(await saved()).project.pages[0].canvas.objects[0];
    const styleAt=index=>Array.isArray(styled.styles)?styled.styles.find(run=>run.start<=index&&run.end>index)?.style:styled.styles?.[0]?.[index];
    for(let index=0;index<5;index++){assert.equal(styleAt(index)?.fontWeight,400);assert.equal(styleAt(index)?.linethrough,true);}
    assert.notEqual(styleAt(5)?.linethrough,true,'Characters outside the selected range must retain their style.');
    await history(false);await waitForRenderer(renderer,`(async()=>{const list=await ${objects};return list[0]?.text===${JSON.stringify('alpha beta\ngamma')};})()`,'One Undo must revert just the case change.');
    await history(true);await waitForRenderer(renderer,`(async()=>{const list=await ${objects};return list[0]?.text===${JSON.stringify('ALPHA beta\ngamma')};})()`,'One Redo must restore the selected case change.');
    await nativeClick(renderer,toolbarButton('List'));
    await waitForRenderer(renderer,`(async()=>{const list=await ${objects};return list[0]?.text===${JSON.stringify('• ALPHA beta\n• gamma')}&&list[0].textAlign==='left';})()`,'The List control must create real bullets and left-align the paragraphs.');
    await focusCanvas();await nativeKey(renderer,'Enter','Enter');await nativeKey(renderer,'ArrowRight','ArrowRight');await nativeKey(renderer,'Enter','Enter');
    await renderer.command('Input.insertText',{text:'delta'});await nativeKey(renderer,'Tab','Tab');await renderer.command('Input.insertText',{text:' extra'});
    await waitForRenderer(renderer,`(async()=>{const list=await ${objects};return list[0]?.text===${JSON.stringify('• ALPHA beta\n• gamma\n  • delta extra')};})()`,'Enter must continue the list and Tab must indent its item without leaving text editing.');
    assert.equal(await renderer.evaluate("document.activeElement?.getAttribute('data-fabric')==='textarea'"),true);
    await nativeKey(renderer,'Escape','Escape');
    const typed=(await saved()).project.pages[0].canvas.objects[0];assert.equal((await saved()).project.pages[0].canvas.objects.length,1);
    await reloadDesign('Native text formatting acceptance');
    const restored=(await saved()).project.pages[0].canvas.objects[0];assert.equal(restored.text,typed.text);assert.deepEqual(restored.styles,typed.styles);
    await capture('text-formatting');
    report.text={nativeRangeFormatting:true,unselectedStylePreserved:true,selectedCaseUndoRedo:true,listControl:true,enterContinuesList:true,tabIndentsWithoutFocusLoss:true,textAndStylesReopened:true};

    progress('checking cold three-page footer previews without visiting inactive pages');
    await createDesign('Native twelve-page zoom acceptance');
    const record=await saved(),prototype=JSON.parse(documentBefore).pages[0];
    const fixturePages=count=>Array.from({length:count},(_,index)=>({
      ...JSON.parse(JSON.stringify(prototype)),id:`native-stack-page-${index+1}`,name:`Page ${index+1}`,
      canvas:{...JSON.parse(JSON.stringify(prototype.canvas)),objects:[{...JSON.parse(JSON.stringify(prototype.canvas.objects[0])),id:`native-stack-object-${index+1}`,fill:index%2?'#F6BED0':'#F26B3A'}]},
    }));
    const storeFixture=()=>renderer.evaluate(`(async()=>{const request=indexedDB.open('visro-studio'),db=await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});try{await new Promise((resolve,reject)=>{const transaction=db.transaction('projects','readwrite');transaction.objectStore('projects').put(${JSON.stringify(record)});transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);});}finally{db.close();}})()`);
    record.project.pages=fixturePages(3);record.project.activePageId=record.project.pages[2].id;record.updated=Date.now();
    await storeFixture();await reloadDesign('Native twelve-page zoom acceptance');
    await waitForRenderer(renderer,"document.querySelector('.continuous-page.active')?.dataset.pageId==='native-stack-page-3'",'The cold footer fixture must open directly on its saved third page.');
    await waitForCenteredRectangle();
    const footerState=`(()=>{const node=document.querySelector('.canvas-viewport');return{active:document.querySelector('.continuous-page.active')?.dataset.pageId,selected:document.querySelector('.canvas-footer').textContent.includes('Element selected'),undo:document.querySelector('.topbar button[title="Undo (⌘Z)"]').disabled,redo:document.querySelector('.topbar button[title="Redo (⌘⇧Z)"]').disabled,scrollLeft:node.scrollLeft,scrollTop:node.scrollTop};})()`;
    const coldBefore={state:await renderer.evaluate(footerState),document:JSON.stringify((await saved()).project)};
    if(panIdle){
      progress('holding a stationary native Space-pan across preview warm-up');
      assert.equal(await renderer.evaluate("Array.from(document.querySelectorAll('[data-preview-page-id] .page-mini img')).some(image=>image.complete&&image.naturalWidth)"),false,'The held-pan regression must start with a genuinely cold footer.');
      const point=await pointOnPage();await focusCanvas();
      await renderer.evaluate("(()=>{window.__visroStationaryPanMoves=[];window.__visroStationaryPanListener=event=>{window.__visroStationaryPanMoves.push({x:event.clientX,y:event.clientY,buttons:event.buttons,trusted:event.isTrusted,time:performance.now()});};document.addEventListener('mousemove',window.__visroStationaryPanListener,true);})()");
      await renderer.command('Input.dispatchMouseEvent',{type:'mouseMoved',...point,button:'none',buttons:0});
      await renderer.command('Input.dispatchKeyEvent',{type:'rawKeyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});
      await renderer.command('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1});
      try{
        await waitForRenderer(renderer,"document.querySelector('.canvas-viewport').classList.contains('interacting')",'A real held Space-pan must enter the interaction state.');
        await delay(1450);
        assert.equal(await renderer.evaluate("Array.from(document.querySelectorAll('[data-preview-page-id] .page-mini img')).some(image=>image.complete&&image.naturalWidth)"),false,'Preview rendering must stay paused throughout the held native pan.');
        assert.equal(JSON.stringify((await saved()).project),coldBefore.document);
      }finally{
        await renderer.command('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',buttons:0,clickCount:1});
        await renderer.command('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
        renderer.controlsTrace.push({stationaryPanPointer:{point,moves:await renderer.evaluate('window.__visroStationaryPanMoves||[]')}});
        await renderer.evaluate("(()=>{document.removeEventListener('mousemove',window.__visroStationaryPanListener,true);delete window.__visroStationaryPanListener;delete window.__visroStationaryPanMoves;})()");
      }
      await waitForRenderer(renderer,"!document.querySelector('.canvas-viewport').classList.contains('interacting')",'Releasing the held pan must leave interaction mode.');
    }
    const footerPaint=`(()=>{return ${JSON.stringify(record.project.pages.map(page=>page.id))}.map((id,index)=>{const button=document.querySelector('[data-preview-page-id="'+id+'"]'),image=button?.querySelector('.page-mini img');let colored=0;if(image?.complete&&image.naturalWidth){const canvas=document.createElement('canvas');canvas.width=canvas.height=32;const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0,32,32);const pixels=context.getImageData(0,0,32,32).data;for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]>200&&pixels[i]>180&&(index%2?pixels[i+1]>120&&pixels[i+1]<230&&pixels[i+2]>150&&pixels[i+2]<240:pixels[i+1]>40&&pixels[i+1]<180&&pixels[i+2]<140))colored++;}return{id,complete:Boolean(image?.complete&&image.naturalWidth),width:image?.naturalWidth||0,height:image?.naturalHeight||0,embedded:Boolean(image?.src.startsWith('data:image/')),colored};});})()`;
    await waitForRenderer(renderer,`(${footerPaint}).every(page=>page.complete&&page.embedded&&page.width>=128&&page.height>=128&&page.colored>20)`,'Every cold footer thumbnail, including unvisited page1, must decode and paint its own colored artwork.');
    const coldFooter=await renderer.evaluate(footerPaint);
    assert.deepEqual(await renderer.evaluate(footerState),coldBefore.state,'Background footer previews must preserve the active page, selection, history and artboard scroll.');
    assert.equal(JSON.stringify((await saved()).project),coldBefore.document,'Background footer preview generation must preserve the exact saved document.');
    await capture('cold-footer-previews');
    report.coldFooter={initialActivePage:3,pages:coldFooter,noPageVisitsOrArtboardScroll:true,activeSelectionAndHistoryPreserved:true,documentPreserved:true,...(panIdle?{stationarySpacePanHeldMs:1450,warmingResumedWithoutDocumentEdit:true}:{})};

    progress('checking native twelve-page low-zoom range and inactive-page zoom anchor');
    record.project.pages=fixturePages(12);record.project.activePageId=record.project.pages[0].id;record.updated=Date.now();
    await storeFixture();
    await reloadDesign('Native twelve-page zoom acceptance');
    await waitForCenteredRectangle();
    await clickPoint(await pointOnPage());
    await waitForRenderer(renderer,"document.querySelector('.canvas-footer')?.textContent.includes('Element selected')",'The first-page rectangle must be selected in the twelve-page fixture.');
    await renderer.evaluate("document.querySelector('input[aria-label=\"Canvas zoom\"]').focus()");await nativeKey(renderer,'Home','Home');
    await waitForRenderer(renderer,"document.querySelector('.zoom-label').textContent==='10%'",'The actual zoom slider Home key must select10%.');
    const viewport=()=>renderer.evaluate("(()=>{const node=document.querySelector('.canvas-viewport'),r=node.getBoundingClientRect(),page=document.querySelector('.continuous-page.active'),p=page.getBoundingClientRect(),point={x:r.right-24,y:r.top+r.height/2};return{top:node.scrollTop,left:node.scrollLeft,height:node.clientHeight,scrollHeight:node.scrollHeight,zoom:document.querySelector('.zoom-label').textContent,pageHeight:p.height,pageTop:p.top,hit:document.elementFromPoint(point.x,point.y)?.className,point};})()");
    const settleZoom=async zoom=>{
      // The label updates before Fabric's next after:render and the page stack's
      // React layout. Reading the old scroll offset here would send a delta for
      // the previous zoom, even though Chromium applies it to the new geometry.
      await waitForRenderer(renderer,`(()=>{const page=document.querySelector('.continuous-page.active')?.getBoundingClientRect();return page&&Math.abs(page.width-${record.project.width*zoom})<.1&&Math.abs(page.height-${record.project.height*zoom})<.1;})()`,'The twelve-page stack must finish laying out the requested zoom before native scrolling.');
      await renderer.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      renderer.controlsTrace.push({stage:'twelve-page settled zoom',zoom,state:await viewport()});
    };
    const scrollTo=async top=>{const view=await viewport(),trace={stage:'twelve-page wheel position',target:top,before:view};renderer.controlsTrace.push(trace);await renderer.command('Input.dispatchMouseEvent',{type:'mouseWheel',...view.point,deltaX:0,deltaY:top-view.top});try{await waitForRenderer(renderer,`Math.abs(document.querySelector('.canvas-viewport').scrollTop-${top})<1`,'The native wheel did not reach its twelve-page viewport fixture.');}finally{trace.after=await viewport();}};
    const rangePaint=`(()=>{const node=document.querySelector('.canvas-viewport'),viewport=node.getBoundingClientRect(),pages=${JSON.stringify(record.project.pages.map(page=>page.id))},first=document.querySelector('[data-page-id="native-stack-page-1"]');if(!first)return null;const origin=first.getBoundingClientRect(),neighbour=Array.from(document.querySelectorAll('.continuous-page')).find(page=>page.dataset.pageId!==pages[0]);if(!neighbour)return null;const neighbourIndex=pages.indexOf(neighbour.dataset.pageId),pitch=(neighbour.getBoundingClientRect().top-origin.top)/neighbourIndex;const expected=pages.filter((_,index)=>origin.top+index*pitch<viewport.bottom-.5&&origin.top+index*pitch+origin.height>viewport.top+.5),missing=[],previews=[];for(const id of expected){const page=document.querySelector('[data-page-id="'+id+'"]');if(!page){missing.push(id);continue;}if(page.classList.contains('active'))continue;const image=page.querySelector('.continuous-page-preview img');let ink=0;if(image?.complete&&image.naturalWidth){const canvas=document.createElement('canvas');canvas.width=canvas.height=32;const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0,32,32);const data=context.getImageData(0,0,32,32).data;for(let index=0;index<data.length;index+=4)if(data[index+3]>200&&(data[index]<240||data[index+1]<240||data[index+2]<240))ink++;}previews.push({id,complete:Boolean(image?.complete&&image.naturalWidth),ink});}return{expected,missing,previews,pageHeight:origin.height,pitch,active:first.dataset.pageId,selection:document.querySelector('.canvas-footer').textContent.includes('Element selected')};})()`;
    await settleZoom(.1);await scrollTo(1000);
    await waitForRenderer(renderer,`(()=>{const range=${rangePaint};return range?.expected.length>=4&&!range.missing.length&&range.previews.every(item=>item.complete&&item.ink>5);})()`,'Every intersecting low-zoom page must exist and paint its real inactive preview.');
    const tenPercent=await renderer.evaluate(rangePaint),baseline=JSON.stringify((await saved()).project);
    const anchorBefore=await renderer.evaluate("(()=>{const page=document.querySelector('[data-page-id=\"native-stack-page-8\"]'),r=page.getBoundingClientRect(),v=document.querySelector('.canvas-viewport').getBoundingClientRect();return{x:r.left+r.width*.75,y:r.top+r.height*.5,inside:r.left+r.width*.75>v.left&&r.left+r.width*.75<v.right&&r.top+r.height*.5>v.top&&r.top+r.height*.5<v.bottom,inactive:!page.classList.contains('active')};})()");
    assert.equal(anchorBefore.inside,true);assert.equal(anchorBefore.inactive,true);
    await renderer.command('Input.dispatchMouseEvent',{type:'mouseWheel',x:anchorBefore.x,y:anchorBefore.y,deltaX:0,deltaY:-80,modifiers:2});
    await waitForRenderer(renderer,"document.querySelector('.zoom-label').textContent!=='10%'",'Control-wheel over inactive page8 must zoom the entire stack.');
    await renderer.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const anchorAfter=await renderer.evaluate("(()=>{const r=document.querySelector('[data-page-id=\"native-stack-page-8\"]').getBoundingClientRect();return{x:r.left+r.width*.75,y:r.top+r.height*.5};})()");
    const anchorError={x:Math.abs(anchorAfter.x-anchorBefore.x),y:Math.abs(anchorAfter.y-anchorBefore.y)};
    assert.ok(anchorError.x<=1.5&&anchorError.y<=1.5,`Native zoom must preserve the document point under the inactive-page pointer: ${JSON.stringify(anchorError)}.`);
    const view=await viewport();await renderer.command('Input.dispatchMouseEvent',{type:'mouseWheel',...view.point,deltaX:0,deltaY:2000,modifiers:2});
    await waitForRenderer(renderer,"document.querySelector('.zoom-label').textContent==='2%'",'Control-wheel must reach the supported2% minimum.');
    await settleZoom(.02);await scrollTo(450);
    await waitForRenderer(renderer,`(()=>{const range=${rangePaint};return range?.expected.length>=7&&!range.missing.length&&range.previews.every(item=>item.complete&&item.ink>5);})()`,'The native2% document must render every visible page, including all decoded photo/shape previews.');
    const twoPercent=await renderer.evaluate(rangePaint);
    assert.equal(twoPercent.active,record.project.pages[0].id);assert.equal(twoPercent.selection,true);
    assert.equal(JSON.stringify((await saved()).project),baseline,'Twelve-page wheel/zoom must preserve the exact saved document.');
    assert.equal(await renderer.evaluate("document.querySelector('.topbar button[title=\"Undo (⌘Z)\"]').disabled"),true,'Twelve-page view navigation must not add undo history.');
    await capture('low-zoom-pages');
    report.longDocument={pages:12,tenPercent:{visible:tenPercent.expected.length,decodedInactive:tenPercent.previews.length,missing:tenPercent.missing},twoPercent:{visible:twoPercent.expected.length,decodedInactive:twoPercent.previews.length,missing:twoPercent.missing},inactivePage8AnchorError:anchorError,selectionAndActivePagePreserved:true,documentAndHistoryPreserved:true};
    return report;
  } catch(error) {
    renderer.controlsTrace.push(await renderer.evaluate(`(async()=>{const record=await ${readSavedProject};return{failure:${JSON.stringify('Control workflow failed')},active:record?.name,mode:document.querySelector('.editing-mode-trigger')?.textContent,selection:document.querySelector('.selected-label')?.textContent,focused:{tag:document.activeElement?.tagName,label:document.activeElement?.getAttribute('aria-label'),fabric:document.activeElement?.getAttribute('data-fabric')},objects:record?.project.pages.map(page=>({id:page.id,objects:page.canvas.objects.map(object=>({id:object.id,type:object.type,text:object.text,styles:object.styles,width:object.width,height:object.height,frame:object.visroFrame,empty:object.visroEmptyFrame}))}))};})()`));
    await capture('controls-failure');
    throw error;
  } finally {
    // All fixtures are confined to the smoke profile. Restore the starting tab
    // for the existing local-cutout acceptance phase and its original checks.
    await renderer.evaluate(`(()=>{const index=JSON.parse(localStorage.getItem('visro-workspace-tabs')||'[]').findIndex(tab=>tab.id===${JSON.stringify(originalId)});document.querySelectorAll('.desktop-tab[role="tab"]')[index]?.click();})()`);
    await waitForRenderer(renderer,`localStorage.getItem('visro-active-design')===${JSON.stringify(originalId)}&&!document.querySelector('.canvas-loading,.busy-toast,.home-shell')`,'Control acceptance must restore the original design.');
  }
}

async function waitForRenderer(cdp, predicate, message, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { if (await cdp.evaluate(predicate)) return; } catch (error) {
      if (!/execution context|context was destroyed/i.test(error.message)) throw error;
    }
    await delay(100);
  }
  throw new Error(message);
}

async function waitForPaint(cdp, expression, message, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    // A drawer opening changes canvas dimensions through ResizeObserver. Read
    // after layout and paint, and validate that exact snapshot instead of
    // validating one frame and asserting on a separately read, cleared frame.
    const pixels = await cdp.evaluate(`(async()=>{await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);return ${expression};})()`);
    if (pixels?.ink > 100 && pixels?.pink > 100) return pixels;
    await delay(50);
  }
  throw new Error(message);
}

async function openHomeDesign(cdp, name) {
  await waitForRenderer(cdp, "document.readyState === 'complete' && (location.protocol!=='visro:'||Boolean(window.visro)) && !document.querySelector('.canvas-loading')", 'The workspace did not finish loading.');
  if (await cdp.evaluate("Boolean(document.querySelector('.home-shell'))")) {
    await waitForRenderer(cdp, name ? `Array.from(document.querySelectorAll('.recent-open')).some(button=>button.querySelector('strong')?.textContent===${JSON.stringify(name)})` : "Boolean(document.querySelector('.recent-open,.home-template-teaser button.recent-card'))", 'The native Home screen did not expose a design.');
    await cdp.evaluate(name ? `Array.from(document.querySelectorAll('.recent-open')).find(button=>button.querySelector('strong')?.textContent===${JSON.stringify(name)}).click()` : "document.querySelector('.recent-open,.home-template-teaser button.recent-card').click()");
    await waitForRenderer(cdp, "!document.querySelector('.home-shell') && !document.querySelector('.busy-toast')", 'The native design did not open.');
  }
}

const readSavedProject = `(async()=>{
  const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('visro-studio');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  try {
    const record=await new Promise((resolve,reject)=>{const request=db.transaction('projects').objectStore('projects').get(localStorage.getItem('visro-active-design'));request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    if(!record)return record;
    const ids=new Set();
    const find=value=>{if(value&&typeof value==='object'&&value.__visroMedia==='visro-media-v1'&&typeof value.id==='string'){ids.add(value.id);return;}if(Array.isArray(value))value.forEach(find);else if(value&&typeof value==='object')Object.values(value).forEach(find);};
    find(record.project);
    const media=new Map();
    await Promise.all(Array.from(ids,async id=>{const stored=await new Promise((resolve,reject)=>{const request=db.transaction('media').objectStore('media').get(id);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});const data=stored?.data instanceof Blob?await stored.data.text():stored?.data;if(typeof data!=='string')throw new Error('A saved image reference is missing.');media.set(id,data);}));
    const hydrate=value=>{if(value&&typeof value==='object'&&value.__visroMedia==='visro-media-v1'&&media.has(value.id))return media.get(value.id);if(Array.isArray(value))return value.map(hydrate);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,hydrate(item)]));return value;};
    record.project=hydrate(record.project);return record;
  } finally {db.close();}
})()`;

async function runNativeEditingRegression(renderer, main) {
  if (!main) return { skipped: true, reason: 'The isolated main-process inspector is unavailable.' };
  const text = 'Visro native undo fixture';
  await renderer.evaluate("(()=>{const input=document.createElement('textarea');input.id='visro-smoke-native-text';input.setAttribute('aria-label','Native editing smoke fixture');document.body.append(input);input.focus();return true;})()");
  try {
    await renderer.command('Input.insertText', { text });
    await waitForRenderer(renderer, `document.querySelector('#visro-smoke-native-text').value===${JSON.stringify(text)}`, 'Native input text was not inserted.');
    const electronAPI = "process.getBuiltinModule('module').createRequire(process.cwd()+'/package.json')('electron')";
    const menuClick = (accelerator) => main.evaluate(`(()=>{const edit=${electronAPI}.Menu.getApplicationMenu().items.find(item=>item.label==='Edit');const item=edit?.submenu?.items.find(item=>item.accelerator===${JSON.stringify(accelerator)});if(!item||typeof item.click!=='function')return false;item.click();return true;})()`);
    assert.equal(await menuClick('CmdOrCtrl+Z'), true, 'The native Undo menu must exist.');
    await waitForRenderer(renderer, "document.querySelector('#visro-smoke-native-text').value===''", 'Native Undo must undo focused text input rather than the canvas.');
    assert.equal(await menuClick('CmdOrCtrl+Y'), true, 'The Canva Redo alternate must exist.');
    await waitForRenderer(renderer, `document.querySelector('#visro-smoke-native-text').value===${JSON.stringify(text)}`, 'Native CmdY Redo must restore focused text input.');
    return { focusedTextUndo: true, focusedTextRedo: true, canvaRedoAlternate: true };
  } finally { await renderer.evaluate("document.querySelector('#visro-smoke-native-text')?.remove()"); }
}

async function runNativeTabsRegression(renderer, main) {
  if (!main) return { skipped: true, reason: 'The isolated main-process inspector is unavailable.' };
  const electronAPI = "process.getBuiltinModule('module').createRequire(process.cwd()+'/package.json')('electron')";
  renderer.nativeTabsTrace = [];
  const clickMenu = async (menu, accelerator) => {
    renderer.nativeTabsTrace.push({ menu, accelerator, before: await renderer.evaluate("({id:localStorage.getItem('visro-active-design'),tabs:JSON.parse(localStorage.getItem('visro-workspace-tabs')||'[]'),home:Boolean(document.querySelector('.home-shell'))})") });
    assert.equal(await main.evaluate(`(()=>{const menu=${electronAPI}.Menu.getApplicationMenu().items.find(item=>item.label===${JSON.stringify(menu)});const item=menu?.submenu?.items.find(item=>item.accelerator===${JSON.stringify(accelerator)});if(!item||typeof item.click!=='function')return false;item.click();return true;})()`), true, `Native ${menu} ${accelerator} must exist.`);
  };
  const originalId = await renderer.evaluate("localStorage.getItem('visro-active-design')"), before = await renderer.evaluate("document.querySelectorAll('[role=tablist][aria-label=\"Open designs\"] [role=tab]').length");
  const waitActive = id => waitForRenderer(renderer, `localStorage.getItem('visro-active-design')===${JSON.stringify(id)}&&!document.querySelector('.home-shell,.busy-toast,.canvas-loading')`, `Native tab selection did not open ${id} after ${renderer.nativeTabsTrace.at(-1)?.accelerator}.`);
  await clickMenu('File', 'CmdOrCtrl+T');
  await waitForRenderer(renderer, `localStorage.getItem('visro-active-design')!==${JSON.stringify(originalId)}&&!document.querySelector('.busy-toast,.canvas-loading')`, 'CmdT must open a new local design.');
  const createdId = await renderer.evaluate("localStorage.getItem('visro-active-design')");
  await waitForRenderer(renderer, `document.querySelectorAll('[role=tablist][aria-label="Open designs"] [role=tab]').length===${before + 1}`, 'The new design must appear in the native tab strip.');
  assert.equal(await renderer.evaluate("document.querySelectorAll('[role=tablist][aria-label=\"Open designs\"] [role=tab]').length"), before + 1);
  await clickMenu('Tab', 'Alt+CmdOrCtrl+Left'); await waitActive(originalId);
  await clickMenu('Tab', 'Alt+CmdOrCtrl+Right'); await waitActive(createdId);
  await clickMenu('File', 'CmdOrCtrl+W'); await waitActive(originalId);
  assert.equal(await renderer.evaluate("document.querySelectorAll('[role=tablist][aria-label=\"Open designs\"] [role=tab]').length"), before);
  await clickMenu('Tab', 'CmdOrCtrl+Shift+T'); await waitActive(createdId);
  const tabs = await renderer.evaluate("JSON.parse(localStorage.getItem('visro-workspace-tabs'))");
  await clickMenu('Tab', 'CmdOrCtrl+1'); await waitActive(tabs[0].id);
  await clickMenu('Tab', 'CmdOrCtrl+9'); await waitActive(createdId);
  await clickMenu('File', 'CmdOrCtrl+Shift+H');
  await waitForRenderer(renderer, "Boolean(document.querySelector('.home-shell'))", 'Native Home command must open Home.');
  await clickMenu('Tab', 'Alt+CmdOrCtrl+Left'); await waitActive(originalId);
  return { newTab: true, nextPrevious: true, closeAndReopen: true, numberedTabs: true, home: true, restoredOriginal: true, countBefore: before, countAfter: before + 1 };
}

async function runNativeCaptionRegression(renderer, main, profile, enginePath, screenshotPath) {
  if (!main) return { skipped: true, reason: 'The isolated main-process inspector is unavailable.' };
  const originalId = await renderer.evaluate("localStorage.getItem('visro-active-design')"), originalName = await renderer.evaluate("document.querySelector('input[aria-label=\"Design name\"]')?.value");
  const electronAPI = "process.getBuiltinModule('module').createRequire(process.cwd()+'/package.json')('electron')";
  const destination = path.join(profile, 'native-caption-export.mp4');
  const text = 'Native caption edited café';
  await renderer.evaluate(`(async()=>{const image=document.createElement('canvas');image.width=320;image.height=180;const context=image.getContext('2d');context.fillStyle='#112244';context.fillRect(0,0,320,180);const project={version:1,name:'Native caption acceptance',width:320,height:180,pages:[{id:'caption-page',name:'Page 1',background:'#112244',canvas:{version:'7.4.0',objects:[],background:'#112244'}}],activePageId:'caption-page',brand:{colors:['#112244'],fonts:['Arial']},kind:'video',content:{scenes:[{id:'caption-still',name:'Caption scene',kind:'image',image:image.toDataURL(),duration:2,transition:'none'}],audio:[],captions:[{id:'caption',start:.2,end:1.3,text:'Native caption QA'}]}};const record={id:'native-caption-acceptance',name:project.name,updated:Date.now(),project};const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('visro-studio');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});await new Promise((resolve,reject)=>{const transaction=db.transaction('projects','readwrite');transaction.objectStore('projects').put(record);transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);});db.close();localStorage.setItem('visro-active-design',record.id);return true;})()`);
  await renderer.command('Page.reload'); await openHomeDesign(renderer, 'Native caption acceptance');
  await waitForRenderer(renderer, "Boolean(document.querySelector('.media-studio input[aria-label=\"Timeline playhead\"]'))", 'The packaged video workspace must expose its playhead.');
  const scrub = async time => {
    const point = await renderer.evaluate(`(()=>{const input=document.querySelector('.media-studio input[aria-label="Timeline playhead"]'),r=input.getBoundingClientRect();return{x:r.left+8+(r.width-16)*${time}/Number(input.max),y:r.top+r.height/2};})()`);
    await renderer.command('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 });
    await renderer.command('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: 1 });
  };
  await scrub(.4);
  await waitForRenderer(renderer, "document.querySelector('[aria-label=\"Caption preview\"]')?.textContent==='Native caption QA'", 'Timed captions must preview at the actual native playhead.');
  await renderer.evaluate("Array.from(document.querySelectorAll('.media-library button')).find(button=>button.textContent.trim()==='Captions').click()");
  await waitForRenderer(renderer, "Boolean(document.querySelector('textarea[aria-label=\"Caption text 1\"]'))", 'The caption editor must be available in the packaged app.');
  await renderer.evaluate("(()=>{const input=document.querySelector('textarea[aria-label=\"Caption text 1\"]');input.focus();input.select();})()");
  await renderer.command('Input.insertText', { text });
  await waitForRenderer(renderer, `document.querySelector('[aria-label="Caption preview"]')?.textContent===${JSON.stringify(text)}`, 'Native caption editing must update the timed preview.');
  assert.equal(await renderer.evaluate("(()=>{const button=document.querySelector('.topbar button[aria-label=\"Undo (⌘Z)\"],.topbar button[title=\"Undo (⌘Z)\"]');if(!button)return false;button.click();return true;})()"), true, 'Project Undo must be available in the video workspace.');
  await waitForRenderer(renderer, "Number(document.querySelector('.media-studio input[aria-label=\"Timeline playhead\"]')?.value)===0", 'Video project Undo must refresh the timeline from restored metadata.');
  await scrub(.4);
  await waitForRenderer(renderer, "document.querySelector('[aria-label=\"Caption preview\"]')?.textContent==='Native caption QA'", 'Video project Undo must restore the prior caption text.');
  assert.equal(await main.evaluate(`(()=>{const edit=${electronAPI}.Menu.getApplicationMenu().items.find(item=>item.label==='Edit');const item=edit?.submenu?.items.find(item=>item.accelerator==='CmdOrCtrl+Shift+Z');if(!item||typeof item.click!=='function')return false;item.click();return true;})()`), true, 'Native project Redo must be available.');
  await waitForRenderer(renderer, "Number(document.querySelector('.media-studio input[aria-label=\"Timeline playhead\"]')?.value)===0", 'Native Redo must refresh video history even when the playhead slider has focus.');
  await scrub(.4);
  await waitForRenderer(renderer, `document.querySelector('[aria-label="Caption preview"]')?.textContent===${JSON.stringify(text)}`, 'Native project Redo must restore the edited caption.');
  await waitForRenderer(renderer, `(async()=>{const saved=await ${readSavedProject};return saved?.project?.content?.captions?.[0]?.text===${JSON.stringify(text)};})()`, 'Edited captions must autosave to the local project.');
  const patched = await main.evaluate(`(()=>{const dialog=${electronAPI}.dialog;globalThis.__visroSmokeSaveDialog=dialog.showSaveDialog;dialog.showSaveDialog=async()=>({canceled:false,filePath:${JSON.stringify(destination)}});return true;})()`);
  assert.equal(patched, true);
  try {
    await renderer.evaluate("Array.from(document.querySelectorAll('.media-studio button')).find(button=>button.textContent.trim()==='Export video').click()");
    await waitForRenderer(renderer, "document.querySelector('.toast')?.textContent?.includes('Video exported: native-caption-export.mp4')", 'The native caption film must render through the actual export workflow.', 30000);
  } finally {
    await main.evaluate(`(()=>{const dialog=${electronAPI}.dialog;if(globalThis.__visroSmokeSaveDialog){dialog.showSaveDialog=globalThis.__visroSmokeSaveDialog;delete globalThis.__visroSmokeSaveDialog;}return true;})()`);
  }
  const frames = [];
  for (const time of [.1, .7, 1.6]) {
    const { stdout } = await promisify(execFile)(enginePath, ['-hide_banner', '-loglevel', 'error', '-ss', String(time), '-i', destination, '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'], { encoding: 'buffer', maxBuffer: 2 * 1024 * 1024 });
    assert.equal(stdout.length, 320 * 180 * 3);
    let white = 0;
    for (let i = 0; i < stdout.length; i += 3) if (stdout[i] > 190 && stdout[i + 1] > 190 && stdout[i + 2] > 190) white++;
    frames.push(white);
  }
  assert.equal(frames[0], 0, 'Native caption export must hide text before its cue.');
  assert.ok(frames[1] > 20, 'Native caption export must burn visible text into video frames.');
  assert.equal(frames[2], 0, 'Native caption export must hide text after its cue.');
  await renderer.command('Page.reload'); await openHomeDesign(renderer, 'Native caption acceptance');
  await waitForRenderer(renderer, "Boolean(document.querySelector('.media-studio input[aria-label=\"Timeline playhead\"]'))", 'The saved caption film must reopen.');
  await scrub(.4);
  await waitForRenderer(renderer, `document.querySelector('[aria-label="Caption preview"]')?.textContent===${JSON.stringify(text)}`, 'Edited captions must survive a full packaged renderer reload.');
  await renderer.evaluate("Array.from(document.querySelectorAll('.media-library button')).find(button=>button.textContent.trim()==='Captions').click()");
  await waitForRenderer(renderer, "Boolean(document.querySelector('textarea[aria-label=\"Caption text 1\"]'))", 'The saved caption track must remain editable after reopening.');
  if (screenshotPath) {
    await renderer.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const screenshot = await renderer.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const file = path.resolve(screenshotPath).replace(/\.png$/i, '-captions.png');
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, Buffer.from(screenshot.data, 'base64'));
  }
  await renderer.evaluate(`localStorage.setItem('visro-active-design',${JSON.stringify(originalId)})`);
  await renderer.command('Page.reload'); await openHomeDesign(renderer, originalName);
  return { timedPreview: true, editable: true, projectUndo: true, nativeProjectRedo: true, autosaveRestored: true, nativeExport: true, frameWhitePixels: frames, outputBytes: (await fs.stat(destination)).size, originalDesignRestored: true };
}

async function runNativePublicImageRegression(renderer, main, profile, screenshotPath) {
  assert.ok(main, 'Public-image acceptance requires the isolated native inspector.');
  const originalId = await renderer.evaluate("localStorage.getItem('visro-active-design')");
  const electronAPI = "process.getBuiltinModule('module').createRequire(process.cwd()+'/package.json')('electron')";
  assert.equal(await renderer.evaluate("typeof window.visro.searchPublicImages==='function'&&typeof window.visro.getPublicImage==='function'"), true, 'Public image search/get must be exposed by the packaged bridge.');
  await renderer.evaluate("window.__visroSmokePhotos={state:'pending'};window.visro.searchPublicImages({query:'mountain',limit:24}).then(result=>{const image=result.items.find(item=>/\\.jpe?g$/i.test(item.title));if(!image)throw new Error('No verified JPEG photo was returned.');window.__visroSmokePhotos={state:'ready',image,count:result.items.length};}).catch(error=>window.__visroSmokePhotos={state:'error',message:error.message});true");
  await waitForRenderer(renderer, "window.__visroSmokePhotos.state!=='pending'", 'The packaged public-domain search did not settle.', 45000);
  const search = await renderer.evaluate('window.__visroSmokePhotos');
  assert.equal(search.state, 'ready', search.message || 'Commons must return verified public-domain/CC0 photos.');
  assert.ok(search.count > 0 && search.count <= 24); assert.match(search.image.id, /^commons:[1-9]\d+$/); assert.ok(['CC0', 'Public domain'].includes(search.image.license));
  // Warm one visible preview through the actual IPC; its full-sized transfer is
  // exercised by opening the real preview dialog below, not by a fixture image.
  await renderer.evaluate(`window.__visroSmokePhotoGet={state:'pending'};window.visro.getPublicImage({id:${JSON.stringify(search.image.id)},size:'thumbnail'}).then(image=>window.__visroSmokePhotoGet={state:'ready',bytes:image.bytes,width:image.imageWidth,height:image.imageHeight,dataURI:image.data.startsWith('data:image/')}).catch(error=>window.__visroSmokePhotoGet={state:'error',message:error.message});true`);
  await waitForRenderer(renderer, "window.__visroSmokePhotoGet.state!=='pending'", 'The packaged photo preview did not settle.', 45000);
  const thumbnail = await renderer.evaluate('window.__visroSmokePhotoGet'); assert.equal(thumbnail.state, 'ready', thumbnail.message); assert.ok(thumbnail.bytes > 1000); assert.ok(thumbnail.dataURI && Math.max(thumbnail.width, thumbnail.height) <= 480);
  assert.equal(await main.evaluate(`(()=>{const item=${electronAPI}.Menu.getApplicationMenu().items.find(item=>item.label==='File')?.submenu?.items.find(item=>item.accelerator==='CmdOrCtrl+T');if(!item)return false;item.click();return true;})()`), true);
  await waitForRenderer(renderer, `localStorage.getItem('visro-active-design')!==${JSON.stringify(originalId)}&&!document.querySelector('.home-shell,.canvas-loading,.busy-toast')`, 'The public-photo test design did not open.');
  const photoDesignId = await renderer.evaluate("localStorage.getItem('visro-active-design')");
  await renderer.evaluate("(()=>{const input=document.querySelector('input[aria-label=\"Design name\"]');input.focus();input.select();})()");
  await renderer.command('Input.insertText', { text: 'Native public image acceptance' });
  await renderer.evaluate("(()=>{const button=Array.from(document.querySelectorAll('.rail-button')).find(button=>button.textContent.trim()==='Elements');if(!button.classList.contains('selected'))button.click();})()");
  await waitForRenderer(renderer, "Boolean(document.querySelector('.elements-panel:not(.hidden) .search-box input'))", 'Elements must open its search box.');
  await renderer.evaluate("(()=>{const input=document.querySelector('.elements-panel .search-box input');input.focus();input.select();})()");
  await renderer.command('Input.insertText', { text: 'mountain' });
  await renderer.evaluate("Array.from(document.querySelectorAll('.elements-filter-tabs button')).find(button=>button.textContent==='Photos').click()");
  const previewSelector = `Array.from(document.querySelectorAll('.public-photo-image')).find(button=>button.getAttribute('aria-label')===${JSON.stringify(`Add ${search.image.name} photo to canvas`)})`;
  await waitForRenderer(renderer, `Boolean(${previewSelector})`, 'The real Elements → Photos grid must contain the searched photo.');
  await renderer.evaluate(`${previewSelector}.scrollIntoView({block:'center'})`);
  await waitForRenderer(renderer, `(()=>{const button=${previewSelector},image=button?.querySelector('img');return image?.complete&&image.naturalWidth>0&&image.src.startsWith('data:image/')&&button.draggable;})()`, 'The real Elements → Photos grid must paint its decoded, draggable preview.', 45000);
  await renderer.evaluate(`${previewSelector}.closest('.public-photo-card').querySelector('.public-photo-details').click()`);
  await waitForRenderer(renderer, "Boolean(document.querySelector('.public-photo-detail [class~=coral]:not(:disabled)'))&&document.querySelector('.public-photo-detail-art img')?.complete", 'The native full-photo preview did not finish loading.', 60000);
  const preview = await renderer.evaluate("(()=>{const image=document.querySelector('.public-photo-detail-art img');return{width:image.naturalWidth,height:image.naturalHeight,dataURI:image.src.startsWith('data:image/'),license:document.querySelector('.public-photo-detail-license')?.textContent,error:document.querySelector('.public-photo-detail [role=alert]')?.textContent||''};})()");
  assert.equal(preview.error, '', preview.error || 'The full photo must load without a preview error.');
  assert.ok(preview.dataURI && Math.max(preview.width, preview.height) <= 2400); assert.match(preview.license, /CC0|Public domain/);
  const addPoint = await renderer.evaluate("(()=>{const button=Array.from(document.querySelectorAll('.public-photo-detail button')).find(button=>button.textContent.trim()==='Add to design'),r=button.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()");
  await renderer.command('Input.dispatchMouseEvent', { type: 'mousePressed', ...addPoint, button: 'left', buttons: 1, clickCount: 1 });
  await renderer.command('Input.dispatchMouseEvent', { type: 'mouseReleased', ...addPoint, button: 'left', buttons: 0, clickCount: 1 });
  await waitForRenderer(renderer, "!document.querySelector('.public-photo-detail')&&Array.from(document.querySelectorAll('.toolbar-button')).some(button=>button.textContent.trim()==='BG Remover')", 'Adding the preview must create a selected editable photo.');
  const savedPhoto = `(async()=>{const saved=await ${readSavedProject};const images=saved?.project.pages.flatMap(page=>page.canvas.objects||[]).filter(object=>object.visroMetadata?.source?.id===${JSON.stringify(search.image.id)})||[];const digest=images[0]?.src?Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(images[0].src)))).map(byte=>byte.toString(16).padStart(2,'0')).join(''):null;return{designId:saved?.id,name:saved?.name,count:images.length,image:images[0]?{id:images[0].id,embedded:images[0].src?.startsWith('data:image/'),sha256:digest,source:images[0].visroMetadata.source}:null};})()`;
  await waitForRenderer(renderer, `(async()=>{const saved=await ${savedPhoto};return saved.count===1&&saved.image.embedded&&saved.designId===${JSON.stringify(photoDesignId)};})()`, 'The inserted photo and source/license metadata must autosave locally.');
  const persisted = await renderer.evaluate(savedPhoto); assert.equal(persisted.image.source.license, search.image.license); assert.equal(persisted.image.source.sourceUrl, search.image.sourceUrl);
  const paint = `(()=>{const source=document.querySelector('.lower-canvas');if(!source?.width)return null;const canvas=document.createElement('canvas');canvas.width=400;canvas.height=Math.max(1,Math.round(source.height/source.width*400));const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(source,0,0,canvas.width,canvas.height);const data=context.getImageData(0,0,canvas.width,canvas.height).data,colors=new Set();for(let i=0;i<data.length;i+=4){if(data[i+3]>200)colors.add((data[i]>>4)*256+(data[i+1]>>4)*16+(data[i+2]>>4));}return{colors:colors.size};})()`;
  await waitForRenderer(renderer, `(()=>{const pixels=${paint};return pixels?.colors>40;})()`, 'Imported photo pixels must visibly paint onto the native design.');
  const beforePixels = await renderer.evaluate(paint);
  await renderer.evaluate("document.querySelector('button[aria-label=\"Close side panel\"]')?.click()");
  let probeRequests = 0;
  const probeServer = createServer((_request,response)=>{
    probeRequests++;
    response.writeHead(200, {'Content-Type':'text/plain','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Cross-Origin-Resource-Policy':'cross-origin'});
    response.end('visro-network-control');
  });
  await new Promise((resolve,reject)=>{probeServer.once('error',reject);probeServer.listen(0,'127.0.0.1',resolve);});
  const probeURL = `http://127.0.0.1:${probeServer.address().port}/visro-network-control`;
  const networkProbe = `(async()=>{try{const response=await fetch(${JSON.stringify(probeURL)},{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(8000)});return{status:response.status,text:await response.text()};}catch(error){return{error:error.message};}})()`;
  const intercepted = [], transfers = [];
  let removeListener, offlineNetwork;
  await renderer.command('Page.enable'); await renderer.command('Network.enable');
  try {
    // The app normally blocks direct browser HTTP through CSP. Allow only this
    // isolated test context, then reload because Chromium initializes CSP bypass
    // at navigation. The local control server avoids external/CORS ambiguity.
    await renderer.command('Page.setBypassCSP', { enabled: true });
    await renderer.command('Page.reload'); await openHomeDesign(renderer, 'Native public image acceptance');
    const reachable = await renderer.evaluate(networkProbe);
    assert.deepEqual(reachable, {status:200,text:'visro-network-control'}, 'The exact renderer probe must succeed before network blocking.');
    assert.equal(probeRequests, 1);
    // Electron custom-scheme navigations reset navigator overrides, and session
    // emulation did not block this renderer's requests in a standalone probe.
    // Intercept every actual HTTP(S) request and fail it at the browser boundary;
    // count real paused requests rather than mocking navigator or fetch.
    removeListener = renderer.on('Fetch.requestPaused', event=>{
      intercepted.push({url:event.request.url,reason:'InternetDisconnected'});
      const transfer = renderer.command('Fetch.failRequest', {requestId:event.requestId,errorReason:'InternetDisconnected'});
      transfer.catch(()=>{}); transfers.push(transfer);
    });
    await renderer.command('Fetch.enable', {patterns:[{urlPattern:'http://*',requestStage:'Request'},{urlPattern:'https://*',requestStage:'Request'}]});
    await renderer.command('Network.overrideNetworkState', {offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
    const onlineBeforeReload = await renderer.evaluate('navigator.onLine');
    const beforeReload = await renderer.evaluate(networkProbe);
    assert.match(beforeReload.error || '', /Failed to fetch/, 'The isolated renderer must reject its actual HTTP probe before reload.');
    await renderer.command('Page.reload'); await openHomeDesign(renderer, 'Native public image acceptance');
    const onlineAfterReload = await renderer.evaluate('navigator.onLine');
    const afterReload = await renderer.evaluate(networkProbe);
    assert.match(afterReload.error || '', /Failed to fetch/, 'The isolated renderer must still reject its actual HTTP probe after reload.');
    await Promise.all(transfers);
    assert.equal(intercepted.filter(event=>event.url===probeURL).length, 2, 'Both real renderer probes must reach browser interception.');
    assert.equal(probeRequests, 1, 'The disconnected renderer requests must never reach the control server.');
    offlineNetwork = {boundary:'renderer-http-and-https-request-interception',onlineControlStatus:reachable.status,controlServerRequests:probeRequests,failedRequests:2,blockedRequestEvents:intercepted.length,errorReason:'InternetDisconnected',navigatorOnlineBeforeReload:onlineBeforeReload,navigatorOnlineAfterReload:onlineAfterReload};
    await waitForRenderer(renderer, `(()=>{const pixels=${paint};return pixels?.colors>40;})()`, 'The embedded photo must render after a blocked-network project reload.');
    const restored = await renderer.evaluate(savedPhoto); assert.equal(restored.image.id,persisted.image.id); assert.equal(restored.image.embedded,true); assert.equal(restored.image.sha256,persisted.image.sha256); assert.deepEqual(restored.image.source,persisted.image.source);
    if (screenshotPath) {
      await renderer.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      const screenshot = await renderer.command('Page.captureScreenshot', {format:'png',captureBeyondViewport:false});
      await fs.mkdir(path.dirname(path.resolve(screenshotPath)), {recursive:true});
      await fs.writeFile(path.resolve(screenshotPath).replace(/\.png$/i,'-public-images.png'),Buffer.from(screenshot.data,'base64'));
    }
    await renderer.command('Fetch.disable'); removeListener(); removeListener = null;
    await renderer.command('Network.overrideNetworkState', {offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
    await renderer.command('Page.setBypassCSP', {enabled:false});
    await renderer.command('Page.reload'); await openHomeDesign(renderer,'Native public image acceptance');
    await renderer.command('Log.enable');
    const securityLog = renderer.once('Log.entryAdded',5000); securityLog.catch(()=>{});
    const blocked = await renderer.evaluate(networkProbe), security = await securityLog;
    assert.match(blocked.error || '', /Failed to fetch/, 'Normal production CSP must block the direct HTTP probe again.');
    assert.equal(security.entry.source,'security'); assert.match(security.entry.text,/connect-src/);
    assert.equal(probeRequests,1,'Restored CSP must block the HTTP control before it reaches the server.');
    offlineNetwork.productionCSPRechecked = true;
  } finally {
    await renderer.command('Fetch.disable'); removeListener?.();
    await renderer.command('Network.overrideNetworkState', {offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
    await renderer.command('Page.setBypassCSP', {enabled:false});
    probeServer.closeIdleConnections();
    await new Promise(resolve=>probeServer.close(resolve));
  }
  const cachedImages = (await fs.readdir(path.join(profile, 'public-images'))).filter(file=>/\.bin$/.test(file)).length;
  await renderer.evaluate(`(()=>{const index=JSON.parse(localStorage.getItem('visro-workspace-tabs')||'[]').findIndex(tab=>tab.id===${JSON.stringify(originalId)});document.querySelectorAll('.desktop-tab[role="tab"]')[index]?.click();})()`);
  await waitForRenderer(renderer, `localStorage.getItem('visro-active-design')===${JSON.stringify(originalId)}&&!document.querySelector('.canvas-loading,.busy-toast,.home-shell')`, 'Public-photo acceptance must return to the original design.');
  return { provider: 'wikimedia-commons', searchCount: search.count, id: search.image.id, license: search.image.license, nativeIPCSearch: true, nativeIPCGet: true, gridDataURI: true, draggablePreview: true, thumbnail, preview, inserted: true, savedSource: persisted.image.source, embeddedSHA256: persisted.image.sha256, localCacheImages: cachedImages, paintColors: beforePixels.colors, autosaveRestored: true, offlineRendererReopen: true, offlineNetwork, originalDesignRestored: true };
}

async function runNativeElementLibraryRegression(renderer, main, screenshotPath) {
  assert.ok(main, 'Element library acceptance requires the isolated native inspector.');
  const originalId = await renderer.evaluate("localStorage.getItem('visro-active-design')"), electronAPI = "process.getBuiltinModule('module').createRequire(process.cwd()+'/package.json')('electron')";
  const menu = accelerator => main.evaluate(`(()=>{const item=${electronAPI}.Menu.getApplicationMenu().items.find(item=>item.label==='Edit')?.submenu?.items.find(item=>item.accelerator===${JSON.stringify(accelerator)});if(!item)return false;item.click();return true;})()`);
  await main.evaluate(`(()=>{${electronAPI}.Menu.getApplicationMenu().items.find(item=>item.label==='File').submenu.items.find(item=>item.accelerator==='CmdOrCtrl+T').click();})()`);
  await waitForRenderer(renderer, `localStorage.getItem('visro-active-design')!==${JSON.stringify(originalId)}&&!document.querySelector('.home-shell,.canvas-loading,.busy-toast')`, 'The element-library test design did not open.');
  await renderer.evaluate("(()=>{const input=document.querySelector('input[aria-label=\"Design name\"]');input.focus();input.select();})()"); await renderer.command('Input.insertText', { text: 'Native element library acceptance' });
  await renderer.evaluate("(()=>{const button=Array.from(document.querySelectorAll('.rail-button')).find(button=>button.textContent.trim()==='Elements');if(!button.classList.contains('selected'))button.click();})()");
  const searchInput = async text => {
    await renderer.evaluate("(()=>{const input=document.querySelector('.elements-panel .search-box input');input.focus();input.select();})()");
    await renderer.command('Input.insertText', { text });
  };
  const category = name => renderer.evaluate(`Array.from(document.querySelectorAll('.elements-filter-tabs button')).find(button=>button.textContent===${JSON.stringify(name)}).click()`);
  await waitForRenderer(renderer, "Boolean(document.querySelector('.elements-panel:not(.hidden) .search-box input'))", 'The native Elements library did not open.');
  await searchInput('heart'); await category('Shapes');
  await waitForRenderer(renderer, "Boolean(document.querySelector('.element-shape-tile[aria-label=\"Add Heart\"]'))", 'The new shape library must expose its native Heart tile.');
  await nativeClick(renderer, "document.querySelector('.element-shape-tile[aria-label=\"Add Heart\"]')");
  await waitForRenderer(renderer, `(async()=>{const saved=await ${readSavedProject};return saved?.project.pages[0].canvas.objects.length===1&&saved.project.pages[0].canvas.objects[0].visroName==='Heart';})()`, 'A native shape click must autosave one Heart vector.');
  await searchInput('Three-step funnel'); await category('Graphics');
  const graphic = "document.querySelector('.original-graphic-add[aria-label=\"Add Three-step funnel graphic\"]')";
  await waitForRenderer(renderer, `Boolean(${graphic})`, 'The graphics library must expose the original, multicolor funnel.');
  const drag = await nativeLibraryDrag(renderer, graphic);
  assert.deepEqual(drag.find(item=>item.mimeType==='text/visro-graphic'), { mimeType: 'text/visro-graphic', data: JSON.stringify({ id: 'graphic-chart-funnel' }) }, 'A real HTML dragstart must carry its vetted graphic ID.');
  const objects = `(async()=>{const saved=await ${readSavedProject};return saved?.project.pages[0].canvas.objects||[];})()`;
  const group = `(async()=>{const objects=await ${objects};return objects.find(object=>object.visroGraphicId==='graphic-chart-funnel');})()`;
  await waitForRenderer(renderer, `(async()=>Boolean(await ${group}))()`, 'Dropping a graphic on the native canvas must autosave its native group.');
  const inserted = await renderer.evaluate(group); assert.equal(inserted.objects.length, 3); assert.ok(inserted.objects.every(part=>String(part.type).toLowerCase()==='path')); assert.ok(inserted.objects.every(part=>part.id));
  assert.equal(await menu('CmdOrCtrl+Z'), true);
  await waitForRenderer(renderer, `(async()=>{const objects=await ${objects};return objects.length===1&&!objects.some(object=>object.visroGraphicId);})()`, 'A single native Undo must remove the complete dropped graphic.');
  assert.equal(await menu('CmdOrCtrl+Shift+Z'), true);
  await waitForRenderer(renderer, `(async()=>Boolean(await ${group}))()`, 'Native Redo must restore the dropped vector graphic.');
  await nativeClick(renderer, "document.querySelector('.canvas-viewport')");
  await waitForRenderer(renderer, "Boolean(document.querySelector('button[aria-label=\"Graphic colour 1\"]'))", 'A multicolor native graphic must expose its editable palette.');
  await nativeClick(renderer, "document.querySelector('button[aria-label=\"Graphic colour 1\"]')");
  await waitForRenderer(renderer, "Boolean(document.querySelector('input[aria-label=\"Hex colour\"]'))", 'A graphic palette swatch must open the color editor.');
  await renderer.evaluate("(()=>{const input=document.querySelector('input[aria-label=\"Hex colour\"]');input.focus();input.select();})()"); await renderer.command('Input.insertText', { text: '#123456' });
  await waitForRenderer(renderer, `(async()=>{const graphic=await ${group};return graphic?.objects.some(part=>part.fill==='#123456'||part.stroke==='#123456');})()`, 'Changing a graphic swatch must save the edited vector palette.');
  const changed = await renderer.evaluate(group), beforePalette = inserted.objects.map(part=>({fill:part.fill,stroke:part.stroke})), afterPalette = changed.objects.map(part=>({fill:part.fill,stroke:part.stroke}));
  assert.notDeepEqual(afterPalette, beforePalette); assert.equal(afterPalette.filter((part,index)=>part.fill!==beforePalette[index].fill||part.stroke!==beforePalette[index].stroke).length, 1, 'Only the selected funnel palette color must change.');
  await nativeClick(renderer, "document.querySelector('.topbar button[aria-label=\"Undo (⌘Z)\"],.topbar button[title=\"Undo (⌘Z)\"]')");
  await waitForRenderer(renderer, `(async()=>{const graphic=await ${group};return JSON.stringify(graphic?.objects.map(part=>({fill:part.fill,stroke:part.stroke})))===${JSON.stringify(JSON.stringify(beforePalette))};})()`, 'Toolbar Undo must restore the original graphic palette.');
  await nativeClick(renderer, "document.querySelector('.canvas-viewport')");
  await waitForRenderer(renderer, "Array.from(document.querySelectorAll('.toolbar-button')).some(button=>button.textContent.trim()==='Ungroup')", 'The restored graphic must be selectable for native ungroup.');
  await nativeClick(renderer, "Array.from(document.querySelectorAll('.toolbar-button')).find(button=>button.textContent.trim()==='Ungroup')");
  await waitForRenderer(renderer, `(async()=>{const objects=await ${objects};return objects.length===4&&objects.every(object=>String(object.type).toLowerCase()==='path');})()`, 'Ungroup must leave the Heart and all three independently editable vector parts.');
  await renderer.command('Page.reload'); await openHomeDesign(renderer, 'Native element library acceptance');
  assert.equal((await renderer.evaluate(objects)).length, 4, 'The expanded native vector library must survive a full project reopen.');
  if (screenshotPath) {
    await renderer.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const screenshot = await renderer.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await fs.mkdir(path.dirname(path.resolve(screenshotPath)), { recursive: true }); await fs.writeFile(path.resolve(screenshotPath).replace(/\.png$/i, '-elements.png'), Buffer.from(screenshot.data, 'base64'));
  }
  await renderer.evaluate(`(()=>{const index=JSON.parse(localStorage.getItem('visro-workspace-tabs')||'[]').findIndex(tab=>tab.id===${JSON.stringify(originalId)});document.querySelectorAll('.desktop-tab[role="tab"]')[index]?.click();})()`);
  await waitForRenderer(renderer, `localStorage.getItem('visro-active-design')===${JSON.stringify(originalId)}&&!document.querySelector('.canvas-loading,.busy-toast,.home-shell')`, 'Element-library acceptance must return to the original design.');
  return { shapeClick: true, realGraphicDrag: true, droppedNativeParts: 3, nativeUndoRedo: true, paletteEditUndo: true, ungroupedEditablePaths: 4, autosaveRestored: true, originalDesignRestored: true };
}

async function runClipboardRegression(renderer, main) {
  if (!main) return { skipped: true, reason: 'The isolated main-process inspector is unavailable; the clipboard was not changed.' };
  const electronAPI = "process.getBuiltinModule('module').createRequire(process.cwd()+'/package.json')('electron')";
  const preservation = await main.evaluate(`(async()=>{
    try {
      const {clipboard,ClipboardItem}=${electronAPI};
      if(typeof clipboard.read!=='function'||typeof clipboard.write!=='function'||typeof ClipboardItem!=='function')return {available:false,reason:'Clipboard preservation APIs are unavailable.'};
      const items=await clipboard.read();let size=0;
      if(!Array.isArray(items)||items.length>100)return {available:false,reason:'Current clipboard cannot be safely preserved.'};
      const backup=[];
      for(const item of items){const values={};if(item.types.length>100)return {available:false,reason:'Current clipboard cannot be safely preserved.'};
        for(const type of item.types){const value=await item.getType(type);size+=typeof value?.size==='number'?value.size:Buffer.byteLength(JSON.stringify(value));if(size>64*1024*1024)return {available:false,reason:'Current clipboard exceeds the preservation limit.'};values[type]=value;}
        backup.push(new ClipboardItem(values));
      }
      // Verify a complete atomic round-trip of the original contents before
      // writing fixtures. Original values remain in this process only.
      if(backup.length)await clipboard.write(backup);
      else if(typeof clipboard.clear!=='function')return {available:false,reason:'Empty clipboard restoration is unavailable.'};
      globalThis.__visroSmokeClipboardBackup=backup;
      return {available:true};
    }catch{return {available:false,reason:'The system clipboard could not be preserved; no test fixture was written.'};}
  })()`);
  if (!preservation.available) return { skipped: true, reason: preservation.reason };
  let report, validationFailure, stage = 'bridge availability';
  try {
    const bridgeReady = await renderer.evaluate("typeof window.visro.writeCanvasClipboard==='function'&&typeof window.visro.readCanvasClipboard==='function'");
    assert.equal(bridgeReady, true, 'The native canvas clipboard bridge must be available.');
    stage = 'editable object copy';
    const objects = [{ type: 'Rect', left: 12, top: 16, width: 40, height: 24, fill: '#8b3dff' }];
    assert.equal(await renderer.evaluate(`window.visro.writeCanvasClipboard({objects:${JSON.stringify(objects)},plainText:'Visro native clipboard fixture'})`), true);
    const copied = await renderer.evaluate('window.visro.readCanvasClipboard()');
    assert.deepEqual(copied, { kind: 'objects', objects }, 'Copied shapes must retain editable geometry.');
    stage = 'external text paste';
    await main.evaluate(`(async()=>{const {clipboard,ClipboardItem}=${electronAPI};await clipboard.write([new ClipboardItem({'text/plain':new Blob(['Visro external text fixture'],{type:'text/plain'})})]);return true;})()`);
    assert.deepEqual(await renderer.evaluate('window.visro.readCanvasClipboard()'), { kind: 'text', text: 'Visro external text fixture' }, 'External copy must replace the old object clipboard marker.');
    stage = 'raster image paste';
    await main.evaluate(`(async()=>{const {clipboard,ClipboardItem,nativeImage}=${electronAPI};const pixels=Buffer.from([139,61,255,255,255,128,64,255,255,128,64,255,139,61,255,255]);const image=nativeImage.createFromBitmap(pixels,{width:2,height:2});await clipboard.write([new ClipboardItem({'image/png':new Blob([image.toPNG()],{type:'image/png'}),'text/plain':new Blob(['Visro native image fixture'],{type:'text/plain'})})]);return true;})()`);
    const pasted = await renderer.evaluate('window.visro.readCanvasClipboard()');
    assert.equal(pasted?.kind, 'image', 'Native paste must prefer the current image over its text label.');
    assert.match(pasted.data, /^data:image\/png;base64,/);
    const dimensions = await renderer.evaluate(`(async()=>{const image=new Image();image.src=${JSON.stringify(pasted.data)};await image.decode();return {width:image.naturalWidth,height:image.naturalHeight};})()`);
    assert.deepEqual(dimensions, { width: 2, height: 2 });
    report = { editableObjects: true, externalText: true, rasterImage: true, originalRestored: false };
  } catch {
    // Assertion diffs could expose a concurrent external clipboard change.
    // Only a controlled stage label leaves this helper, never actual values.
    validationFailure = new Error(`Native clipboard acceptance failed during ${stage}; original contents will be restored.`);
  }
  // Keep the original materialized ClipboardItems alive until restoration is
  // confirmed. No original values or their format names enter this report.
  let restored = false;
  for (let attempt = 0; attempt < 3 && !restored; attempt++) {
    try {
      restored = await main.evaluate(`(async()=>{try{const {clipboard}=${electronAPI};const backup=globalThis.__visroSmokeClipboardBackup;if(!Array.isArray(backup))return false;if(backup.length)await clipboard.write(backup);else await clipboard.clear();delete globalThis.__visroSmokeClipboardBackup;return true;}catch{return false;}})()`);
    } catch { /* A transient inspector failure must not skip restoration. */ }
    if (!restored) await delay(200);
  }
  if (!restored) {
    const error = new Error('Original clipboard restoration could not be confirmed; the isolated test process is preserved for restoration.');
    error.preserveNativeProcess = true;
    throw error;
  }
  if (validationFailure) throw validationFailure;
  report.originalRestored = true;
  return report;
}

async function runGestureRegression(cdp, projectPath, screenshotPath) {
  const project = JSON.parse(await fs.readFile(path.resolve(projectPath), 'utf8'));
  const page = project.pages.find((candidate) => candidate.id === project.activePageId);
  const target = page?.canvas?.objects?.find((object) => object.type === 'Circle' && object.fill === '#F6BED0');
  assert.ok(target, 'The saved reproduction must contain the draggable pink circle.');
  const record = { id: 'native-gesture-reproduction', name: project.name, project, updated: Date.now() };
  await cdp.evaluate(`(async()=>{
    const record=${JSON.stringify(record)};
    const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('visro-studio');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    await new Promise((resolve,reject)=>{const transaction=db.transaction('projects','readwrite');transaction.objectStore('projects').put(record);transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);});
    db.close();localStorage.setItem('visro-active-design',record.id);
    // Seeding replaces the active design without the UI's departure-save flow.
    // Keep workspace tabs consistent instead of retaining an unsaved launch tab.
    localStorage.setItem('visro-workspace-tabs',JSON.stringify([{id:record.id,name:record.name}]));return true;
  })()`);
  await cdp.command('Page.reload');
  await openHomeDesign(cdp, project.name);
  const canvasPixels = `(()=>{
    const canvas=document.querySelector('.lower-canvas'),pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    let ink=0,pink=0,nonBackground=0;
    for(let i=0;i<pixels.length;i+=4){if(!pixels[i+3])continue;const r=pixels[i],g=pixels[i+1],b=pixels[i+2];if(r<100&&g<100&&b<100)ink++;if(r>200&&g>140&&g<220&&b>150&&b<240)pink++;if(Math.abs(r-250)+Math.abs(g-245)+Math.abs(b-236)>40)nonBackground++;}
    return {width:canvas.width,height:canvas.height,ink,pink,nonBackground};
  })()`;
  const initialPixels = await waitForPaint(cdp, canvasPixels, 'The saved project did not visibly render its text and circle.');
  await cdp.evaluate(`(()=>{
    const trace=window.__visroSmokeViewportTrace=[];
    const record=event=>{const node=document.querySelector('.canvas-viewport'),page=document.querySelector('.continuous-page.active'),box=page?.getBoundingClientRect();if(!node)return;trace.push({type:event?.type||'initial',time:performance.now(),trusted:event?.isTrusted??null,target:event?.target?.tagName||null,x:event?.clientX,y:event?.clientY,buttons:event?.buttons,label:event?.target?.getAttribute?.('aria-label')||null,deltaX:event?.deltaX,deltaY:event?.deltaY,visibility:document.visibilityState,focused:document.hasFocus(),scroll:{left:node.scrollLeft,top:node.scrollTop,width:node.scrollWidth,height:node.scrollHeight,clientWidth:node.clientWidth,clientHeight:node.clientHeight},page:box?{left:box.left,top:box.top,width:box.width,height:box.height}:null});if(trace.length>1000)trace.shift();};
    for(const type of ['scroll','wheel','pointerdown','pointerup','mousemove','focusin','visibilitychange'])document.addEventListener(type,record,{capture:true,passive:true});record();
  })()`);
  await cdp.evaluate("window.__visroSmokeHeartbeat={ticks:0,maxGap:0,last:performance.now(),moves:0,longTasks:[],slowGaps:[]};window.__visroSmokeObserver=new PerformanceObserver(entries=>{for(const item of entries.getEntries())window.__visroSmokeHeartbeat.longTasks.push({start:item.startTime,duration:item.duration});});window.__visroSmokeObserver.observe({type:'longtask',buffered:false});window.__visroSmokeTimer=setInterval(()=>{const s=window.__visroSmokeHeartbeat,now=performance.now(),gap=now-s.last;if(gap>150)s.slowGaps.push({start:s.last,duration:gap,visibility:document.visibilityState});s.maxGap=Math.max(s.maxGap,gap);s.last=now;s.ticks++;},50);document.addEventListener('mousemove',()=>window.__visroSmokeHeartbeat.moves++);");
  const selection = "({x:Number(document.querySelector('.inspector input[aria-label=\"Position X\"],.inspector input[aria-label=\"X\"]')?.value),y:Number(document.querySelector('.inspector input[aria-label=\"Position Y\"],.inspector input[aria-label=\"Y\"]')?.value),label:document.querySelector('.selected-label')?.textContent?.trim()||''})";
  // Use actual painted pixels rather than guessing Fabric's viewport transform.
  // CSS overlays, retina density and the opened Position panel can all change
  // the relationship between canvas bitmap and native client coordinates.
  const paintedPoint = (fill) => cdp.evaluate(`(()=>{
    const started=performance.now(),canvas=document.querySelector('.lower-canvas'),r=canvas.getBoundingClientRect(),scale=Math.min(1,640/Math.max(canvas.width,canvas.height));
    const width=Math.max(1,Math.round(canvas.width*scale)),height=Math.max(1,Math.round(canvas.height*scale));
    const sampler=window.__visroSmokePaintSampler||(window.__visroSmokePaintSampler=document.createElement('canvas'));
    if(sampler.width!==width||sampler.height!==height){sampler.width=width;sampler.height=height;}
    const context=sampler.getContext('2d',{willReadFrequently:true});context.clearRect(0,0,width,height);context.drawImage(canvas,0,0,width,height);
    const pixels=context.getImageData(0,0,width,height).data;
    const point=(${rasterPointForFill.toString()})(pixels,width,height,{left:r.left,top:r.top,width:r.width,height:r.height,sourceBitmapWidth:canvas.width,sourceBitmapHeight:canvas.height},${JSON.stringify(fill)});
    const probe=window.__visroSmokePaintProbe||(window.__visroSmokePaintProbe={reads:0,sourcePixels:0,sampledPixels:0,maxMs:0,totalMs:0,maxSampleDimension:640}),elapsed=performance.now()-started;
    probe.reads++;probe.sourcePixels+=canvas.width*canvas.height;probe.sampledPixels+=width*height;probe.maxMs=Math.max(probe.maxMs,elapsed);probe.totalMs+=elapsed;
    return point;
  })()`);
  const click = async (point) => {
    await cdp.command('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', buttons: 1, clickCount: 1 });
    await cdp.command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', buttons: 0, clickCount: 1 });
  };
  const ensurePositionInspector=async()=>{
    const field="document.querySelector('.inspector input[aria-label=\"Position X\"],.inspector input[aria-label=\"X\"]')";
    if(!await cdp.evaluate(`Boolean(${field})`)){
      const button="Array.from(document.querySelectorAll('.context-toolbar .toolbar-button')).find(button=>button.textContent.trim()==='Position')";
      await waitForRenderer(cdp,`Boolean(${button})`,'Selecting an element must expose the actual Position control.');
      await nativeClick(cdp,button);
    }
    await waitForRenderer(cdp,`Boolean(${field})`,'The real Position control did not open its numeric inspector.');
    await waitForPaint(cdp,canvasPixels,'The selected project must remain painted after the Position drawer opens.');
  };
  await click(await paintedPoint(target.fill));
  await ensurePositionInspector();
  const firstSelection = await cdp.evaluate(selection);
  assert.ok(Math.abs(firstSelection.x - target.left) < 1 && Math.abs(firstSelection.y - target.top) < 1, 'The real pointer must select the reproduction circle.');
  let changedGestures = 0, maxGestureMs = 0, maxSceneRoundingError = 0, thumbnailIdleWindows = 0;
  const trace = [];
  cdp.gestureTrace = trace;
  try {
    for (let index = 0; index < 50; index++) {
      const before = await cdp.evaluate(selection);
      const start = await paintedPoint(target.fill);
      const zoomPercent = await cdp.evaluate("Number(document.querySelector('input[aria-label=\"Canvas zoom\"]')?.value)");
      const sign = index % 2 ? -1 : 1;
      const dx = index === 49 ? 35 : 25 * sign, dy = index === 49 ? 9 : 17 * sign;
      const started = Date.now();
      await cdp.command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: start.x, y: start.y, button: 'none', buttons: 0 });
      await cdp.command('Input.dispatchMouseEvent', { type: 'mousePressed', x: start.x, y: start.y, button: 'left', buttons: 1, clickCount: 1 });
      for (let step = 1; step <= 6; step++) {
        await cdp.command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: start.x + dx * step / 6, y: start.y + dy * step / 6, button: 'left', buttons: 1 });
        await delay(8);
      }
      await cdp.command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: start.x + dx, y: start.y + dy, button: 'left', buttons: 0, clickCount: 1 });
      await delay(20);
      const after = await cdp.evaluate(selection);
      const movement = { x: after.x - before.x, y: after.y - before.y };
      const xBounds = gestureDeltaBounds(dx, zoomPercent), yBounds = gestureDeltaBounds(dy, zoomPercent);
      trace.push({ gesture: index + 1, before, after, start, dx, dy, zoomPercent, movement, elapsedMs: Date.now() - started });
      assert.ok(movement.x >= xBounds.min && movement.x <= xBounds.max && movement.y >= yBounds.min && movement.y <= yBounds.max,
        `Native pointer gesture ${index + 1} moved outside its expected scene coordinates: ${JSON.stringify(trace.at(-1))}.`);
      maxSceneRoundingError = Math.max(maxSceneRoundingError, Math.abs(movement.x - dx / (zoomPercent / 100)), Math.abs(movement.y - dy / (zoomPercent / 100)));
      changedGestures++;
      maxGestureMs = Math.max(maxGestureMs, Date.now() - started);
      // Give the actual idle thumbnail and autosave work a chance to run between
      // gestures. Continuous dragging alone can accidentally cancel every timer.
      if ((index + 1) % 5 === 0 && index < 49) { await delay(1400); thumbnailIdleWindows++; }
    }
  } catch (error) { error.smokeGestureTrace = trace; throw error; }
  const finalSelection = await cdp.evaluate(selection);
  // The position inspector rounds its display to whole design pixels while
  // Fabric persists subpixel pointer coordinates with four decimal places.
  await waitForRenderer(cdp, `(async()=>{const record=await ${readSavedProject};const object=record?.project?.pages?.flatMap(page=>page.canvas.objects||[]).find(object=>object.id===${JSON.stringify(target.id)});return object&&Math.abs(object.left-${finalSelection.x})<.51&&Math.abs(object.top-${finalSelection.y})<.51;})()`, `The pointer edits did not autosave to the isolated project at ${JSON.stringify(finalSelection)}.`);
  const persisted = await cdp.evaluate(readSavedProject);
  const persistedObject = persisted.project.pages.flatMap((candidate) => candidate.canvas.objects || []).find((object) => object.id === target.id);
  const heartbeat = await cdp.evaluate("({...window.__visroSmokeHeartbeat})");
  const paintProbe = await cdp.evaluate("({...window.__visroSmokePaintProbe})");
  cdp.gestureSummary = { changedGestures, maxGestureMs, maxSceneRoundingError, thumbnailIdleWindows, heartbeat, paintProbe };
  assert.ok(heartbeat.ticks > 10 && heartbeat.moves >= 300, 'Real pointer moves and the renderer heartbeat must continue through all gestures.');
  assert.ok(heartbeat.maxGap < 1500, `The native renderer must remain responsive during repeated movement: ${JSON.stringify({ heartbeat, maxGestureMs })}.`);
  assert.ok(maxGestureMs < 2000, `A native movement gesture must not stall the renderer: ${maxGestureMs} ms.`);
  await cdp.command('Page.reload');
  await openHomeDesign(cdp, project.name);
  const restoredPixels = await waitForPaint(cdp, canvasPixels, 'The autosaved project did not visibly render after reload.');
  await click(await paintedPoint(target.fill));
  await ensurePositionInspector();
  const restoredSelection = await cdp.evaluate(selection);
  assert.ok(Math.abs(restoredSelection.x - persistedObject.left) < .51 && Math.abs(restoredSelection.y - persistedObject.top) < .51, 'Cold reload must restore the actual moved element position.');
  const pressArrow = async (key, shift = false) => {
    const codes = { ArrowRight: 39, ArrowDown: 40, ArrowLeft: 37, ArrowUp: 38 };
    await cdp.command('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: codes[key], modifiers: shift ? 8 : 0 });
    await cdp.command('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: codes[key], modifiers: shift ? 8 : 0 });
  };
  await pressArrow('ArrowRight');
  await waitForRenderer(cdp, `Number(document.querySelector('.inspector input[aria-label="Position X"],.inspector input[aria-label="X"]')?.value)===${restoredSelection.x + 1}`, 'Arrow Right must move the selected object by one design pixel.');
  await pressArrow('ArrowDown', true);
  await waitForRenderer(cdp, `Number(document.querySelector('.inspector input[aria-label="Position Y"],.inspector input[aria-label="Y"]')?.value)===${restoredSelection.y + 10}`, 'Shift Arrow Down must move the selected object by ten design pixels.');
  const keyboardNudgedSelection = await cdp.evaluate(selection);
  await pressArrow('ArrowLeft');
  await pressArrow('ArrowUp', true);
  await waitForRenderer(cdp, `(()=>{const selection=${selection};return selection.x===${restoredSelection.x}&&selection.y===${restoredSelection.y};})()`, 'Opposite arrow keys must restore the exact selected position.');
  const alternate = page.canvas.objects.find((object) => object.type === 'Circle' && object.fill === '#F26B3A');
  await click(await paintedPoint(alternate.fill));
  const alternateSelection = await cdp.evaluate(selection);
  assert.ok(Math.abs(alternateSelection.x - restoredSelection.x) > 1, 'Pointer selection must continue updating after autosave and reload.');
  const hoverPoint = await paintedPoint(target.fill);
  await cdp.command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: hoverPoint.x, y: hoverPoint.y, button: 'none', buttons: 0 });
  const hoverInk = `(()=>{const canvas=document.querySelector('.lower-canvas'),pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let purple=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]>240&&Math.abs(pixels[i]-139)<8&&Math.abs(pixels[i+1]-61)<8&&Math.abs(pixels[i+2]-255)<8)purple++;return purple;})()`;
  await waitForRenderer(cdp, `${hoverInk}>50`, 'Hovering an unselected object must visibly highlight its layer.');
  const hoverSelection = await cdp.evaluate(selection);
  assert.equal(hoverSelection.x, alternateSelection.x, 'Hover targeting must preserve the selected object until a click.');
  await cdp.command('Input.dispatchMouseEvent', { type: 'mousePressed', x: hoverPoint.x, y: hoverPoint.y, button: 'right', buttons: 2, clickCount: 1 });
  await cdp.command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: hoverPoint.x, y: hoverPoint.y, button: 'right', buttons: 0, clickCount: 1 });
  await waitForRenderer(cdp, "Boolean(document.querySelector('[role=\"menu\"][aria-label=\"Element options\"]'))", 'Right-clicking the hovered object must open element options.');
  const contextMenu = await cdp.evaluate("(()=>{const menu=document.querySelector('[role=\"menu\"][aria-label=\"Element options\"]'),r=menu.getBoundingClientRect();return {labels:Array.from(menu.querySelectorAll('button[role=\"menuitem\"] > span:first-of-type')).map(span=>span.textContent),insideViewport:r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight};})()");
  for (const label of ['Copy', 'Copy style', 'Paste', 'Duplicate', 'Delete', 'Layer', 'Align to page', 'Create component', 'Comment', 'Lock', 'Link', 'Show element timing', 'Alternative text']) assert.ok(contextMenu.labels.includes(label), `Right-click options must include ${label}.`);
  assert.equal(contextMenu.insideViewport, true, 'The entire right-click menu must remain visible.');
  const menuSelected = await cdp.evaluate(selection);
  assert.equal(menuSelected.x, restoredSelection.x, 'Right click must target the pointed element.');
  await pressArrow('ArrowDown');
  assert.equal((await cdp.evaluate(selection)).y, menuSelected.y, 'Menu arrow navigation must not move the selected object.');
  await cdp.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await cdp.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await waitForRenderer(cdp, "!document.querySelector('[role=\"menu\"][aria-label=\"Element options\"]')", 'Escape must close element options.');
  if (screenshotPath) {
    const screenshot = await cdp.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const file = path.resolve(screenshotPath).replace(/\.png$/i, '-gestures.png');
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, Buffer.from(screenshot.data, 'base64'));
  }
  return { fixture: path.basename(projectPath), changedGestures, maxGestureMs, maxSceneRoundingError, thumbnailIdleWindows, heartbeat, paintProbe, firstSelection, finalSelection, restoredSelection, keyboardNudgedSelection, arrowNudge: 1, shiftArrowNudge: 10, hoverHighlight: true, contextMenu, alternateSelection, initialPixels, restoredPixels, autosaveRestored: true, objectCount: persisted.project.pages.flatMap((candidate) => candidate.canvas.objects || []).length };
}

/** Packaged import acceptance uses only file inputs, real Chromium input, DOM and IndexedDB. */
async function runNativeCanvaImportRegression(renderer, root, screenshotPath, progress = () => {}) {
  const original = await renderer.evaluate(readSavedProject), results = [];
  const buttonWithText = (selector, text) => `Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(button=>button.textContent.trim()===${JSON.stringify(text)})`;
  const card = id => `document.querySelector(${JSON.stringify(`.recent-card[data-design-id="${id}"] .recent-open`)})`;
  const saved = () => renderer.evaluate(readSavedProject);
  const home = async () => {
    await nativeClick(renderer, "document.querySelector('.desktop-home-tab')");
    await waitForRenderer(renderer, "Boolean(document.querySelector('.home-shell'))&&!document.querySelector('.busy-toast')", 'The import acceptance Home screen did not open.');
  };
  const openCard = async id => {
    await waitForRenderer(renderer, `Boolean(${card(id)})`, 'The imported local project is missing from Home.');
    await nativeClick(renderer, card(id));
    await waitForRenderer(renderer, `localStorage.getItem('visro-active-design')===${JSON.stringify(id)}&&!document.querySelector('.home-shell,.canvas-loading,.busy-toast')`, 'The imported project did not reopen.');
  };
  const cover = id => `(()=>{const image=(${card(id)})?.querySelector('.recent-cover img');if(!image?.complete||!image.naturalWidth)return null;const canvas=document.createElement('canvas');canvas.width=128;canvas.height=96;const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0,128,96);const pixels=context.getImageData(0,0,128,96).data,colors=new Set();let purple=0,yellow=0;for(let index=0;index<pixels.length;index+=4){if(pixels[index+3]<200)continue;colors.add((pixels[index]>>4)*256+(pixels[index+1]>>4)*16+(pixels[index+2]>>4));if(pixels[index]>70&&pixels[index]<160&&pixels[index+1]<100&&pixels[index+2]>130)purple++;if(pixels[index]>200&&pixels[index+1]>140&&pixels[index+2]<170)yellow++;}return{embedded:image.src.startsWith('data:image/'),complete:image.complete,width:image.naturalWidth,height:image.naturalHeight,colors:colors.size,purple,yellow};})()`;
  const capture = async suffix => {
    if(!screenshotPath)return;
    const shot=await renderer.command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    await fs.mkdir(path.dirname(path.resolve(screenshotPath)),{recursive:true});
    await fs.writeFile(path.resolve(screenshotPath).replace(/\.png$/i,`-canva-${suffix}.png`),Buffer.from(shot.data,'base64'));
  };
  const flatten = objects => objects.flatMap(object => Array.isArray(object.objects)?flatten(object.objects):[object]);
  try {
    for(const format of ['pptx','svg']) {
      progress(`checking packaged editable ${format.toUpperCase()} import and Home cover`);
      const fixture=path.join(root,`output/fixtures/canva-export-original.${format}`);await fs.access(fixture);
      const beforeId=await renderer.evaluate("localStorage.getItem('visro-active-design')");
      await nativeClick(renderer, "document.querySelector('.top-menu')");
      await nativeClick(renderer, buttonWithText('.file-menu button','Import from Canva…'));
      await waitForRenderer(renderer,"document.querySelector('.canva-import-dialog h2')?.textContent==='Import from Canva'",'The native Canva import instructions did not open.');
      const {root:documentNode}=await renderer.command('DOM.getDocument');
      const {nodeId}=await renderer.command('DOM.querySelector',{nodeId:documentNode.nodeId,selector:'input[type="file"][accept=".pptx,.svg"]'});
      assert.ok(nodeId,'The dedicated editable Canva export input must exist.');
      await renderer.command('DOM.setFileInputFiles',{nodeId,files:[fixture]});
      await waitForRenderer(renderer,"document.querySelector('.canva-import-dialog h2')?.textContent==='Your design is ready to edit'&&!document.querySelector('.busy-toast,.canvas-loading')",'The packaged Canva export import did not produce its fidelity report.',30000);
      const fidelity=await renderer.evaluate("({summary:document.querySelector('.canva-import-dialog p')?.textContent,notes:Array.from(document.querySelectorAll('.canva-import-notes li')).map(item=>item.textContent)})");
      assert.ok(fidelity.notes.some(note=>/export|Canva|SVG/i.test(note)),'The import must explain exported-layer fidelity.');
      await nativeClick(renderer,buttonWithText('.canva-import-dialog button','Start editing'));
      await waitForRenderer(renderer,`(async()=>{const record=await ${readSavedProject};return record?.id!==${JSON.stringify(beforeId)}&&record?.name==='canva-export-original'&&record.project.pages.length===${format==='pptx'?2:1};})()`,'The imported native project did not autosave.');
      let record=await saved(),layers=flatten(record.project.pages.flatMap(page=>page.canvas.objects)),id=record.id;
      assert.notEqual(id,beforeId);assert.ok(layers.some(object=>object.type==='Textbox'),'The export must contain native editable Textboxes.');assert.ok(layers.some(object=>['Rect','Ellipse','Path','Polygon'].includes(object.type)),'The export must contain native vector layers.');assert.equal(layers.some(object=>object.type==='Image'),false,'This original vector fixture must not silently flatten to a raster page.');
      const detail={format,id,pages:record.project.pages.length,layerTypes:layers.map(object=>object.type),order:record.project.pages.map(page=>page.canvas.objects.map(object=>({id:object.id,type:object.type,name:object.visroName}))),fidelity,nativeEditableObjects:true};
      if(format==='pptx') {
        assert.deepEqual(record.project.pages.map(page=>page.canvas.objects.map(object=>object.type)),[['Rect','Textbox','Textbox','Ellipse'],['Textbox','Rect']]);
        const headline=record.project.pages[0].canvas.objects.find(object=>object.type==='Textbox');
        await renderer.evaluate("(()=>{document.activeElement?.blur();document.querySelector('.upper-canvas')?.focus({preventScroll:true});})()");
        await nativeKey(renderer,'1','Digit1',1);
        await waitForRenderer(renderer,"Boolean(document.querySelector('.layer-list .layer-select'))",'The native imported Layers panel did not open.');
        await nativeClick(renderer,buttonWithText('.layer-select',headline.visroName));
        await renderer.evaluate("(()=>{const canvas=document.querySelector('.upper-canvas');canvas.tabIndex=0;canvas.focus({preventScroll:true});})()");
        await nativeKey(renderer,'Enter','Enter');
        await waitForRenderer(renderer,"document.activeElement?.getAttribute('data-fabric')==='textarea'",'The imported PowerPoint text did not enter genuine native text editing.');
        await renderer.command('Input.insertText',{text:'PACKAGED IMPORT EDIT'});
        await nativeKey(renderer,'Escape','Escape');
        await waitForRenderer(renderer,`(async()=>{const record=await ${readSavedProject};return record?.project.pages[0].canvas.objects.some(object=>object.id===${JSON.stringify(headline.id)}&&object.text==='PACKAGED IMPORT EDIT');})()`,'The actual native keyboard edit did not persist to the original imported text layer.');
        detail.keyboardTextEdit={id:headline.id,text:'PACKAGED IMPORT EDIT',sameLayer:true};
      } else {
        assert.equal(record.project.pages[0].canvas.objects[0].type,'Group');assert.equal(record.project.pages[0].canvas.objects[0].visroName,'Original card');
        assert.equal(record.project.pages[0].canvas.objects[0].objects[1].type,'Group');assert.equal(record.project.pages[0].canvas.objects[0].objects[1].visroName,'Editable label');
        assert.equal(layers.filter(object=>object.type==='Textbox').length,2);detail.nestedGroups=true;
      }
      record=await saved();const snapshot=JSON.stringify(record.project);
      await home();
      await waitForRenderer(renderer,`(()=>{const pixels=${cover(id)};return pixels?.embedded&&pixels.complete&&pixels.colors>8&&pixels.purple>200&&pixels.yellow>5;})()`,'The imported Home cover did not decode and paint the real original artwork.',30000);
      detail.homeCover=await renderer.evaluate(cover(id));await capture(`${format}-home`);
      const previousOrigin=await renderer.evaluate('performance.timeOrigin');await renderer.command('Page.reload');
      await waitForRenderer(renderer,`performance.timeOrigin!==${previousOrigin}&&document.readyState==='complete'&&!document.querySelector('.canvas-loading')`,'The packaged import reload did not finish.');
      if(!await renderer.evaluate("Boolean(document.querySelector('.home-shell'))"))await home();
      await waitForRenderer(renderer,`(()=>{const pixels=${cover(id)};return pixels?.embedded&&pixels.complete&&pixels.colors>8&&pixels.purple>200&&pixels.yellow>5;})()`,'The imported Home cover did not survive renderer reload.',30000);
      detail.reloadedHomeCover=await renderer.evaluate(cover(id));
      await openCard(id);assert.equal(JSON.stringify((await saved()).project),snapshot,'Reopening the imported design must retain exact native layers, order, text and transforms.');
      detail.exactProjectReopened=true;await capture(`${format}-reopened`);results.push(detail);
    }
    return {formats:results,actualFileInputs:true,actualKeyboardEditing:true,homeCoversDecoded:true,exactProjectsReopened:true,originalProjectRestored:true};
  } finally {
    if(original?.id){if(!await renderer.evaluate("Boolean(document.querySelector('.home-shell'))"))await home();await openCard(original.id);assert.equal(JSON.stringify((await saved()).project),JSON.stringify(original.project),'Canva import acceptance must preserve the original isolated design.');}
  }
}

async function runNativeSmoke({ appPath, screenshotPath, cutoutPath, projectPath, fonts = false, clipboard = false, captions = false, publicImages = false, elements = false, controls = false, v07Controls = false, v08Library = false, canvaImport = false, automationRendering = false, timeoutMs = 60000, onProgress = () => {} } = {}) {
  const root = path.resolve(__dirname, '..');
  let executable, args;
  if (appPath) {
    executable = appPath.endsWith('.app') ? path.join(appPath, 'Contents/MacOS/Visro') : appPath;
    args = [];
  } else {
    try { executable = require('electron'); } catch { throw new Error('Install Electron and run npm run build before the native smoke check.'); }
    args = [root];
  }
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'visro-native-smoke-'));
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  delete environment.VISRO_DEV_URL;
  args.push('--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${profile}`);
  if (clipboard || captions || publicImages || elements || controls || v07Controls || v08Library) args.push('--inspect=0');
  if(automationRendering)args.push('--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding','--disable-background-timer-throttling');
  const child = spawn(executable, args, { cwd: root, env: environment, stdio: ['ignore', 'ignore', 'pipe'] });
  let debuggerURL;
  let mainInspectorURL;
  let launchError;
  child.on('error', (error) => { launchError = error; });
  child.stderr.on('data', (chunk) => {
    const match = String(chunk).match(/DevTools listening on (ws:\/\/(?:127\.0\.0\.1|localhost):\d+\/devtools\/browser\/[^\s]+)/);
    if (match) debuggerURL = match[1];
    const mainMatch = String(chunk).match(/Debugger listening on (ws:\/\/(?:127\.0\.0\.1|localhost):\d+\/[^\s]+)/);
    if (mainMatch) mainInspectorURL = mainMatch[1];
  });
  let cdp;
  let mainCDP;
  let validationResult;
  let validationError;
  let stage = 'launching packaged process';
  const progress = (value) => { stage = value; onProgress(value); };
  progress(stage);
  const expires = Date.now() + timeoutMs;
  try {
    while (!debuggerURL && Date.now() < expires && child.exitCode === null && !launchError) await delay(100);
    if (launchError) throw new Error('The Visro desktop executable could not be launched.');
    if (!debuggerURL) throw new Error('The native Visro renderer did not start its debugger.');
    const httpBase = new URL(debuggerURL); httpBase.protocol = 'http:'; httpBase.pathname = '/json/list';
    let target;
    while (!target && Date.now() < expires && child.exitCode === null) {
      const targets = await (await fetch(httpBase)).json();
      target = targets.find((candidate) => candidate.type === 'page' && candidate.url.startsWith('visro://app/'));
      if (!target) await delay(200);
    }
    if (!target) throw new Error('The packaged Visro page did not open.');
    progress('connecting renderer');
    cdp = await connectCDP(target.webSocketDebuggerUrl);
    progress('loading workspace');
    let ready = false;
    while (!ready && Date.now() < expires) {
      try {
        ready = await cdp.evaluate("document.readyState === 'complete' && Boolean(window.visro) && Boolean(document.querySelector('#root')?.textContent?.trim())");
      } catch (error) {
        if (!/execution context|context was destroyed/i.test(error.message)) throw error;
        // The target is advertised before its first navigation creates a JS context.
      }
      if (!ready) await delay(200);
    }
    assert.equal(ready, true, 'The native editor must finish rendering.');
    progress('checking public native settings and sandbox');
    const result = await cdp.evaluate(`(async () => {
      const settings = await window.visro.getSettings();
      return {
        url: location.href, secureContext: isSecureContext, isolated: crossOriginIsolated,
        sharedArrayBuffer: typeof SharedArrayBuffer === 'function',
        nodeHidden: typeof window.require === 'undefined' && typeof window.process === 'undefined',
        keyNeverReturned: !Object.hasOwn(settings, 'apiKey') && !Object.hasOwn(settings, 'encryptedKey'),
        title: document.title,
      };
    })()`);
    progress('checking bundled FFmpeg');
    result.mediaEngine = await cdp.evaluate('window.visro.getMediaCapabilities()');
    progress('checking local cutout manifest');
    Object.assign(result, await cdp.evaluate(`(async () => {
      const manifestResponse = await fetch('/background-removal/1.7.0/resources.json');
      const manifest = await manifestResponse.json();
      return {
        manifestStatus: manifestResponse.status,
        manifestHeaders: { coop: manifestResponse.headers.get('cross-origin-opener-policy'), coep: manifestResponse.headers.get('cross-origin-embedder-policy'), corp: manifestResponse.headers.get('cross-origin-resource-policy') },
        modelAvailable: Boolean(manifest['/models/isnet_fp16']?.chunks?.length),
      };
    })()`));
    progress('checking local data and blob fetches');
    Object.assign(result, await cdp.evaluate(`(async () => {
      const dataFetch = await (await fetch('data:text/plain,visro-local-data')).text();
      const blobURL = URL.createObjectURL(new Blob(['visro-local-blob'], { type: 'text/plain' }));
      const blobFetch = await (await fetch(blobURL)).text();
      URL.revokeObjectURL(blobURL);
      return { dataFetch, blobFetch };
    })()`));
    progress('checking local worker');
    result.workerResult = await cdp.evaluate(`(async () => {
      const workerURL = URL.createObjectURL(new Blob(["postMessage('visro-local-worker')"], { type: 'text/javascript' }));
      const worker = new Worker(workerURL);
      const workerResult = await new Promise((resolve, reject) => { worker.onmessage = (event) => resolve(event.data); worker.onerror = () => reject(new Error('Local worker failed')); });
      worker.terminate(); URL.revokeObjectURL(workerURL);
      return workerResult;
    })()`);
    progress('checking WebAssembly');
    result.wasm = await cdp.evaluate(`(async () => {
      const wasm = await WebAssembly.compile(new Uint8Array([0,97,115,109,1,0,0,0]));
      return wasm instanceof WebAssembly.Module;
    })()`);
    progress('checking external network blocking');
    result.externalFetchBlocked = await cdp.evaluate(`(async () => {
      let blocked = false;
      const listener = (event) => { if (event.violatedDirective === 'connect-src' && event.blockedURI.startsWith('https://example.invalid')) blocked = true; };
      document.addEventListener('securitypolicyviolation', listener);
      await fetch('https://example.invalid/visro-csp-probe').catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 100));
      document.removeEventListener('securitypolicyviolation', listener);
      return blocked;
    })()`);
    assert.equal(result.url, 'visro://app/index.html');
    assert.equal(result.secureContext, true);
    assert.equal(result.isolated, true);
    assert.equal(result.sharedArrayBuffer, true);
    assert.equal(result.manifestStatus, 200);
    assert.deepEqual(result.manifestHeaders, { coop: 'same-origin', coep: 'require-corp', corp: 'same-origin' });
    assert.equal(result.modelAvailable, true);
    assert.equal(result.dataFetch, 'visro-local-data');
    assert.equal(result.blobFetch, 'visro-local-blob');
    assert.equal(result.workerResult, 'visro-local-worker');
    assert.equal(result.wasm, true);
    assert.equal(result.externalFetchBlocked, true);
    assert.equal(result.nodeHidden, true);
    assert.equal(result.keyNeverReturned, true);
    assert.equal(result.mediaEngine.available, true, 'Packaged FFmpeg must be available without user PATH.');
    assert.equal(result.mediaEngine.bundled, true);
    assert.match(result.mediaEngine.version, /^9\.0\.2/);
    if (clipboard || captions || publicImages || elements || controls || v07Controls || v08Library) {
      progress('checking native runtime version and asynchronous storage');
      if (mainInspectorURL) mainCDP = await connectCDP(mainInspectorURL);
      if (mainCDP) {
        result.appVersion = await mainCDP.evaluate("process.getBuiltinModule('module').createRequire(process.cwd()+'/package.json')('electron').app.getVersion()");
        const expectedVersion = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')).version;
        assert.equal(result.appVersion, expectedVersion, 'Native acceptance must run the current build rather than an older cached application.');
        if(automationRendering){
          result.testWindowPresentation = await mainCDP.evaluate("(()=>{const {BrowserWindow}=process.getBuiltinModule('module').createRequire(process.cwd()+'/package.json')('electron'),window=BrowserWindow.getAllWindows().find(window=>window.webContents.getURL().startsWith('visro://app/'));if(!window)throw new Error('The isolated native test window is missing.');const before=window.webContents.getBackgroundThrottling();globalThis.__visroNativeAutomationRendering=true;window.webContents.setBackgroundThrottling(false);window.setIgnoreMouseEvents(true);window.setResizable(false);window.showInactive();return{mode:'isolated automation rendering',nativeWindowVisible:window.isVisible(),ignorePhysicalMouseInput:true,resizable:window.isResizable(),backgroundThrottlingBefore:before,backgroundThrottlingDuringTest:window.webContents.getBackgroundThrottling()};})()");
          await enableNativeInputIsolation(cdp);
        }
        result.asyncEncryptionAPI = await mainCDP.evaluate("(()=>{const {safeStorage}=process.getBuiltinModule('module').createRequire(process.cwd()+'/package.json')('electron');return ['isAsyncEncryptionAvailable','encryptStringAsync','decryptStringAsync'].every(name=>typeof safeStorage[name]==='function');})()");
        assert.equal(result.asyncEncryptionAPI, true, 'The shipped Electron binary must expose non-blocking secure-storage methods.');
      }
      if (clipboard) {
        progress('preserving and testing native clipboard');
        result.clipboard = await runClipboardRegression(cdp, mainCDP);
        progress('checking native focused text Undo and Redo');
        result.nativeEditing = await runNativeEditingRegression(cdp, mainCDP);
      }
    }
    if (fonts) {
      progress('checking actual offline and installed fonts');
      const fontManifest = JSON.parse(await fs.readFile(path.join(root, 'scripts/font-manifest.json'), 'utf8'));
      const names = fontManifest.families.map((family) => family.name);
      const predicate = `(()=>{const expected=${JSON.stringify(names)},loaded=new Set(Array.from(document.fonts).filter(face=>face.status==='loaded').map(face=>face.family.replace(/^['"]|['"]$/g,'')));return expected.every(name=>loaded.has(name));})()`;
      await waitForRenderer(cdp, predicate, 'The offline font catalog did not load all design families.', 15000);
      const installedTypeface = await cdp.evaluate("(async()=>{const font=await window.visro.getLocalTypeface();return font?{name:font.name,bytes:atob(font.data.split(',')[1]).length}:null;})()");
      if (installedTypeface) {
        await waitForRenderer(cdp, `Array.from(document.fonts).some(face=>face.family.replace(/^['"]|['"]$/g,'')===${JSON.stringify(installedTypeface.name)}&&face.status==='loaded')`, 'The installed local interface typeface was not decoded and registered.', 15000);
        installedTypeface.loaded = true;
      }
      const{expectedFontFaces,assertLoadedFontFaces}=require('./native-v08-library.cjs');
      const expected=expectedFontFaces(fontManifest),actual=await cdp.evaluate("Array.from(document.fonts).map(face=>({family:face.family,weight:face.weight,style:face.style,status:face.status}))");
      const faceProof=assertLoadedFontFaces(expected,actual);
      result.fonts = { families: names, loadedFaces:actual.filter(face=>face.status==='loaded').length,expectedFaces:expected.length,faceProof,cloudFetch: false, installedTypeface };
      assert.equal(result.fonts.families.length,fontManifest.families.length);
      assert.equal(faceProof.length,expected.length,'Every packaged regular, bold and variable font face must decode successfully.');
    }
    if (projectPath) { if(mainCDP)result.gestureWindow=await require('./native-v08-library.cjs').ensureNativeForeground(cdp,mainCDP,waitForRenderer,'Repeated pointer gestures');progress('checking native pointer gestures, autosave and restore'); result.gestures = await runGestureRegression(cdp, projectPath, screenshotPath); }
    else { progress('opening initial design'); await openHomeDesign(cdp); }
    if (mainCDP) {
      progress('checking native design tab commands');
      result.nativeTabs = await runNativeTabsRegression(cdp, mainCDP);
    }
    if (captions) {
      progress('checking native timed caption editing and rendered video frames');
      const enginePath = appPath ? path.join(path.dirname(path.dirname(executable)), 'Resources/media-tools/ffmpeg') : path.join(root, 'build/media-tools/ffmpeg');
      result.captions = await runNativeCaptionRegression(cdp, mainCDP, profile, enginePath, screenshotPath);
    }
    if (publicImages) {
      progress('checking native public-domain search, preview, insertion and offline project reload');
      result.publicImages = await runNativePublicImageRegression(cdp, mainCDP, profile, screenshotPath);
    }
    if (elements) {
      progress('checking native shape clicks, real graphic dragging, palette Undo and vector ungroup');
      result.elements = await runNativeElementLibraryRegression(cdp, mainCDP, screenshotPath);
    }
    if (canvaImport) {
      result.canvaImport = await runNativeCanvaImportRegression(cdp, root, screenshotPath, progress);
    }
    if (controls || v07Controls) {
      progress('checking native continuous pages, frames, text and editing modes');
      result.controls = await runNativeControlsRegression(cdp, cutoutPath || path.join(root, 'output/fixtures/cutout-person.jpeg'), screenshotPath, progress, {panIdle:v07Controls});
    }
    if (v07Controls) {
      result.v07Controls = await require('./native-v07-controls.cjs').runNativeV07Controls(cdp,mainCDP,profile,screenshotPath,progress,{nativeClick,nativeKey,waitForRenderer,openHomeDesign,readSavedProject,delay});
    }
    if(v08Library){
      result.v08Library=await require('./native-v08-library.cjs').runNativeV08Library(cdp,mainCDP,profile,screenshotPath,cutoutPath||path.join(root,'output/fixtures/cutout-person.jpeg'),progress,{nativeKey,waitForRenderer,readSavedProject,delay});
    }
    if (cutoutPath) {
      progress('uploading local cutout fixture');
      const fixturePath = path.resolve(cutoutPath);
      await fs.access(fixturePath);
      const { root: documentNode } = await cdp.command('DOM.getDocument');
      const { nodeId } = await cdp.command('DOM.querySelector', { nodeId: documentNode.nodeId, selector: 'input[type="file"][accept^="image/"]' });
      assert.ok(nodeId, 'The image upload control must exist.');
      await cdp.command('DOM.setFileInputFiles', { nodeId, files: [fixturePath] });
      let imageSelected = false;
      const selectedDeadline = Date.now() + 15000;
      while (!imageSelected && Date.now() < selectedDeadline) {
        imageSelected = await cdp.evaluate("Boolean(document.querySelector('button.remove-bg:not(:disabled)')||Array.from(document.querySelectorAll('.toolbar-button')).find(button=>button.textContent.trim()==='BG Remover'&&!button.disabled))");
        if (!imageSelected) await delay(200);
      }
      assert.equal(imageSelected, true, 'The imported fixture must be selected on the canvas.');
      progress('running local background removal');
      await cdp.evaluate("(document.querySelector('button.remove-bg')||Array.from(document.querySelectorAll('.toolbar-button')).find(button=>button.textContent.trim()==='BG Remover')).click()");
      let complete = false;
      const cutoutDeadline = Date.now() + 180000;
      while (!complete && Date.now() < cutoutDeadline) {
        const status = await cdp.evaluate("({busy:Boolean(document.querySelector('.busy-toast')),toast:document.querySelector('.toast')?.textContent||''})");
        if (status.toast.includes('Background removed')) complete = true;
        else if (!status.busy && status.toast) throw new Error(`Native cutout failed: ${status.toast.slice(0, 300)}`);
        else await delay(400);
      }
      assert.equal(complete, true, 'The local cutout must complete within three minutes.');
      progress('checking saved transparent image alpha');
      // Autosave is deliberately observed as persisted state instead of relying
      // on a private editor test hook or merely the completion toast.
      let alpha;
      const autosaveDeadline = Date.now() + 10000;
      while (!alpha && Date.now() < autosaveDeadline) {
        alpha = await cdp.evaluate(`(async () => {
          const record = await ${readSavedProject};
          const objects = record?.project?.pages?.flatMap(page => page.canvas?.objects || []) || [];
          const output = objects.find(object => String(object.type).toLowerCase() === 'image' && object.src?.startsWith('data:image/png;base64,'));
          if (!output) return null;
          const image = new Image(); image.src = output.src;
          await image.decode();
          const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
          const context = canvas.getContext('2d', {willReadFrequently:true}); context.drawImage(image, 0, 0);
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          let transparent = 0, partial = 0, opaque = 0;
          for (let i = 3; i < pixels.length; i += 4) { if (pixels[i] === 0) transparent++; else if (pixels[i] === 255) opaque++; else partial++; }
          return {width:canvas.width,height:canvas.height,transparent,partial,opaque,persistedPNG:true};
        })()`);
        if (!alpha) await delay(300);
      }
      assert.ok(alpha?.persistedPNG, 'Autosave must retain the transparent PNG in the project.');
      assert.ok(alpha.transparent > 0, 'Cutout must produce transparent pixels.');
      assert.ok(alpha.opaque + alpha.partial > 0, 'Cutout must retain the foreground.');
      result.cutout = alpha;
    }
    if (screenshotPath) {
      progress('capturing final editor screenshot');
      const screenshot = await cdp.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      await fs.mkdir(path.dirname(path.resolve(screenshotPath)), { recursive: true });
      await fs.writeFile(path.resolve(screenshotPath), Buffer.from(screenshot.data, 'base64'));
    }
    if(automationRendering && cdp.nativeInputIsolationReport) result.testWindowPresentation.inputIsolation = await cdp.nativeInputIsolationReport();
    validationResult = result;
    return result;
  } catch (error) {
    error.message = `During ${stage}: ${error.message}`;
    validationError = error;
    if (screenshotPath && cdp) {
      try {
        const screenshot = await cdp.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        const file = path.resolve(screenshotPath).replace(/\.png$/i, '-failure.png');
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, Buffer.from(screenshot.data, 'base64'));
        const state = await cdp.evaluate(`(async()=>{const record=await ${readSavedProject};return {message:${JSON.stringify(error.message)},gestureTrace:${JSON.stringify(error.smokeGestureTrace || cdp.gestureTrace || [])},gestureSummary:${JSON.stringify(cdp.gestureSummary || null)},nativeTabsTrace:${JSON.stringify(cdp.nativeTabsTrace || [])},controlsTrace:${JSON.stringify(cdp.controlsTrace || [])},v07Trace:${JSON.stringify(cdp.v07Trace || [])},v08Trace:${JSON.stringify(cdp.v08Trace || [])},viewportTrace:window.__visroSmokeViewportTrace||[],visibility:{state:document.visibilityState,focused:document.hasFocus()},home:Boolean(document.querySelector('.home-shell')),selected:Array.from(document.querySelectorAll('.inspector input')).map(input=>({label:input.getAttribute('aria-label'),value:input.value})),activeId:localStorage.getItem('visro-active-design'),saved:record?{id:record.id,name:record.name,updated:record.updated,objects:record.project.pages.flatMap(page=>(page.canvas.objects||[]).map(object=>({id:object.id,type:object.type,left:object.left,top:object.top})))}:null};})()`);
        await fs.writeFile(file.replace(/\.png$/i, '.json'), `${JSON.stringify(state, null, 2)}\n`);
      } catch { /* Preserve the actual assertion if the renderer is stalled. */ }
    }
    throw error;
  } finally {
    cdp?.close();
    if (validationError?.preserveNativeProcess) {
      // Do not erase an in-memory clipboard backup after a genuine OS restore
      // failure. The main inspector and child remain available to retry safely.
      throw validationError;
    }
    mainCDP?.close();
    child.kill('SIGTERM');
    await new Promise((resolve) => { if (child.exitCode !== null || child.signalCode !== null) resolve(); else { const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 3000); child.once('exit', () => { clearTimeout(timer); resolve(); }); } });
    await delay(250);
    try {
      await removeSmokeProfile(profile);
      if (validationResult) validationResult.cleanup = { ok: true };
    } catch (error) {
      const cleanupError = new Error(`Temporary smoke profile cleanup failed (${error.code || 'unknown'}).`, { cause: error });
      cleanupError.validation = validationResult;
      cleanupError.validationError = validationError?.message;
      // Keep a completed validation report available while still failing the
      // command, so filesystem cleanup cannot silently mask the app result.
      throw cleanupError;
    }
  }
}

if (require.main === module) {
  const argument = (name) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
  runNativeSmoke({ appPath: argument('--app'), screenshotPath: argument('--screenshot'), cutoutPath: argument('--cutout'), projectPath: argument('--project'), fonts: process.argv.includes('--fonts'), clipboard: process.argv.includes('--clipboard'), captions: process.argv.includes('--captions'), publicImages: process.argv.includes('--public-images'), elements: process.argv.includes('--elements'), controls: process.argv.includes('--controls'), v07Controls: process.argv.includes('--v07-controls'), v08Library: process.argv.includes('--v08-library'), canvaImport: process.argv.includes('--canva-import'), automationRendering: process.argv.includes('--automation-rendering'), onProgress: process.argv.includes('--verbose') ? (stage) => process.stderr.write(`Native smoke: ${stage}\n`) : undefined }).then((result) => { process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); process.exit(0); }).catch((error) => {
    if (error.validation) process.stdout.write(`${JSON.stringify({ ...error.validation, cleanup: { ok: false, error: error.message } }, null, 2)}\n`);
    if (error.validationError) process.stderr.write(`Native validation failed: ${error.validationError}\n`);
    process.stderr.write(`Native smoke failed: ${error.message}\n`);
    process.exit(1);
  });
}

module.exports = { runNativeCanvaImportRegression, runNativeControlsRegression, connectCDP, runNativeSmoke, removeSmokeProfile, runClipboardRegression, runNativeEditingRegression, rasterPointForFill, installNativeInputIsolation, enableNativeInputIsolation };
