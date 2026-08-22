const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('widgetApi', {
  togglePause: () => ipcRenderer.send('widget-toggle-pause'),
  stop: () => ipcRenderer.send('widget-stop'),
  toggleCamera: () => ipcRenderer.send('camera-toggle'),
  onState: (callback) => ipcRenderer.on('recording-state', (event, state) => callback(state)),
  onCameraVisibility: (callback) => ipcRenderer.on('camera-visibility', (event, visible) => callback(visible)),
  onCameraAvailable: (callback) => ipcRenderer.on('camera-available', (event, available) => callback(available)),
  onLanguageChanged: (callback) => ipcRenderer.on('language-changed', (event, lang) => callback(lang))
});
