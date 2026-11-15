import { bridge, type PlaylistItem, type StartDownloadOptions } from "./bridge";
import { UI_STRINGS, elements, state } from "./state";
import { errorMessage, looksLikePlaylist, parseUrlList, setUrlFieldValue, singleVideoUrlOf, urlFieldValue } from "./utils";
import { type EnqueueParams } from "./downloads";
import { clearFieldErrors, setFieldError, setFieldHint } from "./ui/feedback";
import { clearScheduleField } from "./ui/mode-controls";
import { render, setPhase } from "./ui/render";
import { enqueueEntries, openSelection, reportEnqueueFailures, type EnqueueFailure, type SelectionEntry } from "./ui/selection";

/* ════════════════════════════════════════════════════════════════
   DOWNLOAD — validação do formulário + enfileiramento
   ════════════════════════════════════════════════════════════════ */

/** Aceita MM:SS ou HH:MM:SS — mesma sintaxe do --download-sections do yt-dlp. */
const TIME_PATTERN = /^\d{1,2}:\d{2}(:\d{2})?$/;

/** Número com sufixo de unidade opcional — mesma sintaxe do --limit-rate do yt-dlp. */
const RATE_PATTERN = /^\d+(\.\d+)?[KMG]?$/i;

type EntryParamsBuilder = (entry: SelectionEntry) => EnqueueParams;

/** Lê e valida os campos do Modo Avançado; devolve null (com o erro já exibido) se algum for inválido. */
function readAdvancedOptions(): StartDownloadOptions | null {
  const sectionStart = elements.sectionStart?.value.trim() || undefined;
  const sectionEnd = elements.sectionEnd?.value.trim() || undefined;
  if (Boolean(sectionStart) !== Boolean(sectionEnd)) {
    setFieldError(elements.sectionError, UI_STRINGS.errorIncompleteSection);
    return null;
  }
  if (
    (sectionStart && !TIME_PATTERN.test(sectionStart)) ||
    (sectionEnd && !TIME_PATTERN.test(sectionEnd))
  ) {
    setFieldError(elements.sectionError, UI_STRINGS.errorInvalidSection);
    return null;
  }

  const limitRate = elements.limitRateInput?.value.trim() || undefined;
  if (limitRate && !RATE_PATTERN.test(limitRate)) {
    setFieldError(elements.limitRateError, UI_STRINGS.errorInvalidLimitRate);
    return null;
  }

  let scheduledAt: number | undefined;
  const scheduleValue = elements.scheduleInput?.value;
  if (scheduleValue) {
    const timestamp = new Date(scheduleValue).getTime();
    if (Number.isNaN(timestamp)) {
      setFieldError(elements.scheduleError, UI_STRINGS.errorInvalidSchedule);
      return null;
    }
    if (timestamp <= Date.now()) {
      setFieldError(elements.scheduleError, UI_STRINGS.errorSchedulePast);
      return null;
    }
    scheduledAt = Math.floor(timestamp / 1000);
  }

  return {
    sectionStart,
    sectionEnd,
    subLangs: elements.subLangsCheckbox?.checked ? elements.subLangsInput?.value.trim() || undefined : undefined,
    extraArgs: elements.extraArgsInput?.value.trim() || undefined,
    cookiesBrowser: elements.cookiesBrowserSelect?.value || undefined,
    limitRate,
    nameTemplate: elements.nameTemplateInput?.value.trim() || undefined,
    embedThumbnail: elements.embedThumbnailCheckbox?.checked || undefined,
    embedChapters: elements.embedChaptersCheckbox?.checked || undefined,
    embedMetadata: elements.embedMetadataCheckbox?.checked || undefined,
    sponsorblock: (elements.sponsorblockSelect?.value as "remove" | "mark" | "") || undefined,
    proxy: elements.proxyInput?.value.trim() || undefined,
    scheduledAt,
  };
}

