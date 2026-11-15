use crate::format_parser::{classify_ytdlp_error, parse_formats, YtdlpInfo};
use crate::history::{HistoryEntry, HistoryStore};
use crate::playlist::{parse_playlist, PlaylistResult};
use crate::process_runner::{ProcessHandle, ProcessOutput};
pub use crate::queue::DownloadOptions;
use crate::queue::{self, ItemStatus, QueueItem, QueueState};
use crate::settings::SettingsStore;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tauri_plugin_notification::NotificationExt;
use uuid::Uuid;

mod args;
mod events;
mod process;
mod queue_ops;
mod records;
mod settings;

use args::{
    cookies_browser_args, is_unrecognized_remote_components_error, limit_rate_args, push_ejs_args,
    quick_download_args, section_arg, sponsorblock_args, subtitles_args, validate_extra_args,
    validate_proxy, without_remote_components,
};
use events::DownloadFinished;
pub use events::FormatsResult;
use process::{final_status, path_file_for, read_final_file_path, run_probe, spawn_attempt};

const SCHEDULER_MAX_SLEEP_SECS: u64 = 30;
const FORMATS_PROBE_TIMEOUT: Duration = Duration::from_secs(30);
// Playlists grandes levam bem mais que um vídeo só pra listar.
const PLAYLIST_PROBE_TIMEOUT: Duration = Duration::from_secs(120);

fn unix_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Evento "queue-changed": snapshot da fila (só itens pendentes e ativos).
const QUEUE_CHANGED_EVENT: &str = "queue-changed";

#[derive(Clone)]
pub struct DownloadManager {
    // Compartilhado via Arc: o updater do yt-dlp troca o binário em runtime e
    // clones anteriores do manager (State do Tauri) precisam enxergar a troca.
    ytdlp_bin: Arc<Mutex<String>>,
    ffmpeg_bin: Option<String>,
    qjs_bin: Option<String>,
    active: Arc<Mutex<HashMap<String, ProcessHandle>>>,
    // Ids marcados como cancelados: permite distinguir "cancelled" de "failed"
    // quando o processo termina com exit != 0.
    cancelled: Arc<Mutex<HashSet<String>>>,
    // Ids pausados pelo usuário com processo rodando: o processo é morto e o
    // item continua na fila como "paused" em vez de ir para o histórico.
    paused: Arc<Mutex<HashSet<String>>>,
    queue: Arc<Mutex<QueueState>>,
    queue_path: PathBuf,
    settings: Arc<SettingsStore>,
    history: Arc<HistoryStore>,
    default_download_path: PathBuf,
}

impl DownloadManager {
    pub fn new(
        ytdlp_bin: String,
        ffmpeg_bin: Option<String>,
        qjs_bin: Option<String>,
        default_download_path: PathBuf,
        history_path: PathBuf,
        queue_path: PathBuf,
        settings_path: PathBuf,
    ) -> Self {
        std::fs::create_dir_all(&default_download_path).ok();
        let settings = Arc::new(SettingsStore::new(settings_path));
        let restored = QueueState::restored(
            queue::load_items(&queue_path),
            settings.get().max_concurrent,
        );
        Self {
            ytdlp_bin: Arc::new(Mutex::new(ytdlp_bin)),
            ffmpeg_bin,
            qjs_bin,
            active: Arc::new(Mutex::new(HashMap::new())),
            cancelled: Arc::new(Mutex::new(HashSet::new())),
            paused: Arc::new(Mutex::new(HashSet::new())),
            queue: Arc::new(Mutex::new(restored)),
            queue_path,
            settings,
            history: Arc::new(HistoryStore::new(history_path)),
            default_download_path,
        }
    }

    fn current_ytdlp_bin(&self) -> String {
        self.ytdlp_bin.lock().unwrap().clone()
    }

    pub fn set_ytdlp_bin(&self, bin: String) {
        *self.ytdlp_bin.lock().unwrap() = bin;
    }

