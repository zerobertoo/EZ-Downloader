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

/** Mapeia trechos comuns de erro do yt-dlp pra uma explicação em português —
 * o texto bruto (stderr) fica disponível à parte, não substituído. */
const ERROR_PATTERNS: [RegExp, string][] = [
  [/private video/i, "Este vídeo é privado e não pode ser baixado."],
  [/video (is )?unavailable|has been removed/i, "Vídeo indisponível, pode ter sido removido ou não existir mais."],
  [/sign in to confirm your age|age[- ]restrict/i, "Vídeo com restrição de idade, requer login para baixar."],
  [/not available in your country|geo.?restrict/i, "Vídeo bloqueado nessa região (restrição geográfica)."],
  [/429|too many requests/i, "Muitas requisições ao serviço. Aguarde um pouco antes de tentar de novo."],
  [/cookies|login required/i, "O site exige login (cookies) para baixar este conteúdo."],
  [/unsupported url|no extractor/i, "Este link não é suportado pelo yt-dlp."],
  [/network|timed? ?out|connection/i, "Falha de conexão. Verifique sua internet e tente de novo."],
];

export function friendlyErrorMessage(raw: string): string {
  const match = ERROR_PATTERNS.find(([pattern]) => pattern.test(raw));
  return match ? match[1] : "Não foi possível concluir este download.";
}

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}
