const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cameraApi', {
  resize: (delta) => ipcRenderer.send('camera-resize', delta),
  onSetShape: (callback) => ipcRenderer.on('set-shape', (event, shape) => callback(shape)),
  onLanguageChanged: (callback) => ipcRenderer.on('language-changed', (event, lang) => callback(lang)),
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  phoneCheckAndroid: () => ipcRenderer.invoke('phone-check-android'),
  phoneMirrorStart: (serial) => ipcRenderer.invoke('phone-mirror-start', serial),
  phoneMirrorStop: () => ipcRenderer.invoke('phone-mirror-stop')
});
