import { UI_STRINGS, elements } from "./state";

/* ════════════════════════════════════════════════════════════════
   UTILITÁRIOS
   ════════════════════════════════════════════════════════════════ */

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function toggle(element: Element | null, visible: boolean) {
  element?.classList.toggle("hidden", !visible);
}

export function urlFieldValue(): string {
  return elements.urlInput?.value.trim() ?? "";
}

export function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Heurística de playlist: cobre YouTube (?list=), páginas /playlist e sets do
 * SoundCloud. Sem --no-playlist o yt-dlp baixa a playlist inteira sem avisar.
 */
export function looksLikePlaylist(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has("list")) return true;
    return /\/(playlist|sets)(\/|$)/.test(parsed.pathname);
  } catch {
    return false;
  }
}

export function renderPlaylistHint() {
  if (!elements.playlistHint) return;
  const isPlaylist = looksLikePlaylist(urlFieldValue());
  toggle(elements.playlistHint, isPlaylist);
  if (isPlaylist) {
    elements.playlistHint.textContent = UI_STRINGS.hintPlaylist;
  }
}

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}
