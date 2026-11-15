use serde::{Deserialize, Serialize};

// Saída de `yt-dlp --flat-playlist --dump-single-json`: entradas indisponíveis
// podem vir como `null` e campos opcionais variam por site.
#[derive(Debug, Deserialize)]
struct FlatPlaylist {
    title: Option<String>,
    duration: Option<f64>,
    entries: Option<Vec<Option<FlatEntry>>>,
}

#[derive(Debug, Deserialize)]
struct FlatEntry {
    url: Option<String>,
    webpage_url: Option<String>,
    title: Option<String>,
    duration: Option<f64>,
}

#[derive(Debug, Serialize, PartialEq)]
pub struct PlaylistItem {
    pub url: String,
    pub title: Option<String>,
    #[serde(rename = "durationSeconds")]
    pub duration_seconds: Option<u64>,
}

#[derive(Debug, Serialize, PartialEq)]
pub struct PlaylistResult {
    pub title: Option<String>,
    pub items: Vec<PlaylistItem>,
}

fn whole_seconds(duration: Option<f64>) -> Option<u64> {
    duration
        .filter(|seconds| *seconds >= 0.0)
        .map(|seconds| seconds as u64)
}

/// Entradas sem URL http(s) utilizável são descartadas: sem ela não há o que
/// enfileirar (alguns extratores devolvem só o id no modo flat).
///
/// A detecção de playlist no frontend é heurística: se o yt-dlp resolver o link
/// como um vídeo único (sem `entries`), ele vira o único item, em vez de uma
/// playlist vazia que impediria o download.
pub fn parse_playlist(json: &str, source_url: &str) -> Result<PlaylistResult, String> {
    let playlist: FlatPlaylist =
        serde_json::from_str(json).map_err(|e| format!("Erro ao processar a playlist: {e}"))?;
    let Some(entries) = playlist.entries else {
        return Ok(PlaylistResult {
            items: vec![PlaylistItem {
                url: source_url.to_string(),
                title: playlist.title.clone(),
                duration_seconds: whole_seconds(playlist.duration),
            }],
            title: playlist.title,
        });
    };
    let items = entries
        .into_iter()
        .flatten()
        .filter_map(|entry| {
            let url = [entry.url, entry.webpage_url]
                .into_iter()
                .flatten()
                .find(|candidate| candidate.starts_with("http"))?;
            Some(PlaylistItem {
                url,
                title: entry.title,
                duration_seconds: whole_seconds(entry.duration),
            })
        })
        .collect();
    Ok(PlaylistResult {
        title: playlist.title,
        items,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const SOURCE: &str = "https://example.com/source";

    #[test]
    fn parses_title_and_items_with_rounded_down_duration() {
        let json = r#"{
            "title": "Minha lista",
            "entries": [
                {"url": "https://youtube.com/watch?v=a", "title": "Um", "duration": 61.9},
                {"url": "https://youtube.com/watch?v=b", "title": "Dois", "duration": null}
            ]
        }"#;
        let result = parse_playlist(json, SOURCE).unwrap();
        assert_eq!(result.title.as_deref(), Some("Minha lista"));
        assert_eq!(
            result.items,
            vec![
                PlaylistItem {
                    url: "https://youtube.com/watch?v=a".to_string(),
                    title: Some("Um".to_string()),
                    duration_seconds: Some(61),
                },
                PlaylistItem {
                    url: "https://youtube.com/watch?v=b".to_string(),
                    title: Some("Dois".to_string()),
                    duration_seconds: None,
                },
            ]
        );
    }

    #[test]
    fn skips_null_entries_and_entries_without_a_usable_url() {
        let json = r#"{"entries": [
            null,
            {"url": "dQw4w9WgXcQ", "title": "só id"},
            {"title": "sem nada"},
            {"url": "https://example.com/ok", "title": "ok"}
        ]}"#;
        let result = parse_playlist(json, SOURCE).unwrap();
        assert_eq!(result.items.len(), 1);
        assert_eq!(result.items[0].url, "https://example.com/ok");
    }

    #[test]
    fn falls_back_to_webpage_url_when_url_is_not_http() {
        let json = r#"{"entries": [
            {"url": "abc", "webpage_url": "https://example.com/watch/abc"}
        ]}"#;
        let result = parse_playlist(json, SOURCE).unwrap();
        assert_eq!(result.items[0].url, "https://example.com/watch/abc");
    }

    #[test]
    fn single_video_result_becomes_one_item_with_the_source_url() {
        let json = r#"{"title": "Vídeo único", "duration": 90.5}"#;
        let result = parse_playlist(json, SOURCE).unwrap();
        assert_eq!(
            result.items,
            vec![PlaylistItem {
                url: SOURCE.to_string(),
                title: Some("Vídeo único".to_string()),
                duration_seconds: Some(90),
            }]
        );
    }

    #[test]
    fn playlist_with_empty_entries_stays_empty() {
        let result = parse_playlist(r#"{"title": "vazia", "entries": []}"#, SOURCE).unwrap();
        assert!(result.items.is_empty());
    }

    #[test]
    fn negative_duration_is_dropped() {
        let json = r#"{"entries": [{"url": "https://example.com/a", "duration": -1}]}"#;
        assert_eq!(
            parse_playlist(json, SOURCE).unwrap().items[0].duration_seconds,
            None
        );
    }

    #[test]
    fn invalid_json_is_an_error() {
        assert!(parse_playlist("not json", SOURCE).is_err());
    }
}
