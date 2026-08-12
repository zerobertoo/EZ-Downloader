import { bridge, type FormatOption, type DownloadProgress, type DebugLine } from "./bridge";
import { THEMES, initTheme, setTheme, currentThemeId } from "./theme";
import { initMode, setMode, currentMode, type AppMode } from "./mode";

initTheme();
initMode();

const UI_STRINGS = {
  errorNoUrl: "Por favor, insira uma URL",
  errorInvalidUrl: "URL inválida. Insira uma URL completa (ex: https://youtube.com/...)",
  errorNoFormats: "Nenhum formato disponível para este vídeo",
  errorFetchFormats: "Erro ao buscar formatos:",
  errorNoPath: "Por favor, selecione um diretório de download",
  errorIncompleteSection: "Preencha início e fim do corte, ou deixe os dois em branco",
  errorInvalidSection: "Formato de tempo inválido — use HH:MM:SS (ex: 00:01:30)",
  hintPlaylist: "URL de playlist detectada — todos os itens serão baixados de uma vez",
  errorSelectDir: "Erro ao selecionar diretório",
  errorOpenFolder: "Erro ao abrir pasta de downloads",
  errorCancel: "Erro ao cancelar download",
  errorInit: "Erro ao inicializar a aplicação",
  hintUrlChanged: "URL alterada — aperte Buscar para carregar este vídeo",
  progressStarting: "Iniciando download...",
  progressDownloading: "Baixando...",
  progressFinalizing: "Finalizando...",
  progressComplete: "Download concluído!",
  bannerSuccessTitle: "Download concluído!",
  bannerErrorTitle: "Erro no download",
};

interface VideoMetadata {
  title: string | null;
  thumbnail: string | null;
  uploader: string | null;
}

/**
 * Fase do fluxo. Substitui as antigas seções mutuamente exclusivas: a tela é
 * única e progressiva, e cada região aparece conforme a fase.
 */
type Phase = "idle" | "fetching" | "ready" | "downloading" | "done" | "failed";

const DEBUG_LOG_MAX_LINES = 500;
const PATH_STORAGE_KEY = "ez-download-path";
/** Aceita MM:SS ou HH:MM:SS — mesma sintaxe do --download-sections do yt-dlp. */
const TIME_PATTERN = /^\d{1,2}:\d{2}(:\d{2})?$/;

const state = {
  phase: "idle" as Phase,
  currentUrl: "",
  selectedFormat: null as FormatOption | null,
  downloadPath: null as string | null,
  formats: [] as FormatOption[],
  videoMetadata: { title: null, thumbnail: null, uploader: null } as VideoMetadata,
  quickFormat: "mp4" as "mp4" | "mp3",
  nerdMode: false,
  debugLines: [] as { stream: "stdout" | "stderr"; text: string }[],
  /** Evita que a rejeição do processo morto pelo cancelamento vire banner de erro. */
  cancelRequested: false,
};

