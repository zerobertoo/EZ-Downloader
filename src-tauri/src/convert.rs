//! Conversão pós-download para H.264 + AAC em MP4: VP9/AV1/Opus (padrão do
//! YouTube) não abrem no Premiere. Usa `ffmpeg -i` pra analisar, já que o
//! ffprobe não vai embutido.

use crate::process_runner::{spawn_process, ProcessHandle, ProcessOutput};
use regex::Regex;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

const PROGRESS_THROTTLE_MS: u128 = 250;

const PROBLEMATIC_VIDEO_CODECS: &[&str] = &["vp9", "vp8", "av1"];
const PROBLEMATIC_AUDIO_CODECS: &[&str] = &["opus", "vorbis"];
/// Streams de vídeo que na verdade são capa de álbum embutida.
const COVER_ART_CODECS: &[&str] = &["mjpeg", "png", "bmp"];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Encoder {
    Nvenc,
    Qsv,
    Amf,
    VideoToolbox,
    X264,
}

impl Encoder {
    pub fn label(self) -> &'static str {
        match self {
            Encoder::Nvenc => "GPU NVIDIA (NVENC)",
            Encoder::Qsv => "GPU Intel (Quick Sync)",
            Encoder::Amf => "GPU AMD (AMF)",
            Encoder::VideoToolbox => "GPU Apple (VideoToolbox)",
            Encoder::X264 => "CPU (x264)",
        }
    }

    pub fn is_gpu(self) -> bool {
        self != Encoder::X264
    }

    /// Qualidade visualmente próxima do original em todos os encoders
    /// (CRF/CQ/QP ~18-21), sem travar a taxa de bits.
    fn codec_args(self) -> &'static [&'static str] {
        match self {
            Encoder::Nvenc => &["-c:v", "h264_nvenc", "-rc", "vbr", "-cq", "21", "-b:v", "0"],
            Encoder::Qsv => &["-c:v", "h264_qsv", "-global_quality", "21"],
            Encoder::Amf => &[
                "-c:v", "h264_amf", "-rc", "cqp", "-qp_i", "21", "-qp_p", "21",
            ],
            Encoder::VideoToolbox => &["-c:v", "h264_videotoolbox", "-q:v", "65"],
            Encoder::X264 => &["-c:v", "libx264", "-preset", "medium", "-crf", "18"],
        }
    }
}

fn gpu_candidates() -> &'static [Encoder] {
    if cfg!(target_os = "macos") {
        &[Encoder::VideoToolbox]
    } else if cfg!(target_os = "windows") {
        &[Encoder::Nvenc, Encoder::Qsv, Encoder::Amf]
    } else {
        &[Encoder::Nvenc, Encoder::Qsv]
    }
}

fn to_strings(parts: &[&str]) -> Vec<String> {
    parts.iter().map(|p| p.to_string()).collect()
}

/// Encoder listado no ffmpeg não significa GPU presente (o build embute todos).
/// Só um encode de verdade de 1 frame confirma que o hardware responde.
fn encoder_works(ffmpeg: &str, encoder: Encoder) -> bool {
    let mut args = to_strings(&[
        "-hide_banner",
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=black:s=256x144:d=0.1",
        "-frames:v",
        "1",
        "-pix_fmt",
        "yuv420p",
    ]);
    args.extend(to_strings(encoder.codec_args()));
    args.extend(to_strings(&["-f", "null", "-"]));

    let Ok((_, join)) = spawn_process(ffmpeg, &args, Some(Duration::from_secs(15)), |_| {}, |_| {})
    else {
        return false;
    };
    matches!(join.join(), Ok(Ok(output)) if output.code == 0)
}

static DETECTED_ENCODER: OnceLock<Encoder> = OnceLock::new();

