import { bridge, type FormatOption } from "./bridge";
import { button } from "./components/button";
import { switchControl } from "./components/checkbox";
import { confirmDialog } from "./components/dialog";
import { disclosure } from "./components/disclosure";
import { h, shortcutLabel, shortenPath } from "./components/dom";
import { field, textInput } from "./components/field";
import { icon } from "./components/icons";
import { popover } from "./components/popover";
import { segmented } from "./components/segmented";
import { select } from "./components/select";
import { createTape } from "./components/tape";
import { toast } from "./components/toast";
import { attachTooltip } from "./components/tooltip";
import { bindDownloadDeps, handleDownload, handleQuickDownload, openAdvancedPlaylistSelection, urlValue } from "./download";
import { currentMode, setMode, type AppMode } from "./mode";
import { prefs, type QuickFormat } from "./prefs";
import { UI_STRINGS, state, type Phase } from "./state";
import { THEMES, currentThemeId, setTheme } from "./theme";
import { errorMessage, formatFileSize, isValidUrl, looksLikePlaylist, urlHintFor } from "./utils";
import { createAdvancedOptions } from "./ui/advanced";
import { createMessage } from "./ui/feedback";
import { refs } from "./ui/refs";
import { closeSelection } from "./ui/selection";

const FORMAT_GROUP_LABEL: Record<FormatOption["type"], string> = {
  best: "Recomendado",
  combined: "Vídeo + áudio",
  video: "Somente vídeo",
  audio: "Somente áudio",
};

export function setPhase(phase: Phase) {
  state.phase = phase;
  render();
}

/** O estado manda e o DOM só reflete: fase do formulário, modo e dica de URL. */
export function render() {
  const phase = state.phase;
  const advancedMode = currentMode() === "advanced";
  const hasVideo = advancedMode && phase === "ready";

  refs.app.dataset.phase = phase;
  refs.app.dataset.hero = hasVideo ? "collapsed" : "full";

  refs.loadingPanel.classList.toggle("is-hidden", phase !== "fetching");
  refs.videoPanel.classList.toggle("is-hidden", !hasVideo);
  refs.configPanel.classList.toggle("is-hidden", !hasVideo);
  refs.downloadButton.classList.toggle("is-hidden", !hasVideo);

  refs.formatSegmentElement.classList.toggle("is-hidden", advancedMode);
  if (refs.goButton.dataset.mode !== currentMode()) {
    refs.goButton.dataset.mode = currentMode();
    refs.goButton.querySelector(".btn__label")!.textContent = advancedMode ? "Buscar" : "Baixar";
    refs.goButton.querySelector(".btn__icon")?.replaceChildren(icon(advancedMode ? "search" : "download", 18));
  }
  refs.goButton.disabled = phase === "fetching" && advancedMode;
  if (phase === "fetching" && advancedMode) refs.goButton.classList.add("is-busy");
  else if (advancedMode) refs.goButton.classList.remove("is-busy");

  // Se o campo de URL não bate com o vídeo carregado, baixar seria baixar o vídeo antigo: bloqueia e explica.
  const stale = hasVideo && urlValue() !== state.currentUrl;
  refs.downloadButton.disabled = stale;
  if (stale) refs.message.hint(UI_STRINGS.hintUrlChanged);
  else if (refs.message.isHint && !urlHintFor(urlValue(), currentMode())) refs.message.clear();
}

function renderUrlHint() {
  const hint = urlHintFor(urlValue(), currentMode());
  refs.playlistHintText.textContent = hint ?? "";
  refs.playlistHint.classList.toggle("is-hidden", !hint);
}

/* ── Busca de formatos (Modo Avançado) ─────────────────────── */

export async function handleFetchFormats() {
  if (state.phase === "fetching") return;
  const url = urlValue();
  refs.message.clear();

  if (!url) return refs.message.error(UI_STRINGS.errorNoUrl);
  if (/\s/.test(url)) return refs.message.error(UI_STRINGS.errorBatchNeedsBasicMode);
  if (!isValidUrl(url)) return refs.message.error(UI_STRINGS.errorInvalidUrl);
  if (looksLikePlaylist(url)) return openAdvancedPlaylistSelection(url, () => void handleFetchFormats());

  state.currentUrl = url;
  state.formats = [];
  state.selectedFormat = null;
  state.videoMetadata = { title: null, thumbnail: null, uploader: null };
  setPhase("fetching");

  try {
    const result = await bridge.getFormats(url);
    if (!result.formats || result.formats.length === 0) throw new Error(UI_STRINGS.errorNoFormats);
    state.formats = result.formats;
    state.videoMetadata = { title: result.title || null, thumbnail: result.thumbnail || null, uploader: result.uploader || null };
    populateFormats();
    showVideo();
    setPhase("ready");
  } catch (error) {
    console.error("Failed to fetch formats:", error);
    state.currentUrl = "";
    setPhase("idle");
    refs.message.error(`${UI_STRINGS.errorFetchFormats} ${errorMessage(error)}`);
  }
}

