'use strict';

// This explicit smoke runner launches a built desktop renderer and drives CDP
// using only Node's native fetch/WebSocket. It does not save keys or projects.
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');

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

async function runNativeSmoke({ appPath, screenshotPath, cutoutPath, timeoutMs = 60000 } = {}) {
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
  const child = spawn(executable, args, { cwd: root, env: environment, stdio: ['ignore', 'ignore', 'pipe'] });
  let debuggerURL;
  let launchError;
  child.on('error', (error) => { launchError = error; });
  child.stderr.on('data', (chunk) => {
    const match = String(chunk).match(/DevTools listening on (ws:\/\/(?:127\.0\.0\.1|localhost):\d+\/devtools\/browser\/[^\s]+)/);
    if (match) debuggerURL = match[1];
  });
  let cdp;
  let validationResult;
  let validationError;
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
    cdp = await connectCDP(target.webSocketDebuggerUrl);
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
    const result = await cdp.evaluate(`(async () => {
      const settings = await window.visro.getSettings();
      const manifestResponse = await fetch('/background-removal/1.7.0/resources.json');
      const manifest = await manifestResponse.json();
      const dataFetch = await (await fetch('data:text/plain,visro-local-data')).text();
      const blobURL = URL.createObjectURL(new Blob(['visro-local-blob'], { type: 'text/plain' }));
      const blobFetch = await (await fetch(blobURL)).text();
      URL.revokeObjectURL(blobURL);
      const workerURL = URL.createObjectURL(new Blob(["postMessage('visro-local-worker')"], { type: 'text/javascript' }));
      const worker = new Worker(workerURL);
      const workerResult = await new Promise((resolve, reject) => { worker.onmessage = (event) => resolve(event.data); worker.onerror = () => reject(new Error('Local worker failed')); });
      worker.terminate(); URL.revokeObjectURL(workerURL);
      const wasm = await WebAssembly.compile(new Uint8Array([0,97,115,109,1,0,0,0]));
      let blocked = false;
      const listener = (event) => { if (event.violatedDirective === 'connect-src' && event.blockedURI.startsWith('https://example.invalid')) blocked = true; };
      document.addEventListener('securitypolicyviolation', listener);
      await fetch('https://example.invalid/visro-csp-probe').catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 100));
      document.removeEventListener('securitypolicyviolation', listener);
      return {
        url: location.href, secureContext: isSecureContext, isolated: crossOriginIsolated,
        sharedArrayBuffer: typeof SharedArrayBuffer === 'function',
        manifestStatus: manifestResponse.status,
        manifestHeaders: { coop: manifestResponse.headers.get('cross-origin-opener-policy'), coep: manifestResponse.headers.get('cross-origin-embedder-policy'), corp: manifestResponse.headers.get('cross-origin-resource-policy') },
        modelAvailable: Boolean(manifest['/models/isnet_fp16']?.chunks?.length),
        dataFetch, blobFetch, workerResult, wasm: wasm instanceof WebAssembly.Module,
        externalFetchBlocked: blocked,
        nodeHidden: typeof window.require === 'undefined' && typeof window.process === 'undefined',
        keyNeverReturned: !Object.hasOwn(settings, 'apiKey') && !Object.hasOwn(settings, 'encryptedKey'),
        title: document.title,
      };
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
    if (cutoutPath) {
      const fixturePath = path.resolve(cutoutPath);
      await fs.access(fixturePath);
      const { root: documentNode } = await cdp.command('DOM.getDocument');
      const { nodeId } = await cdp.command('DOM.querySelector', { nodeId: documentNode.nodeId, selector: 'input[type="file"][accept^="image/"]' });
      assert.ok(nodeId, 'The image upload control must exist.');
      await cdp.command('DOM.setFileInputFiles', { nodeId, files: [fixturePath] });
      let imageSelected = false;
      const selectedDeadline = Date.now() + 15000;
      while (!imageSelected && Date.now() < selectedDeadline) {
        imageSelected = await cdp.evaluate("Boolean(document.querySelector('button.remove-bg:not(:disabled)'))");
        if (!imageSelected) await delay(200);
      }
      assert.equal(imageSelected, true, 'The imported fixture must be selected on the canvas.');
      await cdp.evaluate("document.querySelector('button.remove-bg').click()");
      let complete = false;
      const cutoutDeadline = Date.now() + 180000;
      while (!complete && Date.now() < cutoutDeadline) {
        const status = await cdp.evaluate("({busy:Boolean(document.querySelector('.busy-toast')),toast:document.querySelector('.toast')?.textContent||''})");
        if (status.toast.includes('Background removed')) complete = true;
        else if (!status.busy && status.toast) throw new Error(`Native cutout failed: ${status.toast.slice(0, 300)}`);
        else await delay(400);
      }
      assert.equal(complete, true, 'The local cutout must complete within three minutes.');
      // Autosave is deliberately observed as persisted state instead of relying
      // on a private editor test hook or merely the completion toast.
      let alpha;
      const autosaveDeadline = Date.now() + 10000;
      while (!alpha && Date.now() < autosaveDeadline) {
        alpha = await cdp.evaluate(`(async () => {
          const db = await new Promise((resolve, reject) => { const req = indexedDB.open('visro-studio', 1); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
          const rows = await new Promise((resolve, reject) => { const req = db.transaction('projects').objectStore('projects').getAll(); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
          db.close();
          const record = rows.find(row => row.id === localStorage.getItem('visro-active-design'));
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
      const screenshot = await cdp.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      await fs.mkdir(path.dirname(path.resolve(screenshotPath)), { recursive: true });
      await fs.writeFile(path.resolve(screenshotPath), Buffer.from(screenshot.data, 'base64'));
    }
    validationResult = result;
    return result;
  } catch (error) {
    validationError = error;
    throw error;
  } finally {
    cdp?.close();
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
  runNativeSmoke({ appPath: argument('--app'), screenshotPath: argument('--screenshot'), cutoutPath: argument('--cutout') }).then((result) => { process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); process.exit(0); }).catch((error) => {
    if (error.validation) process.stdout.write(`${JSON.stringify({ ...error.validation, cleanup: { ok: false, error: error.message } }, null, 2)}\n`);
    if (error.validationError) process.stderr.write(`Native validation failed: ${error.validationError}\n`);
    process.stderr.write(`Native smoke failed: ${error.message}\n`);
    process.exit(1);
  });
}

module.exports = { runNativeSmoke, removeSmokeProfile };
