"use strict";

const state = {
  currentUrl: "",
  selectedFormat: null,
  downloadPath: null,
  formats: [],
  isDownloading: false,
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
  formatInfo: document.getElementById("formatInfo"),
  errorText: document.getElementById("errorText"),
  successText: document.getElementById("successText"),
  version: document.getElementById("version"),
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
    showError("Erro ao inicializar a aplicação");
  }
});

/**
 * Buscar formatos disponíveis
 */
async function handleFetchFormats() {
  const url = elements.urlInput?.value?.trim();

  if (!url) {
    showError("Por favor, insira uma URL");
    return;
  }

  if (!isValidUrl(url)) {
    showError("URL inválida. Insira uma URL completa (ex: https://youtube.com/...)");
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
      throw new Error("Nenhum formato disponível para este vídeo");
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
  if (!elements.formatSelect) return;

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
    showError("Erro ao selecionar diretório");
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
    showError("Por favor, selecione um formato");
    return;
  }

  if (!state.downloadPath) {
    showError("Por favor, selecione um diretório de download");
    return;
  }

  if (state.isDownloading) {
    showError("Um download já está em andamento");
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
    showError(`Erro no download: ${error.message}`);
    showSection("error");
  } finally {
    state.isDownloading = false;
  }
}

/**
 * Atualizar progresso do download
 */
function updateProgress(percent) {
  const clamped = Math.min(Math.max(percent, 0), 100);

  if (elements.progressFill) {
    elements.progressFill.style.width = `${clamped}%`;
  }

  if (elements.progressPercent) {
    elements.progressPercent.textContent = `${Math.round(clamped)}%`;
  }

  if (elements.progressText) {
    if (clamped < 30) {
      elements.progressText.textContent = "Iniciando download...";
    } else if (clamped < 70) {
      elements.progressText.textContent = "Baixando...";
    } else if (clamped < 100) {
      elements.progressText.textContent = "Finalizando...";
    } else {
      elements.progressText.textContent = "Download concluído!";
    }
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
    showError("Erro ao cancelar download");
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

    if (elements.urlInput) {
      elements.urlInput.value = "";
    }

    if (elements.formatSelect) {
      elements.formatSelect.innerHTML = "";
    }

    const downloadsPath = await window.electronAPI.getDownloadsPath();
    if (downloadsPath) {
      state.downloadPath = downloadsPath;
      updateDownloadPathDisplay();
    }

    showSection("input");
  } catch (error) {
    console.error("Erro ao resetar:", error);
    showError("Erro ao resetar a aplicação");
  }
}

/**
 * Abrir pasta de download
 */
async function handleOpenFolder() {
  if (!state.downloadPath) {
    showError("Nenhum caminho de download definido");
    return;
  }

  try {
    const result = await window.electronAPI.openPath(state.downloadPath);
    if (!result.success) {
      throw new Error(result.error || "Erro desconhecido");
    }
  } catch (error) {
    console.error("Erro ao abrir pasta:", error);
    showError("Erro ao abrir pasta de downloads");
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
