import { h, uid } from "./dom";
import { icon } from "./icons";

export interface ToggleOptions {
  label: string;
  hint?: string;
  checked?: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
}

export interface ToggleControl {
  element: HTMLElement;
  input: HTMLInputElement;
  checked: boolean;
  setChecked(checked: boolean, silent?: boolean): void;
  setDisabled(disabled: boolean): void;
}

function build(kind: "checkbox" | "switch", options: ToggleOptions): ToggleControl {
  const id = uid(kind);
  const hintId = options.hint ? `${id}-hint` : undefined;

  // O input real fica visível ao leitor de tela e ao teclado; a caixa desenhada é só a face dele.
  const input = h("input", {
    type: "checkbox",
    class: "toggle__input",
    id,
    role: kind === "switch" ? "switch" : undefined,
    checked: options.checked ?? false,
    disabled: options.disabled ?? false,
    "aria-describedby": hintId,
  });

  const face =
    kind === "checkbox"
      ? h("span", { class: "toggle__box", "aria-hidden": "true" }, icon("check", 14))
      : h("span", { class: "toggle__track", "aria-hidden": "true" }, h("span", { class: "toggle__knob" }));

  const text = h(
    "span",
    { class: "toggle__text" },
    h("span", { class: "toggle__label" }, options.label),
    options.hint ? h("span", { class: "toggle__hint", id: hintId }, options.hint) : null
  );

  const element = h("label", { class: ["toggle", `toggle--${kind}`], for: id }, input, face, text);
  input.addEventListener("change", () => options.onChange?.(input.checked));

  return {
    element,
    input,
    get checked() {
      return input.checked;
    },
    setChecked(checked, silent = false) {
      input.checked = checked;
      if (!silent) options.onChange?.(checked);
    },
    setDisabled(disabled) {
      input.disabled = disabled;
      element.classList.toggle("is-disabled", disabled);
    },
  };
}

export const checkbox = (options: ToggleOptions) => build("checkbox", options);
export const switchControl = (options: ToggleOptions) => build("switch", options);
