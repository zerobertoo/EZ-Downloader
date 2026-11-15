import { h } from "./dom";
import { icon, type IconName } from "./icons";
import { attachTooltip } from "./tooltip";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "paper";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonOptions {
  label?: string;
  icon?: IconName;
  variant?: ButtonVariant;
  size?: ButtonSize;
  tooltip?: string;
  ariaLabel?: string;
  onClick?: (event: MouseEvent) => void;
  className?: string;
  keys?: string;
}

/** Botão com estados de repouso, foco, pressionado, ocupado e desabilitado; `primary` é a tecla física laranja. */
export function button(options: ButtonOptions): HTMLButtonElement {
  const { label, icon: iconName, variant = "secondary", size = "md", tooltip, ariaLabel, onClick, className, keys } = options;
  const element = h(
    "button",
    {
      type: "button",
      class: ["btn", `btn--${variant}`, `btn--${size}`, !label && "btn--icon", className],
      "aria-label": ariaLabel ?? (label ? undefined : tooltip),
      "aria-keyshortcuts": keys,
      onClick,
    },
    iconName ? h("span", { class: "btn__icon" }, icon(iconName, size === "lg" ? 20 : 16)) : null,
    label ? h("span", { class: "btn__label" }, label) : null,
    h("span", { class: "btn__spinner", "aria-hidden": "true" })
  );
  if (tooltip) attachTooltip(element, tooltip);
  return element;
}

/** Ocupado = desabilitado para evitar clique duplo, mas com o leitor de tela avisando "ocupado". */
export function setButtonBusy(target: HTMLButtonElement, busy: boolean) {
  target.classList.toggle("is-busy", busy);
  target.disabled = busy;
  if (busy) target.setAttribute("aria-busy", "true");
  else target.removeAttribute("aria-busy");
}

/** Faz a tecla "afundar" de novo: usado quando a ação foi disparada por atalho de teclado. */
export function pulseButton(target: HTMLElement) {
  target.classList.remove("is-pulsing");
  void target.offsetWidth;
  target.classList.add("is-pulsing");
}