/** Se a checagem falhar, segue sem marcar duplicatas: ela é um aviso, não pode travar o download. */
async function withDuplicateFlags(items: Pick<PlaylistItem, "url" | "title" | "durationSeconds">[]): Promise<SelectionEntry[]> {
  let duplicatePositions: number[] = [];
  try {
    duplicatePositions = await bridge.findDuplicates(items.map((item) => item.url));
  } catch (error) {
    console.warn("Não foi possível checar duplicatas:", error);
  }
  const duplicates = new Set(duplicatePositions);
  return items.map((item, index) => ({ ...item, duplicate: duplicates.has(index) }));
}

async function openPlaylistSelection(
  url: string,
  buildParams: EntryParamsBuilder,
  onEnqueued: (failures: EnqueueFailure[]) => void,
  cookiesBrowser?: string,
  onSingleVideo?: () => void
) {
  setFieldHint(elements.urlError, UI_STRINGS.loadingPlaylist);
  let playlist;
  try {
    playlist = await bridge.getPlaylist(url, cookiesBrowser);
  } catch (error) {
    console.error("Erro ao carregar playlist:", error);
    setFieldError(elements.urlError, `${UI_STRINGS.errorFetchPlaylist} ${errorMessage(error)}`);
    return;
  }
  if (playlist.items.length === 0) {
    setFieldError(elements.urlError, UI_STRINGS.errorEmptyPlaylist);
    return;
  }
  clearFieldErrors();
  const entries = await withDuplicateFlags(playlist.items);
  openSelection({ heading: playlist.title || "Playlist", entries, buildParams, onEnqueued, onSingleVideo });
}

/** Troca o link pelo do vídeo avulso e refaz a ação pelo mesmo caminho do clique original. */
function singleVideoAction(url: string, retry: () => void): (() => void) | undefined {
  const singleUrl = singleVideoUrlOf(url);
  if (!singleUrl) return undefined;
  return () => {
    setUrlFieldValue(singleUrl);
    retry();
  };
}

/** Só limpa o campo quando tudo entrou: o que falhou continua lá para tentar de novo. */
function clearUrlFieldIfAllEnqueued(failures: EnqueueFailure[]) {
  if (failures.length > 0) return;
  setUrlFieldValue("");
  clearScheduleField();
}

/** Deixa no campo só as URLs que falharam, para o usuário poder tentar de novo. */
function keepFailedUrls(failures: EnqueueFailure[]) {
  setUrlFieldValue(failures.map((failure) => failure.entry.url).join(" "));
}

/**
 * Playlist no Modo Avançado: não há um conjunto único de formatos, então abre a
 * seleção de itens e baixa cada um na melhor qualidade. As opções do painel só
 * são lidas se ele está visível (fase "ready"): com o painel escondido, um erro
 * de validação não teria onde aparecer.
 */
export async function openAdvancedPlaylistSelection(url: string, retryAsSingleVideo: () => void) {
  const outputPath = state.downloadPath;
  if (!outputPath) {
    setFieldError(elements.urlError, UI_STRINGS.errorNoPath);
    return;
  }
  const options = state.phase === "ready" ? readAdvancedOptions() : {};
  if (!options) return;

  setPhase("fetching");
  try {
    await openPlaylistSelection(
      url,
      (entry) => ({ url: entry.url, title: entry.title, format: "best", formatLabel: "MP4", outputPath, options }),
      clearUrlFieldIfAllEnqueued,
      options.cookiesBrowser,
      singleVideoAction(url, retryAsSingleVideo)
    );
  } finally {
    setPhase("idle");
  }
}

let submitting = false;

