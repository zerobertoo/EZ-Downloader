use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::Path;

pub const MIN_CONCURRENT_DOWNLOADS: usize = 1;
pub const MAX_CONCURRENT_DOWNLOADS_CEILING: usize = 10;
pub const DEFAULT_CONCURRENT_DOWNLOADS: usize = 3;

const QUEUE_FILE_VERSION: u32 = 1;

/// Opções do Modo Avançado: todas opcionais, ausentes no Modo Rápido.
/// Cookies guardam só o nome do navegador, nunca o conteúdo.
#[derive(Debug, Default, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DownloadOptions {
    pub section: Option<(String, String)>,
    pub sub_langs: Option<String>,
    pub extra_args: Option<String>,
    pub cookies_browser: Option<String>,
    pub limit_rate: Option<String>,
}

/// A fila só guarda itens pendentes; ao terminar, o item vai para o histórico.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ItemStatus {
    Queued,
    Active,
    Paused,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct QueueItem {
    pub id: String,
    pub url: String,
    pub format: String,
    pub title: Option<String>,
    pub output_dir: String,
    pub options: DownloadOptions,
    pub status: ItemStatus,
}

#[derive(Debug)]
pub struct QueueState {
    items: Vec<QueueItem>,
    max_concurrent: usize,
}

#[derive(Serialize, Deserialize)]
struct QueueFile {
    version: u32,
    items: Vec<QueueItem>,
}

pub fn clamp_concurrency(value: usize) -> usize {
    value.clamp(MIN_CONCURRENT_DOWNLOADS, MAX_CONCURRENT_DOWNLOADS_CEILING)
}

impl QueueState {
    #[cfg(test)]
    pub fn new(max_concurrent: usize) -> Self {
        Self {
            items: Vec::new(),
            max_concurrent: clamp_concurrency(max_concurrent),
        }
    }

    /// Reconstrói a fila após reiniciar o app: o que estava ativo perdeu o
    /// processo, então volta como pausado até o usuário retomar.
    pub fn restored(items: Vec<QueueItem>, max_concurrent: usize) -> Self {
        let items = items
            .into_iter()
            .map(|mut item| {
                if item.status == ItemStatus::Active {
                    item.status = ItemStatus::Paused;
                }
                item
            })
            .collect();
        Self {
            items,
            max_concurrent: clamp_concurrency(max_concurrent),
        }
    }

    pub fn items(&self) -> Vec<QueueItem> {
        self.items.clone()
    }

    #[cfg(test)]
    pub fn max_concurrent(&self) -> usize {
        self.max_concurrent
    }

    pub fn status_of(&self, id: &str) -> Option<ItemStatus> {
        self.items.iter().find(|i| i.id == id).map(|i| i.status)
    }

    pub fn enqueue(&mut self, item: QueueItem) {
        let mut item = item;
        item.status = ItemStatus::Queued;
        self.items.push(item);
    }

    fn active_count(&self) -> usize {
        self.items
            .iter()
            .filter(|i| i.status == ItemStatus::Active)
            .count()
    }

    /// Marca como ativos os próximos itens da fila que cabem nos slots livres
    /// e devolve cópias deles para o chamador iniciar o processo.
    ///
    /// `dying` são ids pausados cujo processo ainda está sendo encerrado: eles
    /// continuam ocupando um slot e não podem ser reiniciados até morrerem.
    pub fn promote(&mut self, dying: &HashSet<String>) -> Vec<QueueItem> {
        let busy_slots = self.active_count() + dying.len();
        let mut free_slots = self.max_concurrent.saturating_sub(busy_slots);
        let mut started = Vec::new();
        for item in self.items.iter_mut() {
            if free_slots == 0 {
                break;
            }
            if item.status == ItemStatus::Queued && !dying.contains(&item.id) {
                item.status = ItemStatus::Active;
                started.push(item.clone());
                free_slots -= 1;
            }
        }
        started
    }

    /// Pausa um item. Devolve o status anterior (quem pausa um ativo precisa
    /// também matar o processo) ou `None` se o item não existe ou já está pausado.
    pub fn pause(&mut self, id: &str) -> Option<ItemStatus> {
        let item = self.items.iter_mut().find(|i| i.id == id)?;
        let previous = item.status;
        if previous == ItemStatus::Paused {
            return None;
        }
        item.status = ItemStatus::Paused;
        Some(previous)
    }

