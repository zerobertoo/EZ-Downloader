import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { bridge } from "../bridge";
import { UI_STRINGS, elements } from "../state";
import { isHttpUrl, setUrlFieldValue, toggle, urlFieldValue } from "../utils";
import { setFieldError } from "./feedback";

let monitorEnabled = false;
let lastHandledText = "";

function hideOffer() {
  toggle(elements.clipboardOffer, false);
  elements.clipboardOffer?.classList.remove("flex");
}

function showOffer(url: string) {
  if (elements.clipboardOfferUrl) elements.clipboardOfferUrl.textContent = url;
  toggle(elements.clipboardOffer, true);
  elements.clipboardOffer?.classList.add("flex");
}

function renderMonitorButton() {
  const button = elements.clipboardMonitorBtn;
  if (!button) return;
  button.setAttribute("aria-pressed", String(monitorEnabled));
}

/** Só lê a área de transferência quando o usuário ligou o monitor, e só ao voltar para a janela. */
async function checkClipboard() {
  if (!monitorEnabled) return;
  try {
    const text = ((await readText()) ?? "").trim();
    // O parser de URL ignora quebras de linha e espaços; texto com mais de um link não é oferta.
    if (!text || /\s/.test(text) || text === lastHandledText || !isHttpUrl(text) || text === urlFieldValue()) return;
    lastHandledText = text;
    showOffer(text);
  } catch (error) {
    console.warn("Não foi possível ler a área de transferência:", error);
  }
}

async function toggleMonitor() {
  const next = !monitorEnabled;
  try {
    const settings = await bridge.setClipboardMonitor(next);
    monitorEnabled = settings.clipboardMonitor;
  } catch (error) {
    console.error("Erro ao alterar o monitor de clipboard:", error);
    setFieldError(elements.urlError, UI_STRINGS.errorClipboardToggle);
    return;
  }
  if (!monitorEnabled) hideOffer();
  renderMonitorButton();
}

/** Colar uma lista com quebras de linha: o campo é de linha única, então vira links separados por espaço. */
function initUrlPaste() {
  elements.urlInput?.addEventListener("paste", (event) => {
    const input = elements.urlInput;
    const text = event.clipboardData?.getData("text") ?? "";
    if (!input || !/\s/.test(text.trim())) return;
    event.preventDefault();
    const joined = text.split(/\s+/).filter(Boolean).join(" ");
    input.setRangeText(joined, input.selectionStart ?? input.value.length, input.selectionEnd ?? input.value.length, "end");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

export function initClipboardUI(enabledAtStart: boolean) {
  monitorEnabled = enabledAtStart;
  renderMonitorButton();
  initUrlPaste();
  elements.clipboardMonitorBtn?.addEventListener("click", () => void toggleMonitor());
  elements.clipboardDismissBtn?.addEventListener("click", hideOffer);
  elements.clipboardUseBtn?.addEventListener("click", () => {
    const url = elements.clipboardOfferUrl?.textContent ?? "";
    if (url) setUrlFieldValue(url);
    hideOffer();
    elements.urlInput?.focus();
  });
  window.addEventListener("focus", () => void checkClipboard());
}
