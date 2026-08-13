import type { DownloadProgress } from "../bridge";
import { UI_STRINGS, elements } from "../state";

/* ════════════════════════════════════════════════════════════════
   PROGRESSO — barra, percentual e velocidade/ETA
   ════════════════════════════════════════════════════════════════ */

export function updateProgress(data: DownloadProgress | number) {
  const percent = typeof data === "object" ? data.percent : data;
  const clamped = Math.min(Math.max(percent, 0), 100);

  if (elements.progressFill) {
    elements.progressFill.style.width = `${clamped}%`;
  }

  if (elements.progressPercent) {
    elements.progressPercent.textContent = `${Math.round(clamped)}%`;
  }

  if (elements.progressText) {
    if (clamped < 30) {
      elements.progressText.textContent = UI_STRINGS.progressStarting;
    } else if (clamped < 70) {
      elements.progressText.textContent = UI_STRINGS.progressDownloading;
    } else if (clamped < 100) {
      elements.progressText.textContent = UI_STRINGS.progressFinalizing;
    } else {
      elements.progressText.textContent = UI_STRINGS.progressComplete;
    }
  }

  if (elements.progressStats && typeof data === "object") {
    const parts: string[] = [];
    if (data.speed) parts.push(data.speed);
    if (data.eta) parts.push(`ETA ${data.eta}`);
    elements.progressStats.textContent = parts.join(" • ");
  } else if (elements.progressStats && clamped >= 100) {
    elements.progressStats.textContent = "";
  }
}

export function resetProgress() {
  updateProgress(0);
}
