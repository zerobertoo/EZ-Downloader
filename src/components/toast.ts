import { h } from "./dom";
import { icon, type IconName } from "./icons";
import { layerRoot } from "./layer";

export type ToastKind = "info" | "success" | "error";

export interface ToastOptions {
  kind?: ToastKind;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
}

const ICONS: Record<ToastKind, IconName> = { info: "info", success: "check", error: "warning" };
const MAX_VISIBLE = 3;

let region: HTMLElement | null = null;

function ensureRegion(): HTMLElement {
  if (region && region.isConnected) return region;
  region = h("div", { class: "toasts", role: "region", "aria-label": "Avisos", "aria-live": "polite", "data-layer": "" });
  layerRoot().appendChild(region);
  return region;
}

/** Aviso temporário. Erros ficam mais tempo e usam `role=alert`; pausa o relógio com o mouse ou o foco em cima. */
export function toast(options: ToastOptions): () => void {
  const kind = options.kind ?? "info";
  const container = ensureRegion();
  while (container.children.length >= MAX_VISIBLE) container.firstElementChild?.remove();

  const duration = options.durationMs ?? (kind === "error" ? 8000 : 4200);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let remaining = duration;
  let startedAt = 0;

  const dismiss = () => {
    if (timer) clearTimeout(timer);
    element.classList.add("is-leaving");
    const remove = () => element.remove();
    element.addEventListener("animationend", remove, { once: true });
    setTimeout(remove, 400);
  };
  const start = () => {
    startedAt = Date.now();
    timer = setTimeout(dismiss, remaining);
    bar.style.animationPlayState = "running";
  };
  const pause = () => {
    if (timer) clearTimeout(timer);
    remaining -= Date.now() - startedAt;
    bar.style.animationPlayState = "paused";
  };

  const bar = h("span", { class: "toast__bar", "aria-hidden": "true", style: { "animation-duration": `${duration}ms` } });
  const close = h("button", { type: "button", class: "toast__close", "aria-label": "Fechar aviso", onClick: dismiss }, icon("x", 14));
  const element = h(
    "div",
    { class: ["toast", `toast--${kind}`], role: kind === "error" ? "alert" : "status" },
    h("span", { class: "toast__icon" }, icon(ICONS[kind], 16)),
    h("span", { class: "toast__message" }, options.message),
    options.actionLabel
      ? h("button", { type: "button", class: "toast__action", onClick: () => { options.onAction?.(); dismiss(); } }, options.actionLabel)
      : null,
    close,
    bar
  );
  element.addEventListener("pointerenter", pause);
  element.addEventListener("pointerleave", start);
  element.addEventListener("focusin", pause);
  element.addEventListener("focusout", start);

  container.appendChild(element);
  start();
  return dismiss;
}
