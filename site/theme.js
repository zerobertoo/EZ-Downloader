const THEMES = [
  { id: "ember", label: "Ember", accent: "#f97316", accentBright: "#fb923c" },
  { id: "azure", label: "Azure", accent: "#38bdf8", accentBright: "#7dd3fc" },
  { id: "verdant", label: "Verdant", accent: "#34d399", accentBright: "#6ee7b7" },
  { id: "violet", label: "Violet", accent: "#a78bfa", accentBright: "#c4b5fd" },
  { id: "rose", label: "Rose", accent: "#fb7185", accentBright: "#fda4af" },
];

const STORAGE_KEY = "ez-theme";

function findTheme(id) {
  return THEMES.find((t) => t.id === id) ?? null;
}

function pickRandomTheme() {
  return THEMES[Math.floor(Math.random() * THEMES.length)];
}

function resolveTheme() {
  const saved = findTheme(localStorage.getItem(STORAGE_KEY));
  return saved ?? pickRandomTheme();
}

function faviconHref(theme) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18">
    <rect width="18" height="18" rx="4" fill="${theme.accent}"/>
    <path d="M9 3.5v8M9 11.5 6 8.5M9 11.5l3-3" stroke="#100c08" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M4.5 14.5h9" stroke="#100c08" stroke-width="1.7" stroke-linecap="round"/>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function updateFavicon(theme) {
  const link = document.getElementById("favicon");
  if (link) link.href = faviconHref(theme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme.id);
  updateFavicon(theme);
}

function currentThemeId() {
  return document.documentElement.getAttribute("data-theme") ?? THEMES[0].id;
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const CIRCLE_SIZE = 300; // precisa bater com o width/height de .theme-circle
const CIRCLE_SWAP_AT = 400; // troca as cores do site enquanto a onda passa
const CIRCLE_FADE_AT = 600; // começa a dissolver, tema real já aplicado
const CIRCLE_REMOVE_AT = 950;

let activeCircle = null;
const circleTimers = [];

function clearPendingCircle() {
  while (circleTimers.length) clearTimeout(circleTimers.pop());
  activeCircle?.remove();
  activeCircle = null;
}

function setTheme(id, swatch) {
  const theme = findTheme(id);
  if (!theme || theme.id === currentThemeId()) return;
  localStorage.setItem(STORAGE_KEY, id);

  const swap = () => {
    applyTheme(theme);
    updateActiveSwatch();
  };

  if (prefersReducedMotion()) {
    swap();
    return;
  }

  clearPendingCircle();

  // Sai do centro do próprio swatch, não do ponteiro: o círculo nasce
  // exatamente de onde a cor foi escolhida.
  const rect = swatch.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;

  // Distância até o canto mais longe, pra garantir que cobre a tela inteira.
  const maxDistance = Math.max(
    Math.hypot(x, y),
    Math.hypot(window.innerWidth - x, y),
    Math.hypot(x, window.innerHeight - y),
    Math.hypot(window.innerWidth - x, window.innerHeight - y),
  );

  const circle = document.createElement("div");
  circle.className = "theme-circle";
  circle.style.left = `${x}px`;
  circle.style.top = `${y}px`;
  // Tom fechado do accent (40% sobre preto): forte o bastante pra leitura da
  // onda, escuro o bastante pro texto por cima continuar com contraste AA.
  circle.style.background = `color-mix(in srgb, ${theme.accent} 40%, #000)`;
  circle.style.setProperty("--scale", (maxDistance * 2) / CIRCLE_SIZE);
  document.body.appendChild(circle);
  activeCircle = circle;

  // Dois frames: o primeiro registra o estado inicial (scale 0), o segundo
  // dispara a transition. Sem isso o navegador agrupa as duas mudanças e
  // o círculo aparece já expandido.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => circle.classList.add("is-animating"));
  });

  circleTimers.push(
    setTimeout(swap, CIRCLE_SWAP_AT),
    setTimeout(() => circle.classList.add("is-fading"), CIRCLE_FADE_AT),
    setTimeout(() => {
      circle.remove();
      if (activeCircle === circle) activeCircle = null;
    }, CIRCLE_REMOVE_AT),
  );
}

/* Os swatches são criados uma vez só. Trocar de tema apenas alterna classe e
   aria: reconstruir os 5 botões no meio da animação custava layout + paint
   justo no frame em que o tema já estava repintando a página inteira. */
function renderSwatches() {
  const wrap = document.getElementById("themePicker");
  if (!wrap) return;
  const active = currentThemeId();

  for (const theme of THEMES) {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "theme-swatch" + (theme.id === active ? " is-active" : "");
    swatch.dataset.theme = theme.id;
    swatch.style.background = `linear-gradient(135deg, ${theme.accent}, ${theme.accentBright})`;
    swatch.setAttribute("role", "radio");
    swatch.setAttribute("aria-checked", String(theme.id === active));
    swatch.setAttribute("aria-label", theme.label);
    swatch.title = theme.label;
    swatch.addEventListener("click", () => setTheme(theme.id, swatch));
    wrap.appendChild(swatch);
  }
}

function updateActiveSwatch() {
  const active = currentThemeId();
  for (const swatch of document.querySelectorAll(".theme-swatch")) {
    const isActive = swatch.dataset.theme === active;
    swatch.classList.toggle("is-active", isActive);
    swatch.setAttribute("aria-checked", String(isActive));
  }
}

applyTheme(resolveTheme());
renderSwatches();
