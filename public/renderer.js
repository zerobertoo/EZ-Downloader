// Estado da aplicação
const state = {
  currentUrl: "",
  selectedFormat: null,
  downloadPath: null,
  formats: [],
  videoData: null,
};

// Elementos do DOM
const elements = {
  urlInput: document.getElementById("urlInput"),
  fetchFormatsBtn: document.getElementById("fetchFormatsBtn"),
  loadingSection: document.getElementById("loadingSection"),
  formatsSection: document.getElementById("formatsSection"),
  formatSelect: document.getElementById("formatSelect"),
  inputSection: document.querySelector(".input-section"),
  downloadBtn: document.getElementById("downloadBtn"),
  selectPathBtn: document.getElementById("selectPathBtn"),
  downloadPath: document.getElementById("downloadPath"),
  progressSection: document.getElementById("progressSection"),
  successSection: document.getElementById("successSection"),
  errorSection: document.getElementById("errorSection"),
  cancelBtn: document.getElementById("cancelBtn"),
  retryBtn: document.getElementById("retryBtn"),
  resetBtn: document.getElementById("resetBtn"),
  newDownloadBtn: document.getElementById("newDownloadBtn"),
  openFolderBtn: document.getElementById("openFolderBtn"),
  progressFill: document.getElementById("progressFill"),
  progressText: document.getElementById("progressText"),
  progressPercent: document.getElementById("progressPercent"),
  videoInfo: document.getElementById("videoInfo"),
  videoTitle: document.getElementById("videoTitle"),
  videoDuration: document.getElementById("videoDuration"),
  videoSize: document.getElementById("videoSize"),
  formatInfo: document.getElementById("formatInfo"),
  errorText: document.getElementById("errorText"),
  successText: document.getElementById("successText"),
  version: document.getElementById("version"),
};

// Inicializar a aplicação
document.addEventListener("DOMContentLoaded", async () => {
  const version = await window.electronAPI.getVersion();
  elements.version.textContent = `v${version}`;

  // Event listeners
  elements.fetchFormatsBtn.addEventListener("click", handleFetchFormats);
  elements.formatSelect.addEventListener("change", handleFormatChange);
  elements.downloadBtn.addEventListener("click", handleDownload);
  elements.selectPathBtn.addEventListener("click", handleSelectPath);
  elements.cancelBtn.addEventListener("click", handleCancel);
  elements.retryBtn.addEventListener("click", handleRetry);
  elements.resetBtn.addEventListener("click", handleReset);
  elements.newDownloadBtn.addEventListener("click", handleReset);
  elements.openFolderBtn.addEventListener("click", handleOpenFolder);

  elements.urlInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") handleFetchFormats();
  });

  const downloadsPath = await window.electronAPI.getDownloadsPath();
  if (downloadsPath) {
    state.downloadPath = downloadsPath;
    updateDownloadPathDisplay();
  }

  showSection("input");
});

// Buscar formatos
async function handleFetchFormats() {
  const url = elements.urlInput.value.trim();
  if (!url || !isValidUrl(url)) {
    showError("Por favor, insira uma URL válida");
    return;
  }

  state.currentUrl = url;
  showSection("loading");

  try {
    const result = await window.electronAPI.getFormats(url);
    if (!result.success) throw new Error(result.error);

    state.formats = result.formats;
    populateFormatSelect();
    showSection("formats");
  } catch (error) {
    console.error(error);
    showError(`Erro ao buscar formatos: ${error.message}`);
    showSection("input");
  }
}

// Popular select de formatos
function populateFormatSelect() {
  elements.formatSelect.innerHTML = "";
  state.formats.forEach((format) => {
    const option = document.createElement("option");
    option.value = format.id;
    option.textContent = format.label;
    option.dataset.format = JSON.stringify(format);
    elements.formatSelect.appendChild(option);
  });
  if (state.formats.length > 0) {
    elements.formatSelect.value = state.formats[0].id;
    handleFormatChange();
  }
}

