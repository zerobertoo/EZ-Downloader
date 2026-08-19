import { resetAdvancedPlaylistConfirm, resetQuickPlaylistConfirm } from "../download";
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

// Sair do Avançado com campos preenchidos exige um segundo clique — senão um
// toque sem querer no pill descarta corte/legendas/argumentos em silêncio.
const MODE_SWITCH_CONFIRM_TIMEOUT_MS = 3000;
let modeSwitchConfirmTimer: ReturnType<typeof setTimeout> | null = null;

function hasUnsavedAdvancedInput(): boolean {
  return Boolean(
    elements.sectionStart?.value.trim() ||
      elements.sectionEnd?.value.trim() ||
      elements.subLangsCheckbox?.checked ||
      elements.subLangsInput?.value.trim() ||
      elements.extraArgsInput?.value.trim()
  );
}

function resetModeSwitchConfirm() {
  if (modeSwitchConfirmTimer) {
    clearTimeout(modeSwitchConfirmTimer);
    modeSwitchConfirmTimer = null;
  }
  elements.modeToggleBtn?.classList.remove("is-confirming");
  renderModeLabel();
}

/** Troca de modo descarta o vídeo/formato carregados — evita estado híbrido. */
export function handleToggleMode() {
  const from = currentMode();

  if (from === "advanced" && hasUnsavedAdvancedInput() && !elements.modeToggleBtn?.classList.contains("is-confirming")) {
    elements.modeToggleBtn?.classList.add("is-confirming");
    if (elements.modeToggleLabel) elements.modeToggleLabel.textContent = "Descartar?";
    modeSwitchConfirmTimer = setTimeout(resetModeSwitchConfirm, MODE_SWITCH_CONFIRM_TIMEOUT_MS);
    return;
  }
  resetModeSwitchConfirm();
  resetQuickPlaylistConfirm();
  resetAdvancedPlaylistConfirm();

  const next: AppMode = from === "basic" ? "advanced" : "basic";
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
