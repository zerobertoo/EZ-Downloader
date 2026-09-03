use crate::format_parser::{classify_ytdlp_error, parse_formats, FormatOption, YtdlpInfo};
use crate::history::{HistoryEntry, HistoryStore};
use crate::process_runner::{spawn_process, ProcessHandle, ProcessOutput};
use regex::Regex;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tauri_plugin_notification::NotificationExt;
use uuid::Uuid;

const PROGRESS_THROTTLE_MS: u128 = 500;

/// Máximo de downloads rodando ao mesmo tempo.
const MAX_CONCURRENT_DOWNLOADS: usize = 3;

#[derive(Debug, Serialize, Clone)]
pub struct DownloadProgress {
    pub id: String,
    pub percent: f64,
    pub speed: Option<String>,
    pub eta: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct FormatsResult {
    pub formats: Vec<FormatOption>,
    pub title: Option<String>,
    pub thumbnail: Option<String>,
    pub uploader: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct DebugCommand {
    pub id: String,
    pub command: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct DebugLine {
    pub id: String,
    pub stream: &'static str,
    pub text: String,
}

/// Resultado final de um download, emitido no evento "download-finished".
#[derive(Debug, Serialize, Clone)]
pub struct DownloadFinished {
    pub id: String,
    pub status: &'static str, // "done" | "failed" | "cancelled"
    pub path: Option<String>,
    pub error: Option<String>,
}

/// Opções do Modo Avançado — todas opcionais, ausentes no Modo Rápido.
#[derive(Debug, Default)]
pub struct DownloadOptions {
    pub section: Option<(String, String)>,
    pub sub_langs: Option<String>,
    pub extra_args: Option<String>,
    pub cookies_browser: Option<String>,
    pub limit_rate: Option<String>,
}

#[derive(Clone)]
pub struct DownloadManager {
    // Compartilhado via Arc: o updater do yt-dlp troca o binário em runtime e
    // clones anteriores do manager (State do Tauri) precisam enxergar a troca.
    ytdlp_bin: Arc<Mutex<String>>,
    ffmpeg_bin: Option<String>,
    qjs_bin: Option<String>,
    // Downloads em andamento, indexados pelo id gerado no start_download.
    active: Arc<Mutex<HashMap<String, ProcessHandle>>>,
    // Ids marcados como cancelados: permite distinguir "cancelled" de "failed"
    // quando o processo termina com exit != 0.
    cancelled: Arc<Mutex<HashSet<String>>>,
    history: Arc<HistoryStore>,
    default_download_path: PathBuf,
}

const EXTRA_ARGS_BOOLEAN_FLAGS: &[&str] = &[
    "--write-subs",
    "--write-auto-subs",
    "--embed-thumbnail",
    "--embed-metadata",
    "--no-playlist",
    "--yes-playlist",
];

// --sub-langs e --download-sections ficam de fora: já têm campo dedicado
// (legendas / corte), e permitir os dois caminhos deixaria o usuário mandar
// dois valores conflitantes pro mesmo flag no mesmo comando.
const EXTRA_ARGS_VALUE_FLAGS: &[&str] = &["--cookies-from-browser"];

/// Valida o campo de argumentos extras do Modo Avançado contra uma allowlist
/// fixa antes de deixar qualquer coisa chegar ao subprocess yt-dlp — flags
/// como --exec ou -o/--output nunca passam, mesmo sem estar bloqueadas
/// explicitamente, pois simplesmente não constam na allowlist.
fn validate_extra_args(raw: &str) -> Result<Vec<String>, String> {
    let tokens: Vec<&str> = raw.split_whitespace().collect();
    let mut result = Vec::new();
    let mut i = 0;
    while i < tokens.len() {
        let token = tokens[i];
        if EXTRA_ARGS_BOOLEAN_FLAGS.contains(&token) {
            result.push(token.to_string());
            i += 1;
        } else if EXTRA_ARGS_VALUE_FLAGS.contains(&token) {
            let value = tokens
                .get(i + 1)
                .ok_or_else(|| format!("Flag {token} requer um valor"))?;
            if value.starts_with('-') {
                return Err(format!("Valor inválido para {token}: {value}"));
            }
            result.push(token.to_string());
            result.push(value.to_string());
            i += 2;
        } else if token.starts_with('-') {
            return Err(format!("Flag não permitida: {token}"));
        } else {
            return Err(format!("Argumento sem flag associada: {token}"));
        }
    }
    Ok(result)
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

fn section_arg(start: &str, end: &str) -> Vec<String> {
    vec!["--download-sections".to_string(), format!("*{start}-{end}")]
}

fn subtitles_args(langs: &str) -> Vec<String> {
    vec![
        "--write-subs".to_string(),
        "--sub-langs".to_string(),
        langs.to_string(),
    ]
}

// Mesma lista que o yt-dlp aceita em --cookies-from-browser (sem os perfis
// opcionais entre parênteses, que este app não expõe na UI).
const ALLOWED_COOKIE_BROWSERS: &[&str] = &[
    "chrome", "firefox", "edge", "brave", "opera", "safari", "vivaldi", "chromium",
];

fn cookies_browser_args(browser: &str) -> Result<Vec<String>, String> {
    if !ALLOWED_COOKIE_BROWSERS.contains(&browser) {
        return Err(format!("Navegador não suportado: {browser}"));
    }
    Ok(vec![
        "--cookies-from-browser".to_string(),
        browser.to_string(),
    ])
}

/// Valida o formato aceito pelo --limit-rate do yt-dlp: número (com ou sem
/// decimal) seguido de um sufixo de unidade opcional (K/M/G, maiúsculo ou não).
fn validate_limit_rate(raw: &str) -> Result<String, String> {
    let raw = raw.trim();
    let numeric_part = match raw.chars().last() {
        Some(c) if c.is_ascii_alphabetic() => {
            if !matches!(c.to_ascii_uppercase(), 'K' | 'M' | 'G') {
                return Err(format!("Unidade de limite inválida: {raw}"));
            }
            &raw[..raw.len() - 1]
        }
        _ => raw,
    };
    // Validação manual em vez de f64::parse: parse aceita "-5", "NaN" e "inf"
    // como número válido, e nada disso é um limite de banda que faça sentido
    // passar pro yt-dlp como --limit-rate.
    let mut seen_dot = false;
    let numeric_ok = !numeric_part.is_empty()
        && numeric_part.chars().all(|c| {
            if c == '.' && !seen_dot {
                seen_dot = true;
                true
            } else {
                c.is_ascii_digit()
            }
        });
    if !numeric_ok {
        return Err(format!("Limite de velocidade inválido: {raw}"));
    }
    Ok(raw.to_string())
}

fn limit_rate_args(raw: &str) -> Result<Vec<String>, String> {
    Ok(vec!["--limit-rate".to_string(), validate_limit_rate(raw)?])
}

/// Args de seleção pro Modo Rápido — sem chamada prévia de metadados,
/// direto na melhor qualidade disponível pro formato escolhido.
fn quick_download_args(mode: &str) -> Vec<String> {
    if mode == "mp3" {
        vec![
            "-f".to_string(),
            "bestaudio".to_string(),
            "-x".to_string(),
            "--audio-format".to_string(),
            "mp3".to_string(),
            "--audio-quality".to_string(),
            "0".to_string(),
        ]
    } else {
        vec![
            "-f".to_string(),
            "bv*+ba/b".to_string(),
            "--merge-output-format".to_string(),
            "mp4".to_string(),
        ]
    }
}

/// Componente JS remoto (EJS) que o yt-dlp baixa pra resolver os desafios de
/// assinatura do YouTube — mas só *baixar* o componente não basta, ele precisa
/// de um runtime JS pra *executar* (deno/node/bun/quickjs; nenhum vem
/// instalado por padrão no SO do usuário). Sem runtime, o yt-dlp não gera o
/// PO Token do YouTube e cai num cliente (android_vr) cuja URL de mídia é
/// aceita no início mas cortada com HTTP 403 no meio do download — reproduzido
/// manualmente: log real de usuário mostrava "PO Token Providers: none" e
/// corte em ~16% de um download de 725MB. QuickJS-ng é embutido no bundle
/// (resources/bin/<plataforma>/qjs) especificamente pra preencher essa lacuna.
const EJS_ARGS: [&str; 2] = ["--remote-components", "ejs:github"];
const JS_RUNTIME_FLAG: &str = "--js-runtimes";

fn push_ejs_args(args: &mut Vec<String>, qjs_bin: Option<&str>) {
    args.push(EJS_ARGS[0].to_string());
    args.push(EJS_ARGS[1].to_string());
    if let Some(qjs_bin) = qjs_bin {
        args.push(JS_RUNTIME_FLAG.to_string());
        args.push(format!("quickjs:{qjs_bin}"));
    }
}

/// True só quando o binário de yt-dlp em uso é velho demais pra conhecer
/// `--remote-components`/`--js-runtimes` (argparse rejeita a flag antes de
/// tentar baixar nada). O app se auto-atualiza no startup, mas se essa
/// atualização falhar (rede indisponível) o binário embutido mais antigo não
/// pode travar todo download.
fn is_unrecognized_remote_components_error(stderr: &str) -> bool {
    (stderr.contains("unrecognized arguments") && stderr.contains("--remote-components"))
        || (stderr.contains("unrecognized arguments") && stderr.contains(JS_RUNTIME_FLAG))
}

fn without_remote_components(args: &[String]) -> Vec<String> {
    let mut result = Vec::with_capacity(args.len());
    let mut i = 0;
    while i < args.len() {
        if args[i] == EJS_ARGS[0] || args[i] == JS_RUNTIME_FLAG {
            i += 2;
        } else {
            result.push(args[i].clone());
            i += 1;
        }
    }
    result
}

impl DownloadManager {
    pub fn new(
        ytdlp_bin: String,
        ffmpeg_bin: Option<String>,
        qjs_bin: Option<String>,
        default_download_path: PathBuf,
        history_path: PathBuf,
    ) -> Self {
        std::fs::create_dir_all(&default_download_path).ok();
        Self {
            ytdlp_bin: Arc::new(Mutex::new(ytdlp_bin)),
            ffmpeg_bin,
            qjs_bin,
            active: Arc::new(Mutex::new(HashMap::new())),
            cancelled: Arc::new(Mutex::new(HashSet::new())),
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
        args.push(url.to_string());
        let ytdlp_bin = self.current_ytdlp_bin();
        let output = run_probe(&ytdlp_bin, &args)?;

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

    /// Valida e dispara um download em background, retornando o id na hora.
    /// O fim (sucesso, falha ou cancelamento) é sinalizado só pelo evento
    /// "download-finished" — ninguém aguarda o processo no comando.
    pub fn start_download(
        &self,
        app: &AppHandle,
        url: &str,
        format: &str,
        title: Option<String>,
        output_path: Option<String>,
        options: DownloadOptions,
    ) -> Result<String, String> {
        let download_dir = output_path
            .map(PathBuf::from)
            .unwrap_or_else(|| self.default_download_path.clone());
        std::fs::create_dir_all(&download_dir).map_err(|e| e.to_string())?;

        let output_template = download_dir.join("%(title)s.%(ext)s");
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
        if let Some(extra) = &options.extra_args {
            args.extend(validate_extra_args(extra)?);
        }
        if let Some(ffmpeg) = &self.ffmpeg_bin {
            args.push("--ffmpeg-location".to_string());
            args.push(ffmpeg.clone());
        }
        args.push("-o".to_string());
        args.push(output_template.to_string_lossy().to_string());
        args.push("--progress".to_string());
        args.push("--newline".to_string());
        args.push("--no-warnings".to_string());
        args.push("--encoding".to_string());
        args.push("utf-8".to_string());
        let cookies_already_set = args
            .iter()
            .any(|a| a == "--cookies-from-browser" || a == "--cookies");
        args.push(url.to_string());

        let ytdlp_bin = self.current_ytdlp_bin();
        let id = Uuid::new_v4().to_string();
        log::info!(
            "Iniciando download {id}: url={url} formato={format} destino={}",
            download_dir.display()
        );

        // Checagem do limite e inserção sob o mesmo lock: sem isso, dois
        // starts simultâneos poderiam passar do teto de concorrência.
        let join = {
            let mut active = self.active.lock().unwrap();
            if active.len() >= MAX_CONCURRENT_DOWNLOADS {
                return Err("Limite de downloads simultâneos atingido".to_string());
            }
            let (handle, join) = spawn_attempt(app, &ytdlp_bin, &args, &id)?;
            active.insert(id.clone(), handle);
            join
        };

        // Thread que aguarda o fim do processo e emite "download-finished".
        let manager = self.clone();
        let finish_app = app.clone();
        let finish_id = id.clone();
        let url = url.to_string();
        let format = format.to_string();
        let output_dir = download_dir.to_string_lossy().to_string();
        std::thread::spawn(move || {
            let output = join
                .join()
                .map_err(|_| "Erro interno ao aguardar processo".to_string())
                .and_then(|r| r);
            let mut stderr_text = output.as_ref().ok().map(|o| o.stderr.clone());

            let was_cancelled = manager.cancelled.lock().unwrap().remove(&finish_id);
            let (mut status, mut path, mut error) =
                final_status(output, was_cancelled, &output_dir);
            let mut current_args = args;

            // Binário de yt-dlp desatualizado (auto-update falhou) não conhece
            // --remote-components ainda: reexecuta sem a flag em vez de deixar
            // todo download quebrar por causa de uma flag opcional.
            if status == "failed"
                && stderr_text
                    .as_deref()
                    .is_some_and(is_unrecognized_remote_components_error)
            {
                log::info!(
                    "Download {finish_id}: binário de yt-dlp não suporta --remote-components, tentando sem EJS"
                );
                current_args = without_remote_components(&current_args);
                match spawn_attempt(&finish_app, &ytdlp_bin, &current_args, &finish_id) {
                    Ok((handle, retry_join)) => {
                        manager
                            .active
                            .lock()
                            .unwrap()
                            .insert(finish_id.clone(), handle);
                        let retry_output = retry_join
                            .join()
                            .map_err(|_| "Erro interno ao aguardar processo".to_string())
                            .and_then(|r| r);
                        stderr_text = retry_output.as_ref().ok().map(|o| o.stderr.clone());
                        let retry_cancelled = manager.cancelled.lock().unwrap().remove(&finish_id);
                        let (s, p, e) = final_status(retry_output, retry_cancelled, &output_dir);
                        status = s;
                        path = p;
                        error = e;
                    }
                    Err(e) => log::error!("Falha ao tentar novamente sem --remote-components: {e}"),
                }
            }

            // YouTube às vezes exige prova de humano ("Sign in to confirm
            // you're not a bot") ou corta o download no meio com HTTP 403
            // (PO Token ausente). Sem retry, todo download falha até o
            // usuário descobrir e digitar --cookies-from-browser manualmente
            // no campo de argumentos extras — tenta uma vez sozinho antes de
            // desistir, reaproveitando cookies do Chrome já logado.
            if status == "failed"
                && !cookies_already_set
                && stderr_text.as_deref().is_some_and(is_bot_check_error)
            {
                log::info!(
                    "Download {finish_id} bloqueado (anti-bot ou 403), tentando novamente com cookies do navegador"
                );
                let retry_args = with_cookies_from_browser(&current_args, "chrome");
                match spawn_attempt(&finish_app, &ytdlp_bin, &retry_args, &finish_id) {
                    Ok((handle, retry_join)) => {
                        manager
                            .active
                            .lock()
                            .unwrap()
                            .insert(finish_id.clone(), handle);
                        let retry_output = retry_join
                            .join()
                            .map_err(|_| "Erro interno ao aguardar processo".to_string())
                            .and_then(|r| r);
                        let retry_cancelled = manager.cancelled.lock().unwrap().remove(&finish_id);
                        let (s, p, e) = final_status(retry_output, retry_cancelled, &output_dir);
                        status = s;
                        path = p;
                        error = e;
                    }
                    Err(e) => log::error!("Falha ao tentar novamente com cookies: {e}"),
                }
            }

            manager.active.lock().unwrap().remove(&finish_id);
            match status {
                "done" => log::info!("Download {finish_id} concluído: {output_dir}"),
                "cancelled" => log::info!("Download {finish_id} cancelado pelo usuário"),
                _ => log::error!(
                    "Download {finish_id} falhou: {}",
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
                let body = title.as_deref().unwrap_or(url.as_str());
                let _ = finish_app
                    .notification()
                    .builder()
                    .title(notif_title)
                    .body(body)
                    .show();
            }

            let _ = finish_app.emit(
                "download-finished",
                DownloadFinished {
                    id: finish_id.clone(),
                    status,
                    path,
                    error: error.clone(),
                },
            );
            manager.history.append(HistoryEntry {
                id: finish_id,
                url,
                title,
                format,
                output_path: output_dir,
                status: status.to_string(),
                error,
                finished_at: chrono::Utc::now().to_rfc3339(),
            });
        });

        Ok(id)
    }

    /// Cancela um download específico: marca o id pra diferenciar
    /// "cancelled" de "failed" no encerramento e mata o processo.
    /// A remoção de `active` e o evento download-finished ficam com a
    /// thread que aguarda o processo — kill() é assíncrono.
    pub fn cancel_download(&self, id: &str) {
        let handle = self.active.lock().unwrap().get(id).cloned();
        if let Some(handle) = handle {
            self.cancelled.lock().unwrap().insert(id.to_string());
            log::info!("Cancelando download {id} a pedido do usuário");
            handle.kill();
        }
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
fn run_probe(ytdlp_bin: &str, args: &[String]) -> Result<ProcessOutput, String> {
    let started = Instant::now();
    let (_, join) = spawn_process(
        ytdlp_bin,
        args,
        Some(Duration::from_secs(30)),
        |_| {},
        |_| {},
    )?;
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
        let (_, join) = spawn_process(
            ytdlp_bin,
            &fallback_args,
            Some(Duration::from_secs(30)),
            |_| {},
            |_| {},
        )?;
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

/// Casos em que --cookies-from-browser (sessão já logada) costuma resolver
/// sozinho: a mensagem fixa de "prova de humano" do YouTube, e o HTTP 403 que
/// aparece no meio de um download grande — sintoma de PO Token ausente (ver
/// comentário de EJS_ARGS acima; o app ainda não gera PO Token de verdade,
/// só cookies de uma conta logada contornam esse corte de forma confiável).
fn is_bot_check_error(stderr: &str) -> bool {
    stderr.contains("Sign in to confirm you're not a bot") || stderr.contains("HTTP Error 403")
}

fn with_cookies_from_browser(args: &[String], browser: &str) -> Vec<String> {
    // url é sempre o último elemento (empurrado por último em start_download).
    let mut retry = args[..args.len() - 1].to_vec();
    retry.push("--cookies-from-browser".to_string());
    retry.push(browser.to_string());
    retry.push(args[args.len() - 1].clone());
    retry
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
    fn detects_bot_check_error() {
        assert!(is_bot_check_error(
            "ERROR: [youtube] xyz: Sign in to confirm you're not a bot. Use --cookies-from-browser..."
        ));
        assert!(!is_bot_check_error("ERROR: Video unavailable"));
    }

    #[test]
    fn detects_mid_download_403_as_cookies_retryable() {
        assert!(is_bot_check_error(
            "ERROR: unable to download video data: HTTP Error 403: Forbidden"
        ));
    }

    #[test]
    fn inserts_cookies_flag_before_trailing_url() {
        let args = vec![
            "-f".to_string(),
            "best".to_string(),
            "https://x/y".to_string(),
        ];
        let retry = with_cookies_from_browser(&args, "chrome");
        assert_eq!(
            retry,
            vec![
                "-f".to_string(),
                "best".to_string(),
                "--cookies-from-browser".to_string(),
                "chrome".to_string(),
                "https://x/y".to_string(),
            ]
        );
    }

    #[test]
    fn extra_args_accepts_allowlisted_boolean_flag() {
        assert_eq!(
            validate_extra_args("--write-subs"),
            Ok(vec!["--write-subs".to_string()])
        );
    }

    #[test]
    fn extra_args_accepts_allowlisted_value_flag_with_value() {
        assert_eq!(
            validate_extra_args("--cookies-from-browser chrome"),
            Ok(vec![
                "--cookies-from-browser".to_string(),
                "chrome".to_string()
            ])
        );
    }

    #[test]
    fn extra_args_accepts_multiple_flags() {
        assert_eq!(
            validate_extra_args("--write-subs --cookies-from-browser chrome --embed-thumbnail"),
            Ok(vec![
                "--write-subs".to_string(),
                "--cookies-from-browser".to_string(),
                "chrome".to_string(),
                "--embed-thumbnail".to_string(),
            ])
        );
    }

    #[test]
    fn extra_args_rejects_sub_langs_since_dedicated_field_covers_it() {
        assert!(validate_extra_args("--sub-langs en,pt").is_err());
    }

    #[test]
    fn extra_args_rejects_download_sections_since_dedicated_field_covers_it() {
        assert!(validate_extra_args("--download-sections *0-10").is_err());
    }

    #[test]
    fn extra_args_empty_string_yields_no_args() {
        assert_eq!(validate_extra_args(""), Ok(vec![]));
        assert_eq!(validate_extra_args("   "), Ok(vec![]));
    }

    #[test]
    fn extra_args_rejects_unlisted_flag() {
        assert!(validate_extra_args("--exec 'rm -rf /'").is_err());
    }

    #[test]
    fn extra_args_rejects_output_override() {
        assert!(validate_extra_args("-o /tmp/evil").is_err());
        assert!(validate_extra_args("--output /tmp/evil").is_err());
    }

    #[test]
    fn extra_args_rejects_stray_value_without_flag() {
        assert!(validate_extra_args("en,pt").is_err());
    }

    #[test]
    fn extra_args_rejects_value_flag_missing_value() {
        assert!(validate_extra_args("--cookies-from-browser").is_err());
    }

    #[test]
    fn limit_rate_accepts_plain_number_and_unit_suffix() {
        assert_eq!(validate_limit_rate("500K"), Ok("500K".to_string()));
        assert_eq!(validate_limit_rate("2.5M"), Ok("2.5M".to_string()));
        assert_eq!(validate_limit_rate("1024"), Ok("1024".to_string()));
    }

    #[test]
    fn limit_rate_rejects_invalid_unit_and_non_numeric() {
        assert!(validate_limit_rate("500X").is_err());
        assert!(validate_limit_rate("abc").is_err());
        assert!(validate_limit_rate("").is_err());
        assert!(validate_limit_rate("-5").is_err());
        assert!(validate_limit_rate("-5M").is_err());
        assert!(validate_limit_rate("NaN").is_err());
        assert!(validate_limit_rate("inf").is_err());
    }

    #[test]
    fn extra_args_rejects_flag_smuggled_as_value() {
        assert!(validate_extra_args("--cookies-from-browser --exec").is_err());
    }

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

    #[test]
    fn section_arg_formats_download_sections_flag() {
        assert_eq!(
            section_arg("00:01:00", "00:02:30"),
            vec![
                "--download-sections".to_string(),
                "*00:01:00-00:02:30".to_string()
            ]
        );
    }

    #[test]
    fn subtitles_args_formats_write_subs_and_langs() {
        assert_eq!(
            subtitles_args("en,pt"),
            vec![
                "--write-subs".to_string(),
                "--sub-langs".to_string(),
                "en,pt".to_string(),
            ]
        );
    }

    #[test]
    fn quick_args_mp4_downloads_best_video_and_audio_merged_to_mp4() {
        let args = quick_download_args("mp4");
        assert_eq!(
            args,
            vec![
                "-f".to_string(),
                "bv*+ba/b".to_string(),
                "--merge-output-format".to_string(),
                "mp4".to_string(),
            ]
        );
    }

    #[test]
    fn ejs_args_are_appended_and_removable() {
        let mut args = vec!["-f".to_string(), "best".to_string()];
        push_ejs_args(&mut args, None);
        assert_eq!(
            args,
            vec![
                "-f".to_string(),
                "best".to_string(),
                "--remote-components".to_string(),
                "ejs:github".to_string(),
            ]
        );
        assert_eq!(
            without_remote_components(&args),
            vec!["-f".to_string(), "best".to_string()]
        );
    }

    #[test]
    fn ejs_args_include_js_runtime_when_qjs_bin_is_set() {
        let mut args = vec!["-f".to_string(), "best".to_string()];
        push_ejs_args(&mut args, Some("/path/to/qjs"));
        assert_eq!(
            args,
            vec![
                "-f".to_string(),
                "best".to_string(),
                "--remote-components".to_string(),
                "ejs:github".to_string(),
                "--js-runtimes".to_string(),
                "quickjs:/path/to/qjs".to_string(),
            ]
        );
        assert_eq!(
            without_remote_components(&args),
            vec!["-f".to_string(), "best".to_string()]
        );
    }

    #[test]
    fn detects_unrecognized_remote_components_error() {
        assert!(is_unrecognized_remote_components_error(
            "yt-dlp: error: unrecognized arguments: --remote-components ejs:github"
        ));
        assert!(!is_unrecognized_remote_components_error(
            "ERROR: Video unavailable"
        ));
    }

    #[test]
    fn quick_args_mp3_extracts_best_audio_as_mp3() {
        let args = quick_download_args("mp3");
        assert_eq!(
            args,
            vec![
                "-f".to_string(),
                "bestaudio".to_string(),
                "-x".to_string(),
                "--audio-format".to_string(),
                "mp3".to_string(),
                "--audio-quality".to_string(),
                "0".to_string(),
            ]
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
}
