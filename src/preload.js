const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Versão e informações
  getVersion: () => ipcRenderer.invoke("get-version"),
  getAppInfo: () => ipcRenderer.invoke("get-app-info"),

  // Verificar se a aplicação está inicializada
  checkInit: () => ipcRenderer.invoke("check-init"),

  // Download operations
  getFormats: (url) => ipcRenderer.invoke("get-formats", url),
  startDownload: (url, format, outputPath) =>
    ipcRenderer.invoke("start-download", { url, format, outputPath }),

  // Path operations
  selectDownloadPath: () => ipcRenderer.invoke("select-download-path"),
  getDownloadsPath: () => ipcRenderer.invoke("getDownloadsPath"),
  openPath: (path) => ipcRenderer.invoke("open-path", path),

  // Download control
  cancelDownload: () => ipcRenderer.invoke("cancel-download"),

  // Event listeners
  onDownloadProgress: (callback) =>
    ipcRenderer.on("download-progress", (_, data) => callback(data)),

  // Listener para quando a inicialização estiver completa
  onInitComplete: (callback) =>
    ipcRenderer.on("init-complete", (_, data) => callback(data)),

  // Remover listeners
  removeDownloadProgressListener: () =>
    ipcRenderer.removeAllListeners("download-progress"),
  removeInitCompleteListener: () =>
    ipcRenderer.removeAllListeners("init-complete"),
});