const elements = {
  app: document.getElementById("app"),
  urlInput: document.getElementById("urlInput") as HTMLInputElement | null,
  playlistHint: document.getElementById("playlistHint"),
  fetchFormatsBtn: document.getElementById("fetchFormatsBtn") as HTMLButtonElement | null,
  urlError: document.getElementById("urlError"),
  loadingRegion: document.getElementById("loadingRegion"),
  videoCard: document.getElementById("videoCard"),
  videoThumbnail: document.getElementById("videoThumbnail") as HTMLImageElement | null,
  videoTitle: document.getElementById("videoTitle"),
  videoUploader: document.getElementById("videoUploader"),
  configCard: document.getElementById("configCard"),
  formatSelect: document.getElementById("formatSelect") as HTMLSelectElement | null,
  formatInfo: document.getElementById("formatInfo"),
  downloadPath: document.getElementById("downloadPath") as HTMLInputElement | null,
  selectPathBtn: document.getElementById("selectPathBtn") as HTMLButtonElement | null,
  pathError: document.getElementById("pathError"),
  downloadBtn: document.getElementById("downloadBtn") as HTMLButtonElement | null,
  progressRegion: document.getElementById("progressRegion"),
  progressFill: document.getElementById("progressFill") as HTMLElement | null,
  progressText: document.getElementById("progressText"),
  progressPercent: document.getElementById("progressPercent"),
  progressStats: document.getElementById("progressStats"),
  cancelBtn: document.getElementById("cancelBtn") as HTMLButtonElement | null,
  outcomeBanner: document.getElementById("outcomeBanner"),
  bannerTitle: document.getElementById("bannerTitle"),
  bannerText: document.getElementById("bannerText"),
  openFolderBtn: document.getElementById("openFolderBtn") as HTMLButtonElement | null,
  retryBtn: document.getElementById("retryBtn") as HTMLButtonElement | null,
  version: document.getElementById("version"),
  themeToggleBtn: document.getElementById("themeToggleBtn") as HTMLButtonElement | null,
  themePopover: document.getElementById("themePopover"),
  modeToggleBtn: document.getElementById("modeToggleBtn") as HTMLButtonElement | null,
  modeToggleLabel: document.getElementById("modeToggleLabel"),
  quickMp4Btn: document.getElementById("quickMp4Btn") as HTMLButtonElement | null,
  quickMp3Btn: document.getElementById("quickMp3Btn") as HTMLButtonElement | null,
  quickDownloadBtn: document.getElementById("quickDownloadBtn") as HTMLButtonElement | null,
  sectionStart: document.getElementById("sectionStart") as HTMLInputElement | null,
  sectionEnd: document.getElementById("sectionEnd") as HTMLInputElement | null,
  sectionError: document.getElementById("sectionError"),
  subLangsCheckbox: document.getElementById("subLangsCheckbox") as HTMLInputElement | null,
  subLangsInput: document.getElementById("subLangsInput") as HTMLInputElement | null,
  extraArgsInput: document.getElementById("extraArgsInput") as HTMLInputElement | null,
  nerdModeBtn: document.getElementById("nerdModeBtn") as HTMLButtonElement | null,
  debugPanel: document.getElementById("debugPanel"),
  debugCommand: document.getElementById("debugCommand"),
  debugLog: document.getElementById("debugLog"),
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/* ════════════════════════════════════════════════════════════════
   SELETOR DE TEMA
   ════════════════════════════════════════════════════════════════ */

function renderThemePopover() {
  if (!elements.themePopover) return;
  elements.themePopover.innerHTML = "";
  const active = currentThemeId();

  THEMES.forEach((theme) => {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "theme-swatch" + (theme.id === active ? " is-active" : "");
    swatch.style.background = `linear-gradient(135deg, ${theme.accent}, ${theme.accentBright})`;
    swatch.setAttribute("role", "menuitemradio");
    swatch.setAttribute("aria-checked", String(theme.id === active));
    swatch.setAttribute("aria-label", theme.label);
    swatch.title = theme.label;
    swatch.addEventListener("click", () => {
      setTheme(theme.id);
      renderThemePopover();
      closeThemePopover();
    });
    elements.themePopover?.appendChild(swatch);
  });
}

function toggleThemePopover() {
  const isHidden = elements.themePopover?.classList.contains("hidden");
  if (isHidden) openThemePopover();
  else closeThemePopover();
}

function openThemePopover() {
  renderThemePopover();
  elements.themePopover?.classList.remove("hidden");
  elements.themeToggleBtn?.setAttribute("aria-expanded", "true");
}

function closeThemePopover() {
  elements.themePopover?.classList.add("hidden");
  elements.themeToggleBtn?.setAttribute("aria-expanded", "false");
}

/* ════════════════════════════════════════════════════════════════
   MODO BÁSICO / AVANÇADO
   ════════════════════════════════════════════════════════════════ */

function renderModeLabel() {
  if (elements.modeToggleLabel) {
    elements.modeToggleLabel.textContent = currentMode() === "basic" ? "Básico" : "Avançado";
  }
}

/** Troca de modo descarta o vídeo/formato carregados — evita estado híbrido. */
function handleToggleMode() {
  const next: AppMode = currentMode() === "basic" ? "advanced" : "basic";
  setMode(next);
  renderModeLabel();

  state.formats = [];
  state.selectedFormat = null;
  state.videoMetadata = { title: null, thumbnail: null, uploader: null };
  state.currentUrl = "";
  showBanner("", "");
  setPhase("idle");

  // Campos exclusivos do Avançado não sobrevivem à troca de modo — senão
  // voltam preenchidos com valor antigo num próximo download sem o usuário notar.
  if (elements.sectionStart) elements.sectionStart.value = "";
  if (elements.sectionEnd) elements.sectionEnd.value = "";
  if (elements.subLangsCheckbox) elements.subLangsCheckbox.checked = false;
  if (elements.subLangsInput) elements.subLangsInput.value = "";
  toggle(elements.subLangsInput, false);
  if (elements.extraArgsInput) elements.extraArgsInput.value = "";
}

function setQuickFormat(format: "mp4" | "mp3") {
  state.quickFormat = format;
  const mp4Active = format === "mp4";
  elements.quickMp4Btn?.classList.toggle("is-active", mp4Active);
  elements.quickMp4Btn?.setAttribute("aria-checked", String(mp4Active));
  elements.quickMp3Btn?.classList.toggle("is-active", !mp4Active);
  elements.quickMp3Btn?.setAttribute("aria-checked", String(!mp4Active));
}

/* ════════════════════════════════════════════════════════════════
   MODO NERD — comando montado + log ao vivo
   ════════════════════════════════════════════════════════════════ */

function toggleNerdMode() {
  state.nerdMode = !state.nerdMode;
  elements.nerdModeBtn?.setAttribute("aria-pressed", String(state.nerdMode));
  toggle(elements.debugPanel, state.nerdMode);
  if (state.nerdMode) replayDebugLog();
}

function replayDebugLog() {
  if (!elements.debugLog) return;
  elements.debugLog.innerHTML = "";
  for (const line of state.debugLines) {
    const el = document.createElement("div");
    el.className = "debug-log-line" + (line.stream === "stderr" ? " is-stderr" : "");
    el.textContent = line.text;
    elements.debugLog.appendChild(el);
  }
  elements.debugLog.scrollTop = elements.debugLog.scrollHeight;
}

function clearDebugLog() {
  state.debugLines = [];
  if (elements.debugCommand) elements.debugCommand.textContent = "";
  if (elements.debugLog) elements.debugLog.innerHTML = "";
}

function showDebugCommand(command: string) {
  if (elements.debugCommand) elements.debugCommand.textContent = command;
}

function appendDebugLine(line: DebugLine) {
  state.debugLines.push(line);
  if (state.debugLines.length > DEBUG_LOG_MAX_LINES) {
    state.debugLines.splice(0, state.debugLines.length - DEBUG_LOG_MAX_LINES);
  }
  if (!state.nerdMode || !elements.debugLog) return;

  const el = document.createElement("div");
  el.className = "debug-log-line" + (line.stream === "stderr" ? " is-stderr" : "");
  el.textContent = line.text;
  elements.debugLog.appendChild(el);
  elements.debugLog.scrollTop = elements.debugLog.scrollHeight;
}

document.addEventListener("DOMContentLoaded", async () => {
  elements.fetchFormatsBtn?.addEventListener("click", handleFetchFormats);
  elements.formatSelect?.addEventListener("change", handleFormatChange);
  elements.downloadBtn?.addEventListener("click", handleDownload);
  elements.selectPathBtn?.addEventListener("click", handleSelectPath);
  elements.cancelBtn?.addEventListener("click", handleCancel);
  elements.retryBtn?.addEventListener("click", handleRetry);
  elements.openFolderBtn?.addEventListener("click", handleOpenFolder);
  elements.themeToggleBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleThemePopover();
  });

  elements.modeToggleBtn?.addEventListener("click", handleToggleMode);
  elements.quickMp4Btn?.addEventListener("click", () => setQuickFormat("mp4"));
  elements.quickMp3Btn?.addEventListener("click", () => setQuickFormat("mp3"));
  elements.quickDownloadBtn?.addEventListener("click", handleQuickDownload);
  elements.subLangsCheckbox?.addEventListener("change", () => {
    toggle(elements.subLangsInput, elements.subLangsCheckbox?.checked ?? false);
  });
  elements.nerdModeBtn?.addEventListener("click", toggleNerdMode);
  renderModeLabel();
  document.addEventListener("click", (e) => {
    const popover = elements.themePopover;
    if (popover && !popover.classList.contains("hidden") && !popover.contains(e.target as Node) && e.target !== elements.themeToggleBtn) {
      closeThemePopover();
    }
  });

  elements.urlInput?.addEventListener("keypress", (e) => {
    if (e.key !== "Enter") return;
    if (currentMode() === "basic") {
      handleQuickDownload();
    } else {
      handleFetchFormats();
    }
  });

  // Editar a URL sai de done/failed e reavalia se o vídeo carregado ainda
  // corresponde ao que está no campo.
  elements.urlInput?.addEventListener("input", () => {
    clearFieldError(elements.urlError);
    leaveOutcome();
    renderPlaylistHint();
    render();
  });

  render();
  renderPlaylistHint();

  try {
    const version = await bridge.getVersion();
    if (elements.version) elements.version.textContent = `v${version}`;

    // A pasta escolhida manualmente sobrevive entre sessões; sem escolha
    // prévia, cai no diretório Downloads do SO.
    const savedPath = localStorage.getItem(PATH_STORAGE_KEY);
    const downloadsPath = savedPath || (await bridge.getDownloadsPath());
    if (downloadsPath) {
      state.downloadPath = downloadsPath;
      updateDownloadPathDisplay();
    }

    await bridge.onDownloadProgress((progress) => updateProgress(progress));
    await bridge.onDebugCommand((command) => showDebugCommand(command));
    await bridge.onDebugLine((line) => appendDebugLine(line));
  } catch (error) {
    console.error("Erro ao inicializar:", error);
    setFieldError(elements.urlError, UI_STRINGS.errorInit);
  }
});

