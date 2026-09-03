import { bridge, type DownloadFinished, type DownloadProgress, type StartDownloadOptions } from "./bridge";
import { UI_STRINGS, elements, state, type DownloadItem } from "./state";
import { errorMessage, friendlyErrorMessage, toggle } from "./utils";
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

    if (target.closest(".cancel-btn")) void handleCancel(id);
    else if (target.closest(".js-retry")) void handleRetry(id);
    else if (target.closest(".js-open-folder")) void handleOpenFolder(id);
    else if (target.closest(".js-remove")) handleRemove(id);
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
  item.error = payload.error;
  renderDownloads();
  void loadHistory();
}

function renderDownloads() {
  if (!elements.downloadsList) return;

  const hasItems = state.downloads.size > 0;
  toggle(elements.downloadsSection, hasItems);
  if (!hasItems) {
    elements.downloadsList.innerHTML = "";
    progressRefs.clear();
    return;
  }

  elements.downloadsList.innerHTML = "";
  progressRefs.clear();
  const items = Array.from(state.downloads.values()).reverse();
  for (const item of items) {
    elements.downloadsList.appendChild(buildCard(item));
  }
}

function buildCard(item: DownloadItem): HTMLElement {
  const card = document.createElement("div");
  card.className = "download-card";
  card.dataset.downloadId = item.id;

  const head = document.createElement("div");
  head.className = "download-card-head";

  const title = document.createElement("span");
  title.className = "download-card-title";
  title.textContent = item.title || item.url;
  head.appendChild(title);

  const badge = document.createElement("span");
  badge.className = "download-card-badge";
  badge.textContent = item.formatLabel;
  head.appendChild(badge);

  if (item.phase !== "active") {
    const remove = document.createElement("button");
    remove.className = "download-card-remove js-remove";
    remove.setAttribute("aria-label", UI_STRINGS.downloadRemove);
    remove.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`;
    head.appendChild(remove);
  }

  card.appendChild(head);

  if (item.phase === "active") {
    card.appendChild(buildProgressRegion(item));
  } else {
    card.appendChild(buildOutcomeBanner(item));
  }

  return card;
}

function buildProgressRegion(item: DownloadItem): HTMLElement {
  const region = document.createElement("div");
  region.className = "progress-region";

  const header = document.createElement("div");
  header.className = "progress-header-row";
  header.innerHTML = `
    <div class="progress-orb" aria-hidden="true">
      <div class="orb-ring-outer"></div>
      <div class="orb-core">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <polyline points="7 10 12 15 17 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </div>
    </div>
    <div class="progress-labels">
      <p class="progress-status-text"></p>
      <p class="progress-stats-text"></p>
    </div>
    <div class="progress-pct">0%</div>
  `;
  region.appendChild(header);

  const track = document.createElement("div");
  track.className = "progress-track";
  track.setAttribute("role", "progressbar");
  track.setAttribute("aria-valuemin", "0");
  track.setAttribute("aria-valuemax", "100");
  const fill = document.createElement("div");
  fill.className = "progress-fill";
  track.appendChild(fill);
  region.appendChild(track);

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "cancel-btn";
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

const OUTCOME_CLASS: Record<"done" | "failed" | "cancelled", string> = {
  done: "is-success",
  failed: "is-error",
  cancelled: "is-cancelled",
};

function buildOutcomeBanner(item: DownloadItem): HTMLElement {
  const banner = document.createElement("div");
  banner.className = `outcome-banner ${OUTCOME_CLASS[item.phase as "done" | "failed" | "cancelled"]}`;

  const icon = document.createElement("div");
  icon.className = "banner-icon";
  icon.innerHTML =
    item.phase === "done"
      ? `<svg class="banner-icon-success" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`
      : `<svg class="banner-icon-error" width="15" height="15" viewBox="0 0 24 24" fill="none"><line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>`;
  banner.appendChild(icon);

  const body = document.createElement("div");
  body.className = "banner-body";
  const bannerTitle = document.createElement("p");
  bannerTitle.className = "banner-title";
  bannerTitle.textContent =
    item.phase === "done" ? UI_STRINGS.statusDone : item.phase === "failed" ? UI_STRINGS.statusFailed : UI_STRINGS.statusCancelled;
  body.appendChild(bannerTitle);
  const bannerText = document.createElement("p");
  bannerText.className = "banner-text";
  const rawError = item.phase !== "done" && item.error ? errorMessage(item.error) : null;
  bannerText.textContent = item.phase === "done" ? item.resultPath ?? "" : rawError ? friendlyErrorMessage(rawError) : "";
  body.appendChild(bannerText);

  if (rawError) {
    const details = document.createElement("details");
    details.className = "banner-details";
    details.open = state.nerdMode;
    const summary = document.createElement("summary");
    summary.textContent = "Detalhes técnicos";
    details.appendChild(summary);
    const rawText = document.createElement("code");
    rawText.className = "banner-raw-error";
    rawText.textContent = rawError;
    details.appendChild(rawText);
    body.appendChild(details);
  }

  banner.appendChild(body);

  const actions = document.createElement("div");
  actions.className = "banner-actions";
  if (item.phase === "done") {
    const openBtn = document.createElement("button");
    openBtn.className = "banner-btn success-btn js-open-folder";
    openBtn.textContent = UI_STRINGS.downloadOpenFolder;
    actions.appendChild(openBtn);
  }
  if (item.phase === "failed" || item.phase === "cancelled") {
    const retryBtn = document.createElement("button");
    retryBtn.className = "banner-btn amber-btn js-retry";
    retryBtn.textContent = UI_STRINGS.downloadRetry;
    actions.appendChild(retryBtn);
  }
  banner.appendChild(actions);

  return banner;
}