/// Melhor encoder disponível nesta máquina. O teste leva ~1s por GPU, então
/// roda uma vez só e o resultado fica em cache pelo resto da sessão.
pub fn detect_encoder(ffmpeg: &str) -> Encoder {
    *DETECTED_ENCODER.get_or_init(|| {
        let found = gpu_candidates()
            .iter()
            .copied()
            .find(|encoder| encoder_works(ffmpeg, *encoder))
            .unwrap_or(Encoder::X264);
        log::info!("Encoder H.264 para conversão: {}", found.label());
        found
    })
}

#[derive(Debug, Default, PartialEq)]
pub struct MediaInfo {
    pub video_codec: Option<String>,
    pub audio_codec: Option<String>,
    pub duration_secs: Option<f64>,
}

/// Extrai codecs e duração da saída (stderr) de `ffmpeg -i arquivo`.
pub fn parse_media_info(stderr: &str) -> MediaInfo {
    let video_re = Regex::new(r"Stream #\d+:\d+[^\n]*?: Video:\s*([A-Za-z0-9_]+)").unwrap();
    let audio_re = Regex::new(r"Stream #\d+:\d+[^\n]*?: Audio:\s*([A-Za-z0-9_]+)").unwrap();
    let duration_re = Regex::new(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)").unwrap();

    let video_codec = video_re
        .captures_iter(stderr)
        .map(|caps| caps[1].to_lowercase())
        .find(|codec| !COVER_ART_CODECS.contains(&codec.as_str()));
    let audio_codec = audio_re.captures(stderr).map(|caps| caps[1].to_lowercase());
    let duration_secs = duration_re.captures(stderr).and_then(|caps| {
        let hours: f64 = caps[1].parse().ok()?;
        let minutes: f64 = caps[2].parse().ok()?;
        let seconds: f64 = caps[3].parse().ok()?;
        Some(hours * 3600.0 + minutes * 60.0 + seconds)
    });

    MediaInfo {
        video_codec,
        audio_codec,
        duration_secs,
    }
}

/// Só vale converter vídeo (áudio puro como MP3 fica de fora) com algum codec
/// que os editores não abrem.
pub fn needs_conversion(info: &MediaInfo) -> bool {
    let Some(video) = &info.video_codec else {
        return false;
    };
    PROBLEMATIC_VIDEO_CODECS.contains(&video.as_str())
        || info
            .audio_codec
            .as_deref()
            .is_some_and(|audio| PROBLEMATIC_AUDIO_CODECS.contains(&audio))
}

pub fn probe_media(ffmpeg: &str, path: &str) -> Result<MediaInfo, String> {
    if !Path::new(path).is_file() {
        return Err("Arquivo não encontrado".to_string());
    }
    let args = to_strings(&["-hide_banner", "-i", path]);
    let (_, join) = spawn_process(ffmpeg, &args, Some(Duration::from_secs(20)), |_| {}, |_| {})?;
    // `ffmpeg -i` sem saída termina com código 1 — é esperado, só o stderr importa.
    let output = join
        .join()
        .map_err(|_| "Erro interno ao analisar o arquivo".to_string())??;
    Ok(parse_media_info(&output.stderr))
}

pub fn converted_path_for(input: &Path) -> PathBuf {
    let dir = input.parent().unwrap_or_else(|| Path::new("."));
    let stem = input
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "video".to_string());

    let mut candidate = dir.join(format!("{stem} (H.264).mp4"));
    let mut attempt = 2;
    while candidate.exists() {
        candidate = dir.join(format!("{stem} (H.264) ({attempt}).mp4"));
        attempt += 1;
    }
    candidate
}

/// Mantém só o primeiro vídeo e o primeiro áudio (descarta capa/legendas que o
/// MP4 não aceita) e força yuv420p — AV1 10-bit não tem H.264 de 10-bit na GPU.
pub fn conversion_args(input: &str, output: &str, encoder: Encoder) -> Vec<String> {
    let mut args = to_strings(&[
        "-hide_banner",
        "-nostats",
        "-nostdin",
        "-n",
        "-progress",
        "pipe:1",
        "-i",
        input,
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
    ]);
    args.extend(to_strings(encoder.codec_args()));
    args.extend(to_strings(&[
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-movflags",
        "+faststart",
        output,
    ]));
    args
}