/* ════════════════════════════════════════════════════════════════
   RENDER — estado é a fonte de verdade, o DOM só reflete
   ════════════════════════════════════════════════════════════════ */

function setPhase(phase: Phase) {
  state.phase = phase;
  render();
}

function render() {
  const phase = state.phase;
  const hasVideo =
    currentMode() === "advanced" &&
    (phase === "ready" || phase === "downloading" || phase === "done" || phase === "failed");

  elements.app?.setAttribute("data-phase", phase);
  elements.app?.setAttribute("data-hero", hasVideo ? "collapsed" : "full");

  toggle(elements.loadingRegion, phase === "fetching");
  toggle(elements.videoCard, hasVideo);
  toggle(elements.configCard, hasVideo);
  toggle(elements.downloadBtn, phase === "ready");
  toggle(elements.progressRegion, phase === "downloading");
  toggle(elements.outcomeBanner, phase === "done" || phase === "failed");
  toggle(elements.openFolderBtn, phase === "done");
  toggle(elements.retryBtn, phase === "failed");

  elements.outcomeBanner?.classList.toggle("is-success", phase === "done");
  elements.outcomeBanner?.classList.toggle("is-error", phase === "failed");

  // Durante o download nada de URL, formato ou destino muda debaixo do processo.
  const downloading = phase === "downloading";
  if (elements.urlInput) elements.urlInput.disabled = downloading;
  if (elements.fetchFormatsBtn) elements.fetchFormatsBtn.disabled = downloading || phase === "fetching";
  if (elements.formatSelect) elements.formatSelect.disabled = downloading;
  if (elements.selectPathBtn) elements.selectPathBtn.disabled = downloading;
  if (elements.quickDownloadBtn) elements.quickDownloadBtn.disabled = downloading;

  // Se o campo de URL não bate mais com o vídeo carregado, baixar seria baixar
  // o vídeo antigo — bloqueia e explica.
  const stale = hasVideo && urlFieldValue() !== state.currentUrl;
  if (elements.downloadBtn) elements.downloadBtn.disabled = stale;
  if (stale) {
    setFieldHint(elements.urlError, UI_STRINGS.hintUrlChanged);
  } else if (elements.urlError?.classList.contains("is-hint")) {
    clearFieldError(elements.urlError);
  }
}

