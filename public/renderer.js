"use strict";

const UI_STRINGS = {
  errorNoUrl: "Por favor, insira uma URL",
  errorInvalidUrl: "URL inválida. Insira uma URL completa (ex: https://youtube.com/...)",
  errorNoFormats: "Nenhum formato disponível para este vídeo",
  errorFetchFormats: "Erro ao buscar formatos:",
  errorNoFormat: "Por favor, selecione um formato",
  errorNoPath: "Por favor, selecione um diretório de download",
  errorDownloadActive: "Um download já está em andamento",
  errorSelectDir: "Erro ao selecionar diretório",
  errorOpenFolder: "Erro ao abrir pasta de downloads",
  errorReset: "Erro ao resetar a aplicação",
  errorCancel: "Erro ao cancelar download",
  errorNoDownloadPath: "Nenhum caminho de download definido",
  errorDownload: "Erro no download:",
  errorInit: "Erro ao inicializar a aplicação",
  progressStarting: "Iniciando download...",
  progressDownloading: "Baixando...",
  progressFinalizing: "Finalizando...",
  progressComplete: "Download concluído!",
};

const state = {
  currentUrl: "",
  selectedFormat: null,
  downloadPath: null,
  formats: [],
  isDownloading: false,
  videoMetadata: { title: null, thumbnail: null, uploader: null },
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
  progressStats: document.getElementById("progressStats"),
  formatInfo: document.getElementById("formatInfo"),
  errorText: document.getElementById("errorText"),
  successText: document.getElementById("successText"),
  version: document.getElementById("version"),
  videoCard: document.getElementById("videoCard"),
  videoThumbnail: document.getElementById("videoThumbnail"),
  videoTitle: document.getElementById("videoTitle"),
  videoUploader: document.getElementById("videoUploader"),
};

// Inicializar a aplicação
document.addEventListener("DOMContentLoaded", async () => {
  try {
    // Carregar versão
    const version = await window.electronAPI.getVersion();
    if (elements.version) {
      elements.version.textContent = `v${version}`;
    }

    // Event listeners
    elements.fetchFormatsBtn?.addEventListener("click", handleFetchFormats);
    elements.formatSelect?.addEventListener("change", handleFormatChange);
    elements.downloadBtn?.addEventListener("click", handleDownload);
    elements.selectPathBtn?.addEventListener("click", handleSelectPath);
    elements.cancelBtn?.addEventListener("click", handleCancel);
    elements.retryBtn?.addEventListener("click", handleRetry);
    elements.resetBtn?.addEventListener("click", handleReset);
    elements.newDownloadBtn?.addEventListener("click", handleReset);
    elements.openFolderBtn?.addEventListener("click", handleOpenFolder);

    // Enter para buscar formatos
    elements.urlInput?.addEventListener("keypress", (e) => {
      if (e.key === "Enter") handleFetchFormats();
    });

    // Obter caminho padrão de downloads
    const downloadsPath = await window.electronAPI.getDownloadsPath();
    if (downloadsPath) {
      state.downloadPath = downloadsPath;
      updateDownloadPathDisplay();
    }

    // Listener para progresso de download
    window.electronAPI.onDownloadProgress((progress) => {
      updateProgress(progress);
    });

    showSection("input");
  } catch (error) {
    console.error("Erro ao inicializar:", error);
    showError(UI_STRINGS.errorInit);
  }
});

/**
 * Buscar formatos disponíveis
 */
async function handleFetchFormats() {
  const url = elements.urlInput?.value?.trim();

  if (!url) {
    showError(UI_STRINGS.errorNoUrl);
    return;
  }

  if (!isValidUrl(url)) {
    showError(UI_STRINGS.errorInvalidUrl);
    return;
  }

  state.currentUrl = url;
  showSection("loading");

  try {
    const result = await window.electronAPI.getFormats(url);

    if (!result.success) {
      throw new Error(result.error || "Erro desconhecido");
    }

    if (!result.formats || result.formats.length === 0) {
      throw new Error(UI_STRINGS.errorNoFormats);
    }

    state.formats = result.formats;
    state.videoMetadata = {
      title: result.title || null,
      thumbnail: result.thumbnail || null,
      uploader: result.uploader || null,
    };
    populateFormatSelect();
    displayVideoMetadata();
    showSection("formats");
  } catch (error) {
    console.error("Erro ao buscar formatos:", error);
    showError(`${UI_STRINGS.errorFetchFormats} ${error.message}`);
    showSection("input");
  }
}

