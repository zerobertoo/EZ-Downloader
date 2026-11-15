use std::collections::HashSet;
use url::Url;

const GENERIC_TRACKING_PARAMS: &[&str] = &["fbclid", "gclid", "igshid", "mc_cid", "mc_eid", "ref_src"];

// No YouTube estes parâmetros mudam a URL sem mudar o vídeo; em outros sites
// "t" ou "index" podem identificar o conteúdo, então só caem aqui.
const YOUTUBE_NOISE_PARAMS: &[&str] = &["si", "feature", "pp", "t", "start", "index", "ab_channel"];

const YOUTUBE_VIDEO_PATH_PREFIXES: &[&str] = &["/shorts/", "/embed/", "/live/"];

fn is_youtube_host(host: &str) -> bool {
    host == "youtube.com" || host.ends_with(".youtube.com")
}

/// Reduz a URL a uma forma canônica só para comparação (nunca para baixar):
/// ignora esquema, "www.", fragmento, barra final, rastreadores e a ordem dos
/// parâmetros, e unifica `youtu.be`, `/shorts/` e `/embed/` com `/watch?v=`.
/// URL que não parseia volta só aparada e em minúsculas.
pub fn normalize_url(raw: &str) -> String {
    let trimmed = raw.trim();
    let Ok(parsed) = Url::parse(trimmed) else {
        return trimmed.to_lowercase();
    };
    let Some(host) = parsed.host_str() else {
        return trimmed.to_lowercase();
    };

    let mut host = host.trim_start_matches("www.").to_string();
    // Porta diferente é outro servidor, não o mesmo conteúdo.
    if let Some(port) = parsed.port() {
        host = format!("{host}:{port}");
    }
    let mut path = parsed.path().to_string();
    let mut params: Vec<(String, String)> = parsed
        .query_pairs()
        .map(|(key, value)| (key.into_owned(), value.into_owned()))
        .collect();

    let is_short_link = host == "youtu.be";
    let is_youtube = is_short_link || is_youtube_host(&host);
    if is_youtube {
        let video_id = if is_short_link {
            Some(path.trim_matches('/').to_string())
        } else {
            YOUTUBE_VIDEO_PATH_PREFIXES
                .iter()
                .find_map(|prefix| path.strip_prefix(prefix))
                .map(|id| id.trim_end_matches('/').to_string())
        };
        host = "youtube.com".to_string();
        if let Some(id) = video_id {
            path = "/watch".to_string();
            params.push(("v".to_string(), id));
        }
    }

    params.retain(|(key, _)| {
        !key.starts_with("utm_")
            && !GENERIC_TRACKING_PARAMS.contains(&key.as_str())
            && !(is_youtube && YOUTUBE_NOISE_PARAMS.contains(&key.as_str()))
    });
    params.sort();

    let path = if path.len() > 1 {
        path.trim_end_matches('/').to_string()
    } else {
        path
    };
    let query = params
        .iter()
        .map(|(key, value)| format!("{key}={value}"))
        .collect::<Vec<_>>()
        .join("&");
    if query.is_empty() {
        format!("{host}{path}")
    } else {
        format!("{host}{path}?{query}")
    }
}

