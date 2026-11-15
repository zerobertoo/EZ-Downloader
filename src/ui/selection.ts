import { enqueueDownload, type EnqueueParams } from "../downloads";
import { UI_STRINGS, elements } from "../state";
import { errorMessage, formatDuration, toggle } from "../utils";
import { clearFieldErrors, setFieldError } from "./feedback";

export interface SelectionEntry {
  url: string;
  title: string | null;
  durationSeconds: number | null;
  duplicate: boolean;
}

export interface EnqueueFailure {
  entry: SelectionEntry;
  message: string;
}

export interface SelectionRequest {
  heading: string;
  entries: SelectionEntry[];
  buildParams: (entry: SelectionEntry) => EnqueueParams;
  /** Chamado quando ao menos um item entrou na fila; recebe os que falharam. */
  onEnqueued?: (failures: EnqueueFailure[]) => void;
  /** Quando o link é um vídeo dentro de uma playlist: abandona a seleção e segue só com o vídeo. */
  onSingleVideo?: () => void;
}

let active: { request: SelectionRequest; checked: boolean[] } | null = null;
let confirming = false;

/** Enfileira em sequência e devolve quem falhou, com o motivo. */
export async function enqueueEntries(entries: SelectionEntry[], buildParams: SelectionRequest["buildParams"]): Promise<EnqueueFailure[]> {
  const failures: EnqueueFailure[] = [];
  for (const entry of entries) {
    try {
      await enqueueDownload(buildParams(entry));
    } catch (error) {
      failures.push({ entry, message: errorMessage(error) });
    }
  }
  return failures;
}

export function reportEnqueueFailures(failures: EnqueueFailure[], total: number) {
  if (failures.length === 0) return;
  const prefix = total === 1 ? UI_STRINGS.errorStartDownload : UI_STRINGS.errorEnqueuePartial;
  setFieldError(elements.urlError, `${prefix} ${failures[0].message}`);
}

export function openSelection(request: SelectionRequest) {
  active = { request, checked: request.entries.map((entry) => !entry.duplicate) };
  if (elements.selectionHeading) elements.selectionHeading.textContent = request.heading;
  const hasDuplicates = request.entries.some((entry) => entry.duplicate);
  if (elements.selectionNote) {
    elements.selectionNote.textContent = UI_STRINGS.selectionDuplicateNote;
    toggle(elements.selectionNote, hasDuplicates);
  }
  renderRows();
  toggle(elements.selectionSingleBtn, Boolean(request.onSingleVideo));
  toggle(elements.selectionPanel, true);
  elements.selectionPanel?.scrollIntoView({ block: "nearest" });
}

export function isSelectionOpen(): boolean {
  return active !== null;
}

/** Enquanto os itens estão sendo enfileirados o painel não fecha: o envio não é abortável. */
export function closeSelection() {
  if (confirming) return;
  active = null;
  toggle(elements.selectionPanel, false);
}

function selectedCount(): number {
  return active?.checked.filter(Boolean).length ?? 0;
}

function renderCount() {
  if (!active) return;
  const count = selectedCount();
  if (elements.selectionCount) elements.selectionCount.textContent = `${count}/${active.checked.length} ${UI_STRINGS.selectionSelected}`;
  if (elements.selectionConfirmBtn) {
    elements.selectionConfirmBtn.textContent = `${UI_STRINGS.selectionDownload} ${count}`;
    elements.selectionConfirmBtn.disabled = count === 0 || confirming;
  }
  if (elements.selectionCancelBtn) elements.selectionCancelBtn.disabled = confirming;
  if (elements.selectionSingleBtn) elements.selectionSingleBtn.disabled = confirming;
}

function chooseSingleVideo() {
  const onSingleVideo = active?.request.onSingleVideo;
  if (!onSingleVideo || confirming) return;
  closeSelection();
  onSingleVideo();
}

function renderRows() {
  const list = elements.selectionList;
  if (!list || !active) return;
  list.replaceChildren();

  active.request.entries.forEach((entry, index) => {
    const row = document.createElement("label");
    row.className = "flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 transition-colors duration-150 hover:bg-surface-2 pointer-coarse:min-h-11";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "size-4 shrink-0 cursor-pointer accent-accent";
    checkbox.checked = active?.checked[index] ?? false;
    checkbox.addEventListener("change", () => {
      if (!active) return;
      active.checked[index] = checkbox.checked;
      renderCount();
    });

    const text = document.createElement("span");
    text.className = "min-w-0 flex-1 truncate text-xs text-fg";
    text.textContent = entry.title || entry.url;
    text.title = entry.url;

    row.append(checkbox, text);

    if (entry.duplicate) {
      const badge = document.createElement("span");
      badge.className = "shrink-0 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[0.625rem] font-semibold text-fg-3";
      badge.textContent = UI_STRINGS.selectionDuplicateBadge;
      row.appendChild(badge);
    }
    if (entry.durationSeconds !== null) {
      const duration = document.createElement("span");
      duration.className = "shrink-0 font-mono text-[0.6875rem] text-fg-3";
      duration.textContent = formatDuration(entry.durationSeconds);
      row.appendChild(duration);
    }
    list.appendChild(row);
  });
  renderCount();
}

function setAll(value: boolean) {
  if (!active) return;
  active.checked = active.checked.map(() => value);
  renderRows();
}

async function confirmSelection() {
  if (!active || confirming) return;
  const { request, checked } = active;
  const chosen = request.entries.filter((_, index) => checked[index]);
  if (chosen.length === 0) return;

  confirming = true;
  renderCount();
  clearFieldErrors();
  const failures = await enqueueEntries(chosen, request.buildParams);
  confirming = false;
  if (active?.request === request) closeSelection();
  // Antes do aviso: mexer no campo de URL dispara `input`, que limpa o erro exibido.
  if (failures.length < chosen.length) request.onEnqueued?.(failures);
  reportEnqueueFailures(failures, chosen.length);
}

export function initSelectionUI() {
  elements.selectionAllBtn?.addEventListener("click", () => setAll(true));
  elements.selectionNoneBtn?.addEventListener("click", () => setAll(false));
  elements.selectionConfirmBtn?.addEventListener("click", () => void confirmSelection());
  elements.selectionCancelBtn?.addEventListener("click", closeSelection);
  elements.selectionSingleBtn?.addEventListener("click", chooseSingleVideo);
}
