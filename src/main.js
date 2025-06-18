const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const { updateElectronApp } = require("update-electron-app");

updateElectronApp();

function createWindow() {
  const win = new BrowserWindow({
    width: 600,
    height: 700,
    frame: false,
    resizable: false,
    icon: path.join(__dirname, "assets", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  win.loadFile(path.join(__dirname, "renderer/index.html"));
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// Seleção de pasta
ipcMain.handle("select-folder", async () => {
  const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
  return result.canceled ? null : result.filePaths[0];
});

// Função para executar yt-dlp e enviar logs
function runYtDlp(commandArgs, event) {
  const process = spawn("yt-dlp", commandArgs);

  process.stdout.on("data", (data) => {
    event.sender.send("log", data.toString());
  });

  process.stderr.on("data", (data) => {
    event.sender.send("log", data.toString());
  });

  process.on("close", (code) => {
    event.sender.send(
      "log",
      `✅ Download concluído! Código de saída: ${code}\n`
    );
  });
}

// Download vídeo
ipcMain.on("download-video", (event, { link, output }) => {
  const args = [
    "-f",
    "bv*+ba",
    "--merge-output-format",
    "mp4",
    "-o",
    `${output}/%(title)s.%(ext)s`,
    link,
  ];
  runYtDlp(args, event);
});

// Download áudio
ipcMain.on("download-audio", (event, { link, output }) => {
  const args = [
    "-f",
    "bestaudio",
    "--extract-audio",
    "--audio-format",
    "mp3",
    "-o",
    `${output}/%(title)s.%(ext)s`,
    link,
  ];
  runYtDlp(args, event);
});

// Controles da janela
ipcMain.on("window-control", (event, action) => {
  const window = BrowserWindow.getFocusedWindow();
  if (action === "minimize") window.minimize();
  if (action === "close") window.close();
});
