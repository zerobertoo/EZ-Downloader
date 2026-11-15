import { bridge, type PlaylistItem, type StartDownloadOptions } from "./bridge";
import { setButtonBusy } from "./components/button";
import { confirmDialog } from "./components/dialog";
import { toast } from "./components/toast";
import { type EnqueueParams } from "./downloads";
import { prefs } from "./prefs";
import { UI_STRINGS, state } from "./state";
import { errorMessage, looksLikePlaylist, parseUrlList, singleVideoUrlOf } from "./utils";
import type { AdvancedOptions } from "./ui/advanced";
import { refs } from "./ui/refs";
import { enqueueEntries, openSelection, reportEnqueueFailures, type EnqueueFailure, type SelectionEntry } from "./ui/selection";

type EntryParamsBuilder = (entry: SelectionEntry) => EnqueueParams;

let advanced: AdvancedOptions;
let setPhaseHandler: (phase: typeof state.phase) => void = () => {};
let renderHandler: () => void = () => {};

/** Liga as dependências que só existem depois da tela montada (evita import circular com app.ts). */
export function bindDownloadDeps(deps: { advanced: AdvancedOptions; setPhase: (phase: typeof state.phase) => void; render: () => void }) {
  advanced = deps.advanced;
  setPhaseHandler = deps.setPhase;
  renderHandler = deps.render;
}

export function setUrlValue(value: string) {
  refs.urlInput.value = value;
  refs.urlInput.dispatchEvent(new Event("input", { bubbles: true }));
}

export function urlValue(): string {
  return refs.urlInput.value.trim();
}

/** Se a checagem falhar, segue sem marcar duplicatas: ela é um aviso, não pode travar o download. */
async function withDuplicateFlags(items: Pick<PlaylistItem, "url" | "title" | "durationSeconds">[]): Promise<SelectionEntry[]> {
  let duplicatePositions: number[] = [];
  try {
    duplicatePositions = await bridge.findDuplicates(items.map((item) => item.url));
  } catch (error) {
    console.warn("Failed to check duplicates:", error);
  }
  const duplicates = new Set(duplicatePositions);
  return items.map((item, index) => ({ ...item, duplicate: duplicates.has(index) }));
}

async function openPlaylistSelection(url: string, buildParams: EntryParamsBuilder, onEnqueued: (failures: EnqueueFailure[]) => void, cookiesBrowser?: string, onSingleVideo?: () => void) {
  refs.message.hint(UI_STRINGS.loadingPlaylist);
  let playlist;
  try {
    playlist = await bridge.getPlaylist(url, cookiesBrowser);
  } catch (error) {
    console.error("Failed to load playlist:", error);
    refs.message.error(`${UI_STRINGS.errorFetchPlaylist} ${errorMessage(error)}`);
    return;
  }
  if (playlist.items.length === 0) {
    refs.message.error(UI_STRINGS.errorEmptyPlaylist);
    return;
  }
  refs.message.clear();
  const entries = await withDuplicateFlags(playlist.items);
  openSelection({ heading: playlist.title || "Playlist", entries, buildParams, onEnqueued, onSingleVideo });
}

/** Troca o link pelo do vídeo avulso e refaz a ação pelo mesmo caminho do clique original. */
function singleVideoAction(url: string, retry: () => void): (() => void) | undefined {
  const singleUrl = singleVideoUrlOf(url);
  if (!singleUrl) return undefined;
  return () => {
    setUrlValue(singleUrl);
    retry();
  };
}

/** Só limpa o campo quando tudo entrou: o que falhou continua lá para tentar de novo. */
function clearUrlIfAllEnqueued(failures: EnqueueFailure[]) {
  if (failures.length > 0) return;
  setUrlValue("");
  advanced.clearSchedule();
}

function keepFailedUrls(failures: EnqueueFailure[]) {
  setUrlValue(failures.map((failure) => failure.entry.url).join(" "));
}

/**
 * Playlist no Modo Avançado: não há um conjunto único de formatos, então abre a seleção
 * e baixa cada item na melhor qualidade. As opções só são lidas com o painel visível (fase "ready").
 */
export async function openAdvancedPlaylistSelection(url: string, retryAsSingleVideo: () => void) {
  const outputPath = state.downloadPath;
  if (!outputPath) {
    refs.message.error(UI_STRINGS.errorNoPath);
    return;
  }
  const options = state.phase === "ready" ? advanced.read() : {};
  if (!options) return;

  setPhaseHandler("fetching");
  try {
    await openPlaylistSelection(
      url,
      (entry) => ({ url: entry.url, title: entry.title, format: "best", formatLabel: "MP4", outputPath, options }),
      clearUrlIfAllEnqueued,
      options.cookiesBrowser,
      singleVideoAction(url, retryAsSingleVideo)
    );
  } finally {
    setPhaseHandler("idle");
  }
}

