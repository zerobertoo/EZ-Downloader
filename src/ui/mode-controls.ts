import { currentMode, setMode, type AppMode } from "../mode";
import { elements, state } from "../state";
import { toggle } from "../utils";
import { setPhase } from "./render";

/* ════════════════════════════════════════════════════════════════
   MODO BÁSICO / AVANÇADO
   ════════════════════════════════════════════════════════════════ */

export function renderModeLabel() {
  if (elements.modeToggleLabel) {
    elements.modeToggleLabel.textContent = currentMode() === "basic" ? "Básico" : "Avançado";
  }
}

/** Troca de modo descarta o vídeo/formato carregados — evita estado híbrido. */
export function handleToggleMode() {
  const next: AppMode = currentMode() === "basic" ? "advanced" : "basic";
  setMode(next);
  renderModeLabel();

  state.formats = [];
  state.selectedFormat = null;
  state.videoMetadata = { title: null, thumbnail: null, uploader: null };
  state.currentUrl = "";
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

export function setQuickFormat(format: "mp4" | "mp3") {
  state.quickFormat = format;
  const mp4Active = format === "mp4";
  elements.quickMp4Btn?.classList.toggle("is-active", mp4Active);
  elements.quickMp4Btn?.setAttribute("aria-checked", String(mp4Active));
  elements.quickMp3Btn?.classList.toggle("is-active", !mp4Active);
  elements.quickMp3Btn?.setAttribute("aria-checked", String(!mp4Active));
}
