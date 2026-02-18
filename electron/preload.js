const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Open a PDF via the native file dialog
  openPDFDialog: () => ipcRenderer.invoke('open-pdf-dialog'),

  // Read a PDF from a known file path
  readPDFFile: (filePath) => ipcRenderer.invoke('read-pdf-file', filePath),

  // Listen for PDFs opened from the menu or OS file association
  onOpenPDF: (callback) => {
    ipcRenderer.on('open-pdf', (_, data) => callback(data));
    // Return cleanup function
    return () => ipcRenderer.removeAllListeners('open-pdf');
  },

  // Check if running inside Electron
  isElectron: true,

  // App version
  getVersion: () => ipcRenderer.invoke('get-version'),
});