/// Posições dos candidatos que já estão em `known_urls` ou que repetem um
/// candidato anterior do próprio lote (a primeira ocorrência nunca conta).
/// Devolve posições, não textos: o mesmo link colado duas vezes seria ambíguo.
pub fn duplicate_positions(candidates: &[String], known_urls: &[String]) -> Vec<usize> {
    let mut seen: HashSet<String> = known_urls.iter().map(|url| normalize_url(url)).collect();
    candidates
        .iter()
        .enumerate()
        .filter(|(_, candidate)| !seen.insert(normalize_url(candidate)))
        .map(|(position, _)| position)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn strings(values: &[&str]) -> Vec<String> {
        values.iter().map(|v| v.to_string()).collect()
    }

    #[test]
    fn youtube_short_link_and_watch_url_are_the_same_video() {
        assert_eq!(
            normalize_url("https://youtu.be/abc123"),
            normalize_url("https://www.youtube.com/watch?v=abc123")
        );
    }

    #[test]
    fn youtube_shorts_embed_and_mobile_hosts_are_unified() {
        let canonical = normalize_url("https://www.youtube.com/watch?v=abc123");
        assert_eq!(normalize_url("https://youtube.com/shorts/abc123"), canonical);
        assert_eq!(normalize_url("https://www.youtube.com/embed/abc123"), canonical);
        assert_eq!(normalize_url("https://m.youtube.com/watch?v=abc123"), canonical);
        assert_eq!(normalize_url("https://music.youtube.com/watch?v=abc123"), canonical);
    }

    #[test]
    fn tracking_params_timestamps_and_fragments_are_ignored() {
        assert_eq!(
            normalize_url("https://youtu.be/abc123?si=XYZ&t=42"),
            normalize_url("https://www.youtube.com/watch?v=abc123&feature=shared#comments")
        );
        assert_eq!(
            normalize_url("https://example.com/video/1?utm_source=a&fbclid=b"),
            normalize_url("https://example.com/video/1")
        );
    }

    #[test]
    fn different_videos_stay_different() {
        assert_ne!(
            normalize_url("https://youtube.com/watch?v=aaa"),
            normalize_url("https://youtube.com/watch?v=bbb")
        );
    }

    #[test]
    fn video_inside_a_playlist_differs_from_the_standalone_video() {
        assert_ne!(
            normalize_url("https://youtube.com/watch?v=aaa&list=PL1"),
            normalize_url("https://youtube.com/watch?v=aaa")
        );
    }

    #[test]
    fn scheme_case_of_host_trailing_slash_and_param_order_are_ignored() {
        assert_eq!(
            normalize_url("http://Example.com/a/b/?y=2&x=1"),
            normalize_url("https://www.example.com/a/b?x=1&y=2")
        );
    }

    #[test]
    fn non_youtube_sites_keep_params_that_may_identify_content() {
        assert_ne!(
            normalize_url("https://example.com/watch?id=1&t=5"),
            normalize_url("https://example.com/watch?id=1")
        );
    }

    #[test]
    fn different_ports_are_different_servers_but_default_ports_are_not() {
        assert_ne!(
            normalize_url("http://localhost:8080/v/1"),
            normalize_url("http://localhost:9090/v/1")
        );
        assert_eq!(
            normalize_url("https://example.com:443/a"),
            normalize_url("https://example.com/a")
        );
    }

    #[test]
    fn path_case_is_preserved_because_ids_are_case_sensitive() {
        assert_ne!(
            normalize_url("https://example.com/Abc"),
            normalize_url("https://example.com/abc")
        );
    }

    #[test]
    fn unparseable_input_falls_back_to_trimmed_lowercase() {
        assert_eq!(normalize_url("  Not A Url  "), "not a url");
    }

    #[test]
    fn duplicate_positions_flags_known_urls_in_different_spellings() {
        let known = strings(&["https://www.youtube.com/watch?v=abc123"]);
        let candidates = strings(&["https://youtu.be/abc123?si=x", "https://youtu.be/other"]);
        assert_eq!(duplicate_positions(&candidates, &known), vec![0]);
    }

    #[test]
    fn duplicate_positions_flags_repeats_inside_the_same_batch() {
        let candidates = strings(&[
            "https://example.com/a",
            "https://example.com/b",
            "https://www.example.com/a/",
        ]);
        assert_eq!(duplicate_positions(&candidates, &[]), vec![2]);
    }

    #[test]
    fn identical_links_in_one_batch_keep_the_first_occurrence() {
        let candidates = strings(&["https://example.com/a", "https://example.com/a"]);
        assert_eq!(duplicate_positions(&candidates, &[]), vec![1]);
    }

    #[test]
    fn duplicate_positions_is_empty_when_everything_is_new() {
        let candidates = strings(&["https://example.com/a", "https://example.com/b"]);
        assert!(duplicate_positions(&candidates, &strings(&["https://example.com/c"])).is_empty());
    }
}
