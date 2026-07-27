const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  getFolders: () => ipcRenderer.invoke('get-folders'),
  saveFolderSetting: (key, path) => ipcRenderer.invoke('save-folder-setting', { key, path }),
  savePdfFile: (params) => ipcRenderer.invoke('save-pdf-file', params),
  saveReceiptFile: (params) => ipcRenderer.invoke('save-receipt-file', params)
});
