import {
  bridge,
  type ConversionFinished,
  type ConversionProgress,
  type DebugCommand,
  type DebugLine,
  type DownloadFinished,
  type DownloadProgress,
  type MediaReport,
  type QueueItem,
  type StartDownloadOptions,
} from "./bridge";
import { button } from "./components/button";
import { disclosure } from "./components/disclosure";
import { clamp, h, shortenPath } from "./components/dom";
import { icon } from "./components/icons";
import { progressBar, type ProgressBarControl } from "./components/progress";
import { createTape, type TapeControl } from "./components/tape";
import { toast } from "./components/toast";
import { prefs } from "./prefs";
import { UI_STRINGS, state, type ConversionState, type DownloadItem } from "./state";
import { errorMessage, friendlyErrorMessage, looksLikePlaylist } from "./utils";
import { loadHistory } from "./ui/history";
import { refs } from "./ui/refs";

export interface EnqueueParams {
  url: string;
  format: string;
  formatLabel: string;
  title: string | null;
  outputPath: string;
  options: StartDownloadOptions;
}

interface CardRefs {
  element: HTMLElement;
  key: string;
  tape: TapeControl;
  bar: ProgressBarControl | null;
  percent: HTMLElement | null;
  meta: HTMLElement;
  optimizeBar: ProgressBarControl | null;
  optimizePercent: HTMLElement | null;
  command: HTMLElement | null;
  log: HTMLElement | null;
}

const cards = new Map<string, CardRefs>();
const dismissedIds = new Set<string>();
const stampedIds = new Set<string>();
const techOpenIds = new Set<string>();
const pendingCommands = new Map<string, string>();
const pendingLines = new Map<string, { stream: "stdout" | "stderr"; text: string }[]>();
const DEBUG_LOG_MAX_LINES = 500;

let liveRegion: HTMLElement | null = null;
function announce(message: string) {
  if (!liveRegion) {
    liveRegion = h("div", { class: "sr-only", role: "status", "aria-live": "polite" });
    document.body.appendChild(liveRegion);
  }
  liveRegion.textContent = "";
  requestAnimationFrame(() => (liveRegion!.textContent = message));
}

function takeBuffered<T>(buffer: Map<string, T>, id: string): T | undefined {
  const value = buffer.get(id);
  buffer.delete(id);
  return value;
}

function newItem(fields: Pick<DownloadItem, "id" | "url" | "title" | "formatLabel" | "format" | "outputPath" | "options" | "phase">): DownloadItem {
  return {
    ...fields,
    percent: 0,
    speed: null,
    eta: null,
    error: null,
    resultPath: null,
    filePath: null,
    conversion: null,
    optimizeDir: null,
    debugCommand: takeBuffered(pendingCommands, fields.id) ?? null,
    debugLines: takeBuffered(pendingLines, fields.id) ?? [],
  };
}

export function formatLabelFor(format: string): string {
  if (format === "quick-mp3") return "MP3";
  if (format === "quick-mp4" || format === "best") return "MP4";
  return format;
}

function startOptionsFrom({ options, scheduledAt }: QueueItem): StartDownloadOptions {
  return {
    scheduledAt: scheduledAt ?? undefined,
    sectionStart: options.section?.[0],
    sectionEnd: options.section?.[1],
    subLangs: options.subLangs ?? undefined,
    extraArgs: options.extraArgs ?? undefined,
    cookiesBrowser: options.cookiesBrowser ?? undefined,
    limitRate: options.limitRate ?? undefined,
    nameTemplate: options.nameTemplate ?? undefined,
    embedThumbnail: options.embedThumbnail || undefined,
    embedChapters: options.embedChapters || undefined,
    embedMetadata: options.embedMetadata || undefined,
    sponsorblock: options.sponsorblock ?? undefined,
    proxy: options.proxy ?? undefined,
  };
}

function isPending(phase: DownloadItem["phase"]): phase is "queued" | "active" | "paused" {
  return phase === "queued" || phase === "active" || phase === "paused";
}

