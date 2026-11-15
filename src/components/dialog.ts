import { button } from "./button";
import { h, trapFocus, uid } from "./dom";
import { layerRoot } from "./layer";

export interface DialogAction {
  label: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  value: string;
}

export interface DialogOptions {
  title: string;
  body: string | HTMLElement;
  actions: DialogAction[];
  /** Valor devolvido ao fechar com Esc ou clicar fora; padrão: a primeira ação neutra. */
  dismissValue?: string;
  initialFocus?: string;
}

/** Diálogo modal próprio (alertdialog): foco preso, Esc cancela, devolve o foco a quem abriu. */
export function openDialog(options: DialogOptions): Promise<string> {
  return new Promise((resolve) => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const titleId = uid("dialog-title");
    const bodyId = uid("dialog-body");
    const dismissValue = options.dismissValue ?? options.actions.find((action) => action.variant !== "primary" && action.variant !== "danger")?.value ?? "cancel";

    const finish = (value: string) => {
      releaseTrap();
      document.removeEventListener("keydown", onKeyDown, true);
      scrim.classList.remove("is-open");
      const remove = () => scrim.remove();
      scrim.addEventListener("transitionend", remove, { once: true });
      setTimeout(remove, 320);
      previouslyFocused?.focus({ preventScroll: true });
      resolve(value);
    };

    const buttons = options.actions.map((action) => ({
      action,
      element: button({
        label: action.label,
        variant: action.variant ?? "secondary",
        onClick: () => finish(action.value),
      }),
    }));

    const dialog = h(
      "div",
      { class: "dialog", role: "alertdialog", "aria-modal": "true", "aria-labelledby": titleId, "aria-describedby": bodyId, tabindex: "-1" },
      h("h2", { class: "dialog__title", id: titleId }, options.title),
      h("div", { class: "dialog__body", id: bodyId }, options.body),
      h("div", { class: "dialog__actions" }, ...buttons.map((entry) => entry.element))
    );
    const scrim = h("div", { class: "scrim", "data-layer": "", onPointerdown: (event: PointerEvent) => event.target === scrim && finish(dismissValue) }, dialog);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        finish(dismissValue);
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    layerRoot().appendChild(scrim);
    const releaseTrap = trapFocus(dialog);
    requestAnimationFrame(() => scrim.classList.add("is-open"));

    const preferred = buttons.find((entry) => entry.action.value === options.initialFocus) ?? buttons.find((entry) => entry.action.variant !== "danger" && entry.action.variant !== "primary") ?? buttons[0];
    preferred?.element.focus();
  });
}

export function confirmDialog(options: { title: string; body: string | HTMLElement; confirmLabel: string; cancelLabel?: string; danger?: boolean }): Promise<boolean> {
  return openDialog({
    title: options.title,
    body: options.body,
    dismissValue: "cancel",
    actions: [
      { label: options.cancelLabel ?? "Cancelar", value: "cancel", variant: "ghost" },
      { label: options.confirmLabel, value: "confirm", variant: options.danger ? "danger" : "primary" },
    ],
  }).then((value) => value === "confirm");
}
