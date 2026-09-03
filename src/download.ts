import { UI_STRINGS, elements, state } from "./state";
import { errorMessage, isValidUrl, looksLikePlaylist, urlFieldValue } from "./utils";
import { enqueueDownload } from "./downloads";
import { clearFieldErrors, setFieldError } from "./ui/feedback";
import { render } from "./ui/render";

/* ════════════════════════════════════════════════════════════════
   DOWNLOAD — validação do formulário + enfileiramento
   ════════════════════════════════════════════════════════════════ */

/** Aceita MM:SS ou HH:MM:SS — mesma sintaxe do --download-sections do yt-dlp. */
const TIME_PATTERN = /^\d{1,2}:\d{2}(:\d{2})?$/;

/** Número com sufixo de unidade opcional — mesma sintaxe do --limit-rate do yt-dlp. */
const RATE_PATTERN = /^\d+(\.\d+)?[KMG]?$/i;

// Playlist: exige um segundo clique antes de disparar — sem isso, uma URL de
// playlist dispara dezenas de downloads de uma vez sem aviso. Mesmo gate nos
// dois modos, senão a mesma URL fica protegida num modo e desprotegida no outro.
const PLAYLIST_CONFIRM_TIMEOUT_MS = 3000;

function makePlaylistConfirm(getBtn: () => HTMLButtonElement | null | undefined) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const reset = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    getBtn()?.classList.remove("is-confirming");
  };
  const arm = () => {
    getBtn()?.classList.add("is-confirming");
    timer = setTimeout(reset, PLAYLIST_CONFIRM_TIMEOUT_MS);
  };
  const isArmed = () => getBtn()?.classList.contains("is-confirming") ?? false;
  return { reset, arm, isArmed };
}

const quickPlaylistConfirm = makePlaylistConfirm(() => elements.quickDownloadBtn);
const advancedPlaylistConfirm = makePlaylistConfirm(() => elements.downloadBtn);

export function resetQuickPlaylistConfirm() {
  quickPlaylistConfirm.reset();
}

export function resetAdvancedPlaylistConfirm() {
  advancedPlaylistConfirm.reset();
}

let submitting = false;

export async function handleDownload() {
  if (state.phase !== "ready" || !state.selectedFormat || submitting) return;

  if (!state.downloadPath) {
    setFieldError(elements.pathError, UI_STRINGS.errorNoPath);
    return;
  }

  if (looksLikePlaylist(state.currentUrl) && !advancedPlaylistConfirm.isArmed()) {
    advancedPlaylistConfirm.arm();
    setFieldError(elements.urlError, UI_STRINGS.hintPlaylistConfirm);
    return;
  }
  advancedPlaylistConfirm.reset();

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

  const limitRate = elements.limitRateInput?.value.trim() || undefined;
  if (limitRate && !RATE_PATTERN.test(limitRate)) {
    setFieldError(elements.limitRateError, UI_STRINGS.errorInvalidLimitRate);
    return;
  }

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
        cookiesBrowser: elements.cookiesBrowserSelect?.value || undefined,
        limitRate,
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
  // Node de erro do Modo Avançado (#pathError) fica escondido no Modo Rápido —
  // mostrar aqui, em #urlError, senão o clique falha em silêncio.
  if (!state.downloadPath) {
    setFieldError(elements.urlError, UI_STRINGS.errorNoPath);
    return;
  }

  if (looksLikePlaylist(url) && !quickPlaylistConfirm.isArmed()) {
    quickPlaylistConfirm.arm();
    setFieldError(elements.urlError, UI_STRINGS.hintPlaylistConfirm);
    return;
  }
  quickPlaylistConfirm.reset();

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
