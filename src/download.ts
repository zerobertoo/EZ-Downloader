import { bridge } from "./bridge";
import { UI_STRINGS, elements, state } from "./state";
import { errorMessage, isValidUrl, urlFieldValue } from "./utils";
import { clearDebugLog } from "./ui/debug";
import { clearFieldErrors, setFieldError, showBanner } from "./ui/feedback";
import { resetProgress, updateProgress } from "./ui/progress";
import { setPhase } from "./ui/render";

/* ════════════════════════════════════════════════════════════════
   DOWNLOAD
   ════════════════════════════════════════════════════════════════ */

/** Aceita MM:SS ou HH:MM:SS — mesma sintaxe do --download-sections do yt-dlp. */
const TIME_PATTERN = /^\d{1,2}:\d{2}(:\d{2})?$/;

export async function handleDownload() {
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
export async function handleQuickDownload() {
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

export async function handleCancel() {
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

export async function handleRetry() {
  showBanner("", "");
  setPhase("ready");
  await handleDownload();
}

export async function handleOpenFolder() {
  if (!state.downloadPath) return;

  try {
    await bridge.openPath(state.downloadPath);
  } catch (error) {
    console.error("Erro ao abrir pasta:", error);
    showBanner(UI_STRINGS.bannerErrorTitle, UI_STRINGS.errorOpenFolder);
    setPhase("failed");
  }
}
