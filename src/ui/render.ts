import { currentMode } from "../mode";
import { UI_STRINGS, elements, state, type Phase } from "../state";
import { toggle, urlFieldValue } from "../utils";
import { clearFieldError, setFieldHint } from "./feedback";

/* ════════════════════════════════════════════════════════════════
   RENDER — estado é a fonte de verdade, o DOM só reflete
   ════════════════════════════════════════════════════════════════ */

export function setPhase(phase: Phase) {
  state.phase = phase;
  render();
}

export function render() {
  const phase = state.phase;
  const hasVideo = currentMode() === "advanced" && phase === "ready";

  elements.app?.setAttribute("data-phase", phase);
  elements.app?.setAttribute("data-hero", hasVideo ? "collapsed" : "full");

  toggle(elements.loadingRegion, phase === "fetching");
  toggle(elements.videoCard, hasVideo);
  toggle(elements.configCard, hasVideo);
  toggle(elements.downloadBtn, phase === "ready");

  if (elements.fetchFormatsBtn) elements.fetchFormatsBtn.disabled = phase === "fetching";

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
