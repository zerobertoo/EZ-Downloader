import { bridge } from "./bridge";
import { initMode, currentMode } from "./mode";
import { initTheme } from "./theme";
import { PATH_STORAGE_KEY, UI_STRINGS, elements, state } from "./state";
import { renderPlaylistHint, toggle } from "./utils";
import { handleDownload, handleQuickDownload } from "./download";
import { handleDownloadFinished, initDownloadsUI, updateDownloadProgress } from "./downloads";
import { appendDebugLine, showDebugCommand, toggleNerdMode } from "./ui/debug";
import { handleSelectPath, updateDownloadPathDisplay } from "./ui/destination";
import { clearFieldError, setFieldError } from "./ui/feedback";
import { handleFetchFormats, handleFormatChange } from "./ui/formats";
import { initHistoryUI, loadHistory } from "./ui/history";
import { handleToggleMode, renderModeLabel, setQuickFormat } from "./ui/mode-controls";
import { render } from "./ui/render";
import { closeThemePopover, toggleThemePopover } from "./ui/theme-popover";

initTheme();
initMode();

document.addEventListener("DOMContentLoaded", async () => {
  elements.fetchFormatsBtn?.addEventListener("click", handleFetchFormats);
  elements.formatSelect?.addEventListener("change", handleFormatChange);
  elements.downloadBtn?.addEventListener("click", handleDownload);
  elements.selectPathBtn?.addEventListener("click", handleSelectPath);
  elements.themeToggleBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleThemePopover();
  });

  elements.modeToggleBtn?.addEventListener("click", handleToggleMode);
  elements.quickMp4Btn?.addEventListener("click", () => setQuickFormat("mp4"));
  elements.quickMp3Btn?.addEventListener("click", () => setQuickFormat("mp3"));
  elements.quickDownloadBtn?.addEventListener("click", handleQuickDownload);
  elements.subLangsCheckbox?.addEventListener("change", () => {
    toggle(elements.subLangsInput, elements.subLangsCheckbox?.checked ?? false);
  });
  elements.nerdModeBtn?.addEventListener("click", toggleNerdMode);
  renderModeLabel();
  initDownloadsUI();
  initHistoryUI();
  document.addEventListener("click", (e) => {
    const popover = elements.themePopover;
    if (popover && !popover.classList.contains("hidden") && !popover.contains(e.target as Node) && e.target !== elements.themeToggleBtn) {
      closeThemePopover();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const popover = elements.themePopover;
    if (popover && !popover.classList.contains("hidden")) {
      closeThemePopover();
      elements.themeToggleBtn?.focus();
    }
  });

  elements.urlInput?.addEventListener("keypress", (e) => {
    if (e.key !== "Enter") return;
    if (currentMode() === "basic") {
      handleQuickDownload();
    } else {
      handleFetchFormats();
    }
  });

  // Editar a URL reavalia se o vídeo carregado ainda corresponde ao que está no campo.
  elements.urlInput?.addEventListener("input", () => {
    clearFieldError(elements.urlError);
    renderPlaylistHint();
    render();
  });

  render();
  renderPlaylistHint();

  try {
    const version = await bridge.getVersion();
    if (elements.version) elements.version.textContent = `v${version}`;

    // A pasta escolhida manualmente sobrevive entre sessões; sem escolha
    // prévia, cai no diretório Downloads do SO.
    const savedPath = localStorage.getItem(PATH_STORAGE_KEY);
    const downloadsPath = savedPath || (await bridge.getDownloadsPath());
    if (downloadsPath) {
      state.downloadPath = downloadsPath;
      updateDownloadPathDisplay();
    }

    await bridge.onDownloadProgress((progress) => updateDownloadProgress(progress));
    await bridge.onDownloadFinished((finished) => handleDownloadFinished(finished));
    await bridge.onDebugCommand((command) => showDebugCommand(command.id, command.command));
    await bridge.onDebugLine((line) => appendDebugLine(line));

    await loadHistory();
  } catch (error) {
    console.error("Erro ao inicializar:", error);
    setFieldError(elements.urlError, UI_STRINGS.errorInit);
  }
});