function toggle(element: Element | null, visible: boolean) {
  element?.classList.toggle("hidden", !visible);
}

function urlFieldValue(): string {
  return elements.urlInput?.value.trim() ?? "";
}

/* ════════════════════════════════════════════════════════════════
   FEEDBACK — erro de campo e banner de resultado
   ════════════════════════════════════════════════════════════════ */

function setFieldError(element: Element | null, message: string) {
  if (!element) return;
  element.textContent = message;
  element.classList.remove("is-hint");
}

function setFieldHint(element: Element | null, message: string) {
  if (!element) return;
  element.textContent = message;
  element.classList.add("is-hint");
}

function clearFieldError(element: Element | null) {
  if (!element) return;
  element.textContent = "";
  element.classList.remove("is-hint");
}

function clearFieldErrors() {
  clearFieldError(elements.urlError);
  clearFieldError(elements.pathError);
  clearFieldError(elements.sectionError);
}

function showBanner(title: string, message: string) {
  if (elements.bannerTitle) elements.bannerTitle.textContent = title;
  if (elements.bannerText) elements.bannerText.textContent = message;
}

/** Sai de done/failed de volta para ready quando o usuário mexe em algum controle. */
function leaveOutcome() {
  if (state.phase === "done" || state.phase === "failed") {
    showBanner("", "");
    setPhase("ready");
  }
}

/* ════════════════════════════════════════════════════════════════
   BUSCA DE FORMATOS
   ════════════════════════════════════════════════════════════════ */

