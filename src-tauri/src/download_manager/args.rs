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
pub(super) fn validate_extra_args(raw: &str) -> Result<Vec<String>, String> {
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

pub(super) fn section_arg(start: &str, end: &str) -> Vec<String> {
    vec!["--download-sections".to_string(), format!("*{start}-{end}")]
}

pub(super) fn subtitles_args(langs: &str) -> Vec<String> {
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

pub(super) fn cookies_browser_args(browser: &str) -> Result<Vec<String>, String> {
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

pub(super) fn limit_rate_args(raw: &str) -> Result<Vec<String>, String> {
    Ok(vec!["--limit-rate".to_string(), validate_limit_rate(raw)?])
}

/// Aceita só host:porta com esquema conhecido. Credenciais (`user:senha@`) são
/// recusadas porque a URL do proxy é gravada em texto puro na fila.
pub(super) fn validate_proxy(raw: &str) -> Result<String, String> {
    let raw = raw.trim();
    let parsed = url::Url::parse(raw).map_err(|_| format!("Proxy inválido: {raw}"))?;
    if !matches!(
        parsed.scheme(),
        "http" | "https" | "socks4" | "socks4a" | "socks5" | "socks5h"
    ) {
        return Err(format!(
            "Esquema de proxy não suportado: {}",
            parsed.scheme()
        ));
    }
    if parsed.host_str().is_none() {
        return Err(format!("Proxy sem host: {raw}"));
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("Proxy com usuário e senha não é suportado: as credenciais seriam gravadas em texto puro".to_string());
    }
    Ok(raw.to_string())
}

pub(super) fn sponsorblock_args(mode: &str) -> Result<Vec<String>, String> {
    let flag = match mode {
        "remove" => "--sponsorblock-remove",
        "mark" => "--sponsorblock-mark",
        _ => return Err(format!("Modo de SponsorBlock inválido: {mode}")),
    };
    Ok(vec![
        flag.to_string(),
        "sponsor,selfpromo,interaction".to_string(),
    ])
}

/// Args de seleção pro Modo Rápido — sem chamada prévia de metadados,
/// direto na melhor qualidade disponível pro formato escolhido.
pub(super) fn quick_download_args(mode: &str) -> Vec<String> {
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

pub(super) fn push_ejs_args(args: &mut Vec<String>, qjs_bin: Option<&str>) {
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
pub(super) fn is_unrecognized_remote_components_error(stderr: &str) -> bool {
    (stderr.contains("unrecognized arguments") && stderr.contains("--remote-components"))
        || (stderr.contains("unrecognized arguments") && stderr.contains(JS_RUNTIME_FLAG))
}

pub(super) fn without_remote_components(args: &[String]) -> Vec<String> {
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

#[cfg(test)]
mod tests {
    use super::*;

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
    fn proxy_accepts_known_schemes_and_rejects_credentials() {
        assert!(validate_proxy("http://127.0.0.1:8080").is_ok());
        assert!(validate_proxy("socks5://proxy.local:1080").is_ok());
        assert!(validate_proxy("http://user:pass@host:8080").is_err());
        assert!(validate_proxy("http://user@host:8080").is_err());
        assert!(validate_proxy("ftp://host:21").is_err());
        assert!(validate_proxy("not a url").is_err());
    }

    #[test]
    fn sponsorblock_modes_map_to_flags_and_reject_unknown() {
        assert_eq!(
            sponsorblock_args("remove").unwrap()[0],
            "--sponsorblock-remove"
        );
        assert_eq!(sponsorblock_args("mark").unwrap()[0], "--sponsorblock-mark");
        assert!(sponsorblock_args("all").is_err());
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

    #[test]
    fn cookies_browser_args_accepts_every_allowed_browser() {
        for browser in ALLOWED_COOKIE_BROWSERS {
            assert_eq!(
                cookies_browser_args(browser).unwrap(),
                vec!["--cookies-from-browser".to_string(), browser.to_string()]
            );
        }
    }

    #[test]
    fn cookies_browser_args_rejects_unknown_browser_and_injection() {
        assert!(cookies_browser_args("netscape").is_err());
        assert!(cookies_browser_args("").is_err());
        assert!(cookies_browser_args("chrome:/tmp/perfil").is_err());
        assert!(cookies_browser_args("--exec").is_err());
    }
}
