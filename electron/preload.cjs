'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('visro', Object.freeze({
  getSettings: () => ipcRenderer.invoke('visro:settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('visro:settings:save', settings),
  listModels: () => ipcRenderer.invoke('visro:models:list'),
  runAI: (input) => ipcRenderer.invoke('visro:ai:run', input),
  openProject: () => ipcRenderer.invoke('visro:project:open'),
  saveProject: (input) => ipcRenderer.invoke('visro:project:save', input),
  exportFile: (input) => ipcRenderer.invoke('visro:export', input),
  openExternal: (url) => ipcRenderer.invoke('visro:external', url),
  onMenu: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, action) => callback(action);
    ipcRenderer.on('visro:menu', listener);
    return () => ipcRenderer.removeListener('visro:menu', listener);
  },
}));
