use super::{unix_now, DownloadManager};
use std::time::Duration;
use tauri::AppHandle;

const SCHEDULER_MAX_SLEEP_SECS: u64 = 30;

impl DownloadManager {
    /// Thread única que dorme até o próximo horário agendado e promove o que
    /// venceu. Acorda a cada 30 s para reavaliar: cobre itens agendados depois
    /// do início, suspensão do computador e mudança do relógio.
    pub fn start_scheduler(&self, app: &AppHandle) {
        let manager = self.clone();
        let app = app.clone();
        std::thread::spawn(move || loop {
            let now = unix_now();
            let wait = manager
                .queue
                .lock()
                .unwrap()
                .next_schedule_after(now)
                .map(|at| (at - now) as u64)
                .unwrap_or(SCHEDULER_MAX_SLEEP_SECS)
                .clamp(1, SCHEDULER_MAX_SLEEP_SECS);
            std::thread::sleep(Duration::from_secs(wait));
            manager.pump(&app);
        });
    }

    /// Promove os itens da fila aos slots livres e inicia seus processos.
    /// Só grava e emite quando algo foi promovido: quem muda a fila por
    /// outro motivo já persiste por conta própria.
    pub fn pump(&self, app: &AppHandle) {
        let started = {
            let mut queue = self.queue.lock().unwrap();
            // Processos pausados que ainda estão morrendo seguem ocupando slot.
            let dying = self.paused.lock().unwrap().clone();
            let started = queue.promote(&dying, unix_now());
            if !started.is_empty() {
                self.persist_and_emit(app, &queue);
            }
            started
        };
        for item in started {
            self.launch(app, item);
        }
    }
}
