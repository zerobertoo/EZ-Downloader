import type { FormatOption, StartDownloadOptions } from "./bridge";

export const UI_STRINGS = {
  errorNoUrl: "Por favor, insira uma URL",
  errorInvalidUrl: "URL inválida. Insira uma URL completa (ex: https://youtube.com/...)",
  errorNoFormats: "Nenhum formato disponível para este vídeo",
  errorFetchFormats: "Erro ao buscar formatos:",
  errorNoPath: "Por favor, selecione um diretório de download",
  errorIncompleteSection: "Preencha início e fim do corte, ou deixe os dois em branco",
  errorInvalidSection: "Formato de tempo inválido — use HH:MM:SS (ex: 00:01:30)",
  hintPlaylist: "URL de playlist detectada — todos os itens serão baixados de uma vez",
  hintPlaylistConfirm: "Playlist detectada — clique em Baixar de novo para confirmar",
  errorSelectDir: "Erro ao selecionar diretório",
  errorOpenFolder: "Erro ao abrir pasta de downloads",
  errorCancel: "Erro ao cancelar download",
  errorClearHistory: "Erro ao limpar histórico",
  errorInit: "Erro ao inicializar a aplicação",
  errorStartDownload: "Erro ao iniciar download:",
  hintUrlChanged: "URL alterada — aperte Buscar para carregar este vídeo",
  progressStarting: "Iniciando download...",
  progressDownloading: "Baixando...",
  progressFinalizing: "Finalizando...",
  progressComplete: "Download concluído!",
  statusDone: "Concluído",
  statusFailed: "Falhou",
  statusCancelled: "Cancelado",
  historyTitle: "Histórico",
  historyEmpty: "Nenhum download ainda",
  historyClear: "Limpar histórico",
  historyClearConfirmLabel: "Confirmar?",
  downloadRemove: "Remover",
  downloadRetry: "Tentar novamente",
  downloadOpenFolder: "Abrir pasta",
};

export interface VideoMetadata {
  title: string | null;
  thumbnail: string | null;
  uploader: string | null;
}

/**
 * Fase do FORMULÁRIO — não do download em si (downloads viraram itens
 * concorrentes em `state.downloads`, veja downloads.ts). A tela é única e
 * progressiva, cada região aparece conforme a fase.
 */
export type Phase = "idle" | "fetching" | "ready";

export const PATH_STORAGE_KEY = "ez-download-path";

/** Um item da fila de downloads da sessão — do enfileiramento até o fim. */
export interface DownloadItem {
  id: string;
  url: string;
  title: string | null;
  formatLabel: string;
  format: string;
  outputPath: string;
  options: StartDownloadOptions;
  phase: "active" | "done" | "failed" | "cancelled";
  percent: number;
  speed: string | null;
  eta: string | null;
  error: string | null;
  resultPath: string | null;
}

export const state = {
  phase: "idle" as Phase,
  currentUrl: "",
  selectedFormat: null as FormatOption | null,
  downloadPath: null as string | null,
  formats: [] as FormatOption[],
  videoMetadata: { title: null, thumbnail: null, uploader: null } as VideoMetadata,
  quickFormat: "mp4" as "mp4" | "mp3",
  nerdMode: false,
  debugLines: [] as { stream: "stdout" | "stderr"; text: string }[],
  /** Id do último download iniciado — o painel Nerd só mostra o log dele. */
  debugDownloadId: null as string | null,
  /** Fila de downloads da sessão, mais recente por último (renderizado invertido). */
  downloads: new Map<string, DownloadItem>(),
};

export const elements = {
  app: document.getElementById("app"),
  urlInput: document.getElementById("urlInput") as HTMLInputElement | null,
  playlistHint: document.getElementById("playlistHint"),
  fetchFormatsBtn: document.getElementById("fetchFormatsBtn") as HTMLButtonElement | null,
  urlError: document.getElementById("urlError"),
  loadingRegion: document.getElementById("loadingRegion"),
  videoCard: document.getElementById("videoCard"),
  videoThumbnail: document.getElementById("videoThumbnail") as HTMLImageElement | null,
  videoTitle: document.getElementById("videoTitle"),
  videoUploader: document.getElementById("videoUploader"),
  configCard: document.getElementById("configCard"),
  formatSelect: document.getElementById("formatSelect") as HTMLSelectElement | null,
  formatInfo: document.getElementById("formatInfo"),
  downloadPath: document.getElementById("downloadPath") as HTMLInputElement | null,
  selectPathBtn: document.getElementById("selectPathBtn") as HTMLButtonElement | null,
  pathError: document.getElementById("pathError"),
  downloadBtn: document.getElementById("downloadBtn") as HTMLButtonElement | null,
  version: document.getElementById("version"),
  themeToggleBtn: document.getElementById("themeToggleBtn") as HTMLButtonElement | null,
  themePopover: document.getElementById("themePopover"),
  modeToggleBtn: document.getElementById("modeToggleBtn") as HTMLButtonElement | null,
  modeToggleLabel: document.getElementById("modeToggleLabel"),
  quickMp4Btn: document.getElementById("quickMp4Btn") as HTMLButtonElement | null,
  quickMp3Btn: document.getElementById("quickMp3Btn") as HTMLButtonElement | null,
  quickDownloadBtn: document.getElementById("quickDownloadBtn") as HTMLButtonElement | null,
  sectionStart: document.getElementById("sectionStart") as HTMLInputElement | null,
  sectionEnd: document.getElementById("sectionEnd") as HTMLInputElement | null,
  sectionError: document.getElementById("sectionError"),
  subLangsCheckbox: document.getElementById("subLangsCheckbox") as HTMLInputElement | null,
  subLangsInput: document.getElementById("subLangsInput") as HTMLInputElement | null,
  extraArgsInput: document.getElementById("extraArgsInput") as HTMLInputElement | null,
  nerdModeBtn: document.getElementById("nerdModeBtn") as HTMLButtonElement | null,
  debugPanel: document.getElementById("debugPanel"),
  debugCommand: document.getElementById("debugCommand"),
  debugLog: document.getElementById("debugLog"),
  downloadsSection: document.getElementById("downloadsSection"),
  downloadsList: document.getElementById("downloadsList"),
  historySection: document.getElementById("historySection"),
  historyToggleBtn: document.getElementById("historyToggleBtn") as HTMLButtonElement | null,
  historyBody: document.getElementById("historyBody"),
  historyList: document.getElementById("historyList"),
  historyEmpty: document.getElementById("historyEmpty"),
  clearHistoryBtn: document.getElementById("clearHistoryBtn") as HTMLButtonElement | null,
};
