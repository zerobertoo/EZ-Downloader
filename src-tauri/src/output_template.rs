/// Campos do yt-dlp que o usuário pode usar no template, no formato `{campo}`.
const ALLOWED_FIELDS: &[(&str, &str)] = &[
    ("title", "title"),
    ("uploader", "uploader"),
    ("channel", "channel"),
    ("date", "upload_date"),
    ("year", "upload_date>%Y"),
    ("id", "id"),
    ("playlist", "playlist_title|Sem playlist"),
    ("index", "playlist_index|"),
    ("resolution", "resolution"),
];

pub const DEFAULT_TEMPLATE: &str = "{title}";
const MAX_TEMPLATE_LENGTH: usize = 200;
const FORBIDDEN_LITERAL_CHARS: &[char] = &['<', '>', ':', '"', '|', '?', '*'];

/// Converte o template do usuário (`{uploader}/{title}`) no template do yt-dlp
/// (`%(uploader)s/%(title)s`), relativo à pasta de destino. Rejeita qualquer
/// coisa que possa escapar dessa pasta: caminho absoluto, `..`, unidade de
/// disco e caracteres inválidos em nomes de arquivo.
pub fn to_ytdlp_template(user_template: &str) -> Result<String, String> {
    let template = user_template.trim();
    if template.is_empty() {
        return Err("O template de nome não pode ser vazio".to_string());
    }
    if template.chars().count() > MAX_TEMPLATE_LENGTH {
        return Err("O template de nome é longo demais".to_string());
    }
    if template.starts_with('/') || template.starts_with('\\') {
        return Err("O template não pode ser um caminho absoluto".to_string());
    }

    let mut segments = Vec::new();
    for segment in template.split(['/', '\\']) {
        segments.push(convert_segment(segment)?);
    }
    Ok(segments.join("/"))
}

fn convert_segment(segment: &str) -> Result<String, String> {
    if segment.trim().is_empty() {
        return Err("O template tem uma pasta vazia".to_string());
    }
    if segment.trim_matches('.').is_empty() {
        return Err("O template não pode usar '.' nem '..'".to_string());
    }

    let mut converted = String::new();
    let mut rest = segment;
    while let Some(start) = rest.find('{') {
        push_literal(&mut converted, &rest[..start])?;
        let after = &rest[start + 1..];
        let end = after
            .find('}')
            .ok_or_else(|| "Chave '{' sem fechamento no template".to_string())?;
        let name = &after[..end];
        let field = ALLOWED_FIELDS
            .iter()
            .find(|(alias, _)| *alias == name)
            .map(|(_, ytdlp)| *ytdlp)
            .ok_or_else(|| format!("Campo desconhecido no template: {{{name}}}"))?;
        converted.push_str(&format!("%({field})s"));
        rest = &after[end + 1..];
    }
    push_literal(&mut converted, rest)?;
    Ok(converted)
}

fn push_literal(target: &mut String, literal: &str) -> Result<(), String> {
    if literal.contains('}') {
        return Err("Chave '}' sem abertura no template".to_string());
    }
    if let Some(bad) = literal
        .chars()
        .find(|c| FORBIDDEN_LITERAL_CHARS.contains(c) || c.is_control())
    {
        return Err(format!("Caractere não permitido no template: {bad}"));
    }
    target.push_str(&literal.replace('%', "%%"));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_template_maps_to_title() {
        assert_eq!(to_ytdlp_template(DEFAULT_TEMPLATE).unwrap(), "%(title)s");
    }

    #[test]
    fn folders_and_literals_are_converted() {
        assert_eq!(
            to_ytdlp_template("{uploader}/{date} - {title}").unwrap(),
            "%(uploader)s/%(upload_date)s - %(title)s"
        );
    }

    #[test]
    fn year_and_playlist_fields_have_fallbacks_for_single_videos() {
        assert_eq!(to_ytdlp_template("{year}").unwrap(), "%(upload_date>%Y)s");
        assert_eq!(
            to_ytdlp_template("{playlist}/{index}").unwrap(),
            "%(playlist_title|Sem playlist)s/%(playlist_index|)s"
        );
    }

    #[test]
    fn backslash_separator_is_normalized() {
        assert_eq!(
            to_ytdlp_template("{channel}\\{title}").unwrap(),
            "%(channel)s/%(title)s"
        );
    }

    #[test]
    fn literal_percent_is_escaped() {
        assert_eq!(
            to_ytdlp_template("100% {title}").unwrap(),
            "100%% %(title)s"
        );
    }

    #[test]
    fn parent_directory_is_rejected() {
        assert!(to_ytdlp_template("../{title}").is_err());
        assert!(to_ytdlp_template("{uploader}/../../x").is_err());
        assert!(to_ytdlp_template("./{title}").is_err());
    }

    #[test]
    fn absolute_paths_and_drive_letters_are_rejected() {
        assert!(to_ytdlp_template("/etc/{title}").is_err());
        assert!(to_ytdlp_template("\\\\server\\share\\{title}").is_err());
        assert!(to_ytdlp_template("C:/{title}").is_err());
    }

    #[test]
    fn unknown_fields_and_unbalanced_braces_are_rejected() {
        assert!(to_ytdlp_template("{password}").is_err());
        assert!(to_ytdlp_template("{title").is_err());
        assert!(to_ytdlp_template("title}").is_err());
    }

    #[test]
    fn ytdlp_syntax_cannot_be_injected() {
        assert!(to_ytdlp_template("%(title)s").is_ok_and(|t| t == "%%(title)s"));
        assert!(to_ytdlp_template("{title>x}").is_err());
    }

    #[test]
    fn empty_segments_and_empty_template_are_rejected() {
        assert!(to_ytdlp_template("").is_err());
        assert!(to_ytdlp_template("   ").is_err());
        assert!(to_ytdlp_template("{uploader}//{title}").is_err());
        assert!(to_ytdlp_template("{title}/").is_err());
    }

    #[test]
    fn oversized_template_is_rejected() {
        assert!(to_ytdlp_template(&"a".repeat(201)).is_err());
    }
}
