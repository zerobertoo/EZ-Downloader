const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  selectFolder: () => ipcRenderer.invoke("select-folder"),
  downloadVideo: (link, output) =>
    ipcRenderer.send("download-video", { link, output }),
  downloadAudio: (link, output) =>
    ipcRenderer.send("download-audio", { link, output }),
  windowControl: (action) => ipcRenderer.send("window-control", action),
  onLog: (callback) => ipcRenderer.on("log", (_, data) => callback(data)),
});
