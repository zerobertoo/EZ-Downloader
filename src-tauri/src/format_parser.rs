use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct YtdlpFormat {
    pub format_id: Option<String>,
    pub ext: Option<String>,
    pub height: Option<i64>,
    pub width: Option<i64>,
    pub fps: Option<f64>,
    pub vcodec: Option<String>,
    pub acodec: Option<String>,
    pub filesize: Option<i64>,
    pub abr: Option<f64>,
}

#[derive(Debug, Deserialize)]
pub struct YtdlpInfo {
    pub title: Option<String>,
    pub thumbnail: Option<String>,
    pub uploader: Option<String>,
    pub channel: Option<String>,
    pub formats: Option<Vec<YtdlpFormat>>,
}

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FormatOption {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub label: String,
    pub ext: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub height: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fps: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub abr: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filesize: Option<i64>,
}

fn best_option() -> FormatOption {
    FormatOption {
        id: "best".to_string(),
        kind: "best".to_string(),
        label: "Melhor Qualidade (Automático)".to_string(),
        ext: "mp4".to_string(),
        height: None,
        width: None,
        fps: None,
        abr: None,
        filesize: None,
    }
}

pub fn parse_formats(info: &YtdlpInfo) -> Vec<FormatOption> {
    let formats = match &info.formats {
        Some(f) if !f.is_empty() => f,
        _ => return vec![best_option()],
    };

    let mut combined: Vec<(String, FormatOption)> = Vec::new();
    let mut video: Vec<(String, FormatOption)> = Vec::new();
    let mut audio: Vec<(String, FormatOption)> = Vec::new();

    for f in formats {
        let Some(format_id) = &f.format_id else {
            continue;
        };
        let vcodec = f.vcodec.as_deref().unwrap_or("none");
        let acodec = f.acodec.as_deref().unwrap_or("none");
        let ext = f.ext.clone().unwrap_or_else(|| "mp4".to_string());
        let height = f.height.unwrap_or(0);

        if vcodec != "none" && acodec != "none" {
            let key = format!("{ext}-{height}p");
            if !combined.iter().any(|(k, _)| k == &key) {
                combined.push((
                    key,
                    FormatOption {
                        id: format_id.clone(),
                        kind: "combined".to_string(),
                        label: format!("{} - {}p (Vídeo + Áudio)", ext.to_uppercase(), height),
                        ext,
                        height: Some(height),
                        width: f.width,
                        fps: f.fps,
                        abr: None,
                        filesize: f.filesize,
                    },
                ));
            }
        } else if vcodec != "none" && acodec == "none" {
            let key = format!("{ext}-{height}p");
            if !video.iter().any(|(k, _)| k == &key) {
                video.push((
                    key,
                    FormatOption {
                        id: format_id.clone(),
                        kind: "video".to_string(),
                        label: format!("{} - {}p (Vídeo)", ext.to_uppercase(), height),
                        ext,
                        height: Some(height),
                        width: f.width,
                        fps: f.fps,
                        abr: None,
                        filesize: f.filesize,
                    },
                ));
            }
        } else if acodec != "none" && vcodec == "none" {
            let abr_key = f
                .abr
                .map(|a| a.to_string())
                .unwrap_or_else(|| "unknown".to_string());
            let key = format!("{ext}-{abr_key}");
            if !audio.iter().any(|(k, _)| k == &key) {
                let abr_label = f
                    .abr
                    .map(|a| a.to_string())
                    .unwrap_or_else(|| "Unknown".to_string());
                audio.push((
                    key,
                    FormatOption {
                        id: format_id.clone(),
                        kind: "audio".to_string(),
                        label: format!("{} - {} kbps (Áudio)", ext.to_uppercase(), abr_label),
                        ext,
                        height: None,
                        width: None,
                        fps: None,
                        abr: f.abr,
                        filesize: f.filesize,
                    },
                ));
            }
        }
    }

    let mut result = vec![best_option()];
    result.extend(combined.into_iter().map(|(_, v)| v));
    result.extend(video.into_iter().map(|(_, v)| v));
    result.extend(audio.into_iter().map(|(_, v)| v));
    result
}

