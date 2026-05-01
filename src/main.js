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
const { checkDependencies } = require("./dependencyChecker");
const { getYtdlpBin } = require("./ytdlpPath");
const { getFfmpegBin } = require("./ffmpegPath");
const { createHandlers } = require("./ipcHandlers");
const { updateElectronApp } = require("update-electron-app");
const config = require("./config");

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
      sandbox: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "../public/index.html"));

  if (config.debug) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on("closed", () => (mainWindow = null));
}

app.on("ready", async () => {
  const ytdlpBin = getYtdlpBin(app.isPackaged);
  const ffmpegBin = getFfmpegBin(app.isPackaged);
  const deps = await checkDependencies(ytdlpBin, ffmpegBin);

  if (!deps.ytdlp.available) {
    dialog.showMessageBoxSync({
      type: "error",
      title: "Dependência não encontrada",
      message: "yt-dlp não foi encontrado no PATH.",
      detail:
        "Instale via:\n  pip install yt-dlp\n  ou\n  winget install yt-dlp\n\nReinicie o aplicativo após a instalação.",
      buttons: ["Fechar"],
    });
    app.quit();
    return;
  }

  // Configurar auto-update
  updateElectronApp({
    repo: config.update.repo,
    updateInterval: config.update.updateInterval,
  });

  downloadManager = new DownloadManager(ytdlpBin, ffmpegBin);
  downloadManager.onProgress((progress) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("download-progress", progress);
    }
  });

  const handlers = createHandlers({
    downloadManager,
    getMainWindow: () => mainWindow,
    app,
    dialog,
    shell,
  });
  Object.entries(handlers).forEach(([channel, handler]) => {
    ipcMain.handle(channel, handler);
  });

  createWindow();
  createMenu();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (!mainWindow) {
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
          click: () => app.quit(),
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
              title: `Sobre ${config.app.displayName}`,
              message: config.app.displayName,
              detail: `Versão ${config.version}\n\n${config.description}\n\nGitHub: ${config.repository}`,
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



