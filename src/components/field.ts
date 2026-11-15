import { h, uid } from "./dom";
import { icon, type IconName } from "./icons";

export interface FieldOptions {
  label: string;
  hint?: string;
  control: HTMLElement;
  /** `for` do rótulo: precisa ser o id do controle focável. */
  controlId?: string;
  optional?: boolean;
}

export interface FieldControl {
  element: HTMLElement;
  setError(message: string | null): void;
  setHint(message: string | null): void;
}

/** Rótulo + controle + dica + erro, com `aria-describedby` apontando para o texto de apoio. */
export function field(options: FieldOptions): FieldControl {
  const id = uid("field");
  const note = h("p", { class: "field__note", id: `${id}-note` }, options.hint ?? "");
  const error = h("p", { class: "field__error", id: `${id}-error`, role: "alert" });
  const label = h(
    "label",
    { class: "field__label", for: options.controlId },
    options.label,
    options.optional ? h("span", { class: "field__optional" }, "opcional") : null
  );
  const element = h("div", { class: "field" }, label, options.control, note, error);
  const describe = () => {
    const ids = [options.hint ? note.id : "", error.textContent ? error.id : ""].filter(Boolean).join(" ");
    const target = options.control.matches("input,button") ? options.control : options.control.querySelector("input,button");
    if (!target) return;
    if (ids) target.setAttribute("aria-describedby", ids);
    else target.removeAttribute("aria-describedby");
    if (error.textContent) target.setAttribute("aria-invalid", "true");
    else target.removeAttribute("aria-invalid");
  };
  describe();

  return {
    element,
    setError(message) {
      error.textContent = message ?? "";
      element.classList.toggle("has-error", Boolean(message));
      describe();
    },
    setHint(message) {
      note.textContent = message ?? "";
      note.classList.toggle("is-hidden", !message);
    },
  };
}

export interface TextInputOptions {
  id?: string;
  placeholder?: string;
  ariaLabel?: string;
  mono?: boolean;
  icon?: IconName;
  maxLength?: number;
  readOnly?: boolean;
  center?: boolean;
  onInput?: (value: string) => void;
}

export interface TextInput {
  element: HTMLElement;
  input: HTMLInputElement;
}

export function textInput(options: TextInputOptions = {}): TextInput {
  const input = h("input", {
    type: "text",
    class: ["input", options.mono && "input--mono", options.center && "input--center", options.icon && "input--with-icon"],
    id: options.id ?? uid("input"),
    placeholder: options.placeholder,
    "aria-label": options.ariaLabel,
    maxLength: options.maxLength,
    readOnly: options.readOnly,
    autocomplete: "off",
    spellcheck: "false",
  });
  if (options.onInput) input.addEventListener("input", () => options.onInput?.(input.value));
  const element = h("div", { class: "input-wrap" }, options.icon ? h("span", { class: "input-wrap__icon" }, icon(options.icon, 16)) : null, input);
  return { element, input };
}