let submitting = false;

/** Modo Avançado, depois de escolher o formato: enfileira o vídeo carregado. */
export async function handleDownload() {
  if (state.phase !== "ready" || !state.selectedFormat || submitting) return;
  if (!state.downloadPath) {
    refs.message.error(UI_STRINGS.errorNoPath);
    return;
  }
  const options: StartDownloadOptions | null = advanced.read();
  if (!options) return;

  refs.message.clear();
  submitting = true;
  setButtonBusy(refs.downloadButton, true);
  try {
    const params: EnqueueParams = {
      url: state.currentUrl,
      format: state.selectedFormat.id,
      formatLabel: state.selectedFormat.label,
      title: state.videoMetadata.title,
      outputPath: state.downloadPath,
      options,
    };
    const [entry] = await withDuplicateFlags([{ url: params.url, title: params.title, durationSeconds: null }]);
    if (entry.duplicate) {
      const again = await confirmDialog({ title: UI_STRINGS.duplicateSingleTitle, body: UI_STRINGS.duplicateSingleBody, confirmLabel: UI_STRINGS.duplicateSingleConfirm });
      if (!again) return;
    }
    const failures = await enqueueEntries([entry], () => params);
    reportEnqueueFailures(failures, 1);
    if (failures.length === 0) {
      advanced.clearSchedule();
      toast({ kind: "success", message: "Entrou na fila" });
    }
  } catch (error) {
    console.error("Failed to start download:", error);
    refs.message.error(`${UI_STRINGS.errorStartDownload} ${errorMessage(error)}`);
  } finally {
    submitting = false;
    setButtonBusy(refs.downloadButton, false);
    renderHandler();
  }
}

let quickSubmitting = false;

/** Modo Básico: colar e baixar numa única ação, na melhor qualidade, no formato escolhido. Aceita vários links. */
export async function handleQuickDownload() {
  if (quickSubmitting) return;

  const raw = urlValue();
  refs.message.clear();

  if (!raw) {
    refs.message.error(UI_STRINGS.errorNoUrl);
    refs.urlInput.focus();
    return;
  }
  const { urls, invalid } = parseUrlList(raw);
  if (invalid.length > 0) {
    refs.message.error(urls.length + invalid.length > 1 ? UI_STRINGS.errorInvalidUrlInList : UI_STRINGS.errorInvalidUrl);
    return;
  }
  if (urls.length > 1 && urls.some(looksLikePlaylist)) {
    refs.message.error(UI_STRINGS.errorPlaylistInBatch);
    return;
  }
  const outputPath = state.downloadPath;
  if (!outputPath) {
    refs.message.error(UI_STRINGS.errorNoPath);
    return;
  }

  const isMp3 = prefs.quickFormat === "mp3";
  const buildParams: EntryParamsBuilder = (entry) => ({
    url: entry.url,
    format: isMp3 ? "quick-mp3" : "quick-mp4",
    formatLabel: isMp3 ? "MP3" : "MP4",
    title: entry.title,
    outputPath,
    options: {},
  });

  quickSubmitting = true;
  setButtonBusy(refs.goButton, true);
  try {
    if (urls.length === 1 && looksLikePlaylist(urls[0])) {
      await openPlaylistSelection(urls[0], buildParams, clearUrlIfAllEnqueued, undefined, singleVideoAction(urls[0], () => void handleQuickDownload()));
      return;
    }
    const entries = await withDuplicateFlags(urls.map((url) => ({ url, title: null, durationSeconds: null })));
    if (entries.some((entry) => entry.duplicate)) {
      openSelection({ heading: UI_STRINGS.duplicateHeading, entries, buildParams, onEnqueued: keepFailedUrls });
      return;
    }
    const failures = await enqueueEntries(entries, buildParams);
    keepFailedUrls(failures);
    reportEnqueueFailures(failures, entries.length);
    if (failures.length < entries.length) confirmSent(entries.length - failures.length);
  } catch (error) {
    console.error("Failed to start download:", error);
    refs.message.error(`${UI_STRINGS.errorStartDownload} ${errorMessage(error)}`);
  } finally {
    quickSubmitting = false;
    setButtonBusy(refs.goButton, false);
  }
}

/** A tecla fica verde por um instante: confirma o envio sem exigir um aviso a mais na tela. */
function confirmSent(count: number) {
  refs.goButton.classList.add("is-success");
  setTimeout(() => refs.goButton.classList.remove("is-success"), 900);
  if (count > 1) toast({ kind: "success", message: `${count} links entraram na fila` });
}
