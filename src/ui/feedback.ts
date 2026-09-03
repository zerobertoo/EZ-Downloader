import { elements } from "../state";

/* ════════════════════════════════════════════════════════════════
   FEEDBACK — erro de campo e banner de resultado
   ════════════════════════════════════════════════════════════════ */

export function setFieldError(element: Element | null, message: string) {
  if (!element) return;
  element.textContent = message;
  element.classList.remove("is-hint");
}

export function setFieldHint(element: Element | null, message: string) {
  if (!element) return;
  element.textContent = message;
  element.classList.add("is-hint");
}

export function clearFieldError(element: Element | null) {
  if (!element) return;
  element.textContent = "";
  element.classList.remove("is-hint");
}

export function clearFieldErrors() {
  clearFieldError(elements.urlError);
  clearFieldError(elements.pathError);
  clearFieldError(elements.sectionError);
  clearFieldError(elements.limitRateError);
}
