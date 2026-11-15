import { safeStorageGet, safeStorageSet } from "./components/dom";

export type QuickFormat = "mp4" | "mp3";

const KEYS = {
  quickFormat: "ez-quick-format",
  pasteToDownload: "ez-paste-to-download",
  autoOptimize: "ez-auto-optimize",
  technicalOpen: "ez-technical-open",
} as const;

function readFlag(key: string): boolean {
  return safeStorageGet(key) === "1";
}

function writeFlag(key: string, value: boolean) {
  safeStorageSet(key, value ? "1" : "0");
}

export const prefs = {
  get quickFormat(): QuickFormat {
    return safeStorageGet(KEYS.quickFormat) === "mp3" ? "mp3" : "mp4";
  },
  set quickFormat(value: QuickFormat) {
    safeStorageSet(KEYS.quickFormat, value);
  },
  get pasteToDownload(): boolean {
    return readFlag(KEYS.pasteToDownload);
  },
  set pasteToDownload(value: boolean) {
    writeFlag(KEYS.pasteToDownload, value);
  },
  get autoOptimize(): boolean {
    return readFlag(KEYS.autoOptimize);
  },
  set autoOptimize(value: boolean) {
    writeFlag(KEYS.autoOptimize, value);
  },
  get technicalOpen(): boolean {
    return readFlag(KEYS.technicalOpen);
  },
  set technicalOpen(value: boolean) {
    writeFlag(KEYS.technicalOpen, value);
  },
};
