use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

const MAX_HISTORY_ENTRIES: usize = 100;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct HistoryEntry {
    pub id: String,
    pub url: String,
    pub title: Option<String>,
    pub format: String,
    pub output_path: String,
    pub status: String,
    pub error: Option<String>,
    pub finished_at: String,
}

/// Histórico persistente de downloads em JSON. A escrita é atômica
/// (arquivo temporário + rename) pra não corromper o histórico se o app
/// fechar no meio da gravação.
pub struct HistoryStore {
    path: PathBuf,
    entries: Mutex<Vec<HistoryEntry>>,
}

impl HistoryStore {
    /// Carrega o histórico do disco; arquivo ausente ou corrompido vira
    /// histórico vazio — nunca impede o app de abrir.
    pub fn new(path: PathBuf) -> Self {
        let entries = fs::read_to_string(&path)
            .ok()
            .and_then(|content| serde_json::from_str(&content).ok())
            .unwrap_or_default();
        Self {
            path,
            entries: Mutex::new(entries),
        }
    }

    /// Adiciona uma entrada no topo (mais recente primeiro), mantendo só
    /// as últimas 100.
    pub fn append(&self, entry: HistoryEntry) {
        let mut entries = self.entries.lock().unwrap();
        entries.insert(0, entry);
        entries.truncate(MAX_HISTORY_ENTRIES);
        self.persist(&entries);
    }

    pub fn entries(&self) -> Vec<HistoryEntry> {
        self.entries.lock().unwrap().clone()
    }

    pub fn clear(&self) {
        let mut entries = self.entries.lock().unwrap();
        entries.clear();
        self.persist(&entries);
    }

    fn persist(&self, entries: &[HistoryEntry]) {
        let Ok(json) = serde_json::to_string_pretty(entries) else {
            log::error!("Falha ao serializar histórico de downloads");
            return;
        };
        let tmp = self.path.with_extension("json.tmp");
        if let Err(e) = fs::write(&tmp, json) {
            log::error!("Falha ao gravar histórico de downloads: {e}");
            return;
        }
        if let Err(e) = fs::rename(&tmp, &self.path) {
            log::error!("Falha ao atualizar histórico de downloads: {e}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    /// Caminho único em temp_dir pra cada teste, sem crate extra.
    fn temp_history_path(test_name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!(
            "ez-downloader-history-{test_name}-{}-{nanos}.json",
            std::process::id()
        ))
    }

    fn entry(id: &str) -> HistoryEntry {
        HistoryEntry {
            id: id.to_string(),
            url: format!("https://example.com/{id}"),
            title: None,
            format: "quick-mp4".to_string(),
            output_path: "/tmp/downloads".to_string(),
            status: "done".to_string(),
            error: None,
            finished_at: "2026-01-01T00:00:00+00:00".to_string(),
        }
    }

    #[test]
    fn missing_file_loads_empty_history() {
        let path = temp_history_path("missing");
        let store = HistoryStore::new(path);
        assert!(store.entries().is_empty());
    }

    #[test]
    fn corrupted_file_loads_empty_history() {
        let path = temp_history_path("corrupted");
        fs::write(&path, "{ isso nao e json valido").unwrap();
        let store = HistoryStore::new(path.clone());
        assert!(store.entries().is_empty());
        fs::remove_file(&path).ok();
    }

    #[test]
    fn append_then_load_roundtrips_entries_newest_first() {
        let path = temp_history_path("roundtrip");
        {
            let store = HistoryStore::new(path.clone());
            store.append(entry("a"));
            store.append(entry("b"));
        }
        let store = HistoryStore::new(path.clone());
        let entries = store.entries();
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].id, "b");
        assert_eq!(entries[1].id, "a");
        fs::remove_file(&path).ok();
    }

    #[test]
    fn append_caps_history_at_100_entries() {
        let path = temp_history_path("cap");
        let store = HistoryStore::new(path.clone());
        for i in 0..120 {
            store.append(entry(&i.to_string()));
        }
        let entries = store.entries();
        assert_eq!(entries.len(), MAX_HISTORY_ENTRIES);
        // Mais recente primeiro: o mais antigo (id "0") saiu do histórico.
        assert_eq!(entries[0].id, "119");
        assert_eq!(entries[MAX_HISTORY_ENTRIES - 1].id, "20");
        // O cap também vale pro que foi persistido em disco.
        let reloaded = HistoryStore::new(path.clone());
        assert_eq!(reloaded.entries().len(), MAX_HISTORY_ENTRIES);
        fs::remove_file(&path).ok();
    }

    #[test]
    fn clear_empties_memory_and_disk() {
        let path = temp_history_path("clear");
        {
            let store = HistoryStore::new(path.clone());
            store.append(entry("a"));
            store.clear();
            assert!(store.entries().is_empty());
        }
        let store = HistoryStore::new(path.clone());
        assert!(store.entries().is_empty());
        fs::remove_file(&path).ok();
    }
}