/** Propaga erro síncrono do backend (ex: opção inválida). */
export async function enqueueDownload(params: EnqueueParams): Promise<void> {
  const id = await bridge.startDownload(params.url, params.format, params.outputPath, params.title ?? undefined, params.options);

  // O evento "queue-changed" chega antes do comando retornar: o card pode já existir sem o rótulo de formato.
  const existing = state.downloads.get(id);
  if (existing) {
    existing.formatLabel = params.formatLabel;
    existing.options = params.options;
    dropCard(id);
  } else {
    state.downloads.set(
      id,
      newItem({ id, url: params.url, title: params.title, formatLabel: params.formatLabel, format: params.format, outputPath: params.outputPath, options: params.options, phase: "queued" })
    );
  }
  renderDownloads();
}

/** Espelha a fila do backend (fonte da verdade): cria cards de itens restaurados e atualiza o estado dos conhecidos. */
export function syncQueue(items: QueueItem[]) {
  for (const queued of items) {
    if (dismissedIds.has(queued.id)) continue;
    const existing = state.downloads.get(queued.id);
    if (existing) {
      if (isPending(existing.phase)) existing.phase = queued.status;
      continue;
    }
    state.downloads.set(
      queued.id,
      newItem({
        id: queued.id,
        url: queued.url,
        title: queued.title,
        formatLabel: formatLabelFor(queued.format),
        format: queued.format,
        outputPath: queued.outputDir,
        options: startOptionsFrom(queued),
        phase: queued.status,
      })
    );
  }
  renderDownloads();
}

function queuedStatusLabel(item: DownloadItem): string {
  const scheduledAt = item.options.scheduledAt;
  if (!scheduledAt || scheduledAt * 1000 <= Date.now()) return UI_STRINGS.statusQueued;
  const when = new Date(scheduledAt * 1000).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  return `${UI_STRINGS.statusScheduled} ${when}`;
}

function progressLabel(percent: number): string {
  if (percent < 15) return UI_STRINGS.progressStarting;
  if (percent < 90) return UI_STRINGS.progressDownloading;
  return UI_STRINGS.progressFinalizing;
}

function metaFor(item: DownloadItem): HTMLElement[] {
  switch (item.phase) {
    case "queued":
      return [h("span", {}, queuedStatusLabel(item))];
    case "paused":
      return [h("span", {}, UI_STRINGS.statusPaused)];
    case "active": {
      const stats = [item.speed, item.eta ? `faltam ${item.eta}` : null].filter(Boolean).join(" · ");
      return [h("span", {}, progressLabel(item.percent)), stats ? h("span", { class: "mono" }, stats) : h("span")];
    }
    case "done":
      return [h("span", { class: "mono", title: item.resultPath ?? "" }, item.resultPath ? shortenPath(item.resultPath, 3) : UI_STRINGS.statusDone)];
    case "failed":
      return [h("span", { class: "is-error" }, item.error ? friendlyErrorMessage(errorMessage(item.error)) : UI_STRINGS.statusFailed)];
    case "cancelled":
      return [h("span", {}, UI_STRINGS.statusCancelled)];
  }
}

function paintMeta(target: HTMLElement, item: DownloadItem) {
  target.replaceChildren(...metaFor(item));
}

function dropCard(id: string) {
  cards.get(id)?.element.remove();
  cards.delete(id);
}

/** Só cria, troca ou remove os cards que mudaram: recriar tudo reiniciaria animações e fecharia os detalhes técnicos. */
export function renderDownloads() {
  const list = refs.shelfList;
  if (!list) return;

  for (const id of [...cards.keys()]) if (!state.downloads.has(id)) dropCard(id);

  for (const item of state.downloads.values()) {
    const key = `${item.phase}:${item.conversion?.phase ?? ""}:${item.optimizeDir ?? ""}`;
    const existing = cards.get(item.id);
    if (existing?.key === key) continue;

    const built = buildCard(item, key);
    if (existing) {
      built.element.style.animation = "none";
      existing.element.replaceWith(built.element);
    } else {
      list.prepend(built.element);
    }
    cards.set(item.id, built);
  }

  const total = state.downloads.size;
  const running = [...state.downloads.values()].filter((item) => item.phase === "active").length;
  refs.shelfEmpty.classList.toggle("is-hidden", total > 0);
  refs.shelfList.classList.toggle("is-hidden", total === 0);
  refs.shelfCount.textContent = total === 0 ? "" : running > 0 ? `${running} baixando · ${total} no total` : `${total} ${total === 1 ? "item" : "itens"}`;
}

