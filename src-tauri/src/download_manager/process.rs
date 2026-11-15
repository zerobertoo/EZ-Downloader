use super::args::{is_unrecognized_remote_components_error, without_remote_components};
use super::events::{DebugCommand, DebugLine, DownloadProgress};
use crate::format_parser::classify_ytdlp_error;
use crate::process_runner::{spawn_process, ProcessHandle, ProcessOutput};
use regex::Regex;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

const PROGRESS_THROTTLE_MS: u128 = 500;

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

pub(super) fn path_file_for(id: &str) -> PathBuf {
    std::env::temp_dir().join(format!("ez-downloader-{id}.path"))
}

/// Lê o caminho do arquivo final gravado pelo yt-dlp em `--print-to-file`
/// (um por linha; numa playlist vale o último). Lossy: o nome pode ter bytes
/// fora de UTF-8 em plataformas que não forçam o encoding.
pub(super) fn read_final_file_path(path_file: &Path) -> Option<String> {
    let bytes = std::fs::read(path_file).ok()?;
    String::from_utf8_lossy(&bytes)
        .lines()
        .rev()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(str::to_string)
}

/// Roda uma consulta síncrona (sem streaming de progresso, ex: --dump-json)
/// com fallback automático se o binário for velho demais pro --remote-components.
pub(super) fn run_probe(
    ytdlp_bin: &str,
    args: &[String],
    timeout: Duration,
) -> Result<ProcessOutput, String> {
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
pub(super) fn spawn_attempt(
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
pub(super) fn final_status(
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
}
