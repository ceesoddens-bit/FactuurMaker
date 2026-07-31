const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  getFolders: () => ipcRenderer.invoke('get-folders'),
  saveFolderSetting: (key, path) => ipcRenderer.invoke('save-folder-setting', { key, path }),
  savePdfFile: (params) => ipcRenderer.invoke('save-pdf-file', params),
  saveReceiptFile: (params) => ipcRenderer.invoke('save-receipt-file', params),
  readFolder: (folderPath) => ipcRenderer.invoke('read-folder', folderPath),
  openPath: (filePath) => ipcRenderer.invoke('open-path', filePath),
  showInFolder: (filePath) => ipcRenderer.invoke('show-in-folder', filePath),
  scanBonnetjes: (params) => ipcRenderer.invoke('scan-bonnetjes', params),
  getKlanten: () => ipcRenderer.invoke('get-klanten'),
  saveKlanten: (klanten) => ipcRenderer.invoke('save-klanten', klanten)
});
