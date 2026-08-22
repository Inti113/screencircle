const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getSources: (types) => ipcRenderer.invoke('get-sources', types),
  getScreenInfo: () => ipcRenderer.invoke('get-screen-info'),
  getPrimaryScreenSource: () => ipcRenderer.invoke('get-primary-screen-source'),
  selectRegion: () => ipcRenderer.invoke('select-region'),
  chooseSavePath: (format) => ipcRenderer.invoke('choose-save-path', format),
  saveRecording: (buffer, outputPath, crop, format) => ipcRenderer.invoke('save-recording', { buffer, outputPath, crop, format }),
  recordingStarted: (payload) => ipcRenderer.send('recording-started', payload),
  overlayInfoSetIncluded: (included) => ipcRenderer.send('overlay-info-set-included', included),
  recordingStopped: () => ipcRenderer.send('recording-stopped'),
  sendRecordingState: (state) => ipcRenderer.send('recording-state-update', state),
  onTogglePause: (callback) => ipcRenderer.on('toggle-pause', () => callback()),
  onRequestStop: (callback) => ipcRenderer.on('request-stop', () => callback()),
  onHotkeyStart: (callback) => ipcRenderer.on('hotkey-start', () => callback()),
  onHotkeyPause: (callback) => ipcRenderer.on('hotkey-pause', () => callback()),
  onHotkeyStop: (callback) => ipcRenderer.on('hotkey-stop', () => callback()),
  cameraShow: () => ipcRenderer.send('camera-show'),
  cameraHide: () => ipcRenderer.send('camera-hide'),
  cameraSetIncluded: (included) => ipcRenderer.send('camera-set-included', included),
  cameraSetShape: (shape) => ipcRenderer.send('camera-set-shape', shape),
  showItemInFolder: (filePath) => ipcRenderer.send('show-item-in-folder', filePath)
});