/**
 * Exibir card com thumbnail, título e canal do vídeo
 */
function displayVideoMetadata() {
  const { title, thumbnail, uploader } = state.videoMetadata;

  if (elements.videoTitle) elements.videoTitle.textContent = title || "Vídeo";
  if (elements.videoUploader) elements.videoUploader.textContent = uploader ? `Por: ${uploader}` : "";

  if (elements.videoThumbnail) {
    if (thumbnail) {
      elements.videoThumbnail.src = thumbnail;
      elements.videoThumbnail.onerror = showThumbnailPlaceholder;
    } else {
      showThumbnailPlaceholder();
    }
  }

  elements.videoCard?.classList.remove("hidden");
}

function showThumbnailPlaceholder() {
  if (!elements.videoThumbnail) return;
  elements.videoThumbnail.src =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 180'%3E%3Crect fill='%23333' width='320' height='180'/%3E%3Cpath fill='%23666' d='M145 85l45 27v-54z'/%3E%3C/svg%3E";
}

/**
 * Popular o select de formatos
 */
function populateFormatSelect() {
  if (!elements.formatSelect) return;

  elements.formatSelect.innerHTML = "";

  state.formats.forEach((format) => {
    const option = document.createElement("option");
    option.value = format.id;
    const sizeStr = format.filesize ? ` — ${formatFileSize(format.filesize)}` : "";
    option.textContent = format.label + sizeStr;
    option.dataset.format = JSON.stringify(format);
    elements.formatSelect.appendChild(option);
  });

  if (state.formats.length > 0) {
    elements.formatSelect.value = state.formats[0].id;
    handleFormatChange();
  }
}

/**
 * Lidar com mudança de formato
 */
function handleFormatChange() {
  const selectedOption = elements.formatSelect?.selectedOptions[0];
  if (selectedOption?.dataset.format) {
    state.selectedFormat = JSON.parse(selectedOption.dataset.format);
    updateFormatInfo();
  }
}

/**
 * Atualizar informações do formato
 */
function updateFormatInfo() {
  if (!state.selectedFormat || !elements.formatInfo) return;

  const format = state.selectedFormat;
  let info = "";

  if (format.type === "best") {
    info = "Melhor qualidade disponível (vídeo + áudio)";
  } else if (format.type === "combined") {
    info = `${format.ext.toUpperCase()} - ${format.height}p (Vídeo + Áudio)`;
    if (format.filesize) info += ` • ${formatFileSize(format.filesize)}`;
  } else if (format.type === "video") {
    info = `${format.ext.toUpperCase()} - ${format.height}p (Vídeo)`;
    if (format.fps) info += ` • ${format.fps} fps`;
    if (format.filesize) info += ` • ${formatFileSize(format.filesize)}`;
  } else if (format.type === "audio") {
    info = `${format.ext.toUpperCase()} - Áudio`;
    if (format.abr) info += ` • ${format.abr} kbps`;
    if (format.filesize) info += ` • ${formatFileSize(format.filesize)}`;
  }

  elements.formatInfo.textContent = info;
}

/**
 * Selecionar caminho de download
 */
async function handleSelectPath() {
  try {
    const path = await window.electronAPI.selectDownloadPath();
    if (path) {
      state.downloadPath = path;
      updateDownloadPathDisplay();
    }
  } catch (error) {
    console.error("Erro ao selecionar diretório:", error);
    showError(UI_STRINGS.errorSelectDir);
  }
}

/**
 * Atualizar exibição do caminho de download
 */
function updateDownloadPathDisplay() {
  if (elements.downloadPath) {
    elements.downloadPath.value = state.downloadPath || "";
  }
}

/**
 * Iniciar download
 */
async function handleDownload() {
  if (!state.selectedFormat) {
    showError(UI_STRINGS.errorNoFormat);
    return;
  }

  if (!state.downloadPath) {
    showError(UI_STRINGS.errorNoPath);
    return;
  }

  if (state.isDownloading) {
    showError(UI_STRINGS.errorDownloadActive);
    return;
  }

  state.isDownloading = true;
  showSection("progress");
  resetProgress();

  try {
    const result = await window.electronAPI.startDownload(
      state.currentUrl,
      state.selectedFormat.id,
      state.downloadPath
    );

    if (!result.success) {
      throw new Error(result.error || "Erro desconhecido");
    }

    // Aguardar um pouco para garantir que o progresso chegou a 100%
    await new Promise((resolve) => setTimeout(resolve, 500));
    updateProgress(100);
    showSuccess(result.result);
  } catch (error) {
    console.error("Erro no download:", error);
    showError(`${UI_STRINGS.errorDownload} ${error.message}`);
    showSection("error");
  } finally {
    state.isDownloading = false;
  }
}

