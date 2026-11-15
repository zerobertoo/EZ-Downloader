use super::args::{cookies_browser_args, push_ejs_args};
use super::process::run_probe;
use super::{DownloadManager, FormatsResult};
use crate::format_parser::{classify_ytdlp_error, parse_formats, YtdlpInfo};
use crate::playlist::{parse_playlist, PlaylistResult};
use std::time::Duration;

const FORMATS_PROBE_TIMEOUT: Duration = Duration::from_secs(30);
// Playlists grandes levam bem mais que um vídeo só pra listar.
const PLAYLIST_PROBE_TIMEOUT: Duration = Duration::from_secs(120);

impl DownloadManager {
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
}
