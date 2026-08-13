import { UI_STRINGS, elements, state } from "./state";
import { errorMessage, isValidUrl, urlFieldValue } from "./utils";
import { enqueueDownload } from "./downloads";
import { clearFieldErrors, setFieldError } from "./ui/feedback";
import { render } from "./ui/render";

/* ════════════════════════════════════════════════════════════════
   DOWNLOAD — validação do formulário + enfileiramento
   ════════════════════════════════════════════════════════════════ */

/** Aceita MM:SS ou HH:MM:SS — mesma sintaxe do --download-sections do yt-dlp. */
const TIME_PATTERN = /^\d{1,2}:\d{2}(:\d{2})?$/;

let submitting = false;

export async function handleDownload() {
  if (state.phase !== "ready" || !state.selectedFormat || submitting) return;

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

  clearFieldErrors();
  submitting = true;
  if (elements.downloadBtn) elements.downloadBtn.disabled = true;
  try {
    await enqueueDownload({
      url: state.currentUrl,
      format: state.selectedFormat.id,
      formatLabel: state.selectedFormat.label,
      title: state.videoMetadata.title,
      outputPath: state.downloadPath,
      options: {
        sectionStart,
        sectionEnd,
        subLangs,
        extraArgs: elements.extraArgsInput?.value.trim() || undefined,
      },
    });
  } catch (error) {
    console.error("Erro ao iniciar download:", error);
    setFieldError(elements.urlError, `${UI_STRINGS.errorStartDownload} ${errorMessage(error)}`);
  } finally {
    submitting = false;
    render();
  }
}

let quickSubmitting = false;

/** Modo Rápido: sem metadados prévios, dispara direto na melhor qualidade. */
export async function handleQuickDownload() {
  if (quickSubmitting) return;

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
  if (!state.downloadPath) {
    setFieldError(elements.pathError, UI_STRINGS.errorNoPath);
    return;
  }

  const isMp3 = state.quickFormat === "mp3";
  quickSubmitting = true;
  if (elements.quickDownloadBtn) elements.quickDownloadBtn.disabled = true;
  try {
    await enqueueDownload({
      url,
      format: isMp3 ? "quick-mp3" : "quick-mp4",
      formatLabel: isMp3 ? "Áudio (MP3)" : "Vídeo (MP4)",
      title: null,
      outputPath: state.downloadPath,
      options: {},
    });
    if (elements.urlInput) elements.urlInput.value = "";
  } catch (error) {
    console.error("Erro ao iniciar download:", error);
    setFieldError(elements.urlError, `${UI_STRINGS.errorStartDownload} ${errorMessage(error)}`);
  } finally {
    quickSubmitting = false;
    if (elements.quickDownloadBtn) elements.quickDownloadBtn.disabled = false;
  }
}
