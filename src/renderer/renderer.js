const linkInput = document.getElementById("linkInput");
const folderInput = document.getElementById("folderInput");
const selectFolderBtn = document.getElementById("selectFolderBtn");
const downloadVideoBtn = document.getElementById("downloadVideoBtn");
const downloadAudioBtn = document.getElementById("downloadAudioBtn");
const logOutput = document.getElementById("logOutput");
const minimizeBtn = document.getElementById("minimize");
const closeBtn = document.getElementById("close");

selectFolderBtn.addEventListener("click", async () => {
  const folder = await window.electronAPI.selectFolder();
  if (folder) {
    folderInput.value = folder;
  }
});

downloadVideoBtn.addEventListener("click", () => {
  startDownload("video");
});

downloadAudioBtn.addEventListener("click", () => {
  startDownload("audio");
});

function startDownload(type) {
  const link = linkInput.value.trim();
  const folder = folderInput.value.trim();
  if (!link || !folder) {
    appendLog("⚠️ Informe o link e selecione uma pasta.\n");
    return;
  }
  appendLog(
    `▶️ Iniciando download ${type === "video" ? "de vídeo" : "de áudio"}...\n`
  );
  if (type === "video") {
    window.electronAPI.downloadVideo(link, folder);
  } else {
    window.electronAPI.downloadAudio(link, folder);
  }
}

window.electronAPI.onLog((data) => {
  appendLog(data);
});

minimizeBtn.addEventListener("click", () => {
  window.electronAPI.windowControl("minimize");
});

closeBtn.addEventListener("click", () => {
  window.electronAPI.windowControl("close");
});

function appendLog(message) {
  logOutput.value += message;
  logOutput.scrollTop = logOutput.scrollHeight;
}
