import { clamp, h } from "./dom";

export interface ProgressBarControl {
  element: HTMLElement;
  set(percent: number, indeterminate?: boolean): void;
}

/** Barra de progresso (role=progressbar) com modo indeterminado para quando ainda não há percentual. */
export function progressBar(label: string): ProgressBarControl {
  const fill = h("span", { class: "bar__fill" });
  const element = h("div", { class: "bar", role: "progressbar", "aria-label": label, "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": "0" }, fill);
  return {
    element,
    set(percent, indeterminate = false) {
      const value = clamp(percent, 0, 100);
      element.classList.toggle("is-indeterminate", indeterminate);
      if (indeterminate) element.removeAttribute("aria-valuenow");
      else element.setAttribute("aria-valuenow", String(Math.round(value)));
      fill.style.transform = `scaleX(${value / 100})`;
    },
  };
}
