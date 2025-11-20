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

app.on("ready", () => {
  // Configurar auto-update
  updateElectronApp({
    repo: config.update.repo,
    updateInterval: config.update.updateInterval,
  });

  downloadManager = new DownloadManager();
  downloadManager.onProgress((progress) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("download-progress", progress);
    }
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

// IPC Handlers
ipcMain.handle("get-version", () => {
  return config.version;
});

ipcMain.handle("get-app-info", () => {
  return {
    version: config.version,
    name: config.app.displayName,
    description: config.description,
    author: config.author,
    repository: config.repository,
  };
});

ipcMain.handle("get-formats", async (_, url) => {
  try {
    // Validação básica de URL
    if (!url || typeof url !== "string") {
      return {
        success: false,
        error: "URL inválida",
      };
    }

    const formats = await downloadManager.getAvailableFormats(url);
    return { success: true, formats };
  } catch (error) {
    console.error("Erro ao buscar formatos:", error);
    return {
      success: false,
      error: error.message || "Erro desconhecido ao buscar formatos",
    };
  }
});

ipcMain.handle("start-download", async (_, { url, format, outputPath }) => {
  try {
    // Validações
    if (!url || !format || !outputPath) {
      return {
        success: false,
        error: "URL, formato ou caminho de saída inválido",
      };
    }

    const result = await downloadManager.download(url, format, outputPath);
    return { success: true, result };
  } catch (error) {
    console.error("Erro no download:", error);
    return {
      success: false,
      error: error.message || "Erro desconhecido no download",
    };
  }
});

ipcMain.handle("select-download-path", async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"],
    });
    return result.filePaths[0] || null;
  } catch (error) {
    console.error("Erro ao selecionar diretório:", error);
    return null;
  }
});

ipcMain.handle("open-path", async (_, filePath) => {
  try {
    if (!filePath || typeof filePath !== "string") {
      return { success: false, error: "Caminho inválido" };
    }

    await shell.openPath(filePath);
    return { success: true };
  } catch (error) {
    console.error("Erro ao abrir caminho:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle("getDownloadsPath", () => {
  try {
    return app.getPath("downloads");
  } catch (error) {
    console.error("Erro ao obter caminho de downloads:", error);
    return null;
  }
});

ipcMain.handle("cancel-download", () => {
  try {
    downloadManager.cancelDownload();
    return { success: true };
  } catch (error) {
    console.error("Erro ao cancelar download:", error);
    return { success: false, error: error.message };
  }
});


