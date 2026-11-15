import { bridge, type Preset, type Settings } from "../bridge";
import { UI_STRINGS, elements } from "../state";
import { errorMessage } from "../utils";
import { clearFieldError, setFieldError } from "./feedback";

let presets: Preset[] = [];

function currentPresetFromForm(name: string): Preset {
  return {
    name,
    nameTemplate: elements.nameTemplateInput?.value.trim() || null,
    embedThumbnail: elements.embedThumbnailCheckbox?.checked ?? false,
    embedChapters: elements.embedChaptersCheckbox?.checked ?? false,
    embedMetadata: elements.embedMetadataCheckbox?.checked ?? false,
    sponsorblock: (elements.sponsorblockSelect?.value as "remove" | "mark" | "") || null,
  };
}

const EMPTY_PRESET: Preset = {
  name: "",
  nameTemplate: null,
  embedThumbnail: false,
  embedChapters: false,
  embedMetadata: false,
  sponsorblock: null,
};

function applyPreset(preset: Preset) {
  if (elements.nameTemplateInput) elements.nameTemplateInput.value = preset.nameTemplate ?? "";
  if (elements.embedThumbnailCheckbox) elements.embedThumbnailCheckbox.checked = preset.embedThumbnail;
  if (elements.embedChaptersCheckbox) elements.embedChaptersCheckbox.checked = preset.embedChapters;
  if (elements.embedMetadataCheckbox) elements.embedMetadataCheckbox.checked = preset.embedMetadata;
  if (elements.sponsorblockSelect) elements.sponsorblockSelect.value = preset.sponsorblock ?? "";
  if (elements.presetNameInput) elements.presetNameInput.value = preset.name;
}

function renderPresetOptions(selectedName = "") {
  const select = elements.presetSelect;
  if (!select) return;
  select.replaceChildren(new Option("Nenhum", ""));
  for (const preset of presets) select.append(new Option(preset.name, preset.name));
  select.value = selectedName;
  if (elements.presetDeleteBtn) elements.presetDeleteBtn.disabled = !selectedName;
}

function adoptSettings(settings: Settings, selectedName = "") {
  presets = settings.presets;
  renderPresetOptions(selectedName);
}

async function handleSave() {
  clearFieldError(elements.presetError);
  const name = elements.presetNameInput?.value.trim() ?? "";
  if (!name) {
    setFieldError(elements.presetError, UI_STRINGS.errorPresetName);
    return;
  }
  try {
    adoptSettings(await bridge.savePreset(currentPresetFromForm(name)), name);
  } catch (error) {
    setFieldError(elements.presetError, `${UI_STRINGS.errorPresetSave} ${errorMessage(error)}`);
  }
}

async function handleDelete() {
  clearFieldError(elements.presetError);
  const name = elements.presetSelect?.value;
  if (!name) return;
  try {
    adoptSettings(await bridge.deletePreset(name));
    if (elements.presetNameInput) elements.presetNameInput.value = "";
  } catch (error) {
    setFieldError(elements.presetError, `${UI_STRINGS.errorPresetDelete} ${errorMessage(error)}`);
  }
}

async function handleSaveDefaultProxy() {
  clearFieldError(elements.proxyError);
  try {
    await bridge.setDefaultProxy(elements.proxyInput?.value.trim() || null);
  } catch (error) {
    setFieldError(elements.proxyError, `${UI_STRINGS.errorProxySave} ${errorMessage(error)}`);
  }
}

export function initPresetsUI(settings: Settings) {
  adoptSettings(settings);
  if (elements.proxyInput && settings.defaultProxy) elements.proxyInput.placeholder = `Padrão: ${settings.defaultProxy}`;

  elements.presetSelect?.addEventListener("change", () => {
    const name = elements.presetSelect?.value ?? "";
    if (elements.presetDeleteBtn) elements.presetDeleteBtn.disabled = !name;
    applyPreset(presets.find((preset) => preset.name === name) ?? EMPTY_PRESET);
  });
  elements.presetSaveBtn?.addEventListener("click", () => void handleSave());
  elements.presetDeleteBtn?.addEventListener("click", () => void handleDelete());
  elements.proxySaveDefaultBtn?.addEventListener("click", () => void handleSaveDefaultProxy());
}
