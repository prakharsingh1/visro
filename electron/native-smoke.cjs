'use strict';

// This explicit smoke runner launches a built desktop renderer and drives CDP
// using only Node's native fetch/WebSocket and an isolated Chromium profile.
// Project fixtures and autosaves remain inside that disposable profile.
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { rasterPointForFill, gestureDeltaBounds } = require('./native-geometry.cjs');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
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
  return { command, evaluate, close: () => socket.close() };
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
  await waitForRenderer(cdp, "document.readyState === 'complete' && Boolean(window.visro) && !document.querySelector('.canvas-loading')", 'The native workspace did not finish loading.');
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
    db.close();localStorage.setItem('visro-active-design',record.id);return true;
  })()`);
  await cdp.command('Page.reload');
  await openHomeDesign(cdp, project.name);
  await cdp.evaluate("Array.from(document.querySelectorAll('.toolbar-button')).find(button=>button.textContent.trim()==='Position')?.click()");
  await delay(200);
  const canvasPixels = `(()=>{
    const canvas=document.querySelector('.lower-canvas'),pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    let ink=0,pink=0,nonBackground=0;
    for(let i=0;i<pixels.length;i+=4){if(!pixels[i+3])continue;const r=pixels[i],g=pixels[i+1],b=pixels[i+2];if(r<100&&g<100&&b<100)ink++;if(r>200&&g>140&&g<220&&b>150&&b<240)pink++;if(Math.abs(r-250)+Math.abs(g-245)+Math.abs(b-236)>40)nonBackground++;}
    return {width:canvas.width,height:canvas.height,ink,pink,nonBackground};
  })()`;
  const initialPixels = await waitForPaint(cdp, canvasPixels, 'The saved project did not visibly render its text and circle.');
  await cdp.evaluate("window.__visroSmokeHeartbeat={ticks:0,maxGap:0,last:performance.now(),moves:0,longTasks:[],slowGaps:[]};window.__visroSmokeObserver=new PerformanceObserver(entries=>{for(const item of entries.getEntries())window.__visroSmokeHeartbeat.longTasks.push({start:item.startTime,duration:item.duration});});window.__visroSmokeObserver.observe({type:'longtask',buffered:false});window.__visroSmokeTimer=setInterval(()=>{const s=window.__visroSmokeHeartbeat,now=performance.now(),gap=now-s.last;if(gap>150)s.slowGaps.push({start:s.last,duration:gap,visibility:document.visibilityState});s.maxGap=Math.max(s.maxGap,gap);s.last=now;s.ticks++;},50);document.addEventListener('mousemove',()=>window.__visroSmokeHeartbeat.moves++);");
  const selection = "({x:Number(document.querySelector('.inspector input[aria-label=\"Position X\"],.inspector input[aria-label=\"X\"]')?.value),y:Number(document.querySelector('.inspector input[aria-label=\"Position Y\"],.inspector input[aria-label=\"Y\"]')?.value),label:document.querySelector('.selected-label')?.textContent?.trim()||''})";
  // Use actual painted pixels rather than guessing Fabric's viewport transform.
  // CSS overlays, retina density and the opened Position panel can all change
  // the relationship between canvas bitmap and native client coordinates.
  const paintedPoint = (fill) => cdp.evaluate(`(()=>{const canvas=document.querySelector('.lower-canvas'),r=canvas.getBoundingClientRect(),pixels=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,canvas.width,canvas.height).data;return (${rasterPointForFill.toString()})(pixels,canvas.width,canvas.height,{left:r.left,top:r.top,width:r.width,height:r.height},${JSON.stringify(fill)});})()`);
  const click = async (point) => {
    await cdp.command('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', buttons: 1, clickCount: 1 });
    await cdp.command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', buttons: 0, clickCount: 1 });
  };
  await click(await paintedPoint(target.fill));
  await waitForRenderer(cdp, "Boolean(document.querySelector('.inspector input[aria-label=\"Position X\"],.inspector input[aria-label=\"X\"]'))", 'Pointer selection did not update the native position inspector.');
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
  assert.ok(heartbeat.ticks > 10 && heartbeat.moves >= 300, 'Real pointer moves and the renderer heartbeat must continue through all gestures.');
  assert.ok(heartbeat.maxGap < 1500, `The native renderer must remain responsive during repeated movement: ${JSON.stringify({ heartbeat, maxGestureMs })}.`);
  assert.ok(maxGestureMs < 2000, `A native movement gesture must not stall the renderer: ${maxGestureMs} ms.`);
  await cdp.command('Page.reload');
  await openHomeDesign(cdp, project.name);
  await cdp.evaluate("Array.from(document.querySelectorAll('.toolbar-button')).find(button=>button.textContent.trim()==='Position')?.click()");
  const restoredPixels = await waitForPaint(cdp, canvasPixels, 'The autosaved project did not visibly render after reload.');
  await click(await paintedPoint(target.fill));
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
  return { fixture: path.basename(projectPath), changedGestures, maxGestureMs, maxSceneRoundingError, thumbnailIdleWindows, heartbeat, firstSelection, finalSelection, restoredSelection, keyboardNudgedSelection, arrowNudge: 1, shiftArrowNudge: 10, hoverHighlight: true, contextMenu, alternateSelection, initialPixels, restoredPixels, autosaveRestored: true, objectCount: persisted.project.pages.flatMap((candidate) => candidate.canvas.objects || []).length };
}

async function runNativeSmoke({ appPath, screenshotPath, cutoutPath, projectPath, fonts = false, clipboard = false, timeoutMs = 60000, onProgress = () => {} } = {}) {
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
  if (clipboard) args.push('--inspect=0');
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
    if (clipboard) {
      progress('preserving and testing native clipboard');
      if (mainInspectorURL) mainCDP = await connectCDP(mainInspectorURL);
      if (mainCDP) {
        result.appVersion = await mainCDP.evaluate("process.getBuiltinModule('module').createRequire(process.cwd()+'/package.json')('electron').app.getVersion()");
        const expectedVersion = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')).version;
        assert.equal(result.appVersion, expectedVersion, 'Native acceptance must run the current build rather than an older cached application.');
        result.asyncEncryptionAPI = await mainCDP.evaluate("(()=>{const {safeStorage}=process.getBuiltinModule('module').createRequire(process.cwd()+'/package.json')('electron');return ['isAsyncEncryptionAvailable','encryptStringAsync','decryptStringAsync'].every(name=>typeof safeStorage[name]==='function');})()");
        assert.equal(result.asyncEncryptionAPI, true, 'The shipped Electron binary must expose non-blocking secure-storage methods.');
      }
      result.clipboard = await runClipboardRegression(cdp, mainCDP);
      progress('checking native focused text Undo and Redo');
      result.nativeEditing = await runNativeEditingRegression(cdp, mainCDP);
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
      result.fonts = { families: names, loadedFaces: await cdp.evaluate("Array.from(document.fonts).filter(face=>face.status==='loaded').length"), cloudFetch: false, installedTypeface };
      assert.equal(result.fonts.families.length, 21);
      assert.ok(result.fonts.loadedFaces >= 23, 'Every offline font face must be decoded by the native renderer.');
    }
    if (projectPath) { progress('checking native pointer gestures, autosave and restore'); result.gestures = await runGestureRegression(cdp, projectPath, screenshotPath); }
    else { progress('opening initial design'); await openHomeDesign(cdp); }
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
        const state = await cdp.evaluate(`(async()=>{const record=await ${readSavedProject};return {message:${JSON.stringify(error.message)},gestureTrace:${JSON.stringify(error.smokeGestureTrace || cdp.gestureTrace || [])},home:Boolean(document.querySelector('.home-shell')),selected:Array.from(document.querySelectorAll('.inspector input')).map(input=>({label:input.getAttribute('aria-label'),value:input.value})),activeId:localStorage.getItem('visro-active-design'),saved:record?{id:record.id,name:record.name,updated:record.updated,objects:record.project.pages.flatMap(page=>(page.canvas.objects||[]).map(object=>({id:object.id,type:object.type,left:object.left,top:object.top})))}:null};})()`);
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
  runNativeSmoke({ appPath: argument('--app'), screenshotPath: argument('--screenshot'), cutoutPath: argument('--cutout'), projectPath: argument('--project'), fonts: process.argv.includes('--fonts'), clipboard: process.argv.includes('--clipboard'), onProgress: process.argv.includes('--verbose') ? (stage) => process.stderr.write(`Native smoke: ${stage}\n`) : undefined }).then((result) => { process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); process.exit(0); }).catch((error) => {
    if (error.validation) process.stdout.write(`${JSON.stringify({ ...error.validation, cleanup: { ok: false, error: error.message } }, null, 2)}\n`);
    if (error.validationError) process.stderr.write(`Native validation failed: ${error.validationError}\n`);
    process.stderr.write(`Native smoke failed: ${error.message}\n`);
    process.exit(1);
  });
}

module.exports = { runNativeSmoke, removeSmokeProfile, runClipboardRegression, runNativeEditingRegression, rasterPointForFill };
