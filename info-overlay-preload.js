const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('infoOverlayApi', {
  onState: (callback) => ipcRenderer.on('recording-state', (event, state) => callback(state))
});