async function handleFetchFormats() {
  if (state.phase === "downloading" || state.phase === "fetching") return;

  const url = urlFieldValue();
  clearFieldErrors();

  if (!url) {
    setFieldError(elements.urlError, UI_STRINGS.errorNoUrl);
    return;
  }

  if (!isValidUrl(url)) {
    setFieldError(elements.urlError, UI_STRINGS.errorInvalidUrl);
    return;
  }

  state.currentUrl = url;
  state.formats = [];
  state.selectedFormat = null;
  state.videoMetadata = { title: null, thumbnail: null, uploader: null };
  showBanner("", "");
  setPhase("fetching");

  try {
    const result = await bridge.getFormats(url);

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
    setPhase("ready");
  } catch (error) {
    console.error("Erro ao buscar formatos:", error);
    // A URL digitada continua no campo — só o vídeo não carregou.
    state.currentUrl = "";
    setPhase("idle");
    setFieldError(elements.urlError, `${UI_STRINGS.errorFetchFormats} ${errorMessage(error)}`);
  }
}

function displayVideoMetadata() {
  const { title, thumbnail, uploader } = state.videoMetadata;

  if (elements.videoTitle) elements.videoTitle.textContent = title || "Vídeo";
  if (elements.videoUploader) {
    elements.videoUploader.textContent = uploader ? `Por: ${uploader}` : "";
  }

  if (elements.videoThumbnail) {
    if (thumbnail) {
      elements.videoThumbnail.src = thumbnail;
      elements.videoThumbnail.onerror = showThumbnailPlaceholder;
    } else {
      showThumbnailPlaceholder();
    }
  }
}

function showThumbnailPlaceholder() {
  if (!elements.videoThumbnail) return;
  elements.videoThumbnail.src =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 180'%3E%3Crect fill='%23333' width='320' height='180'/%3E%3Cpath fill='%23666' d='M145 85l45 27v-54z'/%3E%3C/svg%3E";
}

function populateFormatSelect() {
  if (!elements.formatSelect) return;

  elements.formatSelect.innerHTML = "";

  state.formats.forEach((format) => {
    const option = document.createElement("option");
    option.value = format.id;
    const sizeStr = format.filesize ? ` — ${formatFileSize(format.filesize)}` : "";
    option.textContent = format.label + sizeStr;
    option.dataset.format = JSON.stringify(format);
    elements.formatSelect?.appendChild(option);
  });

  if (state.formats.length > 0) {
    elements.formatSelect.value = state.formats[0].id;
    applySelectedFormat();
  }
}

function handleFormatChange() {
  applySelectedFormat();
  leaveOutcome();
}

function applySelectedFormat() {
  const selectedOption = elements.formatSelect?.selectedOptions[0];
  if (selectedOption?.dataset.format) {
    state.selectedFormat = JSON.parse(selectedOption.dataset.format) as FormatOption;
    updateFormatInfo();
  }
}

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

/* ════════════════════════════════════════════════════════════════
   DESTINO
   ════════════════════════════════════════════════════════════════ */

async function handleSelectPath() {
  try {
    const path = await bridge.selectDownloadPath();
    if (path) {
      state.downloadPath = path;
      localStorage.setItem(PATH_STORAGE_KEY, path);
      updateDownloadPathDisplay();
      clearFieldError(elements.pathError);
      leaveOutcome();
    }
  } catch (error) {
    console.error("Erro ao selecionar diretório:", error);
    setFieldError(elements.pathError, UI_STRINGS.errorSelectDir);
  }
}

function updateDownloadPathDisplay() {
  if (elements.downloadPath) {
    elements.downloadPath.value = state.downloadPath || "";
  }
}

/* ════════════════════════════════════════════════════════════════
   DOWNLOAD
   ════════════════════════════════════════════════════════════════ */

async function handleDownload() {
  if (state.phase !== "ready" || !state.selectedFormat) return;

  if (!state.downloadPath) {
    setFieldError(elements.pathError, UI_STRINGS.errorNoPath);
    return;
  }

  const sectionStart = elements.sectionStart?.value.trim() || undefined;
  const sectionEnd = elements.sectionEnd?.value.trim() || undefined;
  if (Boolean(sectionStart) !== Boolean(sectionEnd)) {
    setFieldError(elements.sectionError, UI_STRINGS.errorIncompleteSection);
    return;
  }
  if (
    (sectionStart && !TIME_PATTERN.test(sectionStart)) ||
    (sectionEnd && !TIME_PATTERN.test(sectionEnd))
  ) {
    setFieldError(elements.sectionError, UI_STRINGS.errorInvalidSection);
    return;
  }

  const subLangs = elements.subLangsCheckbox?.checked
    ? elements.subLangsInput?.value.trim() || undefined
    : undefined;

  await performDownload(state.selectedFormat.id, {
    sectionStart,
    sectionEnd,
    subLangs,
    extraArgs: elements.extraArgsInput?.value.trim() || undefined,
  });
}

