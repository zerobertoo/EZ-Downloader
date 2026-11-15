import { bridge, type HistoryEntry } from "../bridge";
import { button } from "../components/button";
import { confirmDialog } from "../components/dialog";
import { h } from "../components/dom";
import { icon, type IconName } from "../components/icons";
import { toast } from "../components/toast";
import { enqueueDownload, formatLabelFor } from "../downloads";
import { UI_STRINGS } from "../state";
import { errorMessage, friendlyErrorMessage } from "../utils";
import { refs } from "./refs";

const STATUS_LABEL: Record<HistoryEntry["status"], string> = {
  done: UI_STRINGS.statusDone,
  failed: UI_STRINGS.statusFailed,
  cancelled: UI_STRINGS.statusCancelled,
};
const STATUS_ICON: Record<HistoryEntry["status"], IconName> = { done: "check", failed: "x", cancelled: "minus" };

let allEntries: HistoryEntry[] = [];
// Downloads que terminam quase juntos disparam loadHistory() concorrente: sem isto, uma resposta lenta sobrescreve o render com dado velho.
let loadGeneration = 0;

export function initHistoryUI() {
  refs.historySearch.addEventListener("input", () => render());
  refs.historyClear.addEventListener("click", () => void handleClear());
}

export async function loadHistory() {
  const generation = ++loadGeneration;
  const entries = await bridge.getHistory();
  if (generation !== loadGeneration) return;
  allEntries = entries;
  render();
}

function visibleEntries(): HistoryEntry[] {
  const query = refs.historySearch.value.trim().toLowerCase();
  if (!query) return allEntries;
  return allEntries.filter((entry) => (entry.title || "").toLowerCase().includes(query) || entry.url.toLowerCase().includes(query));
}

function render() {
  const entries = visibleEntries();
  const searching = Boolean(refs.historySearch.value.trim());
  refs.historyEmpty.classList.toggle("is-hidden", entries.length > 0);
  refs.historyEmpty.textContent = searching && allEntries.length > 0 ? UI_STRINGS.historyNoResults : UI_STRINGS.historyEmpty;
  refs.historyClear.classList.toggle("is-hidden", allEntries.length === 0);
  refs.historyList.replaceChildren(...entries.map(buildRow));
}

async function handleClear() {
  const confirmed = await confirmDialog({
    title: "Limpar o histórico?",
    body: "A lista de downloads anteriores será apagada. Os arquivos baixados não são tocados.",
    confirmLabel: "Limpar histórico",
    danger: true,
  });
  if (!confirmed) return;
  try {
    await bridge.clearHistory();
    allEntries = [];
    render();
  } catch (error) {
    console.error("Failed to clear history:", error);
    toast({ kind: "error", message: UI_STRINGS.errorClearHistory });
  }
}

function buildRow(entry: HistoryEntry): HTMLElement {
  const date = new Date(entry.finishedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  const body = h(
    "div",
    { class: "hrow__body" },
    h("div", { class: "hrow__title", title: entry.title || entry.url }, entry.title || entry.url),
    h("div", { class: "hrow__meta" }, `${STATUS_LABEL[entry.status]} · ${entry.format} · ${date}`),
    entry.status === "failed" && entry.error ? h("div", { class: "hrow__error" }, friendlyErrorMessage(entry.error)) : null
  );

  const row = h("div", { class: "hrow" }, h("span", { class: ["hrow__icon", `hrow__icon--${entry.status}`] }, icon(STATUS_ICON[entry.status], 14)), body);

  if (entry.status === "done") {
    row.appendChild(button({ label: UI_STRINGS.downloadOpenFolder, icon: "folder", variant: "secondary", size: "sm", onClick: () => void openFolder(entry) }));
  } else {
    const retry = button({ label: UI_STRINGS.downloadRetry, icon: "refresh", variant: "secondary", size: "sm" });
    retry.addEventListener("click", () => void retryEntry(entry, retry));
    row.appendChild(retry);
  }
  return row;
}

async function openFolder(entry: HistoryEntry) {
  try {
    await bridge.openPath(entry.outputPath);
  } catch (error) {
    console.error("Failed to open folder:", error);
    toast({ kind: "error", message: UI_STRINGS.errorOpenFolder });
  }
}

/** Retentativa pelo histórico reconstrói só o essencial (link, formato, destino): as opções avançadas não são guardadas. */
async function retryEntry(entry: HistoryEntry, trigger: HTMLButtonElement) {
  trigger.disabled = true;
  try {
    await enqueueDownload({ url: entry.url, format: entry.format, formatLabel: formatLabelFor(entry.format), title: entry.title, outputPath: entry.outputPath, options: {} });
    toast({ kind: "success", message: "Voltou para a fila" });
  } catch (error) {
    console.error("Failed to resubmit download:", error);
    toast({ kind: "error", message: `${UI_STRINGS.errorStartDownload} ${errorMessage(error)}` });
  } finally {
    trigger.disabled = false;
  }
}
