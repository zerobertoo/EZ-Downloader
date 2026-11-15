import { h } from "../components/dom";
import { icon } from "../components/icons";

/** Um lugar onde uma mensagem aparece: erro, dica ou nada. */
export interface MessageSlot {
  error(message: string): void;
  hint(message: string): void;
  clear(): void;
  readonly isHint: boolean;
}

/** Mensagem sob a barra de comando: ícone, texto, vermelho para erro e cor de acento para dica. */
export function createMessage(): { element: HTMLElement; slot: MessageSlot } {
  const text = h("span", { class: "msg__text" });
  const element = h("p", { class: "msg is-hidden", role: "alert" }, icon("warning", 16), text);
  let hinting = false;
  const set = (message: string, asHint: boolean) => {
    hinting = asHint;
    text.textContent = message;
    element.classList.toggle("is-hint", asHint);
    element.classList.remove("is-hidden");
    element.setAttribute("role", asHint ? "status" : "alert");
    // reinicia a animação de tremida quando o mesmo erro se repete
    element.style.animation = "none";
    void element.offsetWidth;
    element.style.animation = "";
  };
  return {
    element,
    slot: {
      error: (message) => set(message, false),
      hint: (message) => set(message, true),
      clear() {
        hinting = false;
        text.textContent = "";
        element.classList.add("is-hidden");
        element.classList.remove("is-hint");
      },
      get isHint() {
        return hinting;
      },
    },
  };
}
