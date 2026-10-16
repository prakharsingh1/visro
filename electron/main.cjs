'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createGeminiService } = require('./gemini.cjs');
const { createGeminiMediaService, validateMediaRequest } = require('./gemini-media.cjs');
const { randomUUID } = require('node:crypto');
const { createSettingsStore } = require('./settings.cjs');
const { createMediaService, validateTimeline } = require('./media.cjs');
const { validatePrintDocument, renderDocumentPDF } = require('./print.cjs');
const { getLocalTypeface } = require('./typeface.cjs');
const { createCanvasClipboard } = require('./clipboard.cjs');
const { createPublicImageService } = require('./public-images.cjs');
const { MAX_FILE_BYTES, safeName, serializeProject, parseProject, decodeExport, resolveAsset } = require('./files.cjs');

function devURL(value) {
  if (!value) return null;
  const url = new URL(value);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.port !== '5173' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('VISRO_DEV_URL must be http://127.0.0.1:5173/.');
  }
  return url.href;
}

function httpsURL(value) {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('Use a valid HTTPS link.');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Only HTTPS links can be opened.');
  return url.href;
}

function contentSecurityPolicy(development) {
  return [
    "default-src 'self'",
    // IMG.LY's bundled ndarray builds typed-array accessors with new Function.
    // No remote scripts are allowed; Electron/Node access remains sandboxed.
    `script-src 'self' blob: 'unsafe-eval' 'wasm-unsafe-eval'${development ? " 'unsafe-inline'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' blob: data:${development ? ' http://127.0.0.1:5173 ws://127.0.0.1:5173' : ''}`,
    "worker-src 'self' blob:",
    "media-src 'self' data: blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

function securityHeaders(development = false, source) {
  const headers = new Headers(source);
  headers.set('Content-Security-Policy', contentSecurityPolicy(development));
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  headers.set('X-Content-Type-Options', 'nosniff');
  return headers;
}

async function dispatchEditorCommand(contents, action, sendMenu) {
  const commands = { undo: 'undo', redo: 'redo', copy: 'copy', cut: 'cut', paste: 'paste', 'select-all': 'selectAll' };
  const nativeCommand = Object.hasOwn(commands, action) ? commands[action] : null;
  if (!nativeCommand || !contents || contents.isDestroyed()) return false;
  try {
    // isContentEditable includes inherited and plaintext-only editable regions.
    // Fabric's hidden textarea also needs native text history while editing.
    const textFocused = await contents.executeJavaScript("(() => { const field=document.activeElement; return Boolean(field && (field.isContentEditable || field.tagName==='TEXTAREA' || (field.tagName==='INPUT' && ['text','search','password','email','url','tel','number'].includes(field.type || 'text')))); })()");
    if (contents.isDestroyed()) return false;
    if (textFocused) contents[nativeCommand](); else sendMenu(action);
    return true;
  } catch { return false; /* A closing renderer cannot receive a command. */ }
}

function createAssetHandler({ distDirectory, fetchFile, realpath = fs.realpath }) {
  const reply = (text, status) => new Response(text, { status, headers: securityHeaders(false, { 'Content-Type': 'text/plain; charset=utf-8' }) });
  return async (request) => {
    const filePath = resolveAsset(distDirectory, request.url);
    if (!filePath || !['GET', 'HEAD'].includes(request.method)) return reply('Forbidden', 403);
    if (request.initiatorOrigin !== undefined && request.initiatorOrigin !== 'visro://app') return reply('Forbidden', 403);
    try {
      const [actualRoot, actualFile] = await Promise.all([realpath(distDirectory), realpath(filePath)]);
      const relative = path.relative(actualRoot, actualFile);
      if (relative.startsWith('..') || path.isAbsolute(relative)) return reply('Forbidden', 403);
      const response = await fetchFile(pathToFileURL(actualFile).href);
      const headers = securityHeaders(false, response.headers);
      if (!headers.has('Content-Type')) {
        const type = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf' }[path.extname(actualFile).toLowerCase()];
        if (type) headers.set('Content-Type', type);
      }
      if (request.method === 'HEAD') await response.body?.cancel();
      // Return security headers here: custom-protocol requests must not depend on
      // a session webRequest interception to enable cross-origin isolation.
      return new Response(request.method === 'HEAD' ? null : response.body, { status: response.status, statusText: response.statusText, headers });
    } catch { return reply('Not found', 404); }
  };
}

function boot() {
  const { app, BrowserWindow, Menu, dialog, ipcMain, safeStorage, shell, session, protocol, net, clipboard, ClipboardItem, nativeImage } = require('electron');
  app.setName('Visro');
  protocol.registerSchemesAsPrivileged([{ scheme: 'visro', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
  const developmentURL = devURL(process.env.VISRO_DEV_URL);
  const distDirectory = path.resolve(__dirname, '../dist');
  let mainWindow = null;
  let currentProjectPath = null;
  let store;
  let media;
  let publicImages;
  const canvasClipboard = createCanvasClipboard({ clipboard, ClipboardItem, nativeImage });
  let inFlightAI = 0;
  const aiJobs = new Map();
  let dialogQueue = Promise.resolve();

  function menuAction(action) {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('visro:menu', action);
  }

  async function editMenuAction(action) {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    return dispatchEditorCommand(mainWindow.webContents, action, menuAction);
  }

  function withDialog(task) {
    const result = dialogQueue.then(task);
    dialogQueue = result.catch(() => {});
    return result;
  }

  function assertSender(event) {
    if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) {
      throw new Error('This request is not from the Visro editor.');
    }
    const expected = developmentURL || 'visro://app/index.html';
    if (event.senderFrame.url !== expected) throw new Error('This request is not from the Visro editor.');
  }

  function handler(channel, task) {
    ipcMain.handle(channel, async (event, ...args) => {
      assertSender(event);
      try { return await task(...args); } catch (error) {
        // IPC exposes only the deliberate message; credentials and stack traces stay in main.
        throw new Error(error.message || 'Visro could not complete this action.');
      }
    });
  }

  function installIPC() {
    handler('visro:clipboard:write', (input) => canvasClipboard.write(input));
    handler('visro:clipboard:read', () => canvasClipboard.read());
    handler('visro:photos:search', (input) => publicImages.search(input));
    handler('visro:photos:get', (input) => publicImages.get(input));
    handler('visro:typeface:local', () => getLocalTypeface());
    handler('visro:settings:get', () => store.getSettings());
    handler('visro:settings:save', (input) => store.saveSettings(input));
    handler('visro:models:list', async () => createGeminiService(await store.getCredentials()).listModels());
    handler('visro:ai:run', async (input) => {
      if (inFlightAI >= 3) throw new Error('Wait for an AI request to finish before starting another.');
      inFlightAI += 1;
      let job;
      try {
        if (input && ['voice', 'video'].includes(input.kind)) {
          validateMediaRequest(input);
          const requestId = input.requestId || randomUUID();
          if (aiJobs.has(requestId)) throw new Error('This AI media request is already running.');
          job = { requestId, controller: new AbortController(), kind: input.kind };
          aiJobs.set(requestId, job);
          const onProgress = (progress) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('visro:ai:progress', { ...progress, requestId, kind: job.kind }); };
          const credentials = await store.getCredentials();
          const generated = await createGeminiMediaService({ ...credentials, signal: job.controller.signal, onProgress }).run(input);
          const item = await media.importBuffer(generated, { signal: job.controller.signal });
          onProgress({ phase: 'complete', percent: 100, message: 'Your generated media is ready in the local library.' });
          return { media: item };
        }
        return await createGeminiService(await store.getCredentials()).runAI(input);
      } catch (error) {
        if (job?.controller.signal.aborted) {
          if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('visro:ai:progress', { requestId: job.requestId, kind: job.kind, phase: 'cancelled', percent: 0, message: 'Stopped waiting for AI media generation.' });
          throw new Error('AI media generation cancelled.');
        }
        throw error;
      } finally { inFlightAI -= 1; if (job) aiJobs.delete(job.requestId); }
    });
    handler('visro:ai:cancel', (requestId) => {
      if (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(requestId)) throw new Error('The AI request identifier is invalid.');
      const job = aiJobs.get(requestId);
      if (!job) return { cancelled: false };
      job.controller.abort();
      return { cancelled: true };
    });
    handler('visro:project:open', () => withDialog(async () => {
      const result = await dialog.showOpenDialog(mainWindow, { title: 'Open Visro project', properties: ['openFile'], filters: [{ name: 'Visro projects', extensions: ['visro', 'json'] }] });
      if (result.canceled || !result.filePaths[0]) return null;
      const filePath = result.filePaths[0];
      const stat = await fs.stat(filePath);
      if (!stat.isFile() || stat.size > MAX_FILE_BYTES) throw new Error('Choose a Visro project smaller than 100 MB.');
      const project = parseProject(await fs.readFile(filePath, 'utf8'));
      currentProjectPath = filePath;
      return { project, filePath, name: path.basename(filePath) };
    }));
    handler('visro:project:save', (input) => withDialog(async () => {
      if (!input || typeof input !== 'object' || !input.project) throw new Error('Choose a valid Visro project to save.');
      const data = serializeProject(input.project);
      let filePath = currentProjectPath;
      if (!filePath || input.saveAs) {
        const result = await dialog.showSaveDialog(mainWindow, { title: 'Save Visro project', defaultPath: `${safeName(input.name || input.project.name)}.visro`, filters: [{ name: 'Visro project', extensions: ['visro'] }] });
        if (result.canceled || !result.filePath) return null;
        filePath = result.filePath;
      }
      // The renderer cannot supply an arbitrary path. Destinations come from native dialogs.
      await fs.writeFile(filePath, data, 'utf8');
      currentProjectPath = filePath;
      return { saved: true, filePath, name: path.basename(filePath) };
    }));
    handler('visro:export', (input) => withDialog(async () => {
      const file = decodeExport(input);
      const result = await dialog.showSaveDialog(mainWindow, { title: `Export ${file.extension.toUpperCase()}`, defaultPath: file.name, filters: [{ name: file.extension.toUpperCase(), extensions: [file.extension] }] });
      if (result.canceled || !result.filePath) return null;
      await fs.writeFile(result.filePath, file.data);
      return { saved: true, filePath: result.filePath, name: path.basename(result.filePath) };
    }));
    handler('visro:document:print', (input) => withDialog(async () => {
      const document = validatePrintDocument(input);
      const result = await dialog.showSaveDialog(mainWindow, { title: 'Export document PDF', defaultPath: `${document.name}.pdf`, filters: [{ name: 'PDF document', extensions: ['pdf'] }] });
      if (result.canceled || !result.filePath) return null;
      const pdf = await renderDocumentPDF(document, { BrowserWindow, session });
      await fs.writeFile(result.filePath, pdf);
      return { saved: true, filePath: result.filePath, name: path.basename(result.filePath) };
    }));
    handler('visro:external', async (value) => { await shell.openExternal(httpsURL(value)); return true; });
    handler('visro:media:capabilities', () => media.capabilities());
    handler('visro:media:list', () => media.listMedia());
    handler('visro:media:remove', (id) => media.removeMedia(id));
    handler('visro:media:open', async (id) => {
      const item = await media.asset(id);
      const error = await shell.openPath(item.previewPath);
      if (error) throw new Error('The media preview could not be opened.');
    });
    handler('visro:media:import', async (kind = 'all') => {
      if (!['video', 'audio', 'all'].includes(kind)) throw new Error('Choose video or audio import.');
      const videos = ['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi'], audio = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'opus'];
      const result = await withDialog(() => dialog.showOpenDialog(mainWindow, { title: 'Import local media', properties: ['openFile', 'multiSelections'], filters: [{ name: kind === 'all' ? 'Video & audio' : kind === 'video' ? 'Video' : 'Audio', extensions: kind === 'all' ? [...videos, ...audio] : kind === 'video' ? videos : audio }] }));
      if (result.canceled || !result.filePaths.length) return [];
      return media.importFiles(result.filePaths, kind);
    });
    handler('visro:media:export', async (input) => {
      const validated = validateTimeline(input);
      const result = await withDialog(() => dialog.showSaveDialog(mainWindow, { title: `Export ${validated.format.toUpperCase()}`, defaultPath: `${validated.name}.${validated.format}`, filters: [{ name: validated.format.toUpperCase(), extensions: [validated.format] }] }));
      if (result.canceled || !result.filePath) return null;
      return media.exportTimeline(input, result.filePath);
    });
    handler('visro:media:cancel', () => media.cancelExport());
  }

  function installMenu() {
    const isMac = process.platform === 'darwin';
    const template = [
      ...(isMac ? [{ label: 'Visro', submenu: [{ role: 'about' }, { type: 'separator' }, { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: () => menuAction('settings') }, { type: 'separator' }, { role: 'services' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] }] : []),
      { label: 'File', submenu: [
        { label: 'New Design', accelerator: 'CmdOrCtrl+T', click: () => { currentProjectPath = null; menuAction('new'); } },
        { label: 'New Design', accelerator: 'CmdOrCtrl+N', visible: false, acceleratorWorksWhenHidden: true, click: () => { currentProjectPath = null; menuAction('new'); } },
        { label: 'Home', accelerator: 'CmdOrCtrl+Shift+H', click: () => menuAction('home') },
        { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: () => menuAction('open') },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => menuAction('save') },
        { label: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', click: () => menuAction('save-as') },
        { label: 'Export…', accelerator: 'CmdOrCtrl+Shift+E', click: () => menuAction('export') },
        { type: 'separator' }, { label: 'Close Design', accelerator: 'CmdOrCtrl+W', click: () => menuAction('close-design') },
        { label: 'Close Window', accelerator: 'CmdOrCtrl+Shift+W', click: () => mainWindow?.close() },
      ] },
      { label: 'Edit', submenu: [{ label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: () => void editMenuAction('undo') }, { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', click: () => void editMenuAction('redo') }, { label: 'Redo', accelerator: 'CmdOrCtrl+Y', visible: false, acceleratorWorksWhenHidden: true, click: () => void editMenuAction('redo') }, { type: 'separator' }, { label: 'Cut', accelerator: 'CmdOrCtrl+X', click: () => void editMenuAction('cut') }, { label: 'Copy', accelerator: 'CmdOrCtrl+C', click: () => void editMenuAction('copy') }, { label: 'Paste', accelerator: 'CmdOrCtrl+V', click: () => void editMenuAction('paste') }, { label: 'Select All', accelerator: 'CmdOrCtrl+A', click: () => void editMenuAction('select-all') }] },
      { label: 'View', submenu: [{ label: 'Zoom In', accelerator: 'CmdOrCtrl+=', click: () => menuAction('zoom-in') }, { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: () => menuAction('zoom-out') }, { label: 'Fit Canvas', accelerator: 'CmdOrCtrl+0', click: () => menuAction('fit') }, { type: 'separator' }, { role: 'togglefullscreen' }, ...(developmentURL ? [{ role: 'toggleDevTools' }] : [])] },
      { label: 'Tab', submenu: [
        { label: 'Next Tab', accelerator: 'Alt+CmdOrCtrl+Right', click: () => menuAction('next-tab') },
        { label: 'Previous Tab', accelerator: 'Alt+CmdOrCtrl+Left', click: () => menuAction('previous-tab') },
        { label: 'Reopen Closed Tab', accelerator: 'CmdOrCtrl+Shift+T', click: () => menuAction('reopen-design') },
        ...Array.from({length:9},(_,index)=>({label:`Select Tab ${index+1}`,accelerator:`CmdOrCtrl+${index+1}`,visible:false,acceleratorWorksWhenHidden:true,click:()=>menuAction(`tab-${index+1}`)})),
      ] },
      { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, ...(isMac ? [{ type: 'separator' }, { role: 'front' }] : [])] },
      { label: 'Help', submenu: [{ label: 'Get a Gemini API key', click: () => shell.openExternal('https://aistudio.google.com/app/apikey') }, { label: 'Gemini documentation', click: () => shell.openExternal('https://ai.google.dev/gemini-api/docs') }] },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
    app.setAboutPanelOptions({ applicationName: 'Visro', applicationVersion: app.getVersion(), copyright: 'Visro — an independent creative workspace', credits: 'Local designs. Your Gemini key.' });
  }

  function createWindow() {
    currentProjectPath = null;
    mainWindow = new BrowserWindow({
      width: 1512, height: 980, minWidth: 1100, minHeight: 720,
      title: 'Visro', backgroundColor: '#FAF8F4',
      titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
      trafficLightPosition: { x: 20, y: 21 },
      show: false,
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, allowRunningInsecureContent: false, spellcheck: true },
    });
    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
    mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());
    mainWindow.once('ready-to-show', () => mainWindow?.show());
    mainWindow.on('closed', () => { mainWindow = null; });
    mainWindow.loadURL(developmentURL || 'visro://app/index.html');
  }

  app.whenReady().then(async () => {
    publicImages = createPublicImageService({root:app.getPath('userData')});
    store = createSettingsStore({ directory: app.getPath('userData'), safeStorage });
    media = createMediaService({ directory: path.join(app.getPath('userData'), 'media-library'), toolsDirectory: path.join(process.resourcesPath, 'media-tools'), developmentToolsDirectory: path.resolve(__dirname, '../build/media-tools'), onProgress: (progress) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('visro:media:progress', progress); } });
    const targetSession = session.defaultSession;
    targetSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    targetSession.setPermissionCheckHandler(() => false);
    targetSession.webRequest.onHeadersReceived((details, callback) => {
      const headers = { ...details.responseHeaders };
      for (const key of Object.keys(headers)) if (['content-security-policy', 'cross-origin-opener-policy', 'cross-origin-embedder-policy'].includes(key.toLowerCase())) delete headers[key];
      headers['Content-Security-Policy'] = [contentSecurityPolicy(Boolean(developmentURL))];
      headers['Cross-Origin-Opener-Policy'] = ['same-origin'];
      headers['Cross-Origin-Embedder-Policy'] = ['require-corp'];
      callback({ responseHeaders: headers });
    });
    const assetHandler = createAssetHandler({ distDirectory, fetchFile: (url) => net.fetch(url) });
    protocol.handle('visro', async (request) => {
      const url = new URL(request.url);
      if (url.protocol === 'visro:' && url.hostname === 'app' && url.pathname.startsWith('/media/')) {
        if (request.initiatorOrigin !== undefined && request.initiatorOrigin !== 'visro://app') return new Response('Forbidden', { status: 403 });
        const response = await media.mediaResponse(request);
        return new Response(response.body, { status: response.status, headers: securityHeaders(false, response.headers) });
      }
      return assetHandler(request);
    });
    installIPC();
    installMenu();
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  }).catch(() => {
    dialog.showErrorBox('Visro could not start', 'The local editor could not be opened. Reinstall Visro or run the development build again.');
    app.quit();
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('before-quit', () => { media?.cancelExport(); for (const job of aiJobs.values()) job.controller.abort(); });
}

// Electron's package loader can import the entry point without assigning it to
// require.main. Node tests import this module without an Electron browser process.
if (process.versions.electron && process.type === 'browser') boot();

module.exports = { devURL, httpsURL, contentSecurityPolicy, securityHeaders, createAssetHandler, dispatchEditorCommand, boot };
