import { checkbox } from "../components/checkbox";
import { h } from "../components/dom";
import { setButtonBusy } from "../components/button";
import { toast } from "../components/toast";
import { enqueueDownload, type EnqueueParams } from "../downloads";
import { UI_STRINGS } from "../state";
import { errorMessage, formatDuration } from "../utils";
import { refs } from "./refs";

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

let active: { request: SelectionRequest; checked: boolean[]; boxes: HTMLInputElement[] } | null = null;
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
  refs.message.error(`${prefix} ${failures[0].message}`);
}

export function isSelectionOpen(): boolean {
  return active !== null;
}

export function openSelection(request: SelectionRequest) {
  active = { request, checked: request.entries.map((entry) => !entry.duplicate), boxes: [] };
  refs.selectionTitle.textContent = request.heading;
  const hasDuplicates = request.entries.some((entry) => entry.duplicate);
  refs.selectionNote.textContent = hasDuplicates ? UI_STRINGS.selectionDuplicateNote : "";
  refs.selectionNote.classList.toggle("is-hidden", !hasDuplicates);
  refs.selectionSingle.classList.toggle("is-hidden", !request.onSingleVideo);
  renderRows();
  refs.selectionPanel.classList.remove("is-hidden");
  refs.selectionPanel.scrollIntoView({ block: "nearest", behavior: "smooth" });
  refs.selectionConfirm.focus({ preventScroll: true });
}

/** Enquanto os itens estão sendo enfileirados o painel não fecha: o envio não é abortável. */
export function closeSelection() {
  if (confirming) return;
  active = null;
  refs.selectionPanel.classList.add("is-hidden");
}

function selectedCount(): number {
  return active?.checked.filter(Boolean).length ?? 0;
}

function renderCount() {
  if (!active) return;
  const count = selectedCount();
  refs.selectionCount.textContent = `${count}/${active.checked.length} ${UI_STRINGS.selectionSelected}`;
  refs.selectionConfirm.querySelector(".btn__label")!.textContent = `${UI_STRINGS.selectionDownload} ${count}`;
  refs.selectionConfirm.disabled = count === 0 || confirming;
  refs.selectionCancel.disabled = confirming;
  refs.selectionSingle.disabled = confirming;
}

function renderRows() {
  if (!active) return;
  const current = active;
  current.boxes = [];
  refs.selectionList.replaceChildren(
    ...current.request.entries.map((entry, index) => {
      const control = checkbox({
        label: entry.title || entry.url,
        checked: current.checked[index],
        onChange: (checked) => {
          current.checked[index] = checked;
          renderCount();
        },
      });
      current.boxes.push(control.input);
      control.element.title = entry.url;
      return h(
        "div",
        { class: "sel__row" },
        control.element,
        entry.duplicate ? h("span", { class: "badge" }, UI_STRINGS.selectionDuplicateBadge) : null,
        entry.durationSeconds !== null ? h("span", { class: "sel__meta" }, formatDuration(entry.durationSeconds)) : null
      );
    })
  );
  renderCount();
}

function setAll(value: boolean) {
  if (!active) return;
  active.checked = active.checked.map(() => value);
  active.boxes.forEach((box) => (box.checked = value));
  renderCount();
}

async function confirmSelection() {
  if (!active || confirming || selectedCount() === 0) return;
  const { request, checked } = active;
  const chosen = request.entries.filter((_, index) => checked[index]);
  confirming = true;
  setButtonBusy(refs.selectionConfirm, true);
  renderCount();
  try {
    const failures = await enqueueEntries(chosen, request.buildParams);
    confirming = false;
    if (failures.length < chosen.length) {
      closeSelection();
      toast({ kind: "success", message: `${chosen.length - failures.length} ${chosen.length - failures.length === 1 ? "item entrou" : "itens entraram"} na fila` });
      request.onEnqueued?.(failures);
    }
    reportEnqueueFailures(failures, chosen.length);
  } finally {
    confirming = false;
    setButtonBusy(refs.selectionConfirm, false);
    renderCount();
  }
}

function chooseSingleVideo() {
  const onSingleVideo = active?.request.onSingleVideo;
  if (!onSingleVideo || confirming) return;
  closeSelection();
  onSingleVideo();
}

export function initSelectionUI() {
  refs.selectionAll.addEventListener("click", () => setAll(true));
  refs.selectionNone.addEventListener("click", () => setAll(false));
  refs.selectionCancel.addEventListener("click", closeSelection);
  refs.selectionConfirm.addEventListener("click", () => void confirmSelection());
  refs.selectionSingle.addEventListener("click", chooseSingleVideo);
}
