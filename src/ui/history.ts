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

  elements.historySearchInput?.addEventListener("input", () => {
    renderHistory(filterEntries(allEntries, elements.historySearchInput?.value ?? ""));
  });

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
    allEntries = [];
    renderHistory([]);
  } catch (error) {
    console.error("Erro ao limpar histórico:", error);
    setFieldError(elements.urlError, UI_STRINGS.errorClearHistory);
  }
}

// Downloads que terminam quase juntos disparam loadHistory() concorrente;
// sem isso, uma resposta mais lenta pode sobrescrever o render com dado velho.
let loadGeneration = 0;
let allEntries: HistoryEntry[] = [];

export async function loadHistory() {
  const generation = ++loadGeneration;
  const entries = await bridge.getHistory();
  if (generation !== loadGeneration) return;
  allEntries = entries;
  renderHistory(filterEntries(entries, elements.historySearchInput?.value ?? ""));
}

/** Busca simples por substring em título e URL — histórico já vem inteiro do backend. */
function filterEntries(entries: HistoryEntry[], query: string): HistoryEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter(
    (e) => (e.title || "").toLowerCase().includes(q) || e.url.toLowerCase().includes(q)
  );
}

function renderHistory(entries: HistoryEntry[]) {
  if (!elements.historyList) return;

  const searching = Boolean(elements.historySearchInput?.value.trim());
  toggle(elements.historyEmpty, entries.length === 0);
  if (elements.historyEmpty) {
    elements.historyEmpty.textContent =
      searching && allEntries.length > 0 ? UI_STRINGS.historyNoResults : UI_STRINGS.historyEmpty;
  }
  elements.historyList.innerHTML = "";

  for (const entry of entries) {
    elements.historyList.appendChild(buildRow(entry));
  }
}

const HISTORY_BTN = "btn-secondary h-7 shrink-0 px-3 text-[0.7rem] pointer-coarse:min-h-11";

const HISTORY_ICON_CLASS: Record<HistoryEntry["status"], string> = {
  done: "bg-green-dim text-green",
  failed: "bg-red-dim text-red",
  cancelled: "bg-surface-3 text-fg-3",
};

function buildRow(entry: HistoryEntry): HTMLElement {
  const row = document.createElement("div");
  row.className = "flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2.5";
  if (entry.outputPath) row.dataset.historyPath = entry.outputPath;

  const icon = document.createElement("span");
  icon.className = `flex size-[22px] shrink-0 items-center justify-center rounded-full ${HISTORY_ICON_CLASS[entry.status]}`;
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML =
    entry.status === "done"
      ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`
      : entry.status === "failed"
        ? `<svg width="10" height="10" viewBox="0 0 24 24" fill="none"><line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>`
        : `<svg width="10" height="10" viewBox="0 0 24 24" fill="none"><line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>`;
  row.appendChild(icon);

  const body = document.createElement("div");
  body.className = "min-w-0 flex-1";
  const title = document.createElement("p");
  title.className = "truncate text-[0.8125rem] font-semibold text-fg";
  title.textContent = entry.title || entry.url;
  body.appendChild(title);
  const meta = document.createElement("p");
  meta.className = "font-mono text-[0.6875rem] text-fg-3";
  const date = new Date(entry.finishedAt).toLocaleString("pt-BR");
  meta.textContent = `${STATUS_LABEL[entry.status]} • ${entry.format} • ${date}`;
  body.appendChild(meta);

  if (entry.status === "failed" && entry.error) {
    const errorText = document.createElement("p");
    errorText.className = "mt-0.5 text-[0.6875rem] text-red";
    errorText.textContent = friendlyErrorMessage(entry.error);
    body.appendChild(errorText);
  }

  row.appendChild(body);

  if (entry.status === "done") {
    const openBtn = document.createElement("button");
    openBtn.className = `${HISTORY_BTN} js-open-folder`;
    openBtn.textContent = UI_STRINGS.downloadOpenFolder;
    row.appendChild(openBtn);
  }

  if (entry.status === "failed" || entry.status === "cancelled") {
    const retryBtn = document.createElement("button");
    retryBtn.className = HISTORY_BTN;
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