fn parse_out_time_secs(line: &str) -> Option<f64> {
    let micros: f64 = line.strip_prefix("out_time_us=")?.trim().parse().ok()?;
    Some(micros / 1_000_000.0)
}

fn last_error_line(stderr: &str) -> String {
    stderr
        .lines()
        .rev()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or("Falha na conversão")
        .to_string()
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MediaReport {
    pub video_codec: Option<String>,
    pub audio_codec: Option<String>,
    pub needs_conversion: bool,
    pub encoder: String,
    pub gpu: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct ConversionProgress {
    pub id: String,
    pub percent: f64,
}

#[derive(Debug, Serialize, Clone)]
pub struct ConversionFinished {
    pub id: String,
    pub status: &'static str, // "done" | "failed" | "cancelled"
    pub path: Option<String>,
    pub error: Option<String>,
}

#[derive(Clone)]
pub struct ConversionManager {
    ffmpeg_bin: String,
    // `None` = conversão reservada mas ainda analisando, sem processo.
    active: Arc<Mutex<HashMap<String, Option<ProcessHandle>>>>,
    cancelled: Arc<Mutex<HashSet<String>>>,
}

impl ConversionManager {
    pub fn new(ffmpeg_bin: String) -> Self {
        Self {
            ffmpeg_bin,
            active: Arc::new(Mutex::new(HashMap::new())),
            cancelled: Arc::new(Mutex::new(HashSet::new())),
        }
    }

    /// Diz se o arquivo precisa de conversão e qual encoder seria usado.
    /// O teste de GPU só roda quando há o que converter.
    pub fn analyze(&self, path: &str) -> Result<MediaReport, String> {
        let info = probe_media(&self.ffmpeg_bin, path)?;
        let needs_conversion = needs_conversion(&info);
        let encoder = if needs_conversion {
            detect_encoder(&self.ffmpeg_bin)
        } else {
            Encoder::X264
        };
        Ok(MediaReport {
            video_codec: info.video_codec,
            audio_codec: info.audio_codec,
            needs_conversion,
            encoder: encoder.label().to_string(),
            gpu: encoder.is_gpu(),
        })
    }

    /// Dispara a conversão em background; o fim chega pelo evento
    /// "conversion-finished" e o progresso por "conversion-progress".
    pub fn start(&self, app: &AppHandle, id: &str, path: &str) -> Result<(), String> {
        // Reserva o slot antes da análise lenta: evita conversão dupla e cancelamento perdido.
        {
            let mut active = self.active.lock().unwrap();
            if active.contains_key(id) {
                return Err("Conversão já em andamento".to_string());
            }
            active.insert(id.to_string(), None);
        }
        self.cancelled.lock().unwrap().remove(id);

        self.launch(app, id, path).inspect_err(|_| {
            self.active.lock().unwrap().remove(id);
            self.cancelled.lock().unwrap().remove(id);
        })
    }

    fn launch(&self, app: &AppHandle, id: &str, path: &str) -> Result<(), String> {
        let info = probe_media(&self.ffmpeg_bin, path)?;
        let total_secs = info.duration_secs.filter(|secs| *secs > 0.0);
        let encoder = detect_encoder(&self.ffmpeg_bin);
        let output = converted_path_for(Path::new(path));
        let output_str = output.to_string_lossy().to_string();
        log::info!(
            "Convertendo {id} com {}: {} -> {}",
            encoder.label(),
            path,
            output_str
        );

        let (handle, join) = self.spawn_ffmpeg(app, id, path, &output_str, encoder, total_secs)?;
        self.register_handle(id, &handle);

        let manager = self.clone();
        let finish_app = app.clone();
        let finish_id = id.to_string();
        let input_path = path.to_string();
        std::thread::spawn(move || {
            let mut result = wait_for(join);

            // O teste de 1 frame não prova que a GPU aguenta o arquivo real: refaz na CPU.
            let cancelled_now = manager.cancelled.lock().unwrap().contains(&finish_id);
            let succeeded = matches!(&result, Ok(o) if o.code == 0);
            if encoder.is_gpu() && !succeeded && !cancelled_now {
                log::warn!(
                    "Conversão {finish_id} falhou com {}, tentando na CPU",
                    encoder.label()
                );
                let _ = std::fs::remove_file(&output);
                result = match manager.spawn_ffmpeg(
                    &finish_app,
                    &finish_id,
                    &input_path,
                    &output_str,
                    Encoder::X264,
                    total_secs,
                ) {
                    Ok((handle, join)) => {
                        manager.register_handle(&finish_id, &handle);
                        wait_for(join)
                    }
                    Err(e) => Err(e),
                };
            }

            manager.active.lock().unwrap().remove(&finish_id);
            let was_cancelled = manager.cancelled.lock().unwrap().remove(&finish_id);

            let finished = match result {
                Ok(output_info) if output_info.code == 0 => ConversionFinished {
                    id: finish_id.clone(),
                    status: "done",
                    path: Some(output_str.clone()),
                    error: None,
                },
                other => {
                    let _ = std::fs::remove_file(&output);
                    if was_cancelled {
                        ConversionFinished {
                            id: finish_id.clone(),
                            status: "cancelled",
                            path: None,
                            error: None,
                        }
                    } else {
                        let error = match other {
                            Ok(output_info) => last_error_line(&output_info.stderr),
                            Err(e) => e,
                        };
                        log::error!("Conversão {finish_id} falhou: {error}");
                        ConversionFinished {
                            id: finish_id.clone(),
                            status: "failed",
                            path: None,
                            error: Some(error),
                        }
                    }
                }
            };
            let _ = finish_app.emit("conversion-finished", finished);
        });
        Ok(())
    }

    fn spawn_ffmpeg(
        &self,
        app: &AppHandle,
        id: &str,
        input: &str,
        output: &str,
        encoder: Encoder,
        total_secs: Option<f64>,
    ) -> Result<(ProcessHandle, JoinHandle<Result<ProcessOutput, String>>), String> {
        let args = conversion_args(input, output, encoder);
        let progress_app = app.clone();
        let progress_id = id.to_string();
        let mut last_emit: Option<Instant> = None;
        let on_stdout = move |line: &str| {
            let (Some(done_secs), Some(total)) = (parse_out_time_secs(line), total_secs) else {
                return;
            };
            let due = last_emit
                .map(|t| t.elapsed().as_millis() > PROGRESS_THROTTLE_MS)
                .unwrap_or(true);
            if due {
                let percent = (done_secs / total * 100.0).clamp(0.0, 100.0);
                let _ = progress_app.emit(
                    "conversion-progress",
                    ConversionProgress {
                        id: progress_id.clone(),
                        percent,
                    },
                );
                last_emit = Some(Instant::now());
            }
        };
        spawn_process(&self.ffmpeg_bin, &args, None, on_stdout, |_| {})
    }

    fn register_handle(&self, id: &str, handle: &ProcessHandle) {
        self.active
            .lock()
            .unwrap()
            .insert(id.to_string(), Some(handle.clone()));
        if self.cancelled.lock().unwrap().contains(id) {
            handle.kill();
        }
    }

    /// Só marca se a conversão ainda existe, senão o id fica preso e a próxima falha vira "cancelada".
    pub fn cancel(&self, id: &str) {
        let active = self.active.lock().unwrap();
        if let Some(slot) = active.get(id) {
            self.cancelled.lock().unwrap().insert(id.to_string());
            if let Some(handle) = slot {
                handle.kill();
            }
        }
    }
}

fn wait_for(join: JoinHandle<Result<ProcessOutput, String>>) -> Result<ProcessOutput, String> {
    join.join()
        .map_err(|_| "Erro interno ao aguardar a conversão".to_string())
        .and_then(|r| r)
}

#[cfg(test)]
mod tests {
    use super::*;

    const VP9_OPUS_OUTPUT: &str = "Input #0, matroska,webm, from 'a.webm':\n  Duration: 00:01:02.50, start: 0.000000, bitrate: 939 kb/s\n  Stream #0:0: Video: vp9 (Profile 0), yuv420p(tv, progressive), 1280x720, 30 fps\n  Stream #0:1: Audio: opus, 48000 Hz, mono, fltp\n";
    const H264_AAC_OUTPUT: &str = "  Duration: 00:00:10.00, start: 0.0\n  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p, 1280x720\n  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz\n";

    #[test]
    fn parses_codecs_and_duration() {
        let info = parse_media_info(VP9_OPUS_OUTPUT);
        assert_eq!(info.video_codec.as_deref(), Some("vp9"));
        assert_eq!(info.audio_codec.as_deref(), Some("opus"));
        assert_eq!(info.duration_secs, Some(62.5));
    }

    #[test]
    fn ignores_embedded_cover_art_stream() {
        let output = "  Duration: 00:03:00.00\n  Stream #0:0: Audio: mp3\n  Stream #0:1: Video: mjpeg, yuvj420p, 500x500\n";
        let info = parse_media_info(output);
        assert_eq!(info.video_codec, None);
        assert!(!needs_conversion(&info));
    }

    #[test]
    fn vp9_av1_and_opus_need_conversion() {
        assert!(needs_conversion(&parse_media_info(VP9_OPUS_OUTPUT)));
        let av1 = "  Stream #0:0: Video: av1 (libdav1d), yuv420p10le\n  Stream #0:1: Audio: aac\n";
        assert!(needs_conversion(&parse_media_info(av1)));
        let h264_opus = "  Stream #0:0: Video: h264 (High)\n  Stream #0:1: Audio: opus\n";
        assert!(needs_conversion(&parse_media_info(h264_opus)));
    }

    #[test]
    fn ignores_codec_words_inside_metadata() {
        let output = "  Metadata:\n    title           : Audio: Opus mix\n  Duration: 00:00:10.00\n  Stream #0:0: Video: h264 (High), yuv420p\n  Stream #0:1: Audio: aac (LC)\n";
        let info = parse_media_info(output);
        assert_eq!(info.audio_codec.as_deref(), Some("aac"));
        assert!(!needs_conversion(&info));
    }

    #[test]
    fn h264_aac_does_not_need_conversion() {
        assert!(!needs_conversion(&parse_media_info(H264_AAC_OUTPUT)));
    }

    #[test]
    fn parses_progress_time_in_seconds() {
        assert_eq!(parse_out_time_secs("out_time_us=6013500"), Some(6.0135));
        assert_eq!(parse_out_time_secs("out_time_us=N/A"), None);
        assert_eq!(parse_out_time_secs("progress=end"), None);
    }

    #[test]
    fn conversion_args_pick_first_streams_and_force_yuv420p() {
        let args = conversion_args("in.webm", "out.mp4", Encoder::Nvenc);
        let joined = args.join(" ");
        assert!(joined.contains("-i in.webm"));
        assert!(joined.contains("-map 0:v:0 -map 0:a:0?"));
        assert!(joined.contains("-c:v h264_nvenc"));
        assert!(joined.contains("-pix_fmt yuv420p"));
        assert_eq!(args.last().map(String::as_str), Some("out.mp4"));
    }

    #[test]
    fn converted_path_sits_next_to_original() {
        let path = converted_path_for(Path::new("/nonexistent-dir/My Video.webm"));
        assert_eq!(path, PathBuf::from("/nonexistent-dir/My Video (H.264).mp4"));
    }

    #[test]
    fn last_error_line_skips_trailing_blank_lines() {
        assert_eq!(last_error_line("a\nboom: bad\n\n"), "boom: bad");
        assert_eq!(last_error_line(""), "Falha na conversão");
    }
}
