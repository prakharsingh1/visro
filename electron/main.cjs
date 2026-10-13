'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createGeminiService } = require('./gemini.cjs');
const { createSettingsStore } = require('./settings.cjs');
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
        const type = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }[path.extname(actualFile).toLowerCase()];
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
  const { app, BrowserWindow, Menu, dialog, ipcMain, safeStorage, shell, session, protocol, net } = require('electron');
  app.setName('Visro');
  protocol.registerSchemesAsPrivileged([{ scheme: 'visro', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
  const developmentURL = devURL(process.env.VISRO_DEV_URL);
  const distDirectory = path.resolve(__dirname, '../dist');
  let mainWindow = null;
  let currentProjectPath = null;
  let store;
  let inFlightAI = 0;
  let dialogQueue = Promise.resolve();

  function menuAction(action) {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('visro:menu', action);
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
    handler('visro:settings:get', () => store.getSettings());
    handler('visro:settings:save', (input) => store.saveSettings(input));
    handler('visro:models:list', async () => createGeminiService(await store.getCredentials()).listModels());
    handler('visro:ai:run', async (input) => {
      if (inFlightAI >= 3) throw new Error('Wait for an AI request to finish before starting another.');
      inFlightAI += 1;
      try { return await createGeminiService(await store.getCredentials()).runAI(input); } finally { inFlightAI -= 1; }
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
    handler('visro:external', async (value) => { await shell.openExternal(httpsURL(value)); return true; });
  }

  function installMenu() {
    const isMac = process.platform === 'darwin';
    const template = [
      ...(isMac ? [{ label: 'Visro', submenu: [{ role: 'about' }, { type: 'separator' }, { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: () => menuAction('settings') }, { type: 'separator' }, { role: 'services' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] }] : []),
      { label: 'File', submenu: [
        { label: 'New Design', accelerator: 'CmdOrCtrl+N', click: () => { currentProjectPath = null; menuAction('new'); } },
        { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: () => menuAction('open') },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => menuAction('save') },
        { label: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', click: () => menuAction('save-as') },
        { label: 'Export…', accelerator: 'CmdOrCtrl+Shift+E', click: () => menuAction('export') },
        { type: 'separator' }, { role: isMac ? 'close' : 'quit' },
      ] },
      { label: 'Edit', submenu: [{ label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: () => menuAction('undo') }, { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', click: () => menuAction('redo') }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
      { label: 'View', submenu: [{ label: 'Zoom In', accelerator: 'CmdOrCtrl+=', click: () => menuAction('zoom-in') }, { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: () => menuAction('zoom-out') }, { label: 'Fit Canvas', accelerator: 'CmdOrCtrl+0', click: () => menuAction('fit') }, { type: 'separator' }, { role: 'togglefullscreen' }, ...(developmentURL ? [{ role: 'toggleDevTools' }] : [])] },
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
    store = createSettingsStore({ directory: app.getPath('userData'), safeStorage });
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
    protocol.handle('visro', createAssetHandler({ distDirectory, fetchFile: (url) => net.fetch(url) }));
    installIPC();
    installMenu();
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  }).catch(() => {
    dialog.showErrorBox('Visro could not start', 'The local editor could not be opened. Reinstall Visro or run the development build again.');
    app.quit();
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}

// Electron's package loader can import the entry point without assigning it to
// require.main. Node tests import this module without an Electron browser process.
if (process.versions.electron && process.type === 'browser') boot();

module.exports = { devURL, httpsURL, contentSecurityPolicy, securityHeaders, createAssetHandler, boot };
