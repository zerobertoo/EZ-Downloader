import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { bridge } from "../bridge";
import { setUrlValue, urlValue } from "../download";
import { UI_STRINGS } from "../state";
import { isHttpUrl } from "../utils";
import { toast } from "../components/toast";
import { refs } from "./refs";

let monitorEnabled = false;
let lastHandledText = "";

function hideOffer() {
  refs.offer.classList.add("is-hidden");
}

function showOffer(url: string) {
  refs.offerUrl.textContent = url;
  refs.offer.classList.remove("is-hidden");
}

/** Só lê a área de transferência quando o usuário ligou o monitor, e só ao voltar para a janela. */
async function checkClipboard() {
  if (!monitorEnabled) return;
  try {
    const text = ((await readText()) ?? "").trim();
    // texto com mais de um link não é oferta
    if (!text || /\s/.test(text) || text === lastHandledText || !isHttpUrl(text) || text === urlValue()) return;
    lastHandledText = text;
    showOffer(text);
  } catch (error) {
    console.warn("Failed to read the clipboard:", error);
  }
}

async function setMonitor(next: boolean) {
  try {
    const settings = await bridge.setClipboardMonitor(next);
    monitorEnabled = settings.clipboardMonitor;
  } catch (error) {
    console.error("Failed to change the clipboard monitor:", error);
    toast({ kind: "error", message: UI_STRINGS.errorClipboardToggle });
    refs.clipboardSwitch.checked = monitorEnabled;
    return;
  }
  if (!monitorEnabled) hideOffer();
}

export function initClipboardUI(enabledAtStart: boolean) {
  monitorEnabled = enabledAtStart;
  refs.clipboardSwitch.checked = enabledAtStart;
  refs.clipboardSwitch.addEventListener("change", () => void setMonitor(refs.clipboardSwitch.checked));
  refs.offerDismiss.addEventListener("click", hideOffer);
  refs.offerUse.addEventListener("click", () => {
    const url = refs.offerUrl.textContent ?? "";
    if (url) setUrlValue(url);
    hideOffer();
    refs.urlInput.focus();
  });
  window.addEventListener("focus", () => void checkClipboard());
}
