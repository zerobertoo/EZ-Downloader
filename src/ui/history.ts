import { bridge, type HistoryEntry } from "../bridge";
import { enqueueDownload } from "../downloads";
import { UI_STRINGS, elements } from "../state";
import { errorMessage, friendlyErrorMessage, toggle } from "../utils";
import { setFieldError } from "./feedback";

/* ════════════════════════════════════════════════════════════════
   HISTÓRICO — lista persistente de downloads finalizados
   ════════════════════════════════════════════════════════════════ */

const STATUS_LABEL: Record<HistoryEntry["status"], string> = {
  done: UI_STRINGS.statusDone,
  failed: UI_STRINGS.statusFailed,
  cancelled: UI_STRINGS.statusCancelled,
};

export function initHistoryUI() {
  elements.historyToggleBtn?.addEventListener("click", () => {
    const collapsed = elements.historyBody?.classList.contains("hidden") ?? true;
    toggle(elements.historyBody, collapsed);
    elements.historyToggleBtn?.setAttribute("aria-expanded", String(collapsed));
  });

  elements.clearHistoryBtn?.addEventListener("click", () => void handleClearHistoryClick());
  elements.clearHistoryBtn?.addEventListener("blur", resetClearHistoryButton);

  elements.historyList?.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const row = target.closest<HTMLElement>("[data-history-path]");
    if (row && target.closest(".js-open-folder")) {
      bridge.openPath(row.dataset.historyPath!).catch((error) => {
        console.error("Erro ao abrir pasta:", error);
        setFieldError(elements.urlError, UI_STRINGS.errorOpenFolder);
      });
    }
  });
}

// Confirmação em dois cliques no próprio botão — sem window.confirm(), que
// quebra o visual escuro do app com um diálogo nativo do SO.
const CLEAR_CONFIRM_TIMEOUT_MS = 3000;
let clearConfirmTimer: ReturnType<typeof setTimeout> | null = null;

function resetClearHistoryButton() {
  if (clearConfirmTimer) {
    clearTimeout(clearConfirmTimer);
    clearConfirmTimer = null;
  }
  const btn = elements.clearHistoryBtn;
  if (!btn) return;
  btn.classList.remove("is-confirming");
  btn.textContent = UI_STRINGS.historyClear;
}

async function handleClearHistoryClick() {
  const btn = elements.clearHistoryBtn;
  if (!btn) return;

  if (!btn.classList.contains("is-confirming")) {
    btn.classList.add("is-confirming");
    btn.textContent = UI_STRINGS.historyClearConfirmLabel;
    clearConfirmTimer = setTimeout(resetClearHistoryButton, CLEAR_CONFIRM_TIMEOUT_MS);
    return;
  }

  resetClearHistoryButton();
  try {
    await bridge.clearHistory();
    renderHistory([]);
  } catch (error) {
    console.error("Erro ao limpar histórico:", error);
    setFieldError(elements.urlError, UI_STRINGS.errorClearHistory);
  }
}

// Downloads que terminam quase juntos disparam loadHistory() concorrente;
// sem isso, uma resposta mais lenta pode sobrescrever o render com dado velho.
let loadGeneration = 0;

export async function loadHistory() {
  const generation = ++loadGeneration;
  const entries = await bridge.getHistory();
  if (generation !== loadGeneration) return;
  renderHistory(entries);
}

function renderHistory(entries: HistoryEntry[]) {
  if (!elements.historyList) return;

  toggle(elements.historyEmpty, entries.length === 0);
  elements.historyList.innerHTML = "";

  for (const entry of entries) {
    elements.historyList.appendChild(buildRow(entry));
  }
}

function buildRow(entry: HistoryEntry): HTMLElement {
  const row = document.createElement("div");
  row.className = `history-row is-${entry.status}`;
  if (entry.outputPath) row.dataset.historyPath = entry.outputPath;

  const icon = document.createElement("span");
  icon.className = "history-row-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = entry.status === "done" ? "✓" : entry.status === "failed" ? "✕" : "–";
  row.appendChild(icon);

  const body = document.createElement("div");
  body.className = "history-row-body";
  const title = document.createElement("p");
  title.className = "history-row-title";
  title.textContent = entry.title || entry.url;
  body.appendChild(title);
  const meta = document.createElement("p");
  meta.className = "history-row-meta";
  const date = new Date(entry.finishedAt).toLocaleString("pt-BR");
  meta.textContent = `${STATUS_LABEL[entry.status]} • ${entry.format} • ${date}`;
  body.appendChild(meta);

  if (entry.status === "failed" && entry.error) {
    const errorText = document.createElement("p");
    errorText.className = "history-row-error";
    errorText.textContent = friendlyErrorMessage(entry.error);
    body.appendChild(errorText);
  }

  row.appendChild(body);

  if (entry.status === "done") {
    const openBtn = document.createElement("button");
    openBtn.className = "history-row-btn js-open-folder";
    openBtn.textContent = UI_STRINGS.downloadOpenFolder;
    row.appendChild(openBtn);
  }

  if (entry.status === "failed" || entry.status === "cancelled") {
    const retryBtn = document.createElement("button");
    retryBtn.className = "history-row-btn";
    retryBtn.textContent = UI_STRINGS.downloadRetry;
    retryBtn.addEventListener("click", () => void handleHistoryRetry(entry, retryBtn));
    row.appendChild(retryBtn);
  }

  return row;
}

/** Retentativa a partir do histórico só reconstrói o essencial (url/formato/destino) —
 * corte, legendas e argumentos extras não são persistidos entre sessões. */
async function handleHistoryRetry(entry: HistoryEntry, btn: HTMLButtonElement) {
  btn.disabled = true;
  try {
    await enqueueDownload({
      url: entry.url,
      format: entry.format,
      formatLabel: entry.format,
      title: entry.title,
      outputPath: entry.outputPath,
      options: {},
    });
  } catch (error) {
    console.error("Erro ao reenviar download:", error);
    setFieldError(elements.urlError, `${UI_STRINGS.errorStartDownload} ${errorMessage(error)}`);
  } finally {
    btn.disabled = false;
  }
}
