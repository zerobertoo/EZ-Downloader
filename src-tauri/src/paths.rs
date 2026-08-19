use std::path::PathBuf;
use tauri::{AppHandle, Manager};

fn binary_name(base: &str) -> String {
    if cfg!(target_os = "windows") {
        format!("{base}.exe")
    } else {
        base.to_string()
    }
}

fn platform_dir() -> &'static str {
    if cfg!(target_os = "windows") {
        "win32"
    } else if cfg!(target_os = "macos") {
        "darwin"
    } else {
        "linux"
    }
}

fn resource_bin_path(app: &AppHandle, base: &str) -> String {
    let resource_dir = app
        .path()
        .resource_dir()
        .expect("resource dir must resolve in a packaged app");
    let path: PathBuf = resource_dir
        .join("bin")
        .join(platform_dir())
        .join(binary_name(base));
    path.to_string_lossy().to_string()
}

/// Cópia do yt-dlp baixada pelo updater em runtime, no diretório de dados do
/// app (gravável — o resource dir de um app instalado geralmente não é).
pub fn updated_ytdlp_path(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_data_dir().ok()?.join("bin");
    Some(dir.join(binary_name("yt-dlp")))
}

pub fn get_ytdlp_bin(app: &AppHandle) -> String {
    // Uma cópia atualizada pelo usuário tem prioridade sobre o binário
    // embutido no build — é o que permite atualizar o yt-dlp sem release nova.
    if let Some(path) = updated_ytdlp_path(app) {
        if path.exists() {
            return path.to_string_lossy().to_string();
        }
    }
    if cfg!(debug_assertions) {
        return "yt-dlp".to_string();
    }
    resource_bin_path(app, "yt-dlp")
}

pub fn get_ffmpeg_bin(app: &AppHandle) -> String {
    if cfg!(debug_assertions) {
        return "ffmpeg".to_string();
    }
    resource_bin_path(app, "ffmpeg")
}

/// QuickJS-ng embutido — sem ele o yt-dlp não consegue gerar o PO Token do
/// YouTube (precisa de deno/node/bun/quickjs; nenhum vem instalado por padrão
/// no SO do usuário) e o download é cortado no meio com HTTP 403.
pub fn get_qjs_bin(app: &AppHandle) -> String {
    if cfg!(debug_assertions) {
        return "qjs".to_string();
    }
    resource_bin_path(app, "qjs")
}
