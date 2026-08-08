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

pub struct DownloadManager {
    ytdlp_bin: String,
    ffmpeg_bin: Option<String>,
    current_process: Arc<Mutex<Option<ProcessHandle>>>,
    default_download_path: PathBuf,
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
        let (_, join) = spawn_process(&self.ytdlp_bin, &args, Some(Duration::from_secs(30)), |_| {})?;
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
        let mut args = vec![
            "-f".to_string(),
            if format == "best" {
                "bestvideo+bestaudio/best".to_string()
            } else {
                format.to_string()
            },
        ];
        if format == "best" {
            args.push("--merge-output-format".to_string());
            args.push("mp4".to_string());
        }
        if let Some(ffmpeg) = &self.ffmpeg_bin {
            args.push("--ffmpeg-location".to_string());
            args.push(ffmpeg.clone());
        }
        args.push("-o".to_string());
        args.push(output_template.to_string_lossy().to_string());
        args.push("--progress".to_string());
        args.push("--no-warnings".to_string());
        args.push(url.to_string());

        let progress_re =
            Regex::new(r"\[download\]\s+([\d.]+)%(?:.*?at\s+(\S+/s).*?ETA\s+([\d:]+))?").unwrap();
        let app_handle = app.clone();
        let mut last_progress = Instant::now()
            .checked_sub(Duration::from_millis(PROGRESS_THROTTLE_MS as u64 + 1))
            .unwrap_or_else(Instant::now);

        let on_stdout = move |line: &str| {
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

        let (handle, join) = spawn_process(&self.ytdlp_bin, &args, None, on_stdout)?;
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
