const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cameraApi', {
  resize: (delta) => ipcRenderer.send('camera-resize', delta),
  onSetShape: (callback) => ipcRenderer.on('set-shape', (event, shape) => callback(shape))
});
