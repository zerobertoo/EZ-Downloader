import { bridge } from "../bridge";
import { UI_STRINGS, elements, state } from "../state";
import { clearFieldError, setFieldError } from "./feedback";

/* ════════════════════════════════════════════════════════════════
   DESTINO
   ════════════════════════════════════════════════════════════════ */

export async function handleSelectPath() {
  try {
    const path = await bridge.selectDownloadPath();
    if (path) {
      state.downloadPath = path;
      await bridge.setDownloadPath(path);
      updateDownloadPathDisplay();
      clearFieldError(elements.pathError);
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
