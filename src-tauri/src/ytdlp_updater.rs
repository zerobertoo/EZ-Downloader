use sha2::{Digest, Sha256};
use std::fs;
use std::io::Read;
use tauri::AppHandle;

const SUMS_URL: &str = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/SHA2-256SUMS";

/// Nome do asset no GitHub Releases conforme a plataforma — mesmos binários
/// que `scripts/download-yt-dlp.cjs` baixa no build, e mesmo nome usado como
/// chave no arquivo SHA2-256SUMS da release.
fn asset_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "yt-dlp.exe"
    } else if cfg!(target_os = "macos") {
        "yt-dlp_macos"
    } else {
        "yt-dlp"
    }
}

fn download_url() -> String {
    format!("https://github.com/yt-dlp/yt-dlp/releases/latest/download/{}", asset_name())
}

/// Busca o hash esperado no SHA2-256SUMS publicado junto da release, pra
/// validar o binário baixado antes de executá-lo (evita rodar algo adulterado
/// por MITM/CDN comprometido, e reduz o padrão "baixa e executa sem checar"
/// que dispara heurísticas de antivírus tipo trojan-downloader).
fn parse_sums(sums: &str, asset: &str) -> Option<String> {
    sums.lines().find_map(|line| {
        let (hash, name) = line.split_once("  ")?;
        (name.trim() == asset).then(|| hash.trim().to_lowercase())
    })
}

fn expected_sha256(asset: &str) -> Result<String, String> {
    let response = ureq::get(SUMS_URL)
        .call()
        .map_err(|e| format!("Erro ao baixar SHA2-256SUMS: {e}"))?;
    let sums = response
        .into_string()
        .map_err(|e| format!("Erro ao ler SHA2-256SUMS: {e}"))?;

    parse_sums(&sums, asset)
        .ok_or_else(|| format!("Hash de {asset} não encontrado em SHA2-256SUMS"))
}

fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().map(|b| format!("{b:02x}")).collect()
}

/// Baixa o yt-dlp mais recente para o diretório de dados do app e retorna a
/// versão instalada. O binário embutido no pacote não é tocado (pode estar em
/// local somente-leitura) — `paths::get_ytdlp_bin` passa a preferir a cópia
/// atualizada a partir da próxima resolução.
pub fn update(app: &AppHandle) -> Result<String, String> {
    let dest = crate::paths::updated_ytdlp_path(app)
        .ok_or_else(|| "Não foi possível resolver o diretório de dados do app".to_string())?;
    let dir = dest
        .parent()
        .ok_or_else(|| "Caminho de destino inválido".to_string())?;
    fs::create_dir_all(dir).map_err(|e| format!("Erro ao criar diretório: {e}"))?;

    // Baixa para arquivo temporário e só então substitui — uma falha no meio
    // do download não pode corromper a cópia que já funcionava.
    let tmp = dest.with_extension("download");

    log::info!("Baixando yt-dlp de {}", download_url());
    let response = ureq::get(&download_url())
        .call()
        .map_err(|e| format!("Erro ao baixar yt-dlp: {e}"))?;

    let mut reader = response.into_reader();
    let bytes = {
        let mut buf = Vec::new();
        reader
            .read_to_end(&mut buf)
            .map_err(|e| format!("Erro ao ler resposta: {e}"))?;
        buf
    };
    if bytes.is_empty() {
        return Err("Download do yt-dlp veio vazio".to_string());
    }

    let expected = expected_sha256(asset_name())?;
    let actual = sha256_hex(&bytes);
    if actual != expected {
        return Err(format!(
            "Hash do yt-dlp baixado não confere (esperado {expected}, obtido {actual}) — download descartado"
        ));
    }

    fs::write(&tmp, &bytes).map_err(|e| format!("Erro ao salvar yt-dlp: {e}"))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&tmp, fs::Permissions::from_mode(0o755))
            .map_err(|e| format!("Erro ao marcar yt-dlp como executável: {e}"))?;
    }

    fs::rename(&tmp, &dest).map_err(|e| format!("Erro ao instalar yt-dlp: {e}"))?;

    // Verifica que o binário executa antes de declarar sucesso — senão
    // remove para não deixar uma cópia quebrada com prioridade sobre a embutida.
    let output = std::process::Command::new(&dest)
        .arg("--version")
        .output()
        .map_err(|e| format!("yt-dlp baixado não executou: {e}"))?;
    if !output.status.success() {
        fs::remove_file(&dest).ok();
        return Err("yt-dlp baixado falhou na verificação de versão".to_string());
    }

    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
    log::info!("yt-dlp atualizado para {version} em {}", dest.display());
    Ok(version)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn download_url_aponta_para_asset_da_plataforma() {
        let url = download_url();
        assert!(url.starts_with("https://github.com/yt-dlp/yt-dlp/releases/latest/download/"));
        if cfg!(target_os = "windows") {
            assert!(url.ends_with("yt-dlp.exe"));
        } else if cfg!(target_os = "macos") {
            assert!(url.ends_with("yt-dlp_macos"));
        } else {
            assert!(url.ends_with("/yt-dlp"));
        }
    }

    #[test]
    fn parse_sums_acha_hash_pelo_nome_exato_do_asset() {
        let sums = "aaa  yt-dlp\nbbb  yt-dlp.exe\nccc  yt-dlp_macos\n";
        assert_eq!(parse_sums(sums, "yt-dlp.exe"), Some("bbb".to_string()));
        assert_eq!(parse_sums(sums, "yt-dlp"), Some("aaa".to_string()));
        assert_eq!(parse_sums(sums, "yt-dlp_ausente"), None);
    }

    #[test]
    fn sha256_hex_bate_com_hash_conhecido() {
        assert_eq!(
            sha256_hex(b""),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }
}
