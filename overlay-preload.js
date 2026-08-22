const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlayApi', {
  regionSelected: (data) => ipcRenderer.send('region-selected', data),
  regionCancelled: () => ipcRenderer.send('region-cancelled')
});