function showVideo() {
  const { title, thumbnail, uploader } = state.videoMetadata;
  refs.videoTitle.textContent = title || "Vídeo";
  refs.videoUploader.textContent = uploader ? `Por ${uploader}` : "";
  const image = refs.videoThumbnail;
  image.classList.remove("is-loaded");
  image.onload = () => image.classList.add("is-loaded");
  image.onerror = () => image.classList.remove("is-loaded");
  image.src = thumbnail ?? "";
}

function populateFormats() {
  const options = state.formats.map((format) => ({
    value: format.id,
    label: format.label,
    group: FORMAT_GROUP_LABEL[format.type],
    detail: format.filesize ? formatFileSize(format.filesize) : undefined,
  }));
  refs.formatSelect.setOptions(options, state.formats[0]?.id);
  applySelectedFormat(state.formats[0]?.id);
}

function applySelectedFormat(id: string | undefined) {
  const format = state.formats.find((candidate) => candidate.id === id);
  if (!format) return;
  state.selectedFormat = format;
  const parts: string[] = [];
  if (format.type === "best") parts.push("Melhor qualidade disponível, com vídeo e áudio");
  else {
    parts.push(format.ext.toUpperCase());
    if (format.height) parts.push(`${format.height}p`);
    if (format.fps) parts.push(`${format.fps} fps`);
    if (format.abr) parts.push(`${format.abr} kbps`);
    if (format.filesize) parts.push(formatFileSize(format.filesize));
  }
  refs.formatInfo.textContent = parts.join(" · ");
}

/* ── Pasta de destino ──────────────────────────────────────── */

export function showDownloadPath() {
  const path = state.downloadPath;
  refs.destinationPath.textContent = path ? shortenPath(path, 3) : "Nenhuma pasta escolhida";
  refs.destinationPath.title = path ?? "";
}

async function chooseDownloadPath() {
  try {
    const path = await bridge.selectDownloadPath();
    if (!path) return;
    await bridge.setDownloadPath(path);
    state.downloadPath = path;
    showDownloadPath();
    refs.message.clear();
  } catch (error) {
    console.error("Failed to select directory:", error);
    toast({ kind: "error", message: UI_STRINGS.errorSelectDir });
  }
}

/* ── Troca de modo ─────────────────────────────────────────── */

function applyMode(next: AppMode, advanced: ReturnType<typeof createAdvancedOptions>) {
  closeSelection();
  setMode(next);
  state.formats = [];
  state.selectedFormat = null;
  state.videoMetadata = { title: null, thumbnail: null, uploader: null };
  state.currentUrl = "";
  advanced.reset();
  refs.message.clear();
  setPhase("idle");
  renderUrlHint();
}

/* ── Montagem da tela ──────────────────────────────────────── */

