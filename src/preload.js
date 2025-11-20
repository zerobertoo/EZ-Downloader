const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  getVersion: () => ipcRenderer.invoke("get-version"),
  getAppInfo: () => ipcRenderer.invoke("get-app-info"),
  getFormats: (url) => ipcRenderer.invoke("get-formats", url),
  startDownload: (url, format, outputPath) =>
    ipcRenderer.invoke("start-download", { url, format, outputPath }),
  selectDownloadPath: () => ipcRenderer.invoke("select-download-path"),
  getDownloadsPath: () => ipcRenderer.invoke("getDownloadsPath"),
  openPath: (path) => ipcRenderer.invoke("open-path", path),
  cancelDownload: () => ipcRenderer.invoke("cancel-download"),
  onDownloadProgress: (callback) =>
    ipcRenderer.on("download-progress", (_, data) => callback(data)),
  removeDownloadProgressListener: () =>
    ipcRenderer.removeAllListeners("download-progress"),
});
