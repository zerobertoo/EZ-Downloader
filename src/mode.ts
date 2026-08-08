export type AppMode = "basic" | "advanced";

const STORAGE_KEY = "ez-mode";
const DEFAULT_MODE: AppMode = "basic";

function isAppMode(value: string | null): value is AppMode {
  return value === "basic" || value === "advanced";
}

function applyMode(mode: AppMode) {
  document.getElementById("app")?.setAttribute("data-mode", mode);
}

export function initMode(): AppMode {
  const saved = localStorage.getItem(STORAGE_KEY);
  const mode = isAppMode(saved) ? saved : DEFAULT_MODE;
  applyMode(mode);
  return mode;
}

export function setMode(mode: AppMode) {
  localStorage.setItem(STORAGE_KEY, mode);
  applyMode(mode);
}

export function currentMode(): AppMode {
  const attr = document.getElementById("app")?.getAttribute("data-mode") ?? null;
  return isAppMode(attr) ? attr : DEFAULT_MODE;
}