export function initDownloadsUI() {
  renderDownloads();
}

async function runQueueAction(action: () => Promise<void>) {
  try {
    await action();
  } catch (error) {
    console.error("Failed to change the queue:", error);
    toast({ kind: "error", message: errorMessage(error) });
  }
}

async function handleCancel(id: string) {
  try {
    await bridge.cancelDownload(id);
  } catch (error) {
    console.error("Failed to cancel:", error);
    toast({ kind: "error", message: UI_STRINGS.errorCancel });
  }
}

/** Só remove o card antigo depois do reenvio dar certo: um erro síncrono não pode fazer o download sumir. */
async function handleRetry(id: string) {
  const item = state.downloads.get(id);
  if (!item) return;
  try {
    await enqueueDownload({ url: item.url, format: item.format, formatLabel: item.formatLabel, title: item.title, outputPath: item.outputPath, options: item.options });
    handleRemove(id);
  } catch (error) {
    console.error("Failed to resubmit download:", error);
    toast({ kind: "error", message: `${UI_STRINGS.errorStartDownload} ${errorMessage(error)}` });
  }
}

async function handleOpenFolder(id: string) {
  const item = state.downloads.get(id);
  if (!item?.resultPath) return;
  try {
    await bridge.openPath(item.resultPath);
  } catch (error) {
    console.error("Failed to open folder:", error);
    toast({ kind: "error", message: UI_STRINGS.errorOpenFolder });
  }
}

function handleRemove(id: string) {
  if (state.downloads.get(id)?.conversion?.phase === "running") void bridge.cancelConversion(id);
  dismissedIds.add(id);
  stampedIds.delete(id);
  techOpenIds.delete(id);
  pendingCommands.delete(id);
  pendingLines.delete(id);
  state.downloads.delete(id);
  const card = cards.get(id);
  if (!card) return renderDownloads();
  card.element.classList.add("is-leaving");
  cards.delete(id);
  setTimeout(() => {
    card.element.remove();
    renderDownloads();
  }, 300);
}

export function updateDownloadProgress(progress: DownloadProgress) {
  const item = state.downloads.get(progress.id);
  if (!item || item.phase !== "active") return;
  item.percent = clamp(progress.percent, 0, 100);
  item.speed = progress.speed;
  item.eta = progress.eta;

  const card = cards.get(progress.id);
  if (!card) return;
  card.tape.update("active", item.percent);
  card.bar?.set(item.percent);
  if (card.percent) card.percent.textContent = `${Math.round(item.percent)}%`;
  paintMeta(card.meta, item);
}

export function handleDownloadFinished(payload: DownloadFinished) {
  const item = state.downloads.get(payload.id);
  if (!item) return;
  item.phase = payload.status;
  item.resultPath = payload.path;
  item.filePath = payload.filePath;
  item.error = payload.error;
  if (payload.status === "done") item.percent = 100;
  renderDownloads();
  void loadHistory();
  const name = item.title || item.url;
  announce(payload.status === "done" ? `Download concluído: ${name}` : payload.status === "failed" ? `Download falhou: ${name}` : `Download cancelado: ${name}`);
  // numa playlist só o último arquivo é conhecido, então não há o que oferecer
  if (payload.status === "done" && payload.filePath && !looksLikePlaylist(item.url)) {
    void offerOptimizationIfNeeded(item.id, payload.filePath);
  }
}

export function handleDebugCommand(command: DebugCommand) {
  const item = state.downloads.get(command.id);
  if (!item) {
    pendingCommands.set(command.id, command.command);
    return;
  }
  item.debugCommand = command.command;
  const card = cards.get(command.id);
  if (card?.command) card.command.textContent = command.command;
}

