const {
  app,
  BrowserWindow,
  Menu,
  ipcMain,
  dialog,
  shell,
} = require("electron");
const path = require("path");
const { DownloadManager } = require("./downloadManager");
const { updateElectronApp } = require("update-electron-app");

let mainWindow;
let downloadManager;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    icon: path.join(__dirname, "../assets/icons/icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "../public/index.html"));

  if (process.env.DEBUG === "true") mainWindow.webContents.openDevTools();

  mainWindow.on("closed", () => (mainWindow = null));
}

app.on("ready", () => {
  updateElectronApp({
    repo: "zerobertoo/EZ-Downloader",
    updateInterval: "1 hour",
  });
  downloadManager = new DownloadManager();
  createWindow();
  createMenu();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (!mainWindow) createWindow();
});

function createMenu() {
  const template = [
    {
      label: "Arquivo",
      submenu: [
        { label: "Sair", accelerator: "CmdOrCtrl+Q", click: () => app.quit() },
      ],
    },
    {
      label: "Editar",
      submenu: [
        { label: "Desfazer", accelerator: "CmdOrCtrl+Z", role: "undo" },
        { label: "Refazer", accelerator: "CmdOrCtrl+Y", role: "redo" },
        { type: "separator" },
        { label: "Cortar", accelerator: "CmdOrCtrl+X", role: "cut" },
        { label: "Copiar", accelerator: "CmdOrCtrl+C", role: "copy" },
        { label: "Colar", accelerator: "CmdOrCtrl+V", role: "paste" },
      ],
    },
    {
      label: "Ajuda",
      submenu: [
        {
          label: "Sobre",
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: "info",
              title: "Sobre EZ Downloader",
              message: "EZ Downloader v1.0.3",
              detail:
                "Interface amigável para o yt-dlp\nGitHub: https://github.com/zerobertoo/EZ-Downloader",
            });
          },
        },
        {
          label: "Verificar Atualizações",
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: "info",
              title: "Atualização Automática",
              message:
                "As atualizações são verificadas automaticamente em segundo plano.",
            });
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// IPC Handlers
ipcMain.handle("get-version", () => app.getVersion());
ipcMain.handle("get-formats", async (_, url) => {
  try {
    const formats = await downloadManager.getAvailableFormats(url);
    return { success: true, formats };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("start-download", async (_, { url, format, outputPath }) => {
  try {
    const result = await downloadManager.download(url, format, outputPath);
    return { success: true, result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("select-download-path", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
  });
  return result.filePaths[0] || null;
});

ipcMain.handle("open-path", async (_, filePath) => {
  try {
    await shell.openPath(filePath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("getDownloadsPath", () => app.getPath("downloads"));

// Progresso de download
ipcMain.on("download-progress", (_, data) => {
  mainWindow?.webContents.send("download-progress", data);
});
