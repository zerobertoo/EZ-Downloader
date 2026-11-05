import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface AppInfo {
  version: string;
  name: string;
  description: string;
  author: string;
  repository: string;
}

export interface FormatOption {
  id: string;
  type: "best" | "combined" | "video" | "audio";
  label: string;
  ext: string;
  height?: number;
  width?: number;
  fps?: number;
  abr?: number;
  filesize?: number;
}

export interface FormatsResult {
  formats: FormatOption[];
  title: string | null;
  thumbnail: string | null;
  uploader: string | null;
}

export interface DownloadProgress {
  id: string;
  percent: number;
  speed: string | null;
  eta: string | null;
}

export interface DownloadFinished {
  id: string;
  status: "done" | "failed" | "cancelled";
  /** Pasta de destino. */
  path: string | null;
  /** Arquivo final baixado — base da conversão de codec. */
  filePath: string | null;
  error: string | null;
}

/** Análise de um arquivo baixado: codecs e se vale converter pra H.264/AAC. */
export interface MediaReport {
  videoCodec: string | null;
  audioCodec: string | null;
  needsConversion: boolean;
  /** Encoder que seria usado, ex: "GPU NVIDIA (NVENC)" ou "CPU (x264)". */
  encoder: string;
  gpu: boolean;
}

export interface ConversionProgress {
  id: string;
  percent: number;
}

export interface ConversionFinished {
  id: string;
  status: "done" | "failed" | "cancelled";
  path: string | null;
  error: string | null;
}

export interface StartDownloadOptions {
  sectionStart?: string;
  sectionEnd?: string;
  subLangs?: string;
  extraArgs?: string;
  cookiesBrowser?: string;
  limitRate?: string;
}

export interface DebugCommand {
  id: string;
  command: string;
}

export interface DebugLine {
  id: string;
  stream: "stdout" | "stderr";
  text: string;
}

export interface HistoryEntry {
  id: string;
  url: string;
  title: string | null;
  format: string;
  outputPath: string;
  status: "done" | "failed" | "cancelled";
  error: string | null;
  finishedAt: string;
}

export const bridge = {
  getVersion: (): Promise<string> => invoke("get_version"),

  getAppInfo: (): Promise<AppInfo> => invoke("get_app_info"),

  getFormats: (url: string): Promise<FormatsResult> => invoke("get_formats", { url }),

  /** Retorna o id do download imediatamente — o fim chega via evento "download-finished". */
  startDownload: (
    url: string,
    format: string,
    outputPath: string,
    title?: string,
    options: StartDownloadOptions = {}
  ): Promise<string> =>
    invoke("start_download", {
      url,
      format,
      outputPath,
      title: title ?? null,
      sectionStart: options.sectionStart ?? null,
      sectionEnd: options.sectionEnd ?? null,
      subLangs: options.subLangs ?? null,
      extraArgs: options.extraArgs ?? null,
      cookiesBrowser: options.cookiesBrowser ?? null,
      limitRate: options.limitRate ?? null,
    }),

  selectDownloadPath: (): Promise<string | null> => invoke("select_download_path"),

  getDownloadsPath: (): Promise<string | null> => invoke("get_downloads_path"),

  openPath: (path: string): Promise<void> => invoke("open_path", { path }),

  cancelDownload: (id: string): Promise<void> => invoke("cancel_download", { id }),

  getHistory: (): Promise<HistoryEntry[]> =>
    invoke<
      { id: string; url: string; title: string | null; format: string; output_path: string; status: string; error: string | null; finished_at: string }[]
    >("get_history").then((entries) =>
      entries.map((e) => ({
        id: e.id,
        url: e.url,
        title: e.title,
        format: e.format,
        outputPath: e.output_path,
        status: e.status as HistoryEntry["status"],
        error: e.error,
        finishedAt: e.finished_at,
      }))
    ),

  clearHistory: (): Promise<void> => invoke("clear_history"),

  analyzeMedia: (path: string): Promise<MediaReport> => invoke("analyze_media", { path }),

  /** `id` é o do download de origem; o fim chega via "conversion-finished". */
  startConversion: (id: string, path: string): Promise<void> => invoke("start_conversion", { id, path }),

  cancelConversion: (id: string): Promise<void> => invoke("cancel_conversion", { id }),

  onConversionProgress: (callback: (progress: ConversionProgress) => void): Promise<UnlistenFn> =>
    listen<ConversionProgress>("conversion-progress", (event) => callback(event.payload)),

  onConversionFinished: (callback: (finished: ConversionFinished) => void): Promise<UnlistenFn> =>
    listen<ConversionFinished>("conversion-finished", (event) => callback(event.payload)),

  onDownloadProgress: (callback: (progress: DownloadProgress) => void): Promise<UnlistenFn> =>
    listen<DownloadProgress>("download-progress", (event) => callback(event.payload)),

  onDownloadFinished: (callback: (finished: DownloadFinished) => void): Promise<UnlistenFn> =>
    listen<DownloadFinished>("download-finished", (event) => callback(event.payload)),

  onDebugCommand: (callback: (command: DebugCommand) => void): Promise<UnlistenFn> =>
    listen<DebugCommand>("download-debug-command", (event) => callback(event.payload)),

  onDebugLine: (callback: (line: DebugLine) => void): Promise<UnlistenFn> =>
    listen<DebugLine>("download-debug-line", (event) => callback(event.payload)),
};
