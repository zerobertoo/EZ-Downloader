use super::args::validate_proxy;
use super::DownloadManager;
use crate::settings::{Preset, Settings};
use tauri::AppHandle;

impl DownloadManager {
    /// Proxy padrão das configurações. Um valor inválido (arquivo editado à mão)
    /// é ignorado com aviso em vez de derrubar todos os downloads e buscas.
    pub(super) fn default_proxy_args(&self) -> Vec<String> {
        let Some(proxy) = self.settings.get().default_proxy else {
            return Vec::new();
        };
        match validate_proxy(&proxy) {
            Ok(valid) => vec!["--proxy".to_string(), valid],
            Err(error) => {
                log::warn!("Proxy padrão ignorado: {error}");
                Vec::new()
            }
        }
    }

    pub fn settings(&self) -> Settings {
        self.settings.get()
    }

    pub fn set_max_concurrent(&self, app: &AppHandle, value: usize) -> Settings {
        let settings = self.settings.set_max_concurrent(value);
        self.queue
            .lock()
            .unwrap()
            .set_max_concurrent(settings.max_concurrent);
        // Aumentar o limite abre slots pra itens que já esperavam.
        self.pump(app);
        settings
    }

    pub fn set_download_path(&self, path: Option<String>) -> Settings {
        self.settings.set_download_path(path)
    }

    pub fn save_preset(&self, preset: Preset) -> Result<Settings, String> {
        self.settings.save_preset(preset)
    }

    pub fn delete_preset(&self, name: &str) -> Settings {
        self.settings.delete_preset(name)
    }

    pub fn set_default_proxy(&self, proxy: Option<String>) -> Result<Settings, String> {
        let proxy = match proxy
            .map(|p| p.trim().to_string())
            .filter(|p| !p.is_empty())
        {
            Some(value) => Some(validate_proxy(&value)?),
            None => None,
        };
        Ok(self.settings.set_default_proxy(proxy))
    }

    pub fn set_clipboard_monitor(&self, enabled: bool) -> Settings {
        self.settings.set_clipboard_monitor(enabled)
    }
}
