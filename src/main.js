const {
  app,
  BrowserWindow,
  Menu,
  ipcMain,
  dialog,
  shell,
} = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const isDev = process.env.NODE_ENV === "development";
const { DownloadManager } = require("./downloadManager");
const { updateElectronApp } = require("update-electron-app");

let mainWindow;
let downloadManager;

// Configurar auto-update
autoUpdater.checkForUpdatesAndNotify();

autoUpdater.on("update-available", () => {
  dialog
    .showMessageBox(mainWindow, {
      type: "info",
      title: "Atualização Disponível",
      message: "Uma nova versão do EZ Downloader está disponível.",
      buttons: ["Instalar Agora", "Mais Tarde"],
      defaultId: 0,
    })
    .then((result) => {
      if (result.response === 0) {
        autoUpdater.downloadUpdate();
      }
    });
});

autoUpdater.on("update-downloaded", () => {
  dialog
    .showMessageBox(mainWindow, {
      type: "info",
      title: "Atualização Pronta",
      message:
        "A atualização foi baixada. O aplicativo será reiniciado para instalar.",
      buttons: ["Reiniciar Agora", "Mais Tarde"],
      defaultId: 0,
    })
    .then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
});

autoUpdater.on("error", (err) => {
  console.error("Erro ao atualizar:", err);
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
    },
    icon: path.join(__dirname, "../assets/icons/icon.png"),
  });

  const startUrl = `file://${path.join(__dirname, "../public/index.html")}`;

  mainWindow.loadURL(startUrl);

  if (process.env.DEBUG === "true") {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.on("ready", () => {
  downloadManager = new DownloadManager();
  createWindow();
  createMenu();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});

function createMenu() {
  const template = [
    {
      label: "Arquivo",
      submenu: [
        {
          label: "Sair",
          accelerator: "CmdOrCtrl+Q",
          click: () => {
            app.quit();
          },
        },
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
                "Uma interface amigável para o yt-dlp\n\nGitHub: https://github.com/zerobertoo/EZ-Downloader",
            });
          },
        },
        {
          label: "Verificar Atualizações",
          click: () => {
            autoUpdater.checkForUpdates();
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// IPC Handlers
ipcMain.handle("get-version", () => {
  return app.getVersion();
});

ipcMain.handle("get-formats", async (event, url) => {
  try {
    const formats = await downloadManager.getAvailableFormats(url);
    return { success: true, formats };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("start-download", async (event, { url, format, outputPath }) => {
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

ipcMain.handle("open-path", async (event, filePath) => {
  try {
    await shell.openPath(filePath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("getDownloadsPath", () => {
  return app.getPath("downloads");
});

// Enviar progresso de download para o renderer
ipcMain.on("download-progress", (event, data) => {
  if (mainWindow) {
    mainWindow.webContents.send("download-progress", data);
  }
});

updateElectronApp();
