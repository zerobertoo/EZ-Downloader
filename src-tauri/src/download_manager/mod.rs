use crate::format_parser::{classify_ytdlp_error, parse_formats, YtdlpInfo};
use crate::history::{HistoryEntry, HistoryStore};
use crate::playlist::{parse_playlist, PlaylistResult};
use crate::process_runner::{spawn_process, ProcessHandle, ProcessOutput};
pub use crate::queue::DownloadOptions;
use crate::queue::{self, ItemStatus, QueueItem, QueueState};
use crate::settings::{Preset, Settings, SettingsStore};
use regex::Regex;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tauri_plugin_notification::NotificationExt;
use uuid::Uuid;

mod args;
mod events;

use args::{
    cookies_browser_args, is_unrecognized_remote_components_error, limit_rate_args, push_ejs_args,
    quick_download_args, section_arg, sponsorblock_args, subtitles_args, validate_extra_args,
    validate_proxy, without_remote_components,
};
pub use events::FormatsResult;
use events::{DebugCommand, DebugLine, DownloadFinished, DownloadProgress};

const PROGRESS_THROTTLE_MS: u128 = 500;
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

fn path_file_for(id: &str) -> PathBuf {
    std::env::temp_dir().join(format!("ez-downloader-{id}.path"))
}

/// Lê o caminho do arquivo final gravado pelo yt-dlp em `--print-to-file`
/// (um por linha; numa playlist vale o último). Lossy: o nome pode ter bytes
/// fora de UTF-8 em plataformas que não forçam o encoding.
fn read_final_file_path(path_file: &Path) -> Option<String> {
    let bytes = std::fs::read(path_file).ok()?;
    String::from_utf8_lossy(&bytes)
        .lines()
        .rev()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(str::to_string)
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

/// Formata o comando pro painel "Modo Nerd" — só exibição, nunca reexecutado.
fn format_command_for_display(bin: &str, args: &[String]) -> String {
    let mut parts = vec![bin.to_string()];
    for arg in args {
        if arg.contains(' ') {
            parts.push(format!("\"{arg}\""));
        } else {
            parts.push(arg.clone());
        }
    }
    parts.join(" ")
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

    /// Proxy padrão das configurações. Um valor inválido (arquivo editado à mão)
    /// é ignorado com aviso em vez de derrubar todos os downloads e buscas.
    fn default_proxy_args(&self) -> Vec<String> {
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

    pub fn queue_items(&self) -> Vec<QueueItem> {
        self.queue.lock().unwrap().items()
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

/// Roda uma consulta síncrona (sem streaming de progresso, ex: --dump-json)
/// com fallback automático se o binário for velho demais pro --remote-components.
fn run_probe(ytdlp_bin: &str, args: &[String], timeout: Duration) -> Result<ProcessOutput, String> {
    let started = Instant::now();
    let (_, join) = spawn_process(ytdlp_bin, args, Some(timeout), |_| {}, |_| {})?;
    let output = join
        .join()
        .map_err(|_| "Erro interno ao aguardar processo".to_string())??;
    log::info!(
        "run_probe levou {:.2?} (code={})",
        started.elapsed(),
        output.code
    );

    if output.code != 0 && is_unrecognized_remote_components_error(&output.stderr) {
        let fallback_started = Instant::now();
        let fallback_args = without_remote_components(args);
        let (_, join) = spawn_process(ytdlp_bin, &fallback_args, Some(timeout), |_| {}, |_| {})?;
        let fallback_output = join
            .join()
            .map_err(|_| "Erro interno ao aguardar processo".to_string())??;
        log::info!(
            "run_probe (fallback sem remote-components) levou {:.2?} (code={})",
            fallback_started.elapsed(),
            fallback_output.code
        );
        return Ok(fallback_output);
    }
    Ok(output)
}

/// Dispara uma tentativa de execução do yt-dlp: emite o comando pro painel de
/// bastidores, liga os callbacks de progresso/log e chama spawn_process.
/// Reaproveitado tanto na tentativa inicial quanto no retry com cookies.
fn spawn_attempt(
    app: &AppHandle,
    ytdlp_bin: &str,
    args: &[String],
    id: &str,
) -> Result<
    (
        ProcessHandle,
        std::thread::JoinHandle<Result<crate::process_runner::ProcessOutput, String>>,
    ),
    String,
> {
    let _ = app.emit(
        "download-debug-command",
        DebugCommand {
            id: id.to_string(),
            command: format_command_for_display(ytdlp_bin, args),
        },
    );

    let progress_re =
        Regex::new(r"\[download\]\s+([\d.]+)%(?:.*?at\s+(\S+/s).*?ETA\s+([\d:]+))?").unwrap();
    let progress_app = app.clone();
    let progress_id = id.to_string();
    let mut last_progress = Instant::now()
        .checked_sub(Duration::from_millis(PROGRESS_THROTTLE_MS as u64 + 1))
        .unwrap_or_else(Instant::now);

    let debug_stdout_app = app.clone();
    let debug_stdout_id = id.to_string();
    let debug_stderr_app = app.clone();
    let debug_stderr_id = id.to_string();

    let on_stdout = move |line: &str| {
        let _ = debug_stdout_app.emit(
            "download-debug-line",
            DebugLine {
                id: debug_stdout_id.clone(),
                stream: "stdout",
                text: line.to_string(),
            },
        );
        let Some(caps) = progress_re.captures(line) else {
            return;
        };
        let percent: f64 = caps
            .get(1)
            .and_then(|m| m.as_str().parse().ok())
            .unwrap_or(0.0);
        let now = Instant::now();
        if now.duration_since(last_progress).as_millis() > PROGRESS_THROTTLE_MS || percent == 100.0
        {
            let payload = DownloadProgress {
                id: progress_id.clone(),
                percent,
                speed: caps.get(2).map(|m| m.as_str().to_string()),
                eta: caps.get(3).map(|m| m.as_str().to_string()),
            };
            let _ = progress_app.emit("download-progress", payload);
            last_progress = now;
        }
    };
    let on_stderr = move |line: &str| {
        let _ = debug_stderr_app.emit(
            "download-debug-line",
            DebugLine {
                id: debug_stderr_id.clone(),
                stream: "stderr",
                text: line.to_string(),
            },
        );
    };

    spawn_process(ytdlp_bin, args, None, on_stdout, on_stderr)
}

/// Traduz o resultado do processo pro status final do download:
/// exit 0 → "done"; exit != 0 marcado como cancelado → "cancelled";
/// exit != 0 espontâneo → "failed" com a mensagem classificada do stderr.
fn final_status(
    output: Result<crate::process_runner::ProcessOutput, String>,
    was_cancelled: bool,
    output_dir: &str,
) -> (&'static str, Option<String>, Option<String>) {
    match output {
        Ok(o) if o.code == 0 => ("done", Some(output_dir.to_string()), None),
        Ok(_) if was_cancelled => ("cancelled", None, None),
        Ok(o) => ("failed", None, Some(classify_ytdlp_error(&o.stderr))),
        Err(e) => ("failed", None, Some(e)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn format_command_quotes_parts_with_spaces() {
        let args = vec![
            "-f".to_string(),
            "bestaudio".to_string(),
            "-o".to_string(),
            "/home/user/My Videos/%(title)s.%(ext)s".to_string(),
        ];
        assert_eq!(
            format_command_for_display("yt-dlp", &args),
            r#"yt-dlp -f bestaudio -o "/home/user/My Videos/%(title)s.%(ext)s""#
        );
    }

    #[test]
    fn format_command_leaves_plain_parts_unquoted() {
        let args = vec!["-f".to_string(), "bestaudio".to_string()];
        assert_eq!(
            format_command_for_display("yt-dlp", &args),
            "yt-dlp -f bestaudio"
        );
    }

    fn output(code: i32, stderr: &str) -> Result<crate::process_runner::ProcessOutput, String> {
        Ok(crate::process_runner::ProcessOutput {
            code,
            stdout: String::new(),
            stderr: stderr.to_string(),
        })
    }

    #[test]
    fn final_status_exit_zero_is_done_with_path() {
        let (status, path, error) = final_status(output(0, ""), false, "/tmp/dl");
        assert_eq!(status, "done");
        assert_eq!(path, Some("/tmp/dl".to_string()));
        assert_eq!(error, None);
    }

    #[test]
    fn final_status_marked_cancelled_wins_over_nonzero_exit() {
        let (status, path, error) = final_status(output(1, "boom"), true, "/tmp/dl");
        assert_eq!(status, "cancelled");
        assert_eq!(path, None);
        assert_eq!(error, None);
    }

    #[test]
    fn final_status_nonzero_exit_without_cancel_is_failed_with_classified_error() {
        let (status, path, error) =
            final_status(output(1, "ERROR: Video unavailable"), false, "/tmp/dl");
        assert_eq!(status, "failed");
        assert_eq!(path, None);
        assert_eq!(
            error,
            Some(classify_ytdlp_error("ERROR: Video unavailable"))
        );
    }

    #[test]
    fn final_status_internal_error_is_failed() {
        let (status, path, error) =
            final_status(Err("falha interna".to_string()), false, "/tmp/dl");
        assert_eq!(status, "failed");
        assert_eq!(path, None);
        assert_eq!(error, Some("falha interna".to_string()));
    }

    #[test]
    fn path_file_for_lives_in_temp_dir_and_is_unique_per_id() {
        let first = path_file_for("abc");
        let second = path_file_for("def");
        assert_ne!(first, second);
        assert_eq!(first.parent().unwrap(), std::env::temp_dir());
        assert!(first.file_name().unwrap().to_string_lossy().contains("abc"));
    }

    #[test]
    fn read_final_file_path_returns_last_non_empty_line() {
        let file = std::env::temp_dir().join(format!(
            "ez-test-final-path-multi-{}.path",
            std::process::id()
        ));
        std::fs::write(&file, "C:\\a\\um.mp4\r\nC:\\a\\dois.mp4\r\n\r\n  \n").unwrap();
        assert_eq!(
            read_final_file_path(&file),
            Some("C:\\a\\dois.mp4".to_string())
        );
        let _ = std::fs::remove_file(&file);
    }

    #[test]
    fn read_final_file_path_is_none_for_missing_or_blank_file() {
        let missing = std::env::temp_dir().join(format!(
            "ez-test-final-path-missing-{}.path",
            std::process::id()
        ));
        let _ = std::fs::remove_file(&missing);
        assert_eq!(read_final_file_path(&missing), None);

        let blank = std::env::temp_dir().join(format!(
            "ez-test-final-path-blank-{}.path",
            std::process::id()
        ));
        std::fs::write(&blank, "\n  \n").unwrap();
        assert_eq!(read_final_file_path(&blank), None);
        let _ = std::fs::remove_file(&blank);
    }

    #[test]
    fn read_final_file_path_tolerates_invalid_utf8() {
        let file = std::env::temp_dir().join(format!(
            "ez-test-final-path-utf8-{}.path",
            std::process::id()
        ));
        std::fs::write(
            &file,
            [b'/', b't', b'm', b'p', b'/', 0xff, b'.', b'm', b'p', b'4'],
        )
        .unwrap();
        let result = read_final_file_path(&file).unwrap();
        assert!(result.starts_with("/tmp/"));
        assert!(result.ends_with(".mp4"));
        let _ = std::fs::remove_file(&file);
    }

    #[test]
    fn unix_now_is_after_2024() {
        assert!(unix_now() > 1_700_000_000);
    }
}
