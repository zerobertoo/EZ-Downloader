import "./styles.css";
import { bridge } from "./bridge";
import { buildApp, render, showDownloadPath } from "./app";
import { toast } from "./components/toast";
import { PATH_STORAGE_KEY, UI_STRINGS, state } from "./state";
import { safeStorageGet, safeStorageRemove } from "./components/dom";
import { initMode } from "./mode";
import { initShortcuts } from "./shortcuts";
import { initTheme } from "./theme";
import { handleConversionFinished, handleDebugCommand, handleDebugLine, handleDownloadFinished, initDownloadsUI, syncQueue, updateConversionProgress, updateDownloadProgress } from "./downloads";
import { initClipboardUI } from "./ui/clipboard";
import { initHistoryUI, loadHistory } from "./ui/history";
import { refs } from "./ui/refs";
import { initSelectionUI, closeSelection } from "./ui/selection";

initTheme();
initMode();

async function start() {
  const root = document.getElementById("app");
  if (!root) return;
  const { advanced } = buildApp(root);
  initHistoryUI();
  initSelectionUI();
  initDownloadsUI();
  initShortcuts();
  showDownloadPath();
  render();

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !event.defaultPrevented && !event.isComposing) closeSelection();
  });

  try {
    refs.version.textContent = `Versão ${await bridge.getVersion()}`;

    // A pasta escolhida sobrevive entre sessões (guardada no backend); sem escolha, cai em Downloads do SO.
    let settings = await bridge.getSettings();
    const legacyPath = safeStorageGet(PATH_STORAGE_KEY);
    if (legacyPath) {
      // Migração única: versões antigas guardavam a pasta no localStorage.
      if (!settings.downloadPath) settings = await bridge.setDownloadPath(legacyPath);
      safeStorageRemove(PATH_STORAGE_KEY);
    }
    const downloadsPath = settings.downloadPath || (await bridge.getDownloadsPath());
    if (downloadsPath) {
      state.downloadPath = downloadsPath;
      showDownloadPath();
    }

    initClipboardUI(settings.clipboardMonitor);
    advanced.initSettings(settings);
    refs.applyConcurrency(String(settings.maxConcurrent));

    await bridge.onQueueChanged((items) => syncQueue(items));
    await bridge.onDownloadProgress((progress) => updateDownloadProgress(progress));
    await bridge.onDownloadFinished((finished) => handleDownloadFinished(finished));
    await bridge.onConversionProgress((progress) => updateConversionProgress(progress));
    await bridge.onConversionFinished((finished) => handleConversionFinished(finished));
    await bridge.onDebugCommand((command) => handleDebugCommand(command));
    await bridge.onDebugLine((line) => handleDebugLine(line));

    syncQueue(await bridge.getQueue());
    await loadHistory();
  } catch (error) {
    console.error("Failed to initialize:", error);
    toast({ kind: "error", message: UI_STRINGS.errorInit });
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => void start());
else void start();
