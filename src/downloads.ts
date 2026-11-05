import {
  bridge,
  type ConversionFinished,
  type ConversionProgress,
  type DownloadFinished,
  type DownloadProgress,
  type MediaReport,
  type StartDownloadOptions,
} from "./bridge";
import { UI_STRINGS, elements, state, type ConversionState, type DownloadItem } from "./state";
import { errorMessage, friendlyErrorMessage, looksLikePlaylist, toggle } from "./utils";
import { setDebugDownload } from "./ui/debug";
import { setFieldError } from "./ui/feedback";
import { loadHistory } from "./ui/history";

/* ════════════════════════════════════════════════════════════════
   FILA DE DOWNLOADS — cards concorrentes, da criação ao fim
   ════════════════════════════════════════════════════════════════ */

/** Referências dos nós de progresso de cada card, pra atualizar sem re-render completo. */
const progressRefs = new Map<
  string,
  { fill: HTMLElement; track: HTMLElement; pct: HTMLElement; statusText: HTMLElement; statsText: HTMLElement }
>();

interface EnqueueParams {
  url: string;
  format: string;
  formatLabel: string;
  title: string | null;
  outputPath: string;
  options: StartDownloadOptions;
}

/** Dispara um download em background e adiciona o card na fila. Propaga erro síncrono do backend (ex: limite atingido). */
export async function enqueueDownload(params: EnqueueParams): Promise<void> {
  const id = await bridge.startDownload(params.url, params.format, params.outputPath, params.title ?? undefined, params.options);

  const item: DownloadItem = {
    id,
    url: params.url,
    title: params.title,
    formatLabel: params.formatLabel,
    format: params.format,
    outputPath: params.outputPath,
    options: params.options,
    phase: "active",
    percent: 0,
    speed: null,
    eta: null,
    error: null,
    resultPath: null,
    filePath: null,
    conversion: null,
  };
  state.downloads.set(id, item);
  setDebugDownload(id);
  renderDownloads();
}

export function initDownloadsUI() {
  elements.downloadsList?.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const card = target.closest<HTMLElement>("[data-download-id]");
    const id = card?.dataset.downloadId;
    if (!id) return;

    if (target.closest(".js-cancel")) void handleCancel(id);
    else if (target.closest(".js-retry")) void handleRetry(id);
    else if (target.closest(".js-open-folder")) void handleOpenFolder(id);
    else if (target.closest(".js-remove")) handleRemove(id);
    else if (target.closest(".js-convert")) void handleConvert(id);
    else if (target.closest(".js-cancel-convert")) void handleCancelConversion(id);
  });
}

async function handleCancel(id: string) {
  try {
    await bridge.cancelDownload(id);
  } catch (error) {
    console.error("Erro ao cancelar:", error);
    setFieldError(elements.urlError, UI_STRINGS.errorCancel);
  }
}

/** Só remove o card antigo depois do reenvio dar certo — senão um erro síncrono
 * (ex: limite de downloads simultâneos) faz o download sumir sem feedback. */
async function handleRetry(id: string) {
  const item = state.downloads.get(id);
  if (!item) return;
  try {
    await enqueueDownload({
      url: item.url,
      format: item.format,
      formatLabel: item.formatLabel,
      title: item.title,
      outputPath: item.outputPath,
      options: item.options,
    });
    handleRemove(id);
  } catch (error) {
    console.error("Erro ao reenviar download:", error);
    setFieldError(elements.urlError, `${UI_STRINGS.errorStartDownload} ${errorMessage(error)}`);
  }
}

async function handleOpenFolder(id: string) {
  const item = state.downloads.get(id);
  if (!item?.resultPath) return;
  try {
    await bridge.openPath(item.resultPath);
  } catch (error) {
    console.error("Erro ao abrir pasta:", error);
    setFieldError(elements.urlError, UI_STRINGS.errorOpenFolder);
  }
}

function handleRemove(id: string) {
  if (state.downloads.get(id)?.conversion?.phase === "running") void bridge.cancelConversion(id);
  state.downloads.delete(id);
  progressRefs.delete(id);
  renderDownloads();
}