function handleFormatChange() {
  const selectedOption = elements.formatSelect.selectedOptions[0];
  if (selectedOption?.dataset.format) {
    state.selectedFormat = JSON.parse(selectedOption.dataset.format);
    updateFormatInfo();
  }
}

function updateFormatInfo() {
  if (!state.selectedFormat) return;

  const format = state.selectedFormat;
  let info = "";
  if (format.type === "best")
    info = "Melhor qualidade disponível (vídeo + áudio)";
  else if (format.type === "video") {
    info = `Vídeo ${format.height}p • ${format.fps} fps`;
    if (format.filesize) info += ` • ${formatFileSize(format.filesize)}`;
  } else if (format.type === "audio") {
    info = `Áudio ${format.ext.toUpperCase()}`;
    if (format.filesize) info += ` • ${formatFileSize(format.filesize)}`;
  }
  elements.formatInfo.textContent = info;
}

// Selecionar caminho de download
async function handleSelectPath() {
  const path = await window.electronAPI.selectDownloadPath();
  if (path) {
    state.downloadPath = path;
    updateDownloadPathDisplay();
  }
}

function updateDownloadPathDisplay() {
  elements.downloadPath.value = state.downloadPath || "";
}

// Iniciar download
async function handleDownload() {
  if (!state.selectedFormat || !state.downloadPath) {
    showError("Selecione formato e diretório de download");
    return;
  }

  showSection("progress");
  elements.progressFill.style.width = "0%";
  elements.progressPercent.textContent = "0%";
  elements.progressText.textContent = "Iniciando download...";

  try {
    const result = await window.electronAPI.startDownload(
      state.currentUrl,
      state.selectedFormat.id,
      state.downloadPath
    );
    if (!result.success) throw new Error(result.error);

    // Atualizar progresso para 100% direto (substituir simulação)
    updateProgress(100);
    showSuccess(result.result);
  } catch (error) {
    console.error(error);
    showError(`Erro no download: ${error.message}`);
    showSection("error");
  }
}

function updateProgress(percent) {
  const clamped = Math.min(Math.max(percent, 0), 100);
  elements.progressFill.style.width = `${clamped}%`;
  elements.progressPercent.textContent = `${Math.round(clamped)}%`;
  if (clamped < 100) elements.progressText.textContent = "Baixando...";
  else elements.progressText.textContent = "Download concluído!";
}

// Cancelar download
function handleCancel() {
  showSection("formats");
}

// Mostrar sucesso
function showSuccess(result) {
  elements.successText.textContent = `Arquivo salvo em: ${result.path}`;
  showSection("success");
}

// Mostrar erro
function showError(message) {
  elements.errorText.textContent = message;
}

// Retry
function handleRetry() {
  showSection("formats");
}

// Reset
async function handleReset() {
  state.currentUrl = "";
  state.selectedFormat = null;
  state.formats = [];
  elements.urlInput.value = "";
  elements.formatSelect.innerHTML = "";

  const downloadsPath = await window.electronAPI.getDownloadsPath();
  if (downloadsPath) {
    state.downloadPath = downloadsPath;
    updateDownloadPathDisplay();
  }

  showSection("input");
}

// Abrir pasta
async function handleOpenFolder() {
  if (state.downloadPath) {
    window.electronAPI.openPath(state.downloadPath).catch((err) => {
      console.error(err);
      showError("Erro ao abrir pasta de downloads");
    });
  }
}

// Mostrar seção
function showSection(section) {
  document
    .querySelectorAll("section")
    .forEach((s) => s.classList.add("hidden"));
  switch (section) {
    case "input":
      elements.inputSection.classList.remove("hidden");
      break;
    case "loading":
      elements.loadingSection.classList.remove("hidden");
      break;
    case "formats":
      elements.formatsSection.classList.remove("hidden");
      break;
    case "progress":
      elements.progressSection.classList.remove("hidden");
      break;
    case "success":
      elements.successSection.classList.remove("hidden");
      break;
    case "error":
      elements.errorSection.classList.remove("hidden");
      break;
  }
}

// Validação de URL
function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

// Formatar tamanho de arquivo
function formatFileSize(bytes) {
  if (!bytes) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}