    pub fn resume(&mut self, id: &str) -> bool {
        match self.items.iter_mut().find(|i| i.id == id) {
            Some(item) if item.status == ItemStatus::Paused => {
                item.status = ItemStatus::Queued;
                true
            }
            _ => false,
        }
    }

    pub fn remove(&mut self, id: &str) -> Option<QueueItem> {
        let index = self.items.iter().position(|i| i.id == id)?;
        Some(self.items.remove(index))
    }

        pub fn reorder(&mut self, id: &str, new_index: usize) -> bool {
        let Some(from) = self.items.iter().position(|i| i.id == id) else {
            return false;
        };
        let item = self.items.remove(from);
        let target = new_index.min(self.items.len());
        self.items.insert(target, item);
        true
    }

    /// Reduzir o limite não pausa ninguém: os ativos terminam e o novo teto
    /// vale só para as próximas promoções.
    pub fn set_max_concurrent(&mut self, value: usize) {
        self.max_concurrent = clamp_concurrency(value);
    }
}

/// Carrega a fila do disco. Arquivo ausente ou corrompido vira fila vazia:
/// nunca impede o app de abrir.
pub fn load_items(path: &Path) -> Vec<QueueItem> {
    fs::read_to_string(path)
        .ok()
        .and_then(|content| serde_json::from_str::<QueueFile>(&content).ok())
        .filter(|file| file.version == QUEUE_FILE_VERSION)
        .map(|file| file.items)
        .unwrap_or_default()
}

