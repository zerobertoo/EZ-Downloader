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

pub fn get_ytdlp_bin(app: &AppHandle) -> String {
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
