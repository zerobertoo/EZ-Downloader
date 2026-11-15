use super::DownloadManager;
use crate::history::HistoryEntry;

impl DownloadManager {
    /// Posições das URLs que já estão na fila, já foram baixadas com sucesso ou
    /// se repetem no próprio lote. Falhas e cancelamentos não contam: baixar
    /// de novo é o esperado.
    pub fn find_duplicates(&self, urls: &[String]) -> Vec<usize> {
        let mut known: Vec<String> = self
            .queue
            .lock()
            .unwrap()
            .items()
            .into_iter()
            .map(|item| item.url)
            .collect();
        known.extend(
            self.history
                .entries()
                .into_iter()
                .filter(|entry| entry.status == "done")
                .map(|entry| entry.url),
        );
        crate::url_tools::duplicate_positions(urls, &known)
    }

    pub fn history_entries(&self) -> Vec<HistoryEntry> {
        self.history.entries()
    }

    pub fn clear_history(&self) {
        self.history.clear();
    }
}
