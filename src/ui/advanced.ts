import { bridge, type Preset, type Settings, type StartDownloadOptions } from "../bridge";
import { button } from "../components/button";
import { checkbox, switchControl } from "../components/checkbox";
import { dateTimePicker } from "../components/datetime-picker";
import { h } from "../components/dom";
import { field, textInput } from "../components/field";
import { select } from "../components/select";
import { toast } from "../components/toast";
import { UI_STRINGS } from "../state";
import { errorMessage } from "../utils";

/** Aceita MM:SS ou HH:MM:SS, a mesma sintaxe do --download-sections do yt-dlp. */
const TIME_PATTERN = /^\d{1,2}:\d{2}(:\d{2})?$/;
/** Número com sufixo de unidade opcional, a mesma sintaxe do --limit-rate do yt-dlp. */
const RATE_PATTERN = /^\d+(\.\d+)?[KMG]?$/i;

const BROWSERS = ["chrome", "firefox", "edge", "brave", "opera", "vivaldi", "chromium", "safari"];

const group = (title: string, ...children: (Node | null)[]) =>
  h("div", { class: "adv__group" }, h("h3", { class: "adv__title" }, title), ...children);

export function createAdvancedOptions() {
  let presets: Preset[] = [];

  const sectionStart = textInput({ placeholder: "00:00:00", ariaLabel: "Início do corte", mono: true, center: true });
  const sectionEnd = textInput({ placeholder: "00:01:30", ariaLabel: "Fim do corte", mono: true, center: true });
  const sectionField = field({
    label: "Corte",
    optional: true,
    controlId: sectionStart.input.id,
    control: h("div", { class: "adv__row" }, sectionStart.element, h("span", { class: "adv__sep" }, "até"), sectionEnd.element),
  });

  const subtitles = switchControl({ label: "Baixar legendas", onChange: (on) => (langsField.element.hidden = !on) });
  const subtitleLangs = textInput({ placeholder: "en,pt", ariaLabel: "Idiomas das legendas", mono: true });
  const langsField = field({ label: "Idiomas", controlId: subtitleLangs.input.id, control: subtitleLangs.element, hint: "Códigos separados por vírgula." });
  langsField.element.hidden = true;

  const cookies = select({
    label: "Navegador para importar cookies",
    value: "",
    options: [{ value: "", label: "Nenhum" }, ...BROWSERS.map((name) => ({ value: name, label: name.charAt(0).toUpperCase() + name.slice(1) }))],
  });
  const cookiesField = field({
    label: "Usar cookies do navegador",
    controlId: cookies.element.id,
    control: cookies.element,
    hint: "Precisa estar logado nesse navegador, e ele fechado durante o download.",
  });

  const limitRate = textInput({ placeholder: "2M, 500K", ariaLabel: "Limite de velocidade", mono: true });
  const limitRateField = field({ label: "Limite de velocidade", optional: true, controlId: limitRate.input.id, control: limitRate.element });

  const presetSelect = select({ label: "Aplicar preset salvo", options: [{ value: "", label: "Nenhum" }], value: "", onChange: (name) => applyPreset(presets.find((preset) => preset.name === name)) });
  const presetName = textInput({ placeholder: "Nome para salvar o preset", ariaLabel: "Nome do preset", maxLength: 40 });
  const presetDelete = button({ label: "Excluir", variant: "ghost", size: "md", onClick: () => void deletePreset() });
  presetDelete.disabled = true;
  const presetField = field({
    label: "Preset",
    controlId: presetSelect.element.id,
    control: h("div", { class: "adv__group" }, presetSelect.element, h("div", { class: "adv__row" }, presetName.element, button({ label: "Salvar", variant: "secondary", onClick: () => void savePreset() }), presetDelete)),
  });

  const nameTemplate = textInput({ placeholder: "{uploader}/{title}", ariaLabel: "Modelo do nome do arquivo", mono: true });
  const nameTemplateField = field({
    label: "Nome do arquivo",
    optional: true,
    controlId: nameTemplate.input.id,
    control: nameTemplate.element,
    hint: "Campos: {title} {uploader} {channel} {date} {year} {id} {playlist} {index} {resolution}. Use / para criar subpastas.",
  });

  const embedThumbnail = checkbox({ label: "Incorporar capa" });
  const embedChapters = checkbox({ label: "Incorporar capítulos" });
  const embedMetadata = checkbox({ label: "Incorporar metadados" });

  const sponsorblock = select({
    label: "Tratamento de trechos patrocinados",
    value: "",
    options: [
      { value: "", label: "Desligado" },
      { value: "mark", label: "Marcar como capítulos" },
      { value: "remove", label: "Remover do vídeo" },
    ],
  });
  const sponsorblockField = field({
    label: "SponsorBlock",
    controlId: sponsorblock.element.id,
    control: sponsorblock.element,
    hint: "Trata patrocínio, autopromoção e pedidos de interação. Remover recodifica com o ffmpeg e demora mais.",
  });

  const proxy = textInput({ placeholder: "socks5://127.0.0.1:1080", ariaLabel: "URL do proxy", mono: true });
  const proxyField = field({
    label: "Proxy",
    optional: true,
    controlId: proxy.input.id,
    control: h("div", { class: "adv__row" }, proxy.element, button({ label: "Salvar como padrão", variant: "secondary", onClick: () => void saveDefaultProxy() })),
    hint: "Sem usuário e senha na URL. Vazio usa o proxy padrão, se houver.",
  });

  const schedule = dateTimePicker({ label: "Data e hora de início", placeholder: "Começar agora" });
  const scheduleField = field({
    label: "Agendar para",
    optional: true,
    controlId: schedule.trigger.id || undefined,
    control: schedule.element,
    hint: "Horário local. Se o app estiver fechado na hora, o download começa quando você abri-lo.",
  });

  const extraArgs = textInput({ placeholder: "--embed-thumbnail --no-playlist", ariaLabel: "Argumentos extras", mono: true });
  const extraArgsField = field({
    label: "Argumentos extras (yt-dlp)",
    optional: true,
    controlId: extraArgs.input.id,
    control: extraArgs.element,
    hint: "Aceitos: --write-subs, --write-auto-subs, --embed-thumbnail, --embed-metadata, --no-playlist, --yes-playlist e --cookies-from-browser <navegador>. Outros são recusados ao iniciar.",
  });

  const element = h(
    "div",
    { class: "adv" },
    group("Recorte e legendas", sectionField.element, subtitles.element, langsField.element),
    group("Arquivo", nameTemplateField.element, h("div", {}, embedThumbnail.element, embedChapters.element, embedMetadata.element)),
    group("Rede e acesso", cookiesField.element, limitRateField.element, proxyField.element),
    group("Qualidade de vida", sponsorblockField.element, scheduleField.element),
    h("div", { class: "adv__group adv__group--wide" }, h("h3", { class: "adv__title" }, "Presets e avançado"), presetField.element, extraArgsField.element)
  );

  function applyPreset(preset: Preset | undefined) {
    nameTemplate.input.value = preset?.nameTemplate ?? "";
    embedThumbnail.setChecked(preset?.embedThumbnail ?? false, true);
    embedChapters.setChecked(preset?.embedChapters ?? false, true);
    embedMetadata.setChecked(preset?.embedMetadata ?? false, true);
    sponsorblock.setValue(preset?.sponsorblock ?? "");
    presetName.input.value = preset?.name ?? "";
    presetDelete.disabled = !preset;
  }

  function adoptPresets(settings: Settings, selected = "") {
    presets = settings.presets;
    presetSelect.setOptions([{ value: "", label: "Nenhum" }, ...presets.map((preset) => ({ value: preset.name, label: preset.name }))], selected);
    presetDelete.disabled = !selected;
  }

  async function savePreset() {
    presetField.setError(null);
    const name = presetName.input.value.trim();
    if (!name) return presetField.setError(UI_STRINGS.errorPresetName);
    try {
      adoptPresets(
        await bridge.savePreset({
          name,
          nameTemplate: nameTemplate.input.value.trim() || null,
          embedThumbnail: embedThumbnail.checked,
          embedChapters: embedChapters.checked,
          embedMetadata: embedMetadata.checked,
          sponsorblock: (sponsorblock.value as "remove" | "mark" | "") || null,
        }),
        name
      );
      toast({ kind: "success", message: `Preset "${name}" salvo` });
    } catch (error) {
      presetField.setError(`${UI_STRINGS.errorPresetSave} ${errorMessage(error)}`);
    }
  }

  async function deletePreset() {
    presetField.setError(null);
    const name = presetSelect.value;
    if (!name) return;
    try {
      adoptPresets(await bridge.deletePreset(name));
      presetName.input.value = "";
      toast({ message: `Preset "${name}" excluído` });
    } catch (error) {
      presetField.setError(`${UI_STRINGS.errorPresetDelete} ${errorMessage(error)}`);
    }
  }

  async function saveDefaultProxy() {
    proxyField.setError(null);
    try {
      await bridge.setDefaultProxy(proxy.input.value.trim() || null);
      toast({ kind: "success", message: proxy.input.value.trim() ? "Proxy padrão salvo" : "Proxy padrão removido" });
    } catch (error) {
      proxyField.setError(`${UI_STRINGS.errorProxySave} ${errorMessage(error)}`);
    }
  }

  function clearErrors() {
    for (const control of [sectionField, limitRateField, presetField, proxyField, scheduleField]) control.setError(null);
  }

  /** Lê e valida os campos; devolve null (com o erro já exibido no campo) se algum for inválido. */
  function read(): StartDownloadOptions | null {
    clearErrors();
    const start = sectionStart.input.value.trim() || undefined;
    const end = sectionEnd.input.value.trim() || undefined;
    if (Boolean(start) !== Boolean(end)) {
      sectionField.setError(UI_STRINGS.errorIncompleteSection);
      return null;
    }
    if ((start && !TIME_PATTERN.test(start)) || (end && !TIME_PATTERN.test(end))) {
      sectionField.setError(UI_STRINGS.errorInvalidSection);
      return null;
    }
    const rate = limitRate.input.value.trim() || undefined;
    if (rate && !RATE_PATTERN.test(rate)) {
      limitRateField.setError(UI_STRINGS.errorInvalidLimitRate);
      return null;
    }
    let scheduledAt: number | undefined;
    if (schedule.value) {
      const timestamp = schedule.value.getTime();
      if (Number.isNaN(timestamp)) {
        scheduleField.setError(UI_STRINGS.errorInvalidSchedule);
        return null;
      }
      if (timestamp <= Date.now()) {
        scheduleField.setError(UI_STRINGS.errorSchedulePast);
        return null;
      }
      scheduledAt = Math.floor(timestamp / 1000);
    }
    return {
      sectionStart: start,
      sectionEnd: end,
      subLangs: subtitles.checked ? subtitleLangs.input.value.trim() || undefined : undefined,
      extraArgs: extraArgs.input.value.trim() || undefined,
      cookiesBrowser: cookies.value || undefined,
      limitRate: rate,
      nameTemplate: nameTemplate.input.value.trim() || undefined,
      embedThumbnail: embedThumbnail.checked || undefined,
      embedChapters: embedChapters.checked || undefined,
      embedMetadata: embedMetadata.checked || undefined,
      sponsorblock: (sponsorblock.value as "remove" | "mark" | "") || undefined,
      proxy: proxy.input.value.trim() || undefined,
      scheduledAt,
    };
  }

  /** Há algo preenchido que a troca de modo descartaria? */
  function hasInput(): boolean {
    return Boolean(
      sectionStart.input.value.trim() || sectionEnd.input.value.trim() || subtitles.checked || subtitleLangs.input.value.trim() ||
        extraArgs.input.value.trim() || cookies.value || limitRate.input.value.trim() || nameTemplate.input.value.trim() ||
        embedThumbnail.checked || embedChapters.checked || embedMetadata.checked || sponsorblock.value ||
        proxy.input.value.trim() || schedule.value || presetSelect.value
    );
  }

  function reset() {
    clearErrors();
    for (const input of [sectionStart.input, sectionEnd.input, subtitleLangs.input, extraArgs.input, limitRate.input, nameTemplate.input, proxy.input, presetName.input]) input.value = "";
    subtitles.setChecked(false, true);
    langsField.element.hidden = true;
    for (const toggle of [embedThumbnail, embedChapters, embedMetadata]) toggle.setChecked(false, true);
    cookies.setValue("");
    sponsorblock.setValue("");
    presetSelect.setValue("");
    presetDelete.disabled = true;
    schedule.setValue(null);
  }

  function clearSchedule() {
    schedule.setValue(null);
  }

  function initSettings(settings: Settings) {
    adoptPresets(settings);
    if (settings.defaultProxy) proxy.input.placeholder = `Padrão: ${settings.defaultProxy}`;
  }

  return { element, read, hasInput, reset, clearSchedule, initSettings };
}

export type AdvancedOptions = ReturnType<typeof createAdvancedOptions>;