/** Modo Rápido: sem metadados prévios, dispara direto na melhor qualidade. */
async function handleQuickDownload() {
  if (state.phase === "downloading") return;

  const url = urlFieldValue();
  clearFieldErrors();

  if (!url) {
    setFieldError(elements.urlError, UI_STRINGS.errorNoUrl);
    return;
  }
  if (!isValidUrl(url)) {
    setFieldError(elements.urlError, UI_STRINGS.errorInvalidUrl);
    return;
  }

  state.currentUrl = url;
  await performDownload(state.quickFormat === "mp3" ? "quick-mp3" : "quick-mp4", {});
}

/** Lógica de download comum aos dois modos — fase, progresso e banner. */
async function performDownload(
  format: string,
  options: { sectionStart?: string; sectionEnd?: string; subLangs?: string; extraArgs?: string }
) {
  if (!state.downloadPath) {
    setFieldError(elements.pathError, UI_STRINGS.errorNoPath);
    return;
  }

  clearFieldErrors();
  setPhase("downloading");
  resetProgress();
  clearDebugLog();
  state.cancelRequested = false;

  try {
    const result = await bridge.startDownload(state.currentUrl, format, state.downloadPath, options);

    await new Promise((resolve) => setTimeout(resolve, 500));
    updateProgress(100);
    showBanner(UI_STRINGS.bannerSuccessTitle, `Salvo em: ${result.path}`);
    setPhase("done");
  } catch (error) {
    // O kill do cancelamento derruba o processo com exit != 0 — sem este
    // guarda, "Cancelar" virava banner de erro por cima do estado ready.
    if (state.cancelRequested) {
      console.log("Download cancelado pelo usuário");
      return;
    }
    console.error("Erro no download:", error);
    showBanner(UI_STRINGS.bannerErrorTitle, errorMessage(error));
    setPhase("failed");
  }
}

function updateProgress(data: DownloadProgress | number) {
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
    const parts: string[] = [];
    if (data.speed) parts.push(data.speed);
    if (data.eta) parts.push(`ETA ${data.eta}`);
    elements.progressStats.textContent = parts.join(" • ");
  } else if (elements.progressStats && clamped >= 100) {
    elements.progressStats.textContent = "";
  }
}

function resetProgress() {
  updateProgress(0);
}

async function handleCancel() {
  try {
    state.cancelRequested = true;
    await bridge.cancelDownload();
    setPhase("ready");
  } catch (error) {
    state.cancelRequested = false;
    console.error("Erro ao cancelar:", error);
    showBanner(UI_STRINGS.bannerErrorTitle, UI_STRINGS.errorCancel);
    setPhase("failed");
  }
}

async function handleRetry() {
  showBanner("", "");
  setPhase("ready");
  await handleDownload();
}

async function handleOpenFolder() {
  if (!state.downloadPath) return;

  try {
    await bridge.openPath(state.downloadPath);
  } catch (error) {
    console.error("Erro ao abrir pasta:", error);
    showBanner(UI_STRINGS.bannerErrorTitle, UI_STRINGS.errorOpenFolder);
    setPhase("failed");
  }
}

/* ════════════════════════════════════════════════════════════════
   UTILITÁRIOS
   ════════════════════════════════════════════════════════════════ */

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Heurística de playlist: cobre YouTube (?list=), páginas /playlist e sets do
 * SoundCloud. Sem --no-playlist o yt-dlp baixa a playlist inteira sem avisar.
 */
function looksLikePlaylist(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has("list")) return true;
    return /\/(playlist|sets)(\/|$)/.test(parsed.pathname);
  } catch {
    return false;
  }
}

function renderPlaylistHint() {
  if (!elements.playlistHint) return;
  const isPlaylist = looksLikePlaylist(urlFieldValue());
  toggle(elements.playlistHint, isPlaylist);
  if (isPlaylist) {
    elements.playlistHint.textContent = UI_STRINGS.hintPlaylist;
  }
}

function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}