export function buildApp(root: HTMLElement) {
  const advanced = createAdvancedOptions();
  const message = createMessage();
  refs.message = message.slot;
  refs.app = root;

  const modeSegment = segmented<AppMode>({
    label: "Modo do aplicativo",
    value: currentMode(),
    options: [
      { value: "basic", label: "Básico", tooltip: `Colar e baixar (${shortcutLabel("M")} alterna)` },
      { value: "advanced", label: "Avançado", tooltip: "Escolher formato, corte, legendas e mais" },
    ],
    beforeChange: async (next, current) => {
      if (current === "advanced" && advanced.hasInput()) {
        return confirmDialog({
          title: "Voltar ao Modo Básico?",
          body: "Os campos do Modo Avançado que você preencheu serão descartados.",
          confirmLabel: "Descartar e voltar",
          cancelLabel: "Continuar editando",
          danger: true,
        });
      }
      return next !== current;
    },
    onChange: (next) => applyMode(next, advanced),
  });
  refs.modeSegment = modeSegment;

  const settingsButton = button({ icon: "sliders", variant: "ghost", ariaLabel: "Ajustes e diagnóstico", tooltip: "Ajustes e diagnóstico" });
  refs.settingsButton = settingsButton;
  const brand = h(
    "div",
    { class: "brand" },
    h("span", { class: "brand__mark" }, icon("download", 20)),
    h("span", { class: "brand__name" }, "EZ", h("b", {}, "Downloader"))
  );
  const topbar = h("header", { class: "topbar" }, brand, h("div", { class: "topbar__tools" }, modeSegment.element, settingsButton));

  const url = textInput({ id: "urlInput", placeholder: "Cole o link aqui", ariaLabel: "Link do vídeo", icon: "link", mono: true });
  refs.urlInput = url.input;
  attachTooltip(url.input, `Campo do link (${shortcutLabel("L")}). ${shortcutLabel("Enter")} executa a ação principal.`);
  const formatSegment = segmented<QuickFormat>({
    label: "Formato do download",
    value: prefs.quickFormat,
    size: "sm",
    className: "seg--tape",
    options: [
      { value: "mp4", label: "MP4", icon: "film", tooltip: "Vídeo com áudio. A escolha fica lembrada." },
      { value: "mp3", label: "MP3", icon: "music", tooltip: "Só o áudio. A escolha fica lembrada." },
    ],
    onChange: (value) => (prefs.quickFormat = value),
  });
  refs.formatSegmentElement = formatSegment.element;
  const goButton = button({ label: "Baixar", icon: "download", variant: "primary", size: "lg", className: "cmd__go" });
  goButton.addEventListener("click", () => (currentMode() === "basic" ? void handleQuickDownload() : void handleFetchFormats()));
  refs.goButton = goButton;
  const cmd = h("div", { class: "cmd" }, url.element, formatSegment.element, goButton);

  const destinationButton = button({ label: "Trocar", icon: "folder", variant: "ghost", size: "sm", onClick: () => void chooseDownloadPath() });
  const destinationPath = h("span", { class: "dest__path" }, "Carregando...");
  refs.destinationPath = destinationPath;
  const dest = h("div", { class: "dest" }, icon("folder", 16), h("span", { class: "dest__label" }, "Salvar em"), destinationPath, destinationButton);

  const hintText = h("span");
  const playlistHint = h("p", { class: "msg is-hint is-hidden", role: "status" }, icon("info", 16), hintText);
  refs.playlistHint = playlistHint;
  refs.playlistHintText = hintText;

  const offerUse = button({ label: UI_STRINGS.clipboardUse, variant: "secondary", size: "sm" });
  const offerDismiss = button({ icon: "x", variant: "ghost", size: "sm", ariaLabel: "Dispensar", tooltip: "Dispensar" });
  const offerUrl = h("span", { class: "offer__url" });
  const offer = h("div", { class: "offer is-hidden", role: "status" }, h("span", { class: "offer__text" }, "Link copiado:"), offerUrl, offerUse, offerDismiss);
  Object.assign(refs, { offer, offerUrl, offerUse, offerDismiss });

  const hero = h(
    "section",
    { class: "hero rise" },
    h("div", { class: "hero__inner" }, h("h1", {}, "Cole o link.", h("br"), h("em", {}, "Baixe de uma vez.")), h("p", {}, "Vídeo ou áudio, do YouTube e de mais de mil sites. Sem configurar nada."))
  );

  const loadingTape = createTape("EZ");
  loadingTape.update("loading", 0);
  const loadingTitle = h("h2", { class: "loading__title" }, "Buscando informações...");
  const loadingText = h("p", { class: "loading__text" }, "Lendo os formatos disponíveis");
  const loadingPanel = h("section", { class: "panel loading rise is-hidden", role: "status", "aria-live": "polite" }, loadingTape.element, h("div", {}, loadingTitle, loadingText));
  refs.loadingPanel = loadingPanel;

  const videoThumbnail = h("img", { alt: "Miniatura do vídeo" });
  const videoTitle = h("h2", { class: "video__title" });
  const videoUploader = h("p", { class: "video__by" });
  const videoPanel = h("section", { class: "panel video rise is-hidden" }, h("div", { class: "video__thumb" }, videoThumbnail), h("div", {}, videoTitle, videoUploader));
  Object.assign(refs, { videoPanel, videoThumbnail, videoTitle, videoUploader });

  const formatSelect = select({ label: "Formato do download", options: [], onChange: (id) => applySelectedFormat(id) });
  refs.formatSelect = formatSelect;
  const formatInfo = h("span", { "aria-live": "polite" });
  refs.formatInfo = formatInfo;
  const formatField = field({ label: "Formato", controlId: formatSelect.element.id, control: formatSelect.element });
  formatField.element.append(formatInfo);
  formatInfo.className = "field__note";
  const advancedDisclosure = disclosure({ title: "Opções avançadas", summary: "Corte, legendas, cookies, proxy, agendamento e mais", content: advanced.element });
  const downloadButton = button({ label: "Iniciar download", icon: "download", variant: "primary", size: "lg", onClick: () => void handleDownload() });
  downloadButton.classList.add("is-hidden");
  refs.downloadButton = downloadButton;
  const configPanel = h("section", { class: "panel config rise is-hidden" }, formatField.element, advancedDisclosure.element, downloadButton);
  Object.assign(refs, { configPanel });

  const selectionTitle = h("h2", { class: "panel__title", id: "selection-title" });
  const selectionCount = h("span", { class: "panel__meta", "aria-live": "polite" });
  const selectionNote = h("p", { class: "field__note is-hidden" });
  const selectionList = h("div", { class: "sel__list" });
  const selectionAll = button({ label: "Marcar todos", variant: "secondary", size: "sm" });
  const selectionNone = button({ label: "Desmarcar todos", variant: "secondary", size: "sm" });
  const selectionSingle = button({ label: "Só este vídeo", variant: "secondary", size: "md", className: "is-hidden" });
  const selectionConfirm = button({ label: "Baixar", icon: "download", variant: "primary", size: "md" });
  const selectionCancel = button({ label: "Cancelar", variant: "ghost", size: "md" });
  const selectionPanel = h(
    "section",
    { class: "panel rise is-hidden", role: "region", "aria-labelledby": "selection-title" },
    h("div", { class: "panel__head" }, selectionTitle, selectionCount),
    selectionNote,
    h("div", { class: "panel__actions" }, selectionAll, selectionNone),
    selectionList,
    selectionSingle,
    h("div", { class: "sel__foot" }, selectionConfirm, selectionCancel)
  );
  Object.assign(refs, { selectionPanel, selectionTitle, selectionCount, selectionNote, selectionList, selectionAll, selectionNone, selectionSingle, selectionConfirm, selectionCancel });

  const shelfCount = h("span", { class: "shelf__count" });
  const shelfList = h("div", { class: "shelf__list is-hidden" });
  const emptyTape = createTape("EZ");
  emptyTape.update("queued", 0);
  const shelfEmpty = h("div", { class: "shelf__empty" }, emptyTape.element, h("p", {}, h("strong", {}, "A prateleira está vazia"), "Cole um link acima e a fita aparece aqui."));
  let appliedConcurrency = "3";
  const concurrency: ReturnType<typeof select> = select({
    label: "Downloads simultâneos",
    options: Array.from({ length: 10 }, (_, index) => ({ value: String(index + 1), label: String(index + 1) })),
    value: appliedConcurrency,
    mono: true,
    onChange: async (value) => {
      try {
        appliedConcurrency = String((await bridge.setMaxConcurrent(Number(value))).maxConcurrent);
      } catch (error) {
        console.error("Failed to change the concurrent downloads limit:", error);
        toast({ kind: "error", message: UI_STRINGS.errorMaxConcurrent });
      }
      concurrency.setValue(appliedConcurrency);
    },
  });
  refs.applyConcurrency = (value: string) => {
    appliedConcurrency = value;
    concurrency.setValue(value);
  };
  const shelfSection = h("section", { class: "shelf", "aria-labelledby": "shelf-title" }, h("div", { class: "shelf__head" }, h("h2", { class: "shelf__title", id: "shelf-title" }, "Prateleira"), shelfCount), shelfEmpty, shelfList);
  Object.assign(refs, { shelfSection, shelfList, shelfCount, shelfEmpty });

  const historySearch = textInput({ placeholder: "Buscar por título ou link", ariaLabel: "Buscar no histórico", icon: "search" });
  const historyList = h("div", { class: "history__list" });
  const historyEmpty = h("p", { class: "history__empty" }, UI_STRINGS.historyEmpty);
  const historyClear = button({ label: UI_STRINGS.historyClear, icon: "trash", variant: "ghost", size: "sm" });
  const history = disclosure({
    title: UI_STRINGS.historyTitle,
    summary: "Downloads anteriores",
    content: h("div", { class: "history__tools" }, historySearch.element, historyList, historyEmpty, h("div", { class: "history__foot" }, historyClear)),
  });
  Object.assign(refs, { historySearch: historySearch.input, historyList, historyEmpty, historyClear, historyToggle: () => history.setOpen(!history.isOpen) });

  const settings = buildSettings(concurrency);
  const settingsPopover = popover({ anchor: settingsButton, content: settings.element, label: "Ajustes e diagnóstico", align: "end", width: 340 });
  settingsButton.addEventListener("click", () => settingsPopover.toggle());
  refs.openSettings = () => settingsPopover.open();
  refs.focusConcurrency = () => {
    settingsPopover.open();
    concurrency.element.focus();
  };
  refs.version = settings.version;

  const stage = h("div", { class: "stage" }, hero, cmd, message.element, playlistHint, offer, dest, loadingPanel, selectionPanel, videoPanel, configPanel, shelfSection, history.element);
  root.append(topbar, h("main", { class: "main" }, stage));

  url.input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.ctrlKey || event.metaKey) return;
    if (currentMode() === "basic") void handleQuickDownload();
    else void handleFetchFormats();
  });
  url.input.addEventListener("input", () => {
    if (!refs.message.isHint) refs.message.clear();
    renderUrlHint();
    render();
  });
  url.input.addEventListener("paste", (event) => {
    const text = event.clipboardData?.getData("text") ?? "";
    if (/\s/.test(text.trim())) {
      event.preventDefault();
      const joined = text.split(/\s+/).filter(Boolean).join(" ");
      url.input.setRangeText(joined, url.input.selectionStart ?? url.input.value.length, url.input.selectionEnd ?? url.input.value.length, "end");
      url.input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    // Colar e baixar: se o usuário ligou, o link colado já dispara a ação, sem outro clique
    if (prefs.pasteToDownload && currentMode() === "basic") {
      requestAnimationFrame(() => {
        const value = urlValue();
        if (value && /^https?:\/\/\S+$/.test(value)) void handleQuickDownload();
      });
    }
  });

  bindDownloadDeps({ advanced, setPhase, render });
  return { advanced, settingsPopover };
}

