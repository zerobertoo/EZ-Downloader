import { h, uid } from "./dom";
import { layerRoot } from "./layer";

const SHOW_DELAY_MS = 420;

let tooltipElement: HTMLElement | null = null;
let showTimer: ReturnType<typeof setTimeout> | null = null;
let currentTarget: HTMLElement | null = null;
const texts = new WeakMap<HTMLElement, string>();

function ensureTooltip(): HTMLElement {
  if (tooltipElement && tooltipElement.isConnected) return tooltipElement;
  tooltipElement = h("div", { class: "tooltip", role: "tooltip", id: uid("tooltip"), "data-layer": "" });
  layerRoot().appendChild(tooltipElement);
  return tooltipElement;
}

function position(target: HTMLElement, tip: HTMLElement) {
  const rect = target.getBoundingClientRect();
  const tipRect = tip.getBoundingClientRect();
  const margin = 8;
  let top = rect.top - tipRect.height - margin;
  let placement = "top";
  if (top < margin) {
    top = rect.bottom + margin;
    placement = "bottom";
  }
  const left = Math.min(Math.max(margin, rect.left + rect.width / 2 - tipRect.width / 2), window.innerWidth - tipRect.width - margin);
  tip.style.top = `${Math.round(top)}px`;
  tip.style.left = `${Math.round(left)}px`;
  tip.dataset.placement = placement;
}

function show(target: HTMLElement) {
  const text = texts.get(target);
  if (!text) return;
  const tip = ensureTooltip();
  tip.textContent = text;
  tip.classList.add("is-visible");
  currentTarget = target;
  target.setAttribute("aria-describedby", tip.id);
  position(target, tip);
}

function hide() {
  if (showTimer) {
    clearTimeout(showTimer);
    showTimer = null;
  }
  tooltipElement?.classList.remove("is-visible");
  currentTarget?.removeAttribute("aria-describedby");
  currentTarget = null;
}

/** Tooltip próprio no lugar do `title` nativo: mesmo visual em qualquer sistema e também aparece no foco por teclado. */
export function attachTooltip(target: HTMLElement, text: string) {
  texts.set(target, text);
  target.addEventListener("pointerenter", (event) => {
    if (event.pointerType === "touch") return;
    if (showTimer) clearTimeout(showTimer);
    showTimer = setTimeout(() => show(target), SHOW_DELAY_MS);
  });
  target.addEventListener("pointerleave", hide);
  target.addEventListener("pointerdown", hide);
  target.addEventListener("focus", () => {
    if (target.matches(":focus-visible")) show(target);
  });
  target.addEventListener("blur", hide);
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") hide();
});
window.addEventListener("scroll", hide, true);
window.addEventListener("blur", hide);
