use super::DownloadManager;
use crate::queue::ItemStatus;
use tauri::AppHandle;

impl DownloadManager {
    /// Cancela um item. Com processo rodando, só marca e mata: a remoção da
    /// fila e o evento ficam com a thread que aguarda o processo (kill() é
    /// assíncrono) e o slot só libera quando ele realmente morre. Item que
    /// espera na fila ou está pausado não tem processo e termina na hora.
    pub fn cancel_download(&self, app: &AppHandle, id: &str) {
        let Some(status) = self.queue.lock().unwrap().status_of(id) else {
            return;
        };
        // Pausado com processo ainda morrendo: quem encerra o item é a thread
        // supervisora, senão ele terminaria duas vezes (cancelado e falho).
        let has_process = status == ItemStatus::Active || self.paused.lock().unwrap().contains(id);
        if has_process {
            self.cancelled.lock().unwrap().insert(id.to_string());
            log::info!("Cancelando download {id} a pedido do usuário");
            let handle = self.active.lock().unwrap().get(id).cloned();
            if let Some(handle) = handle {
                handle.kill();
            }
        } else {
            let removed = self.queue.lock().unwrap().remove(id);
            if let Some(item) = removed {
                self.finish(app, &item, "cancelled", None, None, None);
            }
        }
    }

    /// Pausa um item. Se havia processo, ele é morto e o item fica na fila
    /// como pausado; retomar reexecuta o yt-dlp, que continua o `.part`.
    pub fn pause_download(&self, app: &AppHandle, id: &str) {
        // Cancelamento em curso vale mais que pausa: o item não pode voltar à fila.
        if self.cancelled.lock().unwrap().contains(id) {
            return;
        }
        let previous = {
            let mut queue = self.queue.lock().unwrap();
            let previous = queue.pause(id);
            if previous == Some(ItemStatus::Active) {
                self.paused.lock().unwrap().insert(id.to_string());
            }
            if previous.is_some() {
                self.persist_and_emit(app, &queue);
            }
            previous
        };
        if previous == Some(ItemStatus::Active) {
            let handle = self.active.lock().unwrap().get(id).cloned();
            if let Some(handle) = handle {
                handle.kill();
            }
        }
    }

    pub fn resume_download(&self, app: &AppHandle, id: &str) -> Result<(), String> {
        // O processo antigo ainda está morrendo: retomar agora faria o launch
        // novo enxergar a marca de pausa e matar o processo recém-criado.
        if self.paused.lock().unwrap().contains(id) {
            return Err("O download ainda está pausando, tente de novo em instantes".to_string());
        }
        let resumed = {
            let mut queue = self.queue.lock().unwrap();
            let resumed = queue.resume(id);
            if resumed {
                self.persist_and_emit(app, &queue);
            }
            resumed
        };
        if resumed {
            self.pump(app);
        }
        Ok(())
    }

    pub fn reorder_download(&self, app: &AppHandle, id: &str, new_index: usize) {
        let mut queue = self.queue.lock().unwrap();
        if queue.reorder(id, new_index) {
            self.persist_and_emit(app, &queue);
        }
    }
}
