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

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme.id);
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
