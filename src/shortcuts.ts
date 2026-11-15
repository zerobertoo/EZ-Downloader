import { handleFetchFormats } from "./app";
import { pulseButton } from "./components/button";
import { isMac } from "./components/dom";
import { handleDownload, handleQuickDownload, urlValue } from "./download";
import { currentMode } from "./mode";
import { state } from "./state";
import { refs } from "./ui/refs";
import { isSelectionOpen } from "./ui/selection";

/** A ação principal da tela, igual ao botão visível: baixar no Básico; buscar ou baixar no Avançado. */
export function submitPrimaryAction() {
  if (isSelectionOpen()) return;
  pulseButton(refs.goButton);
  if (currentMode() === "basic") {
    void handleQuickDownload();
    return;
  }
  const videoMatchesField = state.phase === "ready" && urlValue() === state.currentUrl;
  if (videoMatchesField) void handleDownload();
  else void handleFetchFormats();
}

function focusUrlField() {
  refs.urlInput.focus();
  refs.urlInput.select();
}

function toggleMode() {
  void refs.modeSegment.request(currentMode() === "basic" ? "advanced" : "basic");
}

/** Tecla (sem modificador) combinada com Ctrl, ou Cmd no macOS. */
const SHORTCUTS: Record<string, () => void> = {
  l: focusUrlField,
  m: toggleMode,
  h: () => refs.historyToggle(),
  j: () => refs.focusConcurrency(),
  e: () => refs.openSettings(),
  Enter: submitPrimaryAction,
};

export function initShortcuts() {
  document.addEventListener("keydown", (event) => {
    if (event.repeat || event.isComposing || event.defaultPrevented) return;
    const modifier = isMac ? event.metaKey : event.ctrlKey;
    if (!modifier || event.altKey || event.shiftKey) return;
    const action = SHORTCUTS[event.key.length === 1 ? event.key.toLowerCase() : event.key];
    if (!action) return;
    event.preventDefault();
    action();
  });
}
