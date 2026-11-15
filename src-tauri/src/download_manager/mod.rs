use crate::history::HistoryStore;
use crate::process_runner::ProcessHandle;
pub use crate::queue::DownloadOptions;
use crate::queue::{self, ItemStatus, QueueItem, QueueState};
use crate::settings::SettingsStore;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

mod args;
mod events;
mod probe;
mod process;
mod queue_ops;
mod records;
mod scheduler;
mod settings;
mod supervisor;

use args::{
    cookies_browser_args, limit_rate_args, push_ejs_args, quick_download_args, section_arg,
    sponsorblock_args, subtitles_args, validate_extra_args, validate_media_url, validate_proxy,
};
pub use events::FormatsResult;
use process::path_file_for;

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
        args.push(validate_media_url(&item.url)?);
        Ok(args)
    }

    pub fn queue_items(&self) -> Vec<QueueItem> {
        self.queue.lock().unwrap().items()
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
