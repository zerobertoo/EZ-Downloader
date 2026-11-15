use crate::queue::{clamp_concurrency, DEFAULT_CONCURRENT_DOWNLOADS};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

const SETTINGS_FILE_VERSION: u32 = 1;

/// Configurações persistentes do app, com o Rust como fonte da verdade.
/// Campos novos entram com `#[serde(default)]` para não invalidar arquivos antigos.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub version: u32,
    pub max_concurrent: usize,
    pub download_path: Option<String>,
    pub clipboard_monitor: bool,
    pub presets: Vec<Preset>,
    pub default_proxy: Option<String>,
}

pub const MAX_PRESETS: usize = 30;
const MAX_PRESET_NAME_LENGTH: usize = 40;

/// Combinação nomeada de opções de download reaproveitável com um clique.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct Preset {
    pub name: String,
    pub name_template: Option<String>,
    pub embed_thumbnail: bool,
    pub embed_chapters: bool,
    pub embed_metadata: bool,
    pub sponsorblock: Option<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            version: SETTINGS_FILE_VERSION,
            max_concurrent: DEFAULT_CONCURRENT_DOWNLOADS,
            download_path: None,
            clipboard_monitor: false,
            presets: Vec::new(),
            default_proxy: None,
        }
    }
}

pub struct SettingsStore {
    path: PathBuf,
    settings: Mutex<Settings>,
}

impl SettingsStore {
    /// Arquivo ausente ou corrompido vira o padrão: nunca impede o app de abrir.
    pub fn new(path: PathBuf) -> Self {
        let mut settings: Settings = fs::read_to_string(&path)
            .ok()
            .and_then(|content| serde_json::from_str(&content).ok())
            .unwrap_or_default();
        settings.max_concurrent = clamp_concurrency(settings.max_concurrent);
        Self {
            path,
            settings: Mutex::new(settings),
        }
    }

    pub fn get(&self) -> Settings {
        self.settings.lock().unwrap().clone()
    }

    pub fn set_max_concurrent(&self, value: usize) -> Settings {
        self.update(|s| s.max_concurrent = clamp_concurrency(value))
    }

    pub fn set_download_path(&self, path: Option<String>) -> Settings {
        self.update(|s| s.download_path = path)
    }

    pub fn set_clipboard_monitor(&self, enabled: bool) -> Settings {
        self.update(|s| s.clipboard_monitor = enabled)
    }

    /// Substitui o preset de mesmo nome (sem diferenciar maiúsculas) ou cria um novo.
    pub fn save_preset(&self, preset: Preset) -> Result<Settings, String> {
        let name = preset.name.trim().to_string();
        if name.is_empty() {
            return Err("O preset precisa de um nome".to_string());
        }
        if name.chars().count() > MAX_PRESET_NAME_LENGTH {
            return Err(format!(
                "O nome do preset passa de {MAX_PRESET_NAME_LENGTH} caracteres"
            ));
        }
        if let Some(mode) = &preset.sponsorblock {
            if !matches!(mode.as_str(), "remove" | "mark") {
                return Err(format!("Modo de SponsorBlock inválido: {mode}"));
            }
        }
        if let Some(template) = &preset.name_template {
            crate::output_template::to_ytdlp_template(template)?;
        }
        let preset = Preset { name, ..preset };
        let mut settings = self.settings.lock().unwrap();
        match settings
            .presets
            .iter()
            .position(|p| p.name.eq_ignore_ascii_case(&preset.name))
        {
            Some(index) => settings.presets[index] = preset,
            None if settings.presets.len() >= MAX_PRESETS => {
                return Err(format!("Limite de {MAX_PRESETS} presets atingido"));
            }
            None => settings.presets.push(preset),
        }
        self.persist(&settings);
        Ok(settings.clone())
    }

    pub fn delete_preset(&self, name: &str) -> Settings {
        self.update(|s| s.presets.retain(|p| !p.name.eq_ignore_ascii_case(name)))
    }

    pub fn set_default_proxy(&self, proxy: Option<String>) -> Settings {
        self.update(|s| s.default_proxy = proxy)
    }

