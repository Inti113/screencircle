const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlayApi', {
  regionSelected: (data) => ipcRenderer.send('region-selected', data),
  regionCancelled: () => ipcRenderer.send('region-cancelled'),
  onLanguageChanged: (callback) => ipcRenderer.on('language-changed', (event, lang) => callback(lang))
});
