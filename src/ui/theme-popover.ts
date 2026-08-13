import { THEMES, currentThemeId, setTheme } from "../theme";
import { elements } from "../state";

/* ════════════════════════════════════════════════════════════════
   SELETOR DE TEMA
   ════════════════════════════════════════════════════════════════ */

function renderThemePopover() {
  if (!elements.themePopover) return;
  elements.themePopover.innerHTML = "";
  const active = currentThemeId();

  THEMES.forEach((theme) => {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "theme-swatch" + (theme.id === active ? " is-active" : "");
    swatch.style.background = `linear-gradient(135deg, ${theme.accent}, ${theme.accentBright})`;
    swatch.setAttribute("role", "menuitemradio");
    swatch.setAttribute("aria-checked", String(theme.id === active));
    swatch.setAttribute("aria-label", theme.label);
    swatch.title = theme.label;
    swatch.addEventListener("click", () => {
      setTheme(theme.id);
      renderThemePopover();
      closeThemePopover();
    });
    elements.themePopover?.appendChild(swatch);
  });
}

export function toggleThemePopover() {
  const isHidden = elements.themePopover?.classList.contains("hidden");
  if (isHidden) openThemePopover();
  else closeThemePopover();
}

function openThemePopover() {
  renderThemePopover();
  elements.themePopover?.classList.remove("hidden");
  elements.themeToggleBtn?.setAttribute("aria-expanded", "true");
}

export function closeThemePopover() {
  elements.themePopover?.classList.add("hidden");
  elements.themeToggleBtn?.setAttribute("aria-expanded", "false");
}