pub fn save_items(path: &Path, items: &[QueueItem]) {
    let file = QueueFile {
        version: QUEUE_FILE_VERSION,
        items: items.to_vec(),
    };
    let Ok(json) = serde_json::to_string_pretty(&file) else {
        log::error!("Falha ao serializar a fila de downloads");
        return;
    };
    let tmp = path.with_extension("json.tmp");
    if let Err(e) = fs::write(&tmp, json) {
        log::error!("Falha ao gravar a fila de downloads: {e}");
        return;
    }
    if let Err(e) = fs::rename(&tmp, path) {
        log::error!("Falha ao finalizar a gravação da fila de downloads: {e}");
        let _ = fs::remove_file(&tmp);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(id: &str) -> QueueItem {
        QueueItem {
            id: id.to_string(),
            url: format!("https://example.com/{id}"),
            format: "best".to_string(),
            title: None,
            output_dir: "/tmp/dl".to_string(),
            options: DownloadOptions::default(),
            status: ItemStatus::Queued,
        }
    }

    fn ids(state: &QueueState) -> Vec<String> {
        state.items().into_iter().map(|i| i.id).collect()
    }

    #[test]
    fn promote_respects_concurrency_and_keeps_extra_items_queued() {
        let mut state = QueueState::new(2);
        for id in ["a", "b", "c"] {
            state.enqueue(item(id));
        }
        let started = state.promote(&HashSet::new());
        assert_eq!(started.iter().map(|i| i.id.as_str()).collect::<Vec<_>>(), ["a", "b"]);
        assert_eq!(state.status_of("c"), Some(ItemStatus::Queued));
        assert!(state.promote(&HashSet::new()).is_empty());
    }

    #[test]
    fn removing_an_active_item_frees_a_slot_for_the_next() {
        let mut state = QueueState::new(1);
        state.enqueue(item("a"));
        state.enqueue(item("b"));
        state.promote(&HashSet::new());
        state.remove("a");
        let started = state.promote(&HashSet::new());
        assert_eq!(started.len(), 1);
        assert_eq!(started[0].id, "b");
    }

    #[test]
    fn pause_reports_previous_status_and_frees_the_slot() {
        let mut state = QueueState::new(1);
        state.enqueue(item("a"));
        state.enqueue(item("b"));
        state.promote(&HashSet::new());
        assert_eq!(state.pause("a"), Some(ItemStatus::Active));
        assert_eq!(state.pause("a"), None);
        assert_eq!(state.promote(&HashSet::new())[0].id, "b");
    }

    #[test]
    fn dying_processes_hold_their_slot_and_are_not_restarted() {
        let mut state = QueueState::new(1);
        state.enqueue(item("a"));
        state.enqueue(item("b"));
        state.promote(&HashSet::new());
        state.pause("a");
        let dying: HashSet<String> = ["a".to_string()].into();
        assert!(state.promote(&dying).is_empty());
        state.resume("a");
        assert!(state.promote(&dying).is_empty());
        let started = state.promote(&HashSet::new());
        assert_eq!(started[0].id, "a");
    }

    #[test]
    fn pausing_a_queued_item_keeps_it_from_being_promoted() {
        let mut state = QueueState::new(3);
        state.enqueue(item("a"));
        assert_eq!(state.pause("a"), Some(ItemStatus::Queued));
        assert!(state.promote(&HashSet::new()).is_empty());
    }

    #[test]
    fn resume_only_affects_paused_items() {
        let mut state = QueueState::new(3);
        state.enqueue(item("a"));
        assert!(!state.resume("a"));
        state.pause("a");
        assert!(state.resume("a"));
        assert_eq!(state.status_of("a"), Some(ItemStatus::Queued));
        assert!(!state.resume("missing"));
    }

    #[test]
    fn reorder_moves_item_and_clamps_index() {
        let mut state = QueueState::new(3);
        for id in ["a", "b", "c"] {
            state.enqueue(item(id));
        }
        assert!(state.reorder("c", 0));
        assert_eq!(ids(&state), ["c", "a", "b"]);
        assert!(state.reorder("c", 99));
        assert_eq!(ids(&state), ["a", "b", "c"]);
        assert!(!state.reorder("missing", 0));
    }

    #[test]
    fn promotion_follows_queue_order_after_reorder() {
        let mut state = QueueState::new(1);
        state.enqueue(item("a"));
        state.enqueue(item("b"));
        state.reorder("b", 0);
        assert_eq!(state.promote(&HashSet::new())[0].id, "b");
    }

    #[test]
    fn lowering_concurrency_does_not_pause_active_items() {
        let mut state = QueueState::new(3);
        for id in ["a", "b", "c", "d"] {
            state.enqueue(item(id));
        }
        state.promote(&HashSet::new());
        state.set_max_concurrent(1);
        assert_eq!(state.status_of("a"), Some(ItemStatus::Active));
        assert_eq!(state.status_of("c"), Some(ItemStatus::Active));
        state.remove("a");
        state.remove("b");
        assert!(state.promote(&HashSet::new()).is_empty());
        state.remove("c");
        assert_eq!(state.promote(&HashSet::new())[0].id, "d");
    }

    #[test]
    fn concurrency_is_clamped_to_allowed_range() {
        assert_eq!(QueueState::new(0).max_concurrent(), 1);
        assert_eq!(QueueState::new(99).max_concurrent(), 10);
        let mut state = QueueState::new(3);
        state.set_max_concurrent(0);
        assert_eq!(state.max_concurrent(), 1);
    }

    #[test]
    fn restored_queue_turns_active_items_into_paused() {
        let mut active = item("a");
        active.status = ItemStatus::Active;
        let state = QueueState::restored(vec![active, item("b")], 3);
        assert_eq!(state.status_of("a"), Some(ItemStatus::Paused));
        assert_eq!(state.status_of("b"), Some(ItemStatus::Queued));
    }

    fn temp_file(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("ez-queue-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir.join(name)
    }

    #[test]
    fn save_and_load_round_trip() {
        let path = temp_file("queue.json");
        let mut with_options = item("a");
        with_options.options.cookies_browser = Some("firefox".to_string());
        with_options.options.section = Some(("00:00:10".to_string(), "00:00:20".to_string()));
        save_items(&path, &[with_options.clone(), item("b")]);
        assert_eq!(load_items(&path), vec![with_options, item("b")]);
    }

    #[test]
    fn load_returns_empty_for_missing_or_corrupted_file() {
        let path = temp_file("queue.json");
        assert!(load_items(&path).is_empty());
        fs::write(&path, "{ not json").unwrap();
        assert!(load_items(&path).is_empty());
    }

    #[test]
    fn load_ignores_unknown_file_version() {
        let path = temp_file("queue.json");
        fs::write(&path, r#"{"version": 99, "items": []}"#).unwrap();
        assert!(load_items(&path).is_empty());
    }
}
