import { bridge } from "../bridge";
import { PATH_STORAGE_KEY, UI_STRINGS, elements, state } from "../state";
import { clearFieldError, setFieldError } from "./feedback";
import { leaveOutcome } from "./render";

/* ════════════════════════════════════════════════════════════════
   DESTINO
   ════════════════════════════════════════════════════════════════ */

export async function handleSelectPath() {
  try {
    const path = await bridge.selectDownloadPath();
    if (path) {
      state.downloadPath = path;
      localStorage.setItem(PATH_STORAGE_KEY, path);
      updateDownloadPathDisplay();
      clearFieldError(elements.pathError);
      leaveOutcome();
    }
  } catch (error) {
    console.error("Erro ao selecionar diretório:", error);
    setFieldError(elements.pathError, UI_STRINGS.errorSelectDir);
  }
}

export function updateDownloadPathDisplay() {
  if (elements.downloadPath) {
    elements.downloadPath.value = state.downloadPath || "";
  }
}