export function updateDownloadProgress(progress: DownloadProgress) {
  const item = state.downloads.get(progress.id);
  if (!item) return;

  item.percent = progress.percent;
  item.speed = progress.speed;
  item.eta = progress.eta;

  const refs = progressRefs.get(progress.id);
  if (!refs) return;
  const clamped = Math.min(Math.max(progress.percent, 0), 100);
  refs.fill.style.width = `${clamped}%`;
  refs.track.setAttribute("aria-valuenow", String(Math.round(clamped)));
  refs.pct.textContent = `${Math.round(clamped)}%`;
  refs.statusText.textContent = progressStatusLabel(clamped);
  const parts: string[] = [];
  if (progress.speed) parts.push(progress.speed);
  if (progress.eta) parts.push(`ETA ${progress.eta}`);
  refs.statsText.textContent = parts.join(" • ");
}

function progressStatusLabel(percent: number): string {
  if (percent < 30) return UI_STRINGS.progressStarting;
  if (percent < 70) return UI_STRINGS.progressDownloading;
  if (percent < 100) return UI_STRINGS.progressFinalizing;
  return UI_STRINGS.progressComplete;
}

export function handleDownloadFinished(payload: DownloadFinished) {
  const item = state.downloads.get(payload.id);
  if (!item) return;

  item.phase = payload.status;
  item.resultPath = payload.path;
  item.filePath = payload.filePath;
  item.error = payload.error;
  renderDownloads();
  void loadHistory();
  // numa playlist só o último arquivo é conhecido, então não há o que oferecer
  if (payload.status === "done" && payload.filePath && !looksLikePlaylist(item.url)) {
    void offerConversionIfNeeded(item.id, payload.filePath);
  }
}

const renderedCards = new Map<string, { el: HTMLElement; key: string }>();

function renderKey(item: DownloadItem): string {
  return `${item.phase}:${item.conversion?.phase ?? ""}`;
}

/** Só cria/troca/remove os cards que mudaram: recriar todos reiniciava a animação e fechava os "Detalhes técnicos". */
function renderDownloads() {
  const list = elements.downloadsList;
  if (!list) return;

  toggle(elements.downloadsSection, state.downloads.size > 0);

  for (const [id, entry] of renderedCards) {
    if (!state.downloads.has(id)) {
      entry.el.remove();
      renderedCards.delete(id);
      progressRefs.delete(id);
      conversionRefs.delete(id);
    }
  }

  for (const item of state.downloads.values()) {
    const existing = renderedCards.get(item.id);
    const key = renderKey(item);
    if (existing && existing.key === key) continue;

    const el = buildCard(item);
    if (existing) {
      // mudou de fase (ex: ativo → concluído): troca no lugar, sem reanimar a entrada
      el.style.animation = "none";
      existing.el.replaceWith(el);
    } else {
      list.prepend(el);
    }
    renderedCards.set(item.id, { el, key });
  }
}

