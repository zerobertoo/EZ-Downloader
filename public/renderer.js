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
  // Carregar versão
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

  // Permitir Enter para buscar formatos
  elements.urlInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      handleFetchFormats();
    }
  });

  // Definir caminho padrão de Downloads do sistema
  const downloadsPath = await window.electronAPI.getDownloadsPath();
  if (downloadsPath) {
    state.downloadPath = downloadsPath;
    updateDownloadPathDisplay();
  }

  // Mostrar a seção inicial
  showSection("input");
});

/**
 * Buscar formatos disponíveis
 */
async function handleFetchFormats() {
  const url = elements.urlInput.value.trim();

  if (!url) {
    showError("Por favor, insira uma URL válida");
    return;
  }

  if (!isValidUrl(url)) {
    showError(
      "URL inválida. Por favor, insira uma URL completa (ex: https://youtube.com/...)"
    );
    return;
  }

  state.currentUrl = url;

  // Mostrar loading
  showSection("loading");

  try {
    const result = await window.electronAPI.getFormats(url);

    if (!result.success) {
      throw new Error(result.error);
    }

    state.formats = result.formats;
    populateFormatSelect();
    showSection("formats");
  } catch (error) {
    console.error("Erro ao buscar formatos:", error);
    showError(`Erro ao buscar formatos: ${error.message}`);
    showSection("input");
  }
}

/**
 * Popular o select de formatos
 */
function populateFormatSelect() {
  elements.formatSelect.innerHTML = "";

  state.formats.forEach((format) => {
    const option = document.createElement("option");
    option.value = format.id;
    option.textContent = format.label;
    option.dataset.format = JSON.stringify(format);
    elements.formatSelect.appendChild(option);
  });

  // Selecionar o primeiro formato por padrão
  if (state.formats.length > 0) {
    elements.formatSelect.value = state.formats[0].id;
    handleFormatChange();
  }
}

/**
 * Lidar com mudança de formato
 */
function handleFormatChange() {
  const selectedOption = elements.formatSelect.selectedOptions[0];
  if (selectedOption && selectedOption.dataset.format) {
    state.selectedFormat = JSON.parse(selectedOption.dataset.format);
    updateFormatInfo();
  }
}

/**
 * Atualizar informações do formato
 */
function updateFormatInfo() {
  if (!state.selectedFormat) return;

  const format = state.selectedFormat;
  let info = "";

  if (format.type === "best") {
    info = "Melhor qualidade disponível (vídeo + áudio)";
  } else if (format.type === "video") {
    info = `Vídeo ${format.height}p • ${format.fps} fps`;
    if (format.filesize) {
      info += ` • ${formatFileSize(format.filesize)}`;
    }
  } else if (format.type === "audio") {
    info = `Áudio ${format.ext.toUpperCase()}`;
    if (format.filesize) {
      info += ` • ${formatFileSize(format.filesize)}`;
    }
  }

  elements.formatInfo.textContent = info;
}

/**
 * Selecionar caminho de download
 */
async function handleSelectPath() {
  const path = await window.electronAPI.selectDownloadPath();
  if (path) {
    state.downloadPath = path;
    updateDownloadPathDisplay();
  }
}

/**
 * Atualizar exibição do caminho de download
 */
function updateDownloadPathDisplay() {
  if (state.downloadPath) {
    elements.downloadPath.value = state.downloadPath;
  }
}

/**
 * Iniciar download
 */
async function handleDownload() {
  if (!state.selectedFormat) {
    showError("Por favor, selecione um formato");
    return;
  }

  if (!state.downloadPath) {
    showError("Por favor, selecione um diretório de download");
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

    if (!result.success) {
      throw new Error(result.error);
    }

    // Simular progresso
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 30;
      if (progress > 90) progress = 90;
      updateProgress(progress);

      if (progress >= 90) {
        clearInterval(interval);
      }
    }, 500);

    // Aguardar um pouco e depois mostrar sucesso
    setTimeout(() => {
      clearInterval(interval);
      updateProgress(100);
      showSuccess(result.result);
    }, 3000);
  } catch (error) {
    console.error("Erro no download:", error);
    showError(`Erro no download: ${error.message}`);
    showSection("error");
  }
}

/**
 * Atualizar progresso do download
 */
function updateProgress(percent) {
  const clampedPercent = Math.min(Math.max(percent, 0), 100);
  elements.progressFill.style.width = `${clampedPercent}%`;
  elements.progressPercent.textContent = `${Math.round(clampedPercent)}%`;

  if (clampedPercent < 30) {
    elements.progressText.textContent = "Baixando vídeo...";
  } else if (clampedPercent < 70) {
    elements.progressText.textContent = "Processando arquivo...";
  } else if (clampedPercent < 100) {
    elements.progressText.textContent = "Finalizando...";
  } else {
    elements.progressText.textContent = "Download concluído!";
  }
}

/**
 * Cancelar download
 */
function handleCancel() {
  showSection("formats");
}

/**
 * Mostrar sucesso
 */
function showSuccess(result) {
  elements.successText.textContent = `Arquivo salvo em: ${result.path}`;
  showSection("success");
}

/**
 * Mostrar erro
 */
function showError(message) {
  elements.errorText.textContent = message;
}

/**
 * Lidar com retry
 */
function handleRetry() {
  showSection("formats");
}

/**
 * Lidar com reset
 */
async function handleReset() {
  state.currentUrl = "";
  state.selectedFormat = null;
  state.formats = [];
  elements.urlInput.value = "";
  elements.formatSelect.innerHTML = "";

  // Recarregar caminho padrão de Downloads
  const downloadsPath = await window.electronAPI.getDownloadsPath();
  if (downloadsPath) {
    state.downloadPath = downloadsPath;
    updateDownloadPathDisplay();
  }

  showSection("input");
}

/**
 * Abrir pasta de download
 */
async function handleOpenFolder() {
  if (state.downloadPath) {
    window.electronAPI.openPath(state.downloadPath).catch((err) => {
      console.error("Erro ao abrir pasta:", err);
      showError("Erro ao abrir pasta de downloads");
    });
  }
}

/**
 * Mostrar seção específica
 */
function showSection(section) {
  // Esconder todas as seções
  document.querySelectorAll("section").forEach((s) => {
    s.classList.add("hidden");
  });

  // Mostrar seção específica
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

/**
 * Validar URL
 */
function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Formatar tamanho de arquivo
 */
function formatFileSize(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

/**
 * Formatar duração em segundos para HH:MM:SS
 */
function formatDuration(seconds) {
  if (!seconds) return "Desconhecida";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  }
  return `${minutes}m ${secs}s`;
}
