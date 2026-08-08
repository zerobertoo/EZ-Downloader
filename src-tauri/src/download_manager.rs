use crate::format_parser::{classify_ytdlp_error, parse_formats, FormatOption, YtdlpInfo};
use crate::process_runner::{spawn_process, ProcessHandle};
use regex::Regex;
use serde::Serialize;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

const PROGRESS_THROTTLE_MS: u128 = 500;

#[derive(Debug, Serialize, Clone)]
pub struct DownloadProgress {
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

#[derive(Debug, Serialize)]
pub struct DownloadResult {
    pub path: String,
    pub message: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct DebugLine {
    pub stream: &'static str,
    pub text: String,
}

/// Opções do Modo Avançado — todas opcionais, ausentes no Modo Rápido.
#[derive(Debug, Default)]
pub struct DownloadOptions {
    pub section: Option<(String, String)>,
    pub sub_langs: Option<String>,
    pub extra_args: Option<String>,
}

#[derive(Clone)]
pub struct DownloadManager {
    ytdlp_bin: String,
    ffmpeg_bin: Option<String>,
    current_process: Arc<Mutex<Option<ProcessHandle>>>,
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
            "bestvideo+bestaudio/best".to_string(),
            "--merge-output-format".to_string(),
            "mp4".to_string(),
        ]
    }
}

impl DownloadManager {
    pub fn new(ytdlp_bin: String, ffmpeg_bin: Option<String>, default_download_path: PathBuf) -> Self {
        std::fs::create_dir_all(&default_download_path).ok();
        Self {
            ytdlp_bin,
            ffmpeg_bin,
            current_process: Arc::new(Mutex::new(None)),
            default_download_path,
        }
    }

    pub fn get_available_formats(&self, url: &str) -> Result<FormatsResult, String> {
        let args = vec![
            "--dump-json".to_string(),
            "--no-warnings".to_string(),
            url.to_string(),
        ];
        let (_, join) = spawn_process(&self.ytdlp_bin, &args, Some(Duration::from_secs(30)), |_| {}, |_| {})?;
        let output = join
            .join()
            .map_err(|_| "Erro interno ao aguardar processo".to_string())??;

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
            Err(classify_ytdlp_error(&output.stderr))
        }
    }

    pub fn download(
        &self,
        app: &AppHandle,
        url: &str,
        format: &str,
        output_path: Option<String>,
        options: DownloadOptions,
    ) -> Result<DownloadResult, String> {
        {
            let guard = self.current_process.lock().unwrap();
            if guard.is_some() {
                return Err("Um download já está em andamento".to_string());
            }
        }

        let download_dir = output_path
            .map(PathBuf::from)
            .unwrap_or_else(|| self.default_download_path.clone());
        std::fs::create_dir_all(&download_dir).map_err(|e| e.to_string())?;

        let output_template = download_dir.join("%(title)s.%(ext)s");
        let mut args = match format {
            "quick-mp3" => quick_download_args("mp3"),
            "quick-mp4" => quick_download_args("mp4"),
            "best" => {
                let mut a = vec!["-f".to_string(), "bestvideo+bestaudio/best".to_string()];
                a.push("--merge-output-format".to_string());
                a.push("mp4".to_string());
                a
            }
            _ => vec!["-f".to_string(), format.to_string()],
        };
        if let Some((start, end)) = &options.section {
            args.extend(section_arg(start, end));
        }
        if let Some(langs) = &options.sub_langs {
            args.extend(subtitles_args(langs));
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
        args.push(url.to_string());

        let _ = app.emit(
            "download-debug-command",
            format_command_for_display(&self.ytdlp_bin, &args),
        );

        let progress_re =
            Regex::new(r"\[download\]\s+([\d.]+)%(?:.*?at\s+(\S+/s).*?ETA\s+([\d:]+))?").unwrap();
        let app_handle = app.clone();
        let mut last_progress = Instant::now()
            .checked_sub(Duration::from_millis(PROGRESS_THROTTLE_MS as u64 + 1))
            .unwrap_or_else(Instant::now);

        let debug_stdout_handle = app.clone();
        let debug_stderr_handle = app.clone();

        let on_stdout = move |line: &str| {
            let _ = debug_stdout_handle.emit(
                "download-debug-line",
                DebugLine { stream: "stdout", text: line.to_string() },
            );
            let Some(caps) = progress_re.captures(line) else {
                return;
            };
            let percent: f64 = caps
                .get(1)
                .and_then(|m| m.as_str().parse().ok())
                .unwrap_or(0.0);
            let now = Instant::now();
            if now.duration_since(last_progress).as_millis() > PROGRESS_THROTTLE_MS || percent == 100.0 {
                let payload = DownloadProgress {
                    percent,
                    speed: caps.get(2).map(|m| m.as_str().to_string()),
                    eta: caps.get(3).map(|m| m.as_str().to_string()),
                };
                let _ = app_handle.emit("download-progress", payload);
                last_progress = now;
            }
        };
        let on_stderr = move |line: &str| {
            let _ = debug_stderr_handle.emit(
                "download-debug-line",
                DebugLine { stream: "stderr", text: line.to_string() },
            );
        };

        let (handle, join) = spawn_process(&self.ytdlp_bin, &args, None, on_stdout, on_stderr)?;
        *self.current_process.lock().unwrap() = Some(handle);

        let result = join
            .join()
            .map_err(|_| "Erro interno ao aguardar processo".to_string());
        *self.current_process.lock().unwrap() = None;

        let output = result??;
        if output.code == 0 {
            Ok(DownloadResult {
                path: download_dir.to_string_lossy().to_string(),
                message: "Download concluído com sucesso".to_string(),
            })
        } else {
            Err(classify_ytdlp_error(&output.stderr))
        }
    }

    pub fn cancel_download(&self) {
        if let Some(handle) = self.current_process.lock().unwrap().take() {
            handle.kill();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extra_args_accepts_allowlisted_boolean_flag() {
        assert_eq!(validate_extra_args("--write-subs"), Ok(vec!["--write-subs".to_string()]));
    }

    #[test]
    fn extra_args_accepts_allowlisted_value_flag_with_value() {
        assert_eq!(
            validate_extra_args("--cookies-from-browser chrome"),
            Ok(vec!["--cookies-from-browser".to_string(), "chrome".to_string()])
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
        assert_eq!(format_command_for_display("yt-dlp", &args), "yt-dlp -f bestaudio");
    }

    #[test]
    fn section_arg_formats_download_sections_flag() {
        assert_eq!(
            section_arg("00:01:00", "00:02:30"),
            vec!["--download-sections".to_string(), "*00:01:00-00:02:30".to_string()]
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
                "bestvideo+bestaudio/best".to_string(),
                "--merge-output-format".to_string(),
                "mp4".to_string(),
            ]
        );
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
}
