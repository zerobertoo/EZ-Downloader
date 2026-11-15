export type Child = Node | string | number | null | undefined | false;
export type Props = Record<string, unknown>;

const PROPERTY_KEYS = new Set([
  "value",
  "disabled",
  "checked",
  "hidden",
  "tabIndex",
  "id",
  "type",
  "placeholder",
  "maxLength",
  "readOnly",
]);

/** Cria um elemento com atributos, eventos (`onclick`...) e filhos; o resto da UI usa só isto, sem innerHTML. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Props | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  applyProps(element, props);
  append(element, children);
  return element;
}

export function applyProps(element: Element, props?: Props | null) {
  if (!props) return;
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;

    if (key === "class") {
      const names = Array.isArray(value) ? value.filter(Boolean).join(" ") : String(value);
      element.setAttribute("class", names);
    } else if (key === "style" && typeof value === "object") {
      for (const [name, cssValue] of Object.entries(value as Record<string, string>)) {
        (element as HTMLElement).style.setProperty(name, cssValue);
      }
    } else if (key === "dataset" && typeof value === "object") {
      Object.assign((element as HTMLElement).dataset, value);
    } else if (key === "aria" && typeof value === "object") {
      for (const [name, ariaValue] of Object.entries(value as Record<string, unknown>)) {
        if (ariaValue !== null && ariaValue !== undefined && ariaValue !== false) {
          element.setAttribute(`aria-${name}`, String(ariaValue));
        }
      }
    } else if (key.startsWith("on") && typeof value === "function") {
      element.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (PROPERTY_KEYS.has(key)) {
      (element as unknown as Record<string, unknown>)[key] = value;
    } else if (value === true) {
      element.setAttribute(key, "");
    } else {
      element.setAttribute(key, String(value));
    }
  }
}

export function append(parent: ParentNode, children: Child[]) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(typeof child === "number" ? String(child) : child);
  }
}

let idCounter = 0;
export function uid(prefix = "ez"): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export const isMac = /mac/i.test(navigator.platform);

/** "Ctrl+L" no Windows/Linux e "⌘L" no macOS, para as dicas de atalho. */
export function shortcutLabel(key: string): string {
  return isMac ? `⌘${key}` : `Ctrl+${key}`;
}

export function safeStorageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeStorageSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* armazenamento indisponível: a preferência só vale nesta sessão */
  }
}

export function safeStorageRemove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ver safeStorageSet */
  }
}

/** Mantém o foco dentro de `container` enquanto ele estiver aberto; devolve a função que desliga. */
export function trapFocus(container: HTMLElement): () => void {
  const selector =
    'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"]), [role="option"][tabindex="0"]';
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Tab") return;
    const focusable = Array.from(container.querySelectorAll<HTMLElement>(selector)).filter(
      (node) => node.offsetParent !== null || node === document.activeElement
    );
    if (focusable.length === 0) {
      event.preventDefault();
      container.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === container)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  container.addEventListener("keydown", onKeyDown);
  return () => container.removeEventListener("keydown", onKeyDown);
}

export function shortenPath(path: string, keepSegments = 2): string {
  const parts = path.split(/[\\/]+/).filter(Boolean);
  if (parts.length <= keepSegments + 1) return path;
  const separator = path.includes("\\") ? "\\" : "/";
  return `…${separator}${parts.slice(-keepSegments).join(separator)}`;
}
