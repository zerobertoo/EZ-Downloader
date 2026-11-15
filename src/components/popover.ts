import { h } from "./dom";
import { isInsideLayer, layerRoot, placeBelow } from "./layer";

export interface PopoverOptions {
  anchor: HTMLElement;
  content: HTMLElement;
  label: string;
  role?: "dialog" | "menu";
  align?: "start" | "end";
  width?: number;
  onOpen?: () => void;
  onClose?: () => void;
}

export interface PopoverControl {
  panel: HTMLElement;
  open(): void;
  close(returnFocus?: boolean): void;
  toggle(): void;
  readonly isOpen: boolean;
}

let openPopover: PopoverControl | null = null;

/** Painel ancorado, não modal: fecha com Esc, clique fora ou foco saindo; devolve o foco ao âncora. */
export function popover(options: PopoverOptions): PopoverControl {
  const { anchor, content, label, role = "dialog", align = "end", width, onOpen, onClose } = options;
  const panel = h("div", { class: "popover", role, "aria-label": label, tabindex: "-1", "data-layer": "" }, content);
  if (width) panel.style.width = `${width}px`;
  let opened = false;

  const reposition = () => {
    const placement = placeBelow(anchor, panel.offsetHeight, { align, panelWidth: width ?? panel.offsetWidth });
    panel.style.top = `${Math.round(placement.top)}px`;
    panel.style.left = `${Math.round(placement.left)}px`;
    panel.style.maxHeight = `${Math.round(placement.maxHeight)}px`;
    panel.dataset.placement = placement.above ? "top" : "bottom";
  };

  const onPointerDown = (event: PointerEvent) => {
    const target = event.target as Node;
    if (panel.contains(target) || anchor.contains(target) || isInsideLayer(target)) return;
    control.close(false);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && !event.defaultPrevented) {
      event.stopPropagation();
      control.close(true);
    }
  };
  const onFocusOut = (event: FocusEvent) => {
    const next = event.relatedTarget as Node | null;
    if (!next || panel.contains(next) || anchor.contains(next) || isInsideLayer(next)) return;
    control.close(false);
  };

  const control: PopoverControl = {
    panel,
    get isOpen() {
      return opened;
    },
    open() {
      if (opened) return;
      if (openPopover && openPopover !== control) openPopover.close(false);
      openPopover = control;
      opened = true;
      layerRoot().appendChild(panel);
      reposition();
      requestAnimationFrame(() => panel.classList.add("is-open"));
      anchor.setAttribute("aria-expanded", "true");
      document.addEventListener("pointerdown", onPointerDown, true);
      panel.addEventListener("keydown", onKeyDown);
      anchor.addEventListener("keydown", onKeyDown);
      panel.addEventListener("focusout", onFocusOut);
      window.addEventListener("resize", reposition);
      window.addEventListener("scroll", reposition, true);
      onOpen?.();
      // Foca o painel, não o primeiro controle: assim nenhum tooltip dispara sozinho e o Tab entra na ordem natural.
      panel.focus({ preventScroll: true });
      requestAnimationFrame(reposition);
    },
    close(returnFocus = true) {
      if (!opened) return;
      opened = false;
      if (openPopover === control) openPopover = null;
      panel.classList.remove("is-open");
      anchor.setAttribute("aria-expanded", "false");
      document.removeEventListener("pointerdown", onPointerDown, true);
      panel.removeEventListener("keydown", onKeyDown);
      anchor.removeEventListener("keydown", onKeyDown);
      panel.removeEventListener("focusout", onFocusOut);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      panel.remove();
      if (returnFocus) anchor.focus({ preventScroll: true });
      onClose?.();
    },
    toggle() {
      if (opened) control.close(true);
      else control.open();
    },
  };

  anchor.setAttribute("aria-haspopup", role === "menu" ? "menu" : "dialog");
  anchor.setAttribute("aria-expanded", "false");
  return control;
}