export function handleDebugLine(line: DebugLine) {
  const item = state.downloads.get(line.id);
  const entry = { stream: line.stream, text: line.text };
  if (!item) {
    const buffered = pendingLines.get(line.id) ?? [];
    buffered.push(entry);
    pendingLines.set(line.id, buffered);
    return;
  }
  item.debugLines.push(entry);
  if (item.debugLines.length > DEBUG_LOG_MAX_LINES) item.debugLines.splice(0, item.debugLines.length - DEBUG_LOG_MAX_LINES);
  const log = cards.get(line.id)?.log;
  if (!log) return;
  const stick = log.scrollTop + log.clientHeight >= log.scrollHeight - 8;
  log.appendChild(logLine(entry));
  if (stick) log.scrollTop = log.scrollHeight;
}

function logLine(entry: { stream: "stdout" | "stderr"; text: string }): HTMLElement {
  return h("div", { class: entry.stream === "stderr" ? "is-stderr" : "" }, entry.text);
}

/* ── Card ──────────────────────────────────────────────────── */

function shortFormat(label: string): string {
  return label.length > 8 ? label.slice(0, 8) : label;
}

function buildTechnical(item: DownloadItem): { element: HTMLElement; command: HTMLElement; log: HTMLElement } {
  const command = h("code", { "data-empty": "O comando aparece quando o download começa" }, item.debugCommand ?? "");
  const log = h("div", { class: "log", "data-empty": "Aguardando a saída do yt-dlp...", "aria-live": "off" }, ...item.debugLines.map(logLine));
  const box = h("div", { class: "techbox" }, command, log);
  const control = disclosure({
    title: "Detalhes técnicos",
    content: box,
    open: techOpenIds.has(item.id) || prefs.technicalOpen,
    className: "disclosure--quiet",
    onToggle: (open) => {
      if (open) techOpenIds.add(item.id);
      else techOpenIds.delete(item.id);
      if (open) requestAnimationFrame(() => (log.scrollTop = log.scrollHeight));
    },
  });
  return { element: control.element, command, log };
}

function actionButton(label: string, iconName: Parameters<typeof icon>[0], onClick: () => void, variant: "secondary" | "ghost" | "primary" = "ghost") {
  return button({ label, icon: iconName, variant, size: "sm", onClick });
}

function buildCard(item: DownloadItem, key: string): CardRefs {
  const tape = createTape(shortFormat(item.formatLabel).toUpperCase());
  tape.update(item.phase === "queued" ? "queued" : item.phase, item.percent);

  const title = h("span", { class: "tapecard__title", title: item.title || item.url }, item.title || item.url);
  const head = h("div", { class: "tapecard__head" }, title, h("span", { class: "sticker" }, item.formatLabel));
  const meta = h("div", { class: "tapecard__meta" });
  paintMeta(meta, item);

  let remove: HTMLButtonElement | null = null;
  if (!isPending(item.phase)) {
    remove = button({ icon: "x", variant: "ghost", size: "sm", ariaLabel: UI_STRINGS.downloadRemove, tooltip: UI_STRINGS.downloadRemove, onClick: () => handleRemove(item.id) });
    head.appendChild(remove);
  }

  const body = h("div", { class: "tapecard__body" }, head, meta);
  const side = h("div", { class: "tapecard__side" });
  const more = h("div", { class: "tapecard__more" });
  let bar: ProgressBarControl | null = null;
  let percent: HTMLElement | null = null;

  if (isPending(item.phase)) {
    bar = progressBar(`Progresso de ${item.title || "download"}`);
    bar.set(item.percent, item.phase === "queued");
    body.appendChild(bar.element);
    percent = h("div", { class: "tapecard__pct" }, `${Math.round(item.percent)}%`);
    side.appendChild(percent);

    const actions = h("div", { class: "tapecard__actions" });
    if (item.phase === "queued") actions.appendChild(actionButton(UI_STRINGS.downloadPrioritize, "bolt", () => void runQueueAction(() => bridge.reorderDownload(item.id, 0))));
    if (item.phase === "paused") actions.appendChild(actionButton(UI_STRINGS.downloadResume, "play", () => void runQueueAction(() => bridge.resumeDownload(item.id)), "secondary"));
    else if (item.phase === "active") actions.appendChild(actionButton(UI_STRINGS.downloadPause, "pause", () => void runQueueAction(() => bridge.pauseDownload(item.id)), "secondary"));
    actions.appendChild(actionButton(UI_STRINGS.downloadCancel, "x", () => void handleCancel(item.id)));
    body.appendChild(actions);
  } else {
    const kind = item.phase;
    const stamp = h("span", { class: ["stamp", kind !== "done" && `stamp--${kind}`] }, kind === "done" ? "PRONTO" : kind === "failed" ? "FALHOU" : "CANCELADO");
    if (kind === "done" && !stampedIds.has(item.id)) {
      stampedIds.add(item.id);
      stamp.classList.add("is-stamping");
    }
    side.appendChild(stamp);
    const actions = h("div", { class: "tapecard__actions" });
    if (kind === "done") actions.appendChild(actionButton(UI_STRINGS.downloadOpenFolder, "folder", () => void handleOpenFolder(item.id), "secondary"));
    else actions.appendChild(actionButton(UI_STRINGS.downloadRetry, "refresh", () => void handleRetry(item.id), "secondary"));
    body.appendChild(actions);
  }

  let optimizeBar: ProgressBarControl | null = null;
  let optimizePercent: HTMLElement | null = null;
  if (item.phase === "done" && item.conversion) {
    const panel = buildOptimizePanel(item, item.conversion);
    more.appendChild(panel.element);
    optimizeBar = panel.bar;
    optimizePercent = panel.percent;
  }

  const technical = buildTechnical(item);
  more.appendChild(technical.element);

  const element = h(
    "article",
    { class: "tapecard", "data-download-id": item.id, "data-state": item.phase, "aria-label": item.title || item.url },
    h("div", { class: "tapecard__tape" }, tape.element),
    body,
    side,
    more
  );

  return { element, key, tape, bar, percent, meta, optimizeBar, optimizePercent, command: technical.command, log: technical.log };
}

