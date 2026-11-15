use super::args::{is_unrecognized_remote_components_error, without_remote_components};
use super::events::DownloadFinished;
use super::process::{final_status, path_file_for, read_final_file_path, spawn_attempt};
use super::DownloadManager;
use crate::history::HistoryEntry;
use crate::process_runner::ProcessOutput;
use crate::queue::QueueItem;
use tauri::{AppHandle, Emitter};
use tauri_plugin_notification::NotificationExt;

impl DownloadManager {
    /// Inicia o processo de um item já promovido a ativo e deixa uma thread
    /// supervisionando até o fim.
    pub(super) fn launch(&self, app: &AppHandle, item: QueueItem) {
        let args = match self.build_download_args(&item) {
            Ok(args) => args,
            Err(error) => {
                self.finish(app, &item, "failed", None, None, Some(error));
                return;
            }
        };
        let ytdlp_bin = self.current_ytdlp_bin();
        log::info!(
            "Iniciando download {}: url={} formato={} destino={}",
            item.id,
            item.url,
            item.format,
            item.output_dir
        );
        let (handle, join) = match spawn_attempt(app, &ytdlp_bin, &args, &item.id) {
            Ok(pair) => pair,
            Err(error) => {
                self.finish(app, &item, "failed", None, None, Some(error));
                return;
            }
        };
        self.active
            .lock()
            .unwrap()
            .insert(item.id.clone(), handle.clone());
        // Pausa ou cancelamento podem ter chegado entre a promoção e o spawn,
        // quando ainda não havia processo pra matar.
        if self.paused.lock().unwrap().contains(&item.id)
            || self.cancelled.lock().unwrap().contains(&item.id)
        {
            handle.kill();
        }

        let manager = self.clone();
        let app = app.clone();
        std::thread::spawn(move || manager.supervise(&app, item, args, ytdlp_bin, join));
    }

    /// Aguarda o fim do processo e decide o destino do item: volta pra fila
    /// como pausado, ou termina (histórico + evento "download-finished").
    fn supervise(
        &self,
        app: &AppHandle,
        item: QueueItem,
        args: Vec<String>,
        ytdlp_bin: String,
        join: std::thread::JoinHandle<Result<ProcessOutput, String>>,
    ) {
        let id = item.id.clone();
        let output = join
            .join()
            .map_err(|_| "Erro interno ao aguardar processo".to_string())
            .and_then(|r| r);
        let stderr_text = output.as_ref().ok().map(|o| o.stderr.clone());

        let mut was_cancelled = self.cancelled.lock().unwrap().remove(&id);
        let (mut status, mut path, mut error) =
            final_status(output, was_cancelled, &item.output_dir);

        // Binário de yt-dlp desatualizado (auto-update falhou) não conhece
        // --remote-components ainda: reexecuta sem a flag em vez de deixar
        // todo download quebrar por causa de uma flag opcional.
        if status == "failed"
            && stderr_text
                .as_deref()
                .is_some_and(is_unrecognized_remote_components_error)
        {
            log::info!(
                "Download {id}: binário de yt-dlp não suporta --remote-components, tentando sem EJS"
            );
            let retry_args = without_remote_components(&args);
            match spawn_attempt(app, &ytdlp_bin, &retry_args, &id) {
                Ok((handle, retry_join)) => {
                    self.active
                        .lock()
                        .unwrap()
                        .insert(id.clone(), handle.clone());
                    if self.paused.lock().unwrap().contains(&id)
                        || self.cancelled.lock().unwrap().contains(&id)
                    {
                        handle.kill();
                    }
                    let retry_output = retry_join
                        .join()
                        .map_err(|_| "Erro interno ao aguardar processo".to_string())
                        .and_then(|r| r);
                    let retry_cancelled = self.cancelled.lock().unwrap().remove(&id);
                    was_cancelled = was_cancelled || retry_cancelled;
                    let (s, p, e) = final_status(retry_output, retry_cancelled, &item.output_dir);
                    status = s;
                    path = p;
                    error = e;
                }
                Err(e) => log::error!("Falha ao tentar novamente sem --remote-components: {e}"),
            }
        }

        self.active.lock().unwrap().remove(&id);
        let path_file = path_file_for(&id);
        let was_paused = self.paused.lock().unwrap().remove(&id);
        // Se o processo já tinha concluído quando a pausa chegou, vale o
        // resultado real; só um processo interrompido volta pra fila.
        if was_paused && !was_cancelled && status != "done" {
            let _ = std::fs::remove_file(&path_file);
            log::info!("Download {id} pausado pelo usuário");
            self.pump(app);
            return;
        }

        let file_path = if status == "done" {
            read_final_file_path(&path_file)
        } else {
            None
        };
        let _ = std::fs::remove_file(&path_file);
        self.finish(app, &item, status, path, file_path, error);
    }

    /// Encerra um item: tira da fila, avisa o usuário, emite o evento, grava
    /// no histórico e libera o slot pro próximo.
    pub(super) fn finish(
        &self,
        app: &AppHandle,
        item: &QueueItem,
        status: &'static str,
        path: Option<String>,
        file_path: Option<String>,
        error: Option<String>,
    ) {
        {
            let mut queue = self.queue.lock().unwrap();
            queue.remove(&item.id);
            self.persist_and_emit(app, &queue);
        }
        self.cancelled.lock().unwrap().remove(&item.id);
        self.paused.lock().unwrap().remove(&item.id);

        match status {
            "done" => log::info!("Download {} concluído: {}", item.id, item.output_dir),
            "cancelled" => log::info!("Download {} cancelado pelo usuário", item.id),
            _ => log::error!(
                "Download {} falhou: {}",
                item.id,
                error.as_deref().unwrap_or("erro desconhecido")
            ),
        }

        // Downloads levam minutos — sem isso, quem troca de janela só
        // descobre que terminou voltando pro app manualmente.
        if status != "cancelled" {
            let notif_title = if status == "done" {
                "Download concluído"
            } else {
                "Download falhou"
            };
            let body = item.title.as_deref().unwrap_or(item.url.as_str());
            let _ = app
                .notification()
                .builder()
                .title(notif_title)
                .body(body)
                .show();
        }

        let _ = app.emit(
            "download-finished",
            DownloadFinished {
                id: item.id.clone(),
                status,
                path,
                file_path,
                error: error.clone(),
            },
        );
        self.history.append(HistoryEntry {
            id: item.id.clone(),
            url: item.url.clone(),
            title: item.title.clone(),
            format: item.format.clone(),
            output_path: item.output_dir.clone(),
            status: status.to_string(),
            error,
            finished_at: chrono::Utc::now().to_rfc3339(),
        });
        self.pump(app);
    }
}