    pub fn get_available_formats(&self, url: &str) -> Result<FormatsResult, String> {
        let mut args = vec!["--dump-json".to_string(), "--no-warnings".to_string()];
        push_ejs_args(&mut args, self.qjs_bin.as_deref());
        args.extend(self.default_proxy_args());
        args.push(url.to_string());
        let ytdlp_bin = self.current_ytdlp_bin();
        let output = run_probe(&ytdlp_bin, &args, FORMATS_PROBE_TIMEOUT)?;

        if output.code == 0 {
            let info: YtdlpInfo = serde_json::from_str(&output.stdout)
                .map_err(|e| format!("Erro ao processar formatos: {e}"))?;
            let formats = parse_formats(&info);
            Ok(FormatsResult {
                formats,
                title: info.title,
                thumbnail: info.thumbnail,
                uploader: info.uploader.or(info.channel),
            })
        } else {
            let message = classify_ytdlp_error(&output.stderr);
            log::warn!("Busca de formatos falhou para {url}: {message}");
            Err(message)
        }
    }

    /// Valida e enfileira um download, retornando o id na hora. O processo só
    /// começa quando houver slot livre; o fim (sucesso, falha ou cancelamento)
    /// é sinalizado pelo evento "download-finished".
    #[allow(clippy::too_many_arguments)] // espelha os parâmetros do comando Tauri; agrupar mudaria o contrato
    pub fn start_download(
        &self,
        app: &AppHandle,
        url: &str,
        format: &str,
        title: Option<String>,
        output_path: Option<String>,
        options: DownloadOptions,
        scheduled_at: Option<i64>,
    ) -> Result<String, String> {
        let download_dir = output_path
            .map(PathBuf::from)
            .unwrap_or_else(|| self.default_download_path.clone());
        std::fs::create_dir_all(&download_dir).map_err(|e| e.to_string())?;

        if scheduled_at.is_some_and(|at| at <= unix_now()) {
            return Err("O horário agendado já passou".to_string());
        }
        let item = QueueItem {
            id: Uuid::new_v4().to_string(),
            url: url.to_string(),
            format: format.to_string(),
            title,
            output_dir: download_dir.to_string_lossy().to_string(),
            options,
            status: ItemStatus::Queued,
            scheduled_at,
        };
        // Valida agora: um erro nas opções chega na hora pro frontend, em vez
        // de só aparecer quando o item chegar ao topo da fila.
        self.build_download_args(&item)?;

        let id = item.id.clone();
        {
            let mut queue = self.queue.lock().unwrap();
            queue.enqueue(item);
            self.persist_and_emit(app, &queue);
        }
        self.pump(app);
        Ok(id)
    }

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

    fn persist_and_emit(&self, app: &AppHandle, queue: &QueueState) {
        let items = queue.items();
        queue::save_items(&self.queue_path, &items);
        let _ = app.emit(QUEUE_CHANGED_EVENT, items);
    }

