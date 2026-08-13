import { bridge, type FormatOption } from "../bridge";
import { UI_STRINGS, elements, state } from "../state";
import { errorMessage, formatFileSize, isValidUrl, urlFieldValue } from "../utils";
import { clearFieldErrors, setFieldError } from "./feedback";
import { setPhase } from "./render";

/* ════════════════════════════════════════════════════════════════
   BUSCA DE FORMATOS
   ════════════════════════════════════════════════════════════════ */

export async function handleFetchFormats() {
  if (state.phase === "fetching") return;

  const url = urlFieldValue();
  clearFieldErrors();

  if (!url) {
    setFieldError(elements.urlError, UI_STRINGS.errorNoUrl);
    return;
  }

  if (!isValidUrl(url)) {
    setFieldError(elements.urlError, UI_STRINGS.errorInvalidUrl);
    return;
  }

  state.currentUrl = url;
  state.formats = [];
  state.selectedFormat = null;
  state.videoMetadata = { title: null, thumbnail: null, uploader: null };
  setPhase("fetching");

  try {
    const result = await bridge.getFormats(url);

    if (!result.formats || result.formats.length === 0) {
      throw new Error(UI_STRINGS.errorNoFormats);
    }

    state.formats = result.formats;
    state.videoMetadata = {
      title: result.title || null,
      thumbnail: result.thumbnail || null,
      uploader: result.uploader || null,
    };
    populateFormatSelect();
    displayVideoMetadata();
    setPhase("ready");
  } catch (error) {
    console.error("Erro ao buscar formatos:", error);
    // A URL digitada continua no campo — só o vídeo não carregou.
    state.currentUrl = "";
    setPhase("idle");
    setFieldError(elements.urlError, `${UI_STRINGS.errorFetchFormats} ${errorMessage(error)}`);
  }
}

function displayVideoMetadata() {
  const { title, thumbnail, uploader } = state.videoMetadata;

  if (elements.videoTitle) elements.videoTitle.textContent = title || "Vídeo";
  if (elements.videoUploader) {
    elements.videoUploader.textContent = uploader ? `Por: ${uploader}` : "";
  }

  if (elements.videoThumbnail) {
    if (thumbnail) {
      elements.videoThumbnail.src = thumbnail;
      elements.videoThumbnail.onerror = showThumbnailPlaceholder;
    } else {
      showThumbnailPlaceholder();
    }
  }
}

function showThumbnailPlaceholder() {
  if (!elements.videoThumbnail) return;
  elements.videoThumbnail.src =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 180'%3E%3Crect fill='%23333' width='320' height='180'/%3E%3Cpath fill='%23666' d='M145 85l45 27v-54z'/%3E%3C/svg%3E";
}

function populateFormatSelect() {
  if (!elements.formatSelect) return;

  elements.formatSelect.innerHTML = "";

  state.formats.forEach((format) => {
    const option = document.createElement("option");
    option.value = format.id;
    const sizeStr = format.filesize ? ` — ${formatFileSize(format.filesize)}` : "";
    option.textContent = format.label + sizeStr;
    option.dataset.format = JSON.stringify(format);
    elements.formatSelect?.appendChild(option);
  });

  if (state.formats.length > 0) {
    elements.formatSelect.value = state.formats[0].id;
    applySelectedFormat();
  }
}

export function handleFormatChange() {
  applySelectedFormat();
}

function applySelectedFormat() {
  const selectedOption = elements.formatSelect?.selectedOptions[0];
  if (selectedOption?.dataset.format) {
    state.selectedFormat = JSON.parse(selectedOption.dataset.format) as FormatOption;
    updateFormatInfo();
  }
}

function updateFormatInfo() {
  if (!state.selectedFormat || !elements.formatInfo) return;

  const format = state.selectedFormat;
  let info = "";

  if (format.type === "best") {
    info = "Melhor qualidade disponível (vídeo + áudio)";
  } else if (format.type === "combined") {
    info = `${format.ext.toUpperCase()} - ${format.height}p (Vídeo + Áudio)`;
    if (format.filesize) info += ` • ${formatFileSize(format.filesize)}`;
  } else if (format.type === "video") {
    info = `${format.ext.toUpperCase()} - ${format.height}p (Vídeo)`;
    if (format.fps) info += ` • ${format.fps} fps`;
    if (format.filesize) info += ` • ${formatFileSize(format.filesize)}`;
  } else if (format.type === "audio") {
    info = `${format.ext.toUpperCase()} - Áudio`;
    if (format.abr) info += ` • ${format.abr} kbps`;
    if (format.filesize) info += ` • ${formatFileSize(format.filesize)}`;
  }

  elements.formatInfo.textContent = info;
}
