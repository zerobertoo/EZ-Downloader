import { h, uid } from "./dom";
import { icon, type IconName } from "./icons";
import { attachTooltip } from "./tooltip";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
  tooltip?: string;
}

export interface SegmentedOptions<T extends string> {
  label: string;
  options: SegmentedOption<T>[];
  value: T;
  onChange?: (value: T, previous: T) => void;
  /** Pode vetar a troca (ex.: confirmar antes de descartar campos); retorne false para ficar. */
  beforeChange?: (next: T, current: T) => boolean | Promise<boolean>;
  size?: "sm" | "md";
  className?: string;
}

export interface SegmentedControl<T extends string> {
  element: HTMLElement;
  readonly value: T;
  setValue(value: T, silent?: boolean): void;
  /** Troca como um clique do usuário: passa por `beforeChange`. */
  request(value: T): Promise<void>;
  focus(): void;
}

/**
 * Controle segmentado (radiogroup): todos os rótulos visíveis, a pílula ativa desliza entre eles.
 * Setas movem e selecionam, Home/End vão às pontas, só o ativo entra na ordem de Tab.
 */
export function segmented<T extends string>(config: SegmentedOptions<T>): SegmentedControl<T> {
  const { label, options, onChange, beforeChange, size = "md", className } = config;
  let current = config.value;
  const thumb = h("span", { class: "seg__thumb", "aria-hidden": "true" });
  const buttons = new Map<T, HTMLButtonElement>();

  const root = h("div", { class: ["seg", `seg--${size}`, className], role: "radiogroup", "aria-label": label, id: uid("seg") }, thumb);

  for (const option of options) {
    const item = h(
      "button",
      { type: "button", class: "seg__item", role: "radio", dataset: { value: option.value } },
      option.icon ? icon(option.icon, size === "sm" ? 14 : 16) : null,
      h("span", { class: "seg__text" }, option.label)
    );
    if (option.tooltip) attachTooltip(item, option.tooltip);
    item.addEventListener("click", () => void choose(option.value));
    item.addEventListener("keydown", (event) => handleKey(event, option.value));
    buttons.set(option.value, item);
    root.appendChild(item);
  }

  function moveThumb(animate: boolean) {
    const active = buttons.get(current);
    if (!active || !root.isConnected || active.offsetWidth === 0) return;
    if (!animate) thumb.style.transition = "none";
    thumb.style.width = `${active.offsetWidth}px`;
    thumb.style.transform = `translateX(${active.offsetLeft}px)`;
    if (!animate) {
      void thumb.offsetWidth;
      thumb.style.transition = "";
    }
  }

  function paint(animate: boolean) {
    for (const [value, item] of buttons) {
      const active = value === current;
      item.setAttribute("aria-checked", String(active));
      item.tabIndex = active ? 0 : -1;
    }
    moveThumb(animate);
  }

  async function choose(next: T) {
    if (next === current) return;
    if (beforeChange && !(await beforeChange(next, current))) return;
    const previous = current;
    current = next;
    paint(true);
    onChange?.(current, previous);
  }

  function handleKey(event: KeyboardEvent, from: T) {
    const values = options.map((option) => option.value);
    const index = values.indexOf(from);
    let target: T | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") target = values[(index + 1) % values.length];
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") target = values[(index - 1 + values.length) % values.length];
    else if (event.key === "Home") target = values[0];
    else if (event.key === "End") target = values[values.length - 1];
    if (!target) return;
    event.preventDefault();
    void choose(target).then(() => buttons.get(target as T)?.focus());
  }

  paint(false);
  const resizeObserver = new ResizeObserver(() => moveThumb(false));
  resizeObserver.observe(root);
  document.fonts?.ready.then(() => moveThumb(false));

  return {
    element: root,
    get value() {
      return current;
    },
    setValue(value, silent = false) {
      if (value === current) return;
      const previous = current;
      current = value;
      paint(true);
      if (!silent) onChange?.(current, previous);
    },
    request: choose,
    focus() {
      buttons.get(current)?.focus();
    },
  };
}
