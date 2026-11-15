import { handleDownload, handleQuickDownload } from "./download";
import { currentMode } from "./mode";
import { elements, state } from "./state";
import { urlFieldValue } from "./utils";
import { toggleNerdMode } from "./ui/debug";
import { handleFetchFormats } from "./ui/formats";
import { handleToggleMode } from "./ui/mode-controls";
import { isSelectionOpen } from "./ui/selection";

const isMac = /mac/i.test(navigator.platform);

/** A ação principal da tela, igual ao botão visível: baixar no Básico; buscar ou baixar no Avançado. */
export function submitPrimaryAction() {
  if (isSelectionOpen()) return;
  if (currentMode() === "basic") {
    void handleQuickDownload();
    return;
  }
  const videoMatchesField = state.phase === "ready" && urlFieldValue() === state.currentUrl;
  if (videoMatchesField) void handleDownload();
  else void handleFetchFormats();
}

function focusUrlField() {
  elements.urlInput?.focus();
  elements.urlInput?.select();
}

/** Tecla (sem modificador) combinada com Ctrl, ou Cmd no macOS. */
const SHORTCUTS: Record<string, () => void> = {
  l: focusUrlField,
  m: () => handleToggleMode(),
  h: () => elements.historyToggleBtn?.click(),
  j: () => elements.maxConcurrentSelect?.focus(),
  e: toggleNerdMode,
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