/**
 * Atualizar progresso do download
 */
function updateProgress(data) {
  const percent = typeof data === "object" ? data.percent : data;
  const clamped = Math.min(Math.max(percent, 0), 100);

  if (elements.progressFill) {
    elements.progressFill.style.width = `${clamped}%`;
  }

  if (elements.progressPercent) {
    elements.progressPercent.textContent = `${Math.round(clamped)}%`;
  }

  if (elements.progressText) {
    if (clamped < 30) {
      elements.progressText.textContent = UI_STRINGS.progressStarting;
    } else if (clamped < 70) {
      elements.progressText.textContent = UI_STRINGS.progressDownloading;
    } else if (clamped < 100) {
      elements.progressText.textContent = UI_STRINGS.progressFinalizing;
    } else {
      elements.progressText.textContent = UI_STRINGS.progressComplete;
    }
  }

  if (elements.progressStats && typeof data === "object") {
    const parts = [];
    if (data.speed) parts.push(data.speed);
    if (data.eta) parts.push(`ETA ${data.eta}`);
    elements.progressStats.textContent = parts.join(" • ");
  } else if (elements.progressStats && clamped >= 100) {
    elements.progressStats.textContent = "";
  }
}

/**
 * Resetar progresso
 */
function resetProgress() {
  updateProgress(0);
}

/**
 * Cancelar download
 */
async function handleCancel() {
  try {
    await window.electronAPI.cancelDownload();
    state.isDownloading = false;
    showSection("formats");
  } catch (error) {
    console.error("Erro ao cancelar:", error);
    showError(UI_STRINGS.errorCancel);
  }
}

/**
 * Mostrar sucesso
 */
function showSuccess(result) {
  if (elements.successText) {
    elements.successText.textContent = `Arquivo salvo em: ${result.path}`;
  }
  showSection("success");
}

/**
 * Mostrar erro
 */
function showError(message) {
  if (elements.errorText) {
    elements.errorText.textContent = message || "Erro desconhecido";
  }
}

/**
 * Retry
 */
function handleRetry() {
  showSection("formats");
}

/**
 * Reset
 */
async function handleReset() {
  try {
    state.currentUrl = "";
    state.selectedFormat = null;
    state.formats = [];
    state.isDownloading = false;
    state.videoMetadata = { title: null, thumbnail: null, uploader: null };

    if (elements.urlInput) elements.urlInput.value = "";
    if (elements.formatSelect) elements.formatSelect.innerHTML = "";

    if (elements.videoCard) elements.videoCard.classList.add("hidden");
    if (elements.videoThumbnail) elements.videoThumbnail.src = "";
    if (elements.videoTitle) elements.videoTitle.textContent = "";
    if (elements.videoUploader) elements.videoUploader.textContent = "";

    const downloadsPath = await window.electronAPI.getDownloadsPath();
    if (downloadsPath) {
      state.downloadPath = downloadsPath;
      updateDownloadPathDisplay();
    }

    showSection("input");
  } catch (error) {
    console.error("Erro ao resetar:", error);
    showError(UI_STRINGS.errorReset);
  }
}

/**
 * Abrir pasta de download
 */
async function handleOpenFolder() {
  if (!state.downloadPath) {
    showError(UI_STRINGS.errorNoDownloadPath);
    return;
  }

  try {
    const result = await window.electronAPI.openPath(state.downloadPath);
    if (!result.success) {
      throw new Error(result.error || "Erro desconhecido");
    }
  } catch (error) {
    console.error("Erro ao abrir pasta:", error);
    showError(UI_STRINGS.errorOpenFolder);
  }
}

/**
 * Mostrar seção específica
 */
function showSection(section) {
  document.querySelectorAll("section").forEach((s) => {
    s.classList.add("hidden");
  });

  switch (section) {
    case "input":
      elements.inputSection?.classList.remove("hidden");
      break;
    case "loading":
      elements.loadingSection?.classList.remove("hidden");
      break;
    case "formats":
      elements.formatsSection?.classList.remove("hidden");
      break;
    case "progress":
      elements.progressSection?.classList.remove("hidden");
      break;
    case "success":
      elements.successSection?.classList.remove("hidden");
      break;
    case "error":
      elements.errorSection?.classList.remove("hidden");
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
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}