function buildCard(item: DownloadItem): HTMLElement {
  const card = document.createElement("div");
  card.className = "animate-appear rounded-[1.25rem] border border-line bg-surface px-[18px] py-4 shadow-card-sm";
  card.dataset.downloadId = item.id;

  const head = document.createElement("div");
  head.className = "mb-3.5 flex items-center gap-2.5";

  const title = document.createElement("span");
  title.className = "min-w-0 flex-1 truncate text-sm font-semibold text-fg";
  title.textContent = item.title || item.url;
  head.appendChild(title);

  const badge = document.createElement("span");
  badge.className = "flex h-[22px] shrink-0 items-center rounded-full border border-line-focus bg-accent-dim px-[9px] text-[0.6875rem] font-bold text-accent-bright";
  badge.textContent = item.formatLabel;
  head.appendChild(badge);

  if (item.phase !== "active") {
    const remove = document.createElement("button");
    remove.className = "js-remove flex size-[22px] shrink-0 items-center justify-center rounded-full text-fg-3 transition-colors duration-150 hover:bg-surface-3 hover:text-fg pointer-coarse:size-11";
    remove.setAttribute("aria-label", UI_STRINGS.downloadRemove);
    remove.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`;
    head.appendChild(remove);
  }

  card.appendChild(head);

  if (item.phase === "active") {
    card.appendChild(buildProgressRegion(item));
  } else {
    card.appendChild(buildOutcomeBanner(item));
    if (item.phase === "done" && item.conversion) card.appendChild(buildConversionPanel(item, item.conversion));
  }

  return card;
}

function buildProgressRegion(item: DownloadItem): HTMLElement {
  const region = document.createElement("div");
  region.className = "relative flex animate-appear flex-col gap-3.5";

  const header = document.createElement("div");
  header.className = "flex items-center gap-4";
  header.innerHTML = `
    <div class="relative flex size-[50px] shrink-0 items-center justify-center" aria-hidden="true">
      <div class="absolute inset-0 animate-ring rounded-full border-[1.5px] border-accent/20 motion-reduce:animate-none motion-reduce:opacity-50"></div>
      <div class="absolute inset-[7px] flex items-center justify-center rounded-full border border-accent/30 bg-accent-dim text-accent">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <polyline points="7 10 12 15 17 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </div>
    </div>
    <div class="min-w-0 flex-1">
      <p class="progress-status-text mb-[3px] text-base font-semibold tracking-[-0.02em] text-fg"></p>
      <p class="progress-stats-text min-h-[15px] font-mono text-[0.6875rem] tracking-[0.01em] text-fg-3"></p>
    </div>
    <div class="progress-pct min-w-[68px] shrink-0 text-right font-mono text-[1.875rem] leading-none font-bold tracking-[-0.04em] text-accent">0%</div>
  `;
  region.appendChild(header);

  const track = document.createElement("div");
  track.className = "relative h-1.5 overflow-hidden rounded-full bg-surface-3";
  track.setAttribute("role", "progressbar");
  track.setAttribute("aria-valuemin", "0");
  track.setAttribute("aria-valuemax", "100");
  const fill = document.createElement("div");
  fill.className = PROGRESS_FILL_CLASS;
  track.appendChild(fill);
  region.appendChild(track);

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "js-cancel btn-ghost h-[34px] self-start px-[15px] text-xs font-medium pointer-coarse:min-h-11";
  cancelBtn.textContent = "Cancelar";
  region.appendChild(cancelBtn);

  const statusText = header.querySelector(".progress-status-text") as HTMLElement;
  const statsText = header.querySelector(".progress-stats-text") as HTMLElement;
  const pct = header.querySelector(".progress-pct") as HTMLElement;
  progressRefs.set(item.id, { fill, track, pct, statusText, statsText });

  const clamped = Math.min(Math.max(item.percent, 0), 100);
  fill.style.width = `${clamped}%`;
  track.setAttribute("aria-valuenow", String(Math.round(clamped)));
  pct.textContent = `${Math.round(clamped)}%`;
  statusText.textContent = progressStatusLabel(clamped);
  const parts: string[] = [];
  if (item.speed) parts.push(item.speed);
  if (item.eta) parts.push(`ETA ${item.eta}`);
  statsText.textContent = parts.join(" • ");

  return region;
}

const BANNER_BTN = "btn-accent h-[34px] gap-[7px] rounded-lg px-3.5 text-xs tracking-[-0.015em] pointer-coarse:min-h-11";

const OUTCOME_CLASS: Record<"done" | "failed" | "cancelled", { banner: string; icon: string }> = {
  done: {
    banner: "border-green/20 bg-green-dim",
    icon: "border-green/30 bg-green-dim text-green shadow-[0_0_16px_rgba(52,211,153,0.28)]",
  },
  failed: {
    banner: "border-red/20 bg-red-dim",
    icon: "border-red/30 bg-red-dim text-red shadow-[0_0_16px_rgba(248,113,113,0.28)]",
  },
  cancelled: {
    banner: "border-line bg-surface-2",
    icon: "border-line-2 bg-surface-3 text-fg-3",
  },
};

function buildOutcomeBanner(item: DownloadItem): HTMLElement {
  const banner = document.createElement("div");
  banner.className = `flex animate-appear flex-wrap items-start gap-3 rounded-xl border px-4 py-3.5 ${OUTCOME_CLASS[item.phase as "done" | "failed" | "cancelled"].banner}`;

  const icon = document.createElement("div");
  icon.className = `flex size-[30px] shrink-0 items-center justify-center rounded-full border ${OUTCOME_CLASS[item.phase as "done" | "failed" | "cancelled"].icon}`;
  icon.innerHTML =
    item.phase === "done"
      ? `<svg class="banner-icon-success" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`
      : `<svg class="banner-icon-error" width="15" height="15" viewBox="0 0 24 24" fill="none"><line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>`;
  banner.appendChild(icon);

  const body = document.createElement("div");
  body.className = "min-w-[190px] flex-1";
  const bannerTitle = document.createElement("p");
  bannerTitle.className = "mb-0.5 text-sm font-bold tracking-[-0.025em] text-fg empty:hidden";
  bannerTitle.textContent =
    item.phase === "done" ? UI_STRINGS.statusDone : item.phase === "failed" ? UI_STRINGS.statusFailed : UI_STRINGS.statusCancelled;
  body.appendChild(bannerTitle);
  const bannerText = document.createElement("p");
  bannerText.className = `text-xs leading-[1.55] break-all ${item.phase === "done" ? "font-mono text-fg-2" : "text-red"}`;
  const rawError = item.phase !== "done" && item.error ? errorMessage(item.error) : null;
  bannerText.textContent = item.phase === "done" ? item.resultPath ?? "" : rawError ? friendlyErrorMessage(rawError) : "";
  body.appendChild(bannerText);

  if (rawError) {
    const details = document.createElement("details");
    details.className = "mt-2 text-[0.6875rem]";
    details.open = state.nerdMode;
    const summary = document.createElement("summary");
    summary.className = "cursor-pointer text-fg-3 select-none hover:text-fg-2";
    summary.textContent = "Detalhes técnicos";
    details.appendChild(summary);
    const rawText = document.createElement("code");
    rawText.className = "mt-1.5 block rounded-lg border border-line bg-surface-2 px-2.5 py-2 font-mono text-[0.6875rem] leading-normal break-all whitespace-pre-wrap text-fg-3";
    rawText.textContent = rawError;
    details.appendChild(rawText);
    body.appendChild(details);
  }

  banner.appendChild(body);

  const actions = document.createElement("div");
  actions.className = "flex flex-wrap items-center gap-2";
  if (item.phase === "done") {
    const openBtn = document.createElement("button");
    openBtn.className = `${BANNER_BTN} bg-green text-[#021c0e] shadow-[0_3px_14px_rgba(52,211,153,0.32)] hover:not-disabled:bg-green hover:not-disabled:shadow-[0_5px_20px_rgba(52,211,153,0.46)] js-open-folder`;
    openBtn.textContent = UI_STRINGS.downloadOpenFolder;
    actions.appendChild(openBtn);
  }
  if (item.phase === "failed" || item.phase === "cancelled") {
    const retryBtn = document.createElement("button");
    retryBtn.className = `${BANNER_BTN} shadow-accent-sm hover:not-disabled:shadow-accent-sm-hover js-retry`;
    retryBtn.textContent = UI_STRINGS.downloadRetry;
    actions.appendChild(retryBtn);
  }
  banner.appendChild(actions);

  return banner;
}

/* ════════════════════════════════════════════════════════════════
   CONVERSÃO PARA H.264 — oferecida no card concluído quando o codec
   baixado (VP9/AV1/Opus) costuma não abrir no Premiere e similares
   ════════════════════════════════════════════════════════════════ */

const PROGRESS_FILL_CLASS =
  "relative h-full w-0 rounded-full bg-linear-to-r from-accent to-accent-bright shadow-[0_0_10px_color-mix(in_srgb,var(--accent)_50%,transparent)] transition-[width] duration-[450ms] ease-app after:absolute after:top-0 after:right-0 after:h-full after:w-[50px] after:animate-shimmer after:rounded-full after:bg-linear-to-r after:from-transparent after:to-white/40 after:content-[''] motion-reduce:after:hidden";

const conversionRefs = new Map<string, { fill: HTMLElement; track: HTMLElement; pct: HTMLElement }>();

function describeCodecs(report: MediaReport): string {
  return [report.videoCodec, report.audioCodec]
    .filter((codec): codec is string => Boolean(codec))
    .map((codec) => codec.toUpperCase())
    .join(" + ");
}

async function offerConversionIfNeeded(id: string, filePath: string) {
  try {
    const report = await bridge.analyzeMedia(filePath);
    const item = state.downloads.get(id);
    if (!item || !report.needsConversion) return;
    item.conversion = { phase: "offer", report };
    renderDownloads();
  } catch (error) {
    console.warn("Não foi possível analisar o arquivo baixado:", error);
  }
}

async function handleConvert(id: string) {
  const item = state.downloads.get(id);
  const conversion = item?.conversion;
  if (!item || !item.filePath || !conversion) return;
  if (conversion.phase !== "offer" && conversion.phase !== "failed") return;

  item.conversion = { phase: "running", report: conversion.report, percent: 0 };
  renderDownloads();
  try {
    await bridge.startConversion(id, item.filePath);
  } catch (error) {
    console.error("Erro ao iniciar conversão:", error);
    item.conversion = { phase: "failed", report: conversion.report, error: errorMessage(error) };
    renderDownloads();
  }
}

async function handleCancelConversion(id: string) {
  try {
    await bridge.cancelConversion(id);
  } catch (error) {
    console.error("Erro ao cancelar conversão:", error);
    setFieldError(elements.urlError, UI_STRINGS.errorCancel);
  }
}

export function updateConversionProgress(progress: ConversionProgress) {
  const conversion = state.downloads.get(progress.id)?.conversion;
  if (conversion?.phase !== "running") return;

  const clamped = Math.min(Math.max(progress.percent, 0), 100);
  conversion.percent = clamped;
  const refs = conversionRefs.get(progress.id);
  if (!refs) return;
  refs.fill.style.width = `${clamped}%`;
  refs.track.setAttribute("aria-valuenow", String(Math.round(clamped)));
  refs.pct.textContent = `${Math.round(clamped)}%`;
}

export function handleConversionFinished(finished: ConversionFinished) {
  const item = state.downloads.get(finished.id);
  const conversion = item?.conversion;
  if (!item || conversion?.phase !== "running") return;

  if (finished.status === "done" && finished.path) {
    item.conversion = { phase: "done", outputPath: finished.path };
  } else if (finished.status === "failed") {
    item.conversion = { phase: "failed", report: conversion.report, error: finished.error ?? UI_STRINGS.conversionFailed };
  } else {
    item.conversion = { phase: "offer", report: conversion.report };
  }
  renderDownloads();
}

function buildConversionButton(label: string, jsClass: string, ghost: boolean): HTMLButtonElement {
  const button = document.createElement("button");
  const look = ghost ? "btn-ghost" : `${BANNER_BTN} shadow-accent-sm hover:not-disabled:shadow-accent-sm-hover`;
  button.className = `${look} h-[34px] px-3.5 text-xs pointer-coarse:min-h-11 ${jsClass}`;
  button.textContent = label;
  return button;
}

function buildConversionPanel(item: DownloadItem, conversion: ConversionState): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "mt-3 flex animate-appear flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3.5";

  const body = document.createElement("div");
  body.className = "min-w-[190px] flex-1";
  const title = document.createElement("p");
  title.className = "text-sm font-bold tracking-[-0.025em] text-fg";
  const text = document.createElement("p");
  text.className = "mt-0.5 text-xs leading-[1.55] text-fg-2";
  body.append(title, text);
  panel.appendChild(body);

  switch (conversion.phase) {
    case "offer":
      title.textContent = UI_STRINGS.conversionTitle;
      text.textContent = `O arquivo está em ${describeCodecs(conversion.report)} e o Premiere pode não importar. Converte para H.264 + AAC (MP4) usando ${conversion.report.encoder}.`;
      panel.appendChild(buildConversionButton(UI_STRINGS.conversionConvert, "js-convert", false));
      break;

    case "running": {
      title.textContent = UI_STRINGS.conversionRunning;
      text.textContent = conversion.report.encoder;

      const pct = document.createElement("span");
      pct.className = "shrink-0 font-mono text-lg leading-none font-bold text-accent";
      pct.textContent = `${Math.round(conversion.percent)}%`;
      panel.appendChild(pct);

      const track = document.createElement("div");
      track.className = "relative h-1.5 w-full basis-full overflow-hidden rounded-full bg-surface-3";
      track.setAttribute("role", "progressbar");
      track.setAttribute("aria-valuemin", "0");
      track.setAttribute("aria-valuemax", "100");
      track.setAttribute("aria-valuenow", String(Math.round(conversion.percent)));
      const fill = document.createElement("div");
      fill.className = PROGRESS_FILL_CLASS;
      fill.style.width = `${conversion.percent}%`;
      track.appendChild(fill);
      panel.appendChild(track);
      conversionRefs.set(item.id, { fill, track, pct });

      panel.appendChild(buildConversionButton(UI_STRINGS.conversionCancel, "js-cancel-convert", true));
      break;
    }

    case "done":
      title.textContent = UI_STRINGS.conversionDone;
      text.className = "mt-0.5 font-mono text-xs leading-[1.55] break-all text-fg-2";
      text.textContent = conversion.outputPath;
      break;

    case "failed":
      title.textContent = UI_STRINGS.conversionFailed;
      text.className = "mt-0.5 text-xs leading-[1.55] break-all text-red";
      text.textContent = conversion.error;
      panel.appendChild(buildConversionButton(UI_STRINGS.conversionRetry, "js-convert", false));
      break;
  }
  return panel;
}