    /// Monta os args do yt-dlp para um item. O yt-dlp grava em `path_file` o
    /// caminho do arquivo final (após mover/mesclar), sem mexer no stdout que
    /// alimenta o progresso.
    fn build_download_args(&self, item: &QueueItem) -> Result<Vec<String>, String> {
        let format = item.format.as_str();
        let options = &item.options;
        let name_template = crate::output_template::to_ytdlp_template(
            options
                .name_template
                .as_deref()
                .unwrap_or(crate::output_template::DEFAULT_TEMPLATE),
        )?;
        let output_template =
            PathBuf::from(&item.output_dir).join(format!("{name_template}.%(ext)s"));
        let mut args = match format {
            "quick-mp3" => quick_download_args("mp3"),
            "quick-mp4" => quick_download_args("mp4"),
            "best" => {
                vec![
                    "-f".to_string(),
                    "bv*+ba/b".to_string(),
                    "--merge-output-format".to_string(),
                    "mp4".to_string(),
                ]
            }
            _ => {
                let mut a = vec!["-f".to_string(), format.to_string()];
                // Seletores de resolução (ex: "bv*[height<=1080]+ba/b") combinam
                // vídeo+áudio e precisam de remux pra manter a promessa de MP4;
                // um id de áudio puro (sem "+") não passa por aqui.
                if format.contains('+') {
                    a.push("--merge-output-format".to_string());
                    a.push("mp4".to_string());
                }
                a
            }
        };
        push_ejs_args(&mut args, self.qjs_bin.as_deref());
        if let Some((start, end)) = &options.section {
            args.extend(section_arg(start, end));
        }
        if let Some(langs) = &options.sub_langs {
            args.extend(subtitles_args(langs));
        }
        if let Some(browser) = &options.cookies_browser {
            args.extend(cookies_browser_args(browser)?);
        }
        if let Some(rate) = &options.limit_rate {
            args.extend(limit_rate_args(rate)?);
        }
        if options.embed_thumbnail {
            args.push("--embed-thumbnail".to_string());
        }
        if options.embed_chapters {
            args.push("--embed-chapters".to_string());
        }
        if options.embed_metadata {
            args.push("--embed-metadata".to_string());
        }
        if let Some(mode) = &options.sponsorblock {
            args.extend(sponsorblock_args(mode)?);
        }
        if let Some(proxy) = &options.proxy {
            args.push("--proxy".to_string());
            args.push(validate_proxy(proxy)?);
        } else {
            args.extend(self.default_proxy_args());
        }
        if let Some(extra) = &options.extra_args {
            args.extend(validate_extra_args(extra)?);
        }
        if let Some(ffmpeg) = &self.ffmpeg_bin {
            args.push("--ffmpeg-location".to_string());
            args.push(ffmpeg.clone());
        }
        args.push("--print-to-file".to_string());
        args.push("after_move:filepath".to_string());
        args.push(path_file_for(&item.id).to_string_lossy().to_string());
        args.push("-o".to_string());
        args.push(output_template.to_string_lossy().to_string());
        args.push("--progress".to_string());
        args.push("--newline".to_string());
        args.push("--no-warnings".to_string());
        args.push("--encoding".to_string());
        args.push("utf-8".to_string());
        args.push(item.url.clone());
        Ok(args)
    }

    /// Inicia o processo de um item já promovido a ativo e deixa uma thread
    /// supervisionando até o fim.
    fn launch(&self, app: &AppHandle, item: QueueItem) {
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

        let was_cancelled = self.cancelled.lock().unwrap().remove(&id);
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
                    self.active.lock().unwrap().insert(id.clone(), handle);
                    let retry_output = retry_join
                        .join()
                        .map_err(|_| "Erro interno ao aguardar processo".to_string())
                        .and_then(|r| r);
                    let retry_cancelled = self.cancelled.lock().unwrap().remove(&id);
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
    fn finish(
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

    pub fn queue_items(&self) -> Vec<QueueItem> {
        self.queue.lock().unwrap().items()
    }

    pub fn get_playlist(
        &self,
        url: &str,
        cookies_browser: Option<&str>,
    ) -> Result<PlaylistResult, String> {
        let mut args = vec![
            "--flat-playlist".to_string(),
            "--dump-single-json".to_string(),
            "--no-warnings".to_string(),
        ];
        push_ejs_args(&mut args, self.qjs_bin.as_deref());
        if let Some(browser) = cookies_browser {
            args.extend(cookies_browser_args(browser)?);
        }
        args.extend(self.default_proxy_args());
        args.push(url.to_string());
        let output = run_probe(&self.current_ytdlp_bin(), &args, PLAYLIST_PROBE_TIMEOUT)?;
        if output.code == 0 {
            parse_playlist(&output.stdout, url)
        } else {
            let message = classify_ytdlp_error(&output.stderr);
            log::warn!("Busca da playlist falhou para {url}: {message}");
            Err(message)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unix_now_is_after_2024() {
        assert!(unix_now() > 1_700_000_000);
    }
}
