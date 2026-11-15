import { h, uid } from "./dom";
import { icon } from "./icons";

export interface DisclosureOptions {
  title: string;
  summary?: string;
  content: HTMLElement;
  open?: boolean;
  onToggle?: (open: boolean) => void;
  className?: string;
}

export interface DisclosureControl {
  element: HTMLElement;
  setOpen(open: boolean): void;
  readonly isOpen: boolean;
}

/** Recolhível próprio no lugar de `<details>`: anima a altura por grid-template-rows e funciona igual em qualquer engine. */
export function disclosure(options: DisclosureOptions): DisclosureControl {
  const panelId = uid("disclosure");
  let opened = options.open ?? false;

  const summary = h("span", { class: "disclosure__summary" }, options.summary ?? "");
  const trigger = h(
    "button",
    { type: "button", class: "disclosure__trigger", "aria-expanded": String(opened), "aria-controls": panelId },
    h("span", { class: "disclosure__title" }, options.title),
    summary,
    h("span", { class: "disclosure__chevron" }, icon("chevron-down", 16))
  );
  const panel = h("div", { class: "disclosure__panel", id: panelId, role: "region" }, h("div", { class: "disclosure__inner" }, options.content));
  const element = h("section", { class: ["disclosure", options.className, opened && "is-open"] }, trigger, panel);

  const paint = () => {
    element.classList.toggle("is-open", opened);
    trigger.setAttribute("aria-expanded", String(opened));
    panel.inert = !opened;
  };
  paint();

  trigger.addEventListener("click", () => {
    opened = !opened;
    paint();
    options.onToggle?.(opened);
  });

  return {
    element,
    get isOpen() {
      return opened;
    },
    setOpen(next) {
      if (next === opened) return;
      opened = next;
      paint();
      options.onToggle?.(opened);
    },
  };
}
