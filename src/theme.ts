export interface Theme {
  id: string;
  label: string;
  accent: string;
  accentBright: string;
}

export const THEMES: Theme[] = [
  { id: "ember", label: "Ember", accent: "#f97316", accentBright: "#fb923c" },
  { id: "azure", label: "Azure", accent: "#38bdf8", accentBright: "#7dd3fc" },
  { id: "verdant", label: "Verdant", accent: "#34d399", accentBright: "#6ee7b7" },
  { id: "violet", label: "Violet", accent: "#a78bfa", accentBright: "#c4b5fd" },
  { id: "rose", label: "Rose", accent: "#fb7185", accentBright: "#fda4af" },
];

const STORAGE_KEY = "ez-theme";

function findTheme(id: string | null): Theme | null {
  return THEMES.find((t) => t.id === id) ?? null;
}

function pickRandomTheme(): Theme {
  return THEMES[Math.floor(Math.random() * THEMES.length)];
}

/** Tema salvo pelo usuário, ou aleatório se ele nunca escolheu um. */
export function resolveTheme(): Theme {
  const saved = findTheme(localStorage.getItem(STORAGE_KEY));
  return saved ?? pickRandomTheme();
}

/** Mesmo glifo do .brand-icon (seta de download), num quadrado sólido na cor
 * do tema — só a cor muda, o ícone continua o mesmo em todo lugar. */
function faviconHref(theme: Theme): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18">
    <rect width="18" height="18" rx="4" fill="${theme.accent}"/>
    <path d="M9 3.5v8M9 11.5 6 8.5M9 11.5l3-3" stroke="#100c08" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M4.5 14.5h9" stroke="#100c08" stroke-width="1.7" stroke-linecap="round"/>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function updateFavicon(theme: Theme) {
  const link = document.getElementById("favicon") as HTMLLinkElement | null;
  if (link) link.href = faviconHref(theme);
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme.id);
  updateFavicon(theme);
}

export function initTheme(): Theme {
  const theme = resolveTheme();
  applyTheme(theme);
  return theme;
}

/** Escolha explícita do usuário — essa fica salva e persiste entre sessões. */
export function setTheme(id: string) {
  const theme = findTheme(id);
  if (!theme) return;
  localStorage.setItem(STORAGE_KEY, id);
  applyTheme(theme);
}

export function currentThemeId(): string {
  return document.documentElement.getAttribute("data-theme") ?? THEMES[0].id;
}
