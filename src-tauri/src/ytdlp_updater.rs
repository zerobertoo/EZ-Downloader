use std::fs;
use std::io::Read;
use tauri::AppHandle;

/// Asset do GitHub Releases conforme a plataforma — mesmos binários que
/// `scripts/download-yt-dlp.cjs` baixa no build.
fn download_url() -> &'static str {
    if cfg!(target_os = "windows") {
        "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
    } else if cfg!(target_os = "macos") {
        "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos"
    } else {
        "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp"
    }
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
    let response = ureq::get(download_url())
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
}