export async function handleDownload() {
  if (state.phase !== "ready" || !state.selectedFormat || submitting) return;

  if (!state.downloadPath) {
    setFieldError(elements.pathError, UI_STRINGS.errorNoPath);
    return;
  }

  const options = readAdvancedOptions();
  if (!options) return;

  clearFieldErrors();
  submitting = true;
  if (elements.downloadBtn) elements.downloadBtn.disabled = true;
  try {
    const params: EnqueueParams = {
      url: state.currentUrl,
      format: state.selectedFormat.id,
      formatLabel: state.selectedFormat.label,
      title: state.videoMetadata.title,
      outputPath: state.downloadPath,
      options,
    };
    const entries = await withDuplicateFlags([{ url: params.url, title: params.title, durationSeconds: null }]);
    if (entries[0].duplicate) {
      openSelection({ heading: UI_STRINGS.duplicateHeading, entries, buildParams: () => params });
      return;
    }
    const failures = await enqueueEntries(entries, () => params);
    reportEnqueueFailures(failures, 1);
    if (failures.length === 0) clearScheduleField();
  } catch (error) {
    console.error("Erro ao iniciar download:", error);
    setFieldError(elements.urlError, `${UI_STRINGS.errorStartDownload} ${errorMessage(error)}`);
  } finally {
    submitting = false;
    render();
  }
}

let quickSubmitting = false;

/** Modo Rápido: sem metadados prévios, dispara direto na melhor qualidade. Aceita vários links separados por espaço. */
export async function handleQuickDownload() {
  if (quickSubmitting) return;

  const raw = urlFieldValue();
  clearFieldErrors();

  if (!raw) {
    setFieldError(elements.urlError, UI_STRINGS.errorNoUrl);
    return;
  }
  const { urls, invalid } = parseUrlList(raw);
  if (invalid.length > 0) {
    const isList = urls.length + invalid.length > 1;
    setFieldError(elements.urlError, isList ? UI_STRINGS.errorInvalidUrlInList : UI_STRINGS.errorInvalidUrl);
    return;
  }
  // Sem esta checagem, um link de playlist no meio do lote baixaria a playlist inteira sem aviso.
  if (urls.length > 1 && urls.some(looksLikePlaylist)) {
    setFieldError(elements.urlError, UI_STRINGS.errorPlaylistInBatch);
    return;
  }
  // Node de erro do Modo Avançado (#pathError) fica escondido no Modo Rápido —
  // mostrar aqui, em #urlError, senão o clique falha em silêncio.
  const outputPath = state.downloadPath;
  if (!outputPath) {
    setFieldError(elements.urlError, UI_STRINGS.errorNoPath);
    return;
  }

  const isMp3 = state.quickFormat === "mp3";
  const buildParams: EntryParamsBuilder = (entry) => ({
    url: entry.url,
    format: isMp3 ? "quick-mp3" : "quick-mp4",
    formatLabel: isMp3 ? "Áudio (MP3)" : "Vídeo (MP4)",
    title: entry.title,
    outputPath,
    options: {},
  });

  quickSubmitting = true;
  if (elements.quickDownloadBtn) elements.quickDownloadBtn.disabled = true;
  try {
    if (urls.length === 1 && looksLikePlaylist(urls[0])) {
      await openPlaylistSelection(
        urls[0],
        buildParams,
        clearUrlFieldIfAllEnqueued,
        undefined,
        singleVideoAction(urls[0], () => void handleQuickDownload())
      );
      return;
    }
    const entries = await withDuplicateFlags(urls.map((url) => ({ url, title: null, durationSeconds: null })));
    if (entries.some((entry) => entry.duplicate)) {
      openSelection({ heading: UI_STRINGS.duplicateHeading, entries, buildParams, onEnqueued: keepFailedUrls });
      return;
    }
    const failures = await enqueueEntries(entries, buildParams);
    reportEnqueueFailures(failures, entries.length);
    if (failures.length < entries.length) keepFailedUrls(failures);
  } catch (error) {
    console.error("Erro ao iniciar download:", error);
    setFieldError(elements.urlError, `${UI_STRINGS.errorStartDownload} ${errorMessage(error)}`);
  } finally {
    quickSubmitting = false;
    if (elements.quickDownloadBtn) elements.quickDownloadBtn.disabled = false;
  }
}
