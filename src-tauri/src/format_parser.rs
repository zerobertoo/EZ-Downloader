use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct YtdlpFormat {
    pub format_id: Option<String>,
    pub ext: Option<String>,
    pub height: Option<i64>,
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

/// Formato de vídeo é sempre um seletor genérico por altura (`bv*[height<=H]+ba/b`),
/// nunca um format_id específico: os ids do YouTube variam por cliente/codec/
/// disponibilidade (ex: 137, 399), então travar num id concreto quebra assim que
/// o YouTube deixa de oferecer aquele stream para o cliente que o yt-dlp escolher.
/// O seletor também garante vídeo+áudio sempre juntos — um format_id de vídeo puro
/// (sem áudio) baixado sozinho gerava arquivo mudo.
fn resolution_option(height: i64) -> FormatOption {
    FormatOption {
        id: format!("bv*[height<={height}]+ba/b"),
        kind: "combined".to_string(),
        label: format!("MP4 - {height}p (Vídeo + Áudio)"),
        ext: "mp4".to_string(),
        height: Some(height),
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

    let mut heights: Vec<i64> = Vec::new();
    let mut audio: Vec<(String, FormatOption)> = Vec::new();

    for f in formats {
        let Some(format_id) = &f.format_id else {
            continue;
        };
        let vcodec = f.vcodec.as_deref().unwrap_or("none");
        let acodec = f.acodec.as_deref().unwrap_or("none");

        if vcodec != "none" {
            if let Some(height) = f.height {
                if height > 0 && !heights.contains(&height) {
                    heights.push(height);
                }
            }
        } else if acodec != "none" {
            let ext = f.ext.clone().unwrap_or_else(|| "m4a".to_string());
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

    heights.sort_unstable_by(|a, b| b.cmp(a));

    let mut result = vec![best_option()];
    result.extend(heights.into_iter().map(resolution_option));
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
    if stderr.contains("HTTP Error 403") {
        return "O YouTube bloqueou este download (Erro 403). O app já tenta de novo automaticamente usando os cookies do Chrome; se persistir, faça login no YouTube pelo Chrome e tente de novo.".to_string();
    }
    if stderr.contains("nsig extraction failed")
        || stderr.contains("Unable to obtain nsig")
        || stderr.contains("Some formats are possibly damaged")
    {
        return "Falha ao resolver o desafio de segurança do YouTube (assinatura). Verifique sua conexão com a internet — o resolvedor é baixado automaticamente na primeira execução — e tente novamente.".to_string();
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
    fn deduplicates_combined_and_video_only_formats_at_the_same_height() {
        // 22 (combined) and 137/399 (video-only, different codecs) all sit at
        // 1080p — should collapse into a single generic resolution entry, not
        // one per underlying format_id/codec.
        let formats = vec![
            combined_format("22", "mp4", 720),
            video_format("137", "mp4", 1080),
            video_format("399", "mp4", 1080),
        ];
        let result = parse_formats(&info_with(formats));
        let combined: Vec<_> = result.iter().filter(|f| f.kind == "combined").collect();
        assert_eq!(combined.len(), 2);
    }

    #[test]
    fn resolution_entries_use_a_generic_height_capped_selector_not_a_specific_format_id() {
        // Regression: picking a raw video-only format_id (e.g. "137") downloads
        // video with no audio track, and hardcoding ids breaks once YouTube
        // stops offering that exact id for the client yt-dlp picks.
        let result = parse_formats(&info_with(vec![video_format("137", "mp4", 1080)]));
        let entry = result.iter().find(|f| f.height == Some(1080)).unwrap();
        assert_eq!(entry.id, "bv*[height<=1080]+ba/b");
        assert_eq!(entry.kind, "combined");
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
    fn orders_best_then_resolutions_descending_then_audio() {
        let formats = vec![
            audio_format("140", "m4a", 128.0),
            video_format("248", "webm", 1080),
            combined_format("22", "mp4", 720),
        ];
        let result = parse_formats(&info_with(formats));
        let kinds: Vec<_> = result.iter().map(|f| f.kind.as_str()).collect();
        assert_eq!(kinds[0], "best");
        let combined_idx = kinds.iter().position(|k| *k == "combined").unwrap();
        let audio_idx = kinds.iter().position(|k| *k == "audio").unwrap();
        assert!(combined_idx < audio_idx);
        assert_eq!(result[1].height, Some(1080));
        assert_eq!(result[2].height, Some(720));
    }

    #[test]
    fn skips_formats_without_format_id() {
        let mut no_id = combined_format("22", "mp4", 720);
        no_id.format_id = None;
        let formats = vec![no_id];
        let result = parse_formats(&info_with(formats));
        let combined: Vec<_> = result.iter().filter(|f| f.kind == "combined").collect();
        assert_eq!(combined.len(), 0);
    }

    #[test]
    fn skips_video_formats_with_null_or_zero_height() {
        let mut format = combined_format("22", "mp4", 720);
        format.height = None;
        let result = parse_formats(&info_with(vec![format]));
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].id, "best");
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
    fn classifies_http_403() {
        let msg =
            classify_ytdlp_error("ERROR: unable to download video data: HTTP Error 403: Forbidden");
        assert!(msg.contains("403"));
    }

    #[test]
    fn classifies_nsig_failure() {
        assert!(
            classify_ytdlp_error("ERROR: [youtube] Unable to obtain nsig").contains("segurança")
        );
    }

    #[test]
    fn returns_generic_message_for_unknown_errors() {
        let msg = classify_ytdlp_error("something completely unknown");
        assert!(!msg.is_empty());
    }
}
