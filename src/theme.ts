import { safeStorageGet, safeStorageSet } from "./components/dom";

export interface Theme {
  id: string;
  label: string;
  accent: string;
  accentBright: string;
}

export const THEMES: Theme[] = [
  { id: "ember", label: "Brasa", accent: "#f97316", accentBright: "#fb923c" },
  { id: "azure", label: "Azul", accent: "#38bdf8", accentBright: "#7dd3fc" },
  { id: "verdant", label: "Verde", accent: "#34d399", accentBright: "#6ee7b7" },
  { id: "violet", label: "Violeta", accent: "#a78bfa", accentBright: "#c4b5fd" },
  { id: "rose", label: "Rosa", accent: "#fb7185", accentBright: "#fda4af" },
];

const STORAGE_KEY = "ez-theme";

function findTheme(id: string | null): Theme | null {
  return THEMES.find((theme) => theme.id === id) ?? null;
}

/** Tema salvo pelo usuário, ou aleatório se ele nunca escolheu um. */
export function resolveTheme(): Theme {
  return findTheme(safeStorageGet(STORAGE_KEY)) ?? THEMES[Math.floor(Math.random() * THEMES.length)];
}

/** Mesmo glifo da marca (seta de download) num quadrado na cor do tema. */
function faviconHref(theme: Theme): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18">
    <rect width="18" height="18" rx="4" fill="${theme.accent}"/>
    <path d="M9 3.5v8M9 11.5 6 8.5M9 11.5l3-3" stroke="#140d08" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M4.5 14.5h9" stroke="#140d08" stroke-width="1.7" stroke-linecap="round"/>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme.id);
  const link = document.getElementById("favicon") as HTMLLinkElement | null;
  if (link) link.href = faviconHref(theme);
}

export function initTheme(): Theme {
  const theme = resolveTheme();
  applyTheme(theme);
  return theme;
}

/** Escolha explícita do usuário: fica salva entre sessões. */
export function setTheme(id: string) {
  const theme = findTheme(id);
  if (!theme) return;
  safeStorageSet(STORAGE_KEY, id);
  applyTheme(theme);
}

export function currentThemeId(): string {
  return document.documentElement.getAttribute("data-theme") ?? THEMES[0].id;
}