interface SettingsView {
  element: HTMLElement;
  version: HTMLElement;
}

function buildSettings(concurrency: ReturnType<typeof select>): SettingsView {
  const version = h("span", { class: "settings__version" }, "v...");

  const swatches = h("div", { class: "swatches", role: "radiogroup", "aria-label": "Cor do tema" });
  const swatchButtons = THEMES.map((theme) => {
    const swatch = h(
      "button",
      { type: "button", class: "swatch", role: "radio", "aria-label": theme.label, style: { "--swatch": `linear-gradient(135deg, ${theme.accent}, ${theme.accentBright})` } },
      icon("check", 16)
    );
    attachTooltip(swatch, theme.label);
    swatch.addEventListener("click", () => {
      setTheme(theme.id);
      paintSwatches();
    });
    return swatch;
  });
  const paintSwatches = () => {
    swatchButtons.forEach((swatch, index) => swatch.setAttribute("aria-checked", String(THEMES[index].id === currentThemeId())));
  };
  swatches.append(...swatchButtons);
  paintSwatches();

  const clipboard = switchControl({ label: "Monitorar a área de transferência", hint: "Oferece usar links copiados quando você volta ao app. Desligado por padrão." });
  const paste = switchControl({ label: "Baixar ao colar", hint: "No Modo Básico, colar um link já inicia o download.", checked: prefs.pasteToDownload, onChange: (on) => (prefs.pasteToDownload = on) });
  const optimize = switchControl({ label: "Otimizar compatibilidade sozinho", hint: "Quando o arquivo baixado usa um codec pouco compatível, gera a cópia MP4 automaticamente.", checked: prefs.autoOptimize, onChange: (on) => (prefs.autoOptimize = on) });
  const technical = switchControl({ label: "Detalhes técnicos abertos", hint: "Mostra o comando e o log do yt-dlp em cada item da prateleira.", checked: prefs.technicalOpen, onChange: (on) => (prefs.technicalOpen = on) });
  refs.clipboardSwitch = clipboard.input;

  const section = (title: string, ...children: HTMLElement[]) => h("div", { class: "settings__section" }, h("h3", { class: "settings__title" }, title), ...children);

  const element = h(
    "div",
    { class: "settings" },
    section("Aparência", swatches),
    section("Baixar", paste.element, optimize.element, clipboard.element),
    section("Fila", field({ label: "Downloads simultâneos", controlId: concurrency.element.id, control: concurrency.element, hint: `Atalho: ${shortcutLabel("J")}` }).element),
    section("Diagnóstico", technical.element, h("p", { class: "field__note" }, "O comando e o log de cada download ficam em “Detalhes técnicos”, dentro do item.")),
    h("div", { class: "settings__section" }, version)
  );
  return { element, version };
}