    fn update(&self, change: impl FnOnce(&mut Settings)) -> Settings {
        let mut settings = self.settings.lock().unwrap();
        change(&mut settings);
        self.persist(&settings);
        settings.clone()
    }

    fn persist(&self, settings: &Settings) {
        let Ok(json) = serde_json::to_string_pretty(settings) else {
            log::error!("Falha ao serializar as configurações");
            return;
        };
        let tmp = self.path.with_extension("json.tmp");
        if let Err(e) = fs::write(&tmp, json) {
            log::error!("Falha ao gravar as configurações: {e}");
            return;
        }
        if let Err(e) = fs::rename(&tmp, &self.path) {
            log::error!("Falha ao finalizar a gravação das configurações: {e}");
            let _ = fs::remove_file(&tmp);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_path() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ez-settings-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir.join("settings.json")
    }

    #[test]
    fn missing_file_yields_defaults() {
        let store = SettingsStore::new(temp_path());
        assert_eq!(store.get(), Settings::default());
    }

    #[test]
    fn corrupted_file_yields_defaults() {
        let path = temp_path();
        fs::write(&path, "garbage").unwrap();
        assert_eq!(SettingsStore::new(path).get(), Settings::default());
    }

    #[test]
    fn changes_persist_across_reload() {
        let path = temp_path();
        let store = SettingsStore::new(path.clone());
        store.set_max_concurrent(5);
        store.set_download_path(Some("/media".to_string()));
        let reloaded = SettingsStore::new(path).get();
        assert_eq!(reloaded.max_concurrent, 5);
        assert_eq!(reloaded.download_path.as_deref(), Some("/media"));
    }

    #[test]
    fn concurrency_is_clamped_on_set_and_on_load() {
        let path = temp_path();
        let store = SettingsStore::new(path.clone());
        assert_eq!(store.set_max_concurrent(500).max_concurrent, 10);
        fs::write(&path, r#"{"maxConcurrent": 0}"#).unwrap();
        assert_eq!(SettingsStore::new(path).get().max_concurrent, 1);
    }

    #[test]
    fn clipboard_monitor_is_off_by_default_and_persists_when_enabled() {
        let path = temp_path();
        let store = SettingsStore::new(path.clone());
        assert!(!store.get().clipboard_monitor);
        store.set_clipboard_monitor(true);
        assert!(SettingsStore::new(path).get().clipboard_monitor);
    }

    fn preset(name: &str) -> Preset {
        Preset {
            name: name.to_string(),
            ..Preset::default()
        }
    }

    #[test]
    fn preset_is_saved_replaced_by_name_and_deleted() {
        let store = SettingsStore::new(temp_path());
        store.save_preset(preset("Música")).unwrap();
        let mut updated = preset("música");
        updated.embed_metadata = true;
        let settings = store.save_preset(updated).unwrap();
        assert_eq!(settings.presets.len(), 1);
        assert!(settings.presets[0].embed_metadata);
        assert!(store.delete_preset("MÚSICA").presets.len() == 1);
        assert!(store.delete_preset("música").presets.is_empty());
    }

    #[test]
    fn preset_rejects_blank_name_and_bad_template() {
        let store = SettingsStore::new(temp_path());
        assert!(store.save_preset(preset("  ")).is_err());
        let mut bad = preset("x");
        bad.name_template = Some("../{title}".to_string());
        assert!(store.save_preset(bad).is_err());
        let mut bad_mode = preset("y");
        bad_mode.sponsorblock = Some("foo".to_string());
        assert!(store.save_preset(bad_mode).is_err());
        assert!(store.save_preset(preset(&"n".repeat(41))).is_err());
    }

    #[test]
    fn older_file_missing_new_fields_still_loads() {
        let path = temp_path();
        fs::write(&path, r#"{"downloadPath": "/x"}"#).unwrap();
        let settings = SettingsStore::new(path).get();
        assert_eq!(settings.download_path.as_deref(), Some("/x"));
        assert_eq!(settings.max_concurrent, DEFAULT_CONCURRENT_DOWNLOADS);
    }
}
