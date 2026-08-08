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

export interface DownloadResult {
  path: string;
  message: string;
}

export interface DownloadProgress {
  percent: number;
  speed: string | null;
  eta: string | null;
}

export interface StartDownloadOptions {
  sectionStart?: string;
  sectionEnd?: string;
  subLangs?: string;
  extraArgs?: string;
}

export interface DebugLine {
  stream: "stdout" | "stderr";
  text: string;
}

export const bridge = {
  getVersion: (): Promise<string> => invoke("get_version"),

  getAppInfo: (): Promise<AppInfo> => invoke("get_app_info"),

  getFormats: (url: string): Promise<FormatsResult> => invoke("get_formats", { url }),

  startDownload: (
    url: string,
    format: string,
    outputPath: string,
    options: StartDownloadOptions = {}
  ): Promise<DownloadResult> =>
    invoke("start_download", {
      url,
      format,
      outputPath,
      sectionStart: options.sectionStart ?? null,
      sectionEnd: options.sectionEnd ?? null,
      subLangs: options.subLangs ?? null,
      extraArgs: options.extraArgs ?? null,
    }),

  selectDownloadPath: (): Promise<string | null> => invoke("select_download_path"),

  getDownloadsPath: (): Promise<string | null> => invoke("get_downloads_path"),

  openPath: (path: string): Promise<void> => invoke("open_path", { path }),

  cancelDownload: (): Promise<void> => invoke("cancel_download"),

  onDownloadProgress: (callback: (progress: DownloadProgress) => void): Promise<UnlistenFn> =>
    listen<DownloadProgress>("download-progress", (event) => callback(event.payload)),

  onDebugCommand: (callback: (command: string) => void): Promise<UnlistenFn> =>
    listen<string>("download-debug-command", (event) => callback(event.payload)),

  onDebugLine: (callback: (line: DebugLine) => void): Promise<UnlistenFn> =>
    listen<DebugLine>("download-debug-line", (event) => callback(event.payload)),
};
