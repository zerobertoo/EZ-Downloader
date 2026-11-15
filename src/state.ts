import type { FormatOption, MediaReport, StartDownloadOptions } from "./bridge";

export const UI_STRINGS = {
  errorNoUrl: "Cole um link para começar",
  errorInvalidUrl: "Esse link não parece válido. Use o endereço completo, começando com https://",
  errorNoFormats: "Nenhum formato disponível para este vídeo",
  errorFetchFormats: "Não foi possível buscar os formatos:",
  errorNoPath: "Escolha uma pasta de destino antes de baixar",
  errorIncompleteSection: "Preencha início e fim do corte, ou deixe os dois em branco",
  errorInvalidSection: "Tempo inválido. Use HH:MM:SS (ex: 00:01:30)",
  errorInvalidLimitRate: "Formato inválido. Use um número com K, M ou G (ex: 2M, 500K)",
  errorSubtitleLangsRequired: "Informe os idiomas das legendas (ex: pt, en) ou desligue a opção",
  errorInvalidSchedule: "Data e hora inválidas",
  errorSchedulePast: "Esse horário já passou",
  errorPresetName: "Dê um nome ao preset",
  errorPresetSave: "Não foi possível salvar o preset:",
  errorPresetDelete: "Não foi possível excluir o preset:",
  errorProxySave: "Não foi possível salvar o proxy:",
  statusScheduled: "Agendado para",
  hintPlaylist: "Link de playlist: você poderá escolher os itens",
  hintBatch: "links detectados, todos entram na fila",
  errorInvalidUrlInList: "Um dos itens da lista não é um link válido",
  errorPlaylistInBatch: "Cole links de playlist sozinhos. Para vários vídeos, cole o link de cada um",
  errorClipboardToggle: "Não foi possível alterar o monitor da área de transferência",
  errorBatchNeedsBasicMode: "Para baixar vários links de uma vez, use o modo Básico",
  loadingPlaylist: "Carregando playlist...",
  errorFetchPlaylist: "Não foi possível carregar a playlist:",
  errorEmptyPlaylist: "Nenhum item encontrado nesta playlist",
  errorEnqueuePartial: "Alguns itens não entraram na fila:",
  duplicateHeading: "Links já baixados ou na fila",
  duplicateSingleTitle: "Você já baixou este link",
  duplicateSingleBody: "Ele já foi baixado ou está na fila. Quer baixar de novo?",
  duplicateSingleConfirm: "Baixar de novo",
  selectionDownload: "Baixar",
  selectionSelected: "selecionados",
  selectionDuplicateBadge: "Já baixado",
  selectionDuplicateNote: "Itens já baixados ou na fila começam desmarcados.",
  clipboardUse: "Usar link",
  errorSelectDir: "Não foi possível escolher a pasta",
  errorOpenFolder: "Não foi possível abrir a pasta",
  errorCancel: "Não foi possível cancelar o download",
  errorClearHistory: "Não foi possível limpar o histórico",
  errorInit: "Erro ao iniciar o aplicativo",
  errorStartDownload: "Não foi possível iniciar o download:",
  errorMaxConcurrent: "Não foi possível alterar o limite de downloads simultâneos",
  hintUrlChanged: "O link mudou. Toque em Buscar para carregar este vídeo",
  progressStarting: "Iniciando",
  progressDownloading: "Baixando",
  progressFinalizing: "Finalizando",
  progressComplete: "Concluído",
  statusDone: "Concluído",
  statusFailed: "Falhou",
  statusCancelled: "Cancelado",
  statusQueued: "Na fila",
  statusPaused: "Pausado",
  downloadPrioritize: "Priorizar",
  downloadPause: "Pausar",
  downloadResume: "Retomar",
  downloadCancel: "Cancelar",
  historyTitle: "Histórico",
  historyEmpty: "Nenhum download ainda",
  historyNoResults: "Nenhum resultado para a busca",
  historyClear: "Limpar histórico",
  downloadRemove: "Remover da lista",
  downloadRetry: "Tentar de novo",
  downloadOpenFolder: "Abrir pasta",
  optimizeTitle: "Otimizar compatibilidade",
  optimizeAction: "Otimizar",
  optimizeRunning: "Otimizando",
  optimizeDone: "Cópia otimizada pronta",
  optimizeFailed: "Não foi possível otimizar",
  optimizeCancel: "Cancelar",
  optimizeRetry: "Tentar de novo",
  optimizeBesideOriginal: "Ao lado do original",
};

/** Otimização pós-download (cópia H.264 + AAC em MP4), oferecida só quando o codec baixado costuma dar problema. */
export type ConversionState =
  | { phase: "offer"; report: MediaReport }
  | { phase: "running"; report: MediaReport; percent: number }
  | { phase: "done"; outputPath: string }
  | { phase: "failed"; report: MediaReport; error: string };

export interface VideoMetadata {
  title: string | null;
  thumbnail: string | null;
  uploader: string | null;
}

/** Fase do formulário do Modo Avançado (os downloads em si vivem em `state.downloads`). */
export type Phase = "idle" | "fetching" | "ready";

export const PATH_STORAGE_KEY = "ez-download-path";

export interface DebugEntry {
  stream: "stdout" | "stderr";
  text: string;
}

export interface DownloadItem {
  id: string;
  url: string;
  title: string | null;
  formatLabel: string;
  format: string;
  outputPath: string;
  options: StartDownloadOptions;
  phase: "queued" | "active" | "paused" | "done" | "failed" | "cancelled";
  percent: number;
  speed: string | null;
  eta: string | null;
  error: string | null;
  resultPath: string | null;
  filePath: string | null;
  conversion: ConversionState | null;
  /** Pasta escolhida para a cópia otimizada; null grava ao lado do original. */
  optimizeDir: string | null;
  debugCommand: string | null;
  debugLines: DebugEntry[];
}

export const state = {
  phase: "idle" as Phase,
  currentUrl: "",
  selectedFormat: null as FormatOption | null,
  downloadPath: null as string | null,
  formats: [] as FormatOption[],
  videoMetadata: { title: null, thumbnail: null, uploader: null } as VideoMetadata,
  downloads: new Map<string, DownloadItem>(),
};