/* ── Otimizar compatibilidade ──────────────────────────────── */

function describeCodecs(report: MediaReport): string {
  return [report.videoCodec, report.audioCodec]
    .filter((codec): codec is string => Boolean(codec))
    .map((codec) => codec.toUpperCase())
    .join(" + ");
}

async function offerOptimizationIfNeeded(id: string, filePath: string) {
  try {
    const report = await bridge.analyzeMedia(filePath);
    const item = state.downloads.get(id);
    if (!item || !report.needsConversion) return;
    item.conversion = { phase: "offer", report };
    renderDownloads();
    if (prefs.autoOptimize) void startOptimization(id);
  } catch (error) {
    console.warn("Failed to inspect the downloaded file:", error);
  }
}

export async function startOptimization(id: string) {
  const item = state.downloads.get(id);
  const conversion = item?.conversion;
  if (!item || !item.filePath || !conversion) return;
  if (conversion.phase !== "offer" && conversion.phase !== "failed") return;

  item.conversion = { phase: "running", report: conversion.report, percent: 0 };
  renderDownloads();
  try {
    await bridge.startConversion(id, item.filePath, item.optimizeDir ?? undefined);
  } catch (error) {
    console.error("Failed to start optimization:", error);
    item.conversion = { phase: "failed", report: conversion.report, error: errorMessage(error) };
    renderDownloads();
  }
}

async function chooseOptimizeFolder(id: string) {
  const item = state.downloads.get(id);
  if (!item) return;
  try {
    const folder = await bridge.selectDownloadPath();
    if (!folder) return;
    item.optimizeDir = folder;
    renderDownloads();
  } catch (error) {
    console.error("Failed to choose folder:", error);
    toast({ kind: "error", message: UI_STRINGS.errorSelectDir });
  }
}

async function cancelOptimization(id: string) {
  try {
    await bridge.cancelConversion(id);
  } catch (error) {
    console.error("Failed to cancel optimization:", error);
    toast({ kind: "error", message: UI_STRINGS.errorCancel });
  }
}

