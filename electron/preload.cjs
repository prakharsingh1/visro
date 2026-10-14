'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('visro', Object.freeze({
  writeCanvasClipboard: (input) => ipcRenderer.invoke('visro:clipboard:write', input),
  readCanvasClipboard: () => ipcRenderer.invoke('visro:clipboard:read'),
  getLocalTypeface: () => ipcRenderer.invoke('visro:typeface:local'),
  getSettings: () => ipcRenderer.invoke('visro:settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('visro:settings:save', settings),
  listModels: () => ipcRenderer.invoke('visro:models:list'),
  runAI: (input) => ipcRenderer.invoke('visro:ai:run', input),
  cancelAI: (requestId) => ipcRenderer.invoke('visro:ai:cancel', requestId),
  onAIProgress: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('visro:ai:progress', listener);
    return () => ipcRenderer.removeListener('visro:ai:progress', listener);
  },
  openProject: () => ipcRenderer.invoke('visro:project:open'),
  saveProject: (input) => ipcRenderer.invoke('visro:project:save', input),
  exportFile: (input) => ipcRenderer.invoke('visro:export', input),
  printDocument: (input) => ipcRenderer.invoke('visro:document:print', input),
  openExternal: (url) => ipcRenderer.invoke('visro:external', url),
  getMediaCapabilities: () => ipcRenderer.invoke('visro:media:capabilities'),
  importMedia: (kind) => ipcRenderer.invoke('visro:media:import', kind),
  listMedia: () => ipcRenderer.invoke('visro:media:list'),
  removeMedia: (id) => ipcRenderer.invoke('visro:media:remove', id),
  openMedia: (id) => ipcRenderer.invoke('visro:media:open', id),
  exportTimeline: (input) => ipcRenderer.invoke('visro:media:export', input),
  cancelMediaExport: () => ipcRenderer.invoke('visro:media:cancel'),
  onMediaProgress: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('visro:media:progress', listener);
    return () => ipcRenderer.removeListener('visro:media:progress', listener);
  },
  onMenu: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, action) => callback(action);
    ipcRenderer.on('visro:menu', listener);
    return () => ipcRenderer.removeListener('visro:menu', listener);
  },
}));
