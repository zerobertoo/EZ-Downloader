import { UI_STRINGS } from "./state";

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/** Separa por espaço em branco: URLs não contêm espaço, e colar uma lista traz quebras de linha. */
export function parseUrlList(text: string): { urls: string[]; invalid: string[] } {
  const tokens = text.split(/\s+/).filter(Boolean);
  return { urls: tokens.filter(isHttpUrl), invalid: tokens.filter((token) => !isHttpUrl(token)) };
}

export function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
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

/** Link de vídeo dentro de uma playlist (`watch?v=X&list=Y`): devolve o link só do vídeo, ou null se não for esse caso. */
export function singleVideoUrlOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has("v") || !parsed.searchParams.has("list")) return null;
    for (const key of ["list", "index", "start_radio"]) parsed.searchParams.delete(key);
    return parsed.toString();
  } catch {
    return null;
  }
}

/** Texto da dica sob a barra de comando, ou null quando não há o que dizer. */
export function urlHintFor(value: string, mode: "basic" | "advanced"): string | null {
  const { urls } = parseUrlList(value);
  const isBatch = /\s/.test(value) && urls.length > 1;
  if (isBatch && mode === "advanced") return UI_STRINGS.errorBatchNeedsBasicMode;
  if (isBatch) return `${urls.length} ${UI_STRINGS.hintBatch}`;
  if (looksLikePlaylist(value)) return UI_STRINGS.hintPlaylist;
  return null;
}

/** Mapeia trechos comuns de erro do yt-dlp para uma explicação em português; o texto bruto fica à parte. */
const ERROR_PATTERNS: [RegExp, string][] = [
  [/private video/i, "Este vídeo é privado e não pode ser baixado."],
  [/video (is )?unavailable|has been removed/i, "Vídeo indisponível: pode ter sido removido ou não existir mais."],
  [/could not copy .* cookie database|cookie database|failed to decrypt/i, "Não foi possível ler os cookies desse navegador. Chrome, Edge e Brave bloqueiam isso mesmo fechados. Em Ajustes, escolha Firefox em “Entrar com o navegador” (precisa estar logado no YouTube nele)."],
  [/not a bot/i, "O YouTube pediu confirmação de que você não é um robô. Em Ajustes, escolha o navegador em “Entrar com o navegador” e tente de novo."],
  [/sign in to confirm your age|age[- ]restrict/i, "Vídeo com restrição de idade: exige login para baixar."],
  [/not available in your country|geo.?restrict/i, "Vídeo bloqueado nesta região."],
  [/429|too many requests/i, "Muitas requisições ao serviço. Espere um pouco e tente de novo."],
  [/cookies|login required/i, "O site exige login (cookies) para baixar este conteúdo."],
  [/unsupported url|no extractor/i, "Este link não é suportado pelo yt-dlp."],
  [/network|timed? ?out|connection/i, "Falha de conexão. Verifique a internet e tente de novo."],
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