pub fn classify_ytdlp_error(stderr: &str) -> String {
    if stderr.contains("Video unavailable") {
        return "Vídeo indisponível ou privado.".to_string();
    }
    if stderr.contains("Sign in") {
        return "Este conteúdo requer autenticação.".to_string();
    }
    if stderr.contains("not installed") {
        return "Erro ao processar o vídeo: ffmpeg não encontrado.".to_string();
    }
    if stderr.contains("Unable to extract") {
        return "Não foi possível processar a URL.".to_string();
    }
    if stderr.contains("HTTP Error 429") {
        return "Muitas requisições. Aguarde e tente novamente.".to_string();
    }
    if stderr.contains("is not a valid URL") {
        return "URL inválida ou não suportada.".to_string();
    }
    "Erro ao processar o vídeo. Verifique a URL e tente novamente.".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn combined_format(id: &str, ext: &str, height: i64) -> YtdlpFormat {
        YtdlpFormat {
            format_id: Some(id.to_string()),
            ext: Some(ext.to_string()),
            height: Some(height),
            width: Some(height * 16 / 9),
            fps: Some(30.0),
            vcodec: Some("avc1".to_string()),
            acodec: Some("mp4a".to_string()),
            filesize: Some(50_000_000),
            abr: None,
        }
    }

    fn video_format(id: &str, ext: &str, height: i64) -> YtdlpFormat {
        YtdlpFormat {
            format_id: Some(id.to_string()),
            ext: Some(ext.to_string()),
            height: Some(height),
            width: Some(height * 16 / 9),
            fps: Some(30.0),
            vcodec: Some("vp9".to_string()),
            acodec: Some("none".to_string()),
            filesize: Some(40_000_000),
            abr: None,
        }
    }

    fn audio_format(id: &str, ext: &str, abr: f64) -> YtdlpFormat {
        YtdlpFormat {
            format_id: Some(id.to_string()),
            ext: Some(ext.to_string()),
            height: None,
            width: None,
            fps: None,
            vcodec: Some("none".to_string()),
            acodec: Some("opus".to_string()),
            filesize: Some(5_000_000),
            abr: Some(abr),
        }
    }

    fn info_with(formats: Vec<YtdlpFormat>) -> YtdlpInfo {
        YtdlpInfo {
            title: None,
            thumbnail: None,
            uploader: None,
            channel: None,
            formats: Some(formats),
        }
    }

    #[test]
    fn prepends_best_option_when_formats_exist() {
        let result = parse_formats(&info_with(vec![combined_format("22", "mp4", 720)]));
        assert_eq!(result[0].id, "best");
        assert_eq!(result[0].kind, "best");
    }

    #[test]
    fn returns_only_best_when_formats_array_is_empty() {
        let result = parse_formats(&info_with(vec![]));
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].id, "best");
    }

    #[test]
    fn returns_only_best_when_formats_key_is_absent() {
        let info = YtdlpInfo {
            title: None,
            thumbnail: None,
            uploader: None,
            channel: None,
            formats: None,
        };
        let result = parse_formats(&info);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].id, "best");
    }

    #[test]
    fn deduplicates_combined_formats_by_ext_and_resolution() {
        let formats = vec![
            combined_format("22", "mp4", 720),
            combined_format("23", "mp4", 720),
            combined_format("137", "mp4", 1080),
        ];
        let result = parse_formats(&info_with(formats));
        let combined: Vec<_> = result.iter().filter(|f| f.kind == "combined").collect();
        assert_eq!(combined.len(), 2);
    }

    #[test]
    fn deduplicates_video_only_formats_by_ext_and_resolution() {
        let formats = vec![
            video_format("248", "webm", 1080),
            video_format("249", "webm", 1080),
        ];
        let result = parse_formats(&info_with(formats));
        let videos: Vec<_> = result.iter().filter(|f| f.kind == "video").collect();
        assert_eq!(videos.len(), 1);
    }

    #[test]
    fn deduplicates_audio_formats_by_ext_and_bitrate() {
        let formats = vec![
            audio_format("140", "m4a", 128.0),
            audio_format("141", "m4a", 128.0),
        ];
        let result = parse_formats(&info_with(formats));
        let audio: Vec<_> = result.iter().filter(|f| f.kind == "audio").collect();
        assert_eq!(audio.len(), 1);
    }

    #[test]
    fn orders_best_combined_video_audio() {
        let formats = vec![
            audio_format("140", "m4a", 128.0),
            video_format("248", "webm", 1080),
            combined_format("22", "mp4", 720),
        ];
        let result = parse_formats(&info_with(formats));
        let kinds: Vec<_> = result.iter().map(|f| f.kind.as_str()).collect();
        assert_eq!(kinds[0], "best");
        let combined_idx = kinds.iter().position(|k| *k == "combined").unwrap();
        let video_idx = kinds.iter().position(|k| *k == "video").unwrap();
        let audio_idx = kinds.iter().position(|k| *k == "audio").unwrap();
        assert!(combined_idx < video_idx);
        assert!(video_idx < audio_idx);
    }

    #[test]
    fn includes_filesize_in_format_objects() {
        let result = parse_formats(&info_with(vec![combined_format("22", "mp4", 720)]));
        let combined = result.iter().find(|f| f.kind == "combined").unwrap();
        assert_eq!(combined.filesize, Some(50_000_000));
    }

    #[test]
    fn skips_formats_without_format_id() {
        let mut no_id = combined_format("22", "mp4", 720);
        no_id.format_id = None;
        let formats = vec![no_id, combined_format("22", "mp4", 720)];
        let result = parse_formats(&info_with(formats));
        let combined: Vec<_> = result.iter().filter(|f| f.kind == "combined").collect();
        assert_eq!(combined.len(), 1);
    }

    #[test]
    fn uses_zero_height_fallback_when_height_is_null() {
        let mut format = combined_format("22", "mp4", 720);
        format.height = None;
        let result = parse_formats(&info_with(vec![format]));
        let combined = result.iter().find(|f| f.kind == "combined").unwrap();
        assert_eq!(combined.height, Some(0));
    }

    #[test]
    fn classifies_unavailable_video() {
        assert!(classify_ytdlp_error("Video unavailable").contains("indisponível"));
    }

    #[test]
    fn classifies_auth_required() {
        assert!(classify_ytdlp_error("Sign in to confirm your age").contains("autenticação"));
    }

    #[test]
    fn classifies_missing_ffmpeg() {
        assert!(classify_ytdlp_error("ffmpeg not installed").contains("ffmpeg"));
    }

    #[test]
    fn classifies_rate_limit() {
        assert!(classify_ytdlp_error("HTTP Error 429: Too Many Requests")
            .contains("Muitas requisições"));
    }

    #[test]
    fn classifies_invalid_url() {
        assert!(classify_ytdlp_error("is not a valid URL").contains("URL inválida"));
    }

    #[test]
    fn classifies_unable_to_extract() {
        assert!(classify_ytdlp_error("Unable to extract video data").contains("processar"));
    }

    #[test]
    fn returns_generic_message_for_unknown_errors() {
        let msg = classify_ytdlp_error("something completely unknown");
        assert!(!msg.is_empty());
    }
}