export function updateConversionProgress(progress: ConversionProgress) {
  const conversion = state.downloads.get(progress.id)?.conversion;
  if (conversion?.phase !== "running") return;
  conversion.percent = clamp(progress.percent, 0, 100);
  const card = cards.get(progress.id);
  card?.optimizeBar?.set(conversion.percent);
  if (card?.optimizePercent) card.optimizePercent.textContent = `${Math.round(conversion.percent)}%`;
}

export function handleConversionFinished(finished: ConversionFinished) {
  const item = state.downloads.get(finished.id);
  const conversion = item?.conversion;
  if (!item || conversion?.phase !== "running") return;

  if (finished.status === "done" && finished.path) {
    item.conversion = { phase: "done", outputPath: finished.path };
    toast({ kind: "success", message: UI_STRINGS.optimizeDone, actionLabel: UI_STRINGS.downloadOpenFolder, onAction: () => void bridge.openPath(finished.path!) });
  } else if (finished.status === "failed") {
    item.conversion = { phase: "failed", report: conversion.report, error: finished.error ?? UI_STRINGS.optimizeFailed };
  } else {
    item.conversion = { phase: "offer", report: conversion.report };
  }
  renderDownloads();
}

function destinationRow(item: DownloadItem): HTMLElement {
  const chosen = item.optimizeDir;
  const change = button({ label: "Trocar pasta", icon: "folder", variant: "ghost", size: "sm", onClick: () => void chooseOptimizeFolder(item.id) });
  return h(
    "div",
    { class: "optimize__dest" },
    icon("folder", 16),
    h("span", {}, "Salvar em:"),
    h("span", { class: "mono", title: chosen ?? "" }, chosen ? shortenPath(chosen, 3) : UI_STRINGS.optimizeBesideOriginal),
    change
  );
}

function buildOptimizePanel(item: DownloadItem, conversion: ConversionState): { element: HTMLElement; bar: ProgressBarControl | null; percent: HTMLElement | null } {
  const title = h("h4", { class: "optimize__title" });
  const text = h("p", { class: "optimize__text" });
  const element = h("div", { class: "optimize", role: "group", "aria-label": UI_STRINGS.optimizeTitle }, title, text);
  let bar: ProgressBarControl | null = null;
  let percent: HTMLElement | null = null;

  switch (conversion.phase) {
    case "offer":
      title.textContent = UI_STRINGS.optimizeTitle;
      text.textContent = `Este arquivo está em ${describeCodecs(conversion.report)}, que nem todo programa, TV ou celular abre. Gere uma cópia MP4 (H.264 + AAC) compatível usando ${conversion.report.encoder}. O original continua intacto.`;
      element.append(destinationRow(item), h("div", { class: "tapecard__actions" }, button({ label: UI_STRINGS.optimizeAction, icon: "sparkle", variant: "primary", size: "sm", onClick: () => void startOptimization(item.id) })));
      break;

    case "running": {
      title.textContent = `${UI_STRINGS.optimizeRunning}...`;
      text.textContent = conversion.report.encoder;
      bar = progressBar("Progresso da otimização");
      bar.set(conversion.percent);
      percent = h("span", { class: "optimize__pct" }, `${Math.round(conversion.percent)}%`);
      element.append(h("div", { class: "optimize__row" }, bar.element, percent, button({ label: UI_STRINGS.optimizeCancel, variant: "ghost", size: "sm", onClick: () => void cancelOptimization(item.id) })));
      break;
    }

    case "done":
      title.textContent = UI_STRINGS.optimizeDone;
      text.className = "optimize__text mono";
      text.textContent = conversion.outputPath;
      element.append(h("div", { class: "tapecard__actions" }, button({ label: UI_STRINGS.downloadOpenFolder, icon: "folder", variant: "secondary", size: "sm", onClick: () => void bridge.openPath(conversion.outputPath) })));
      break;

    case "failed":
      title.textContent = UI_STRINGS.optimizeFailed;
      text.textContent = conversion.error;
      text.style.color = "var(--red)";
      element.append(h("div", { class: "tapecard__actions" }, button({ label: UI_STRINGS.optimizeRetry, icon: "refresh", variant: "secondary", size: "sm", onClick: () => void startOptimization(item.id) })));
      break;
  }
  return { element, bar, percent };
}
