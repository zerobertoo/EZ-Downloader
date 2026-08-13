import { currentMode } from "../mode";
import { UI_STRINGS, elements, state, type Phase } from "../state";
import { toggle, urlFieldValue } from "../utils";
import { clearFieldError, setFieldHint, showBanner } from "./feedback";

/* ════════════════════════════════════════════════════════════════
   RENDER — estado é a fonte de verdade, o DOM só reflete
   ════════════════════════════════════════════════════════════════ */

export function setPhase(phase: Phase) {
  state.phase = phase;
  render();
}

export function render() {
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

/** Sai de done/failed de volta para ready quando o usuário mexe em algum controle. */
export function leaveOutcome() {
  if (state.phase === "done" || state.phase === "failed") {
    showBanner("", "");
    setPhase("ready");
  }
}
