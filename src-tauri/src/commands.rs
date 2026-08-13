use crate::download_manager::{DownloadManager, DownloadOptions, FormatsResult};
use crate::history::HistoryEntry;
use serde::Serialize;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

#[derive(Serialize)]
pub struct AppInfo {
    pub version: String,
    pub name: String,
    pub description: String,
    pub author: String,
    pub repository: String,
}

#[tauri::command]
pub fn get_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
pub fn get_app_info(app: AppHandle) -> AppInfo {
    AppInfo {
        version: app.package_info().version.to_string(),
        name: "EZ Downloader".to_string(),
        description:
            "A user-friendly desktop application for downloading videos and audio from YouTube and other platforms using yt-dlp"
                .to_string(),
        author: "zerobertoo".to_string(),
        repository: "https://github.com/zerobertoo/EZ-Downloader".to_string(),
    }
}

#[tauri::command]
pub async fn get_formats(
    manager: State<'_, DownloadManager>,
    url: String,
) -> Result<FormatsResult, String> {
    if url.trim().is_empty() {
        return Err("URL inválida".to_string());
    }
    let manager = manager.inner().clone();
    tauri::async_runtime::spawn_blocking(move || manager.get_available_formats(&url))
        .await
        .map_err(|e| e.to_string())?
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn start_download(
    app: AppHandle,
    manager: State<DownloadManager>,
    url: String,
    format: String,
    output_path: String,
    title: Option<String>,
    section_start: Option<String>,
    section_end: Option<String>,
    sub_langs: Option<String>,
    extra_args: Option<String>,
) -> Result<String, String> {
    // Validações síncronas: erro aqui chega na hora pro frontend. Depois
    // disso o download roda em background e o fim chega via "download-finished".
    if url.trim().is_empty() || format.trim().is_empty() || output_path.trim().is_empty() {
        return Err("URL, formato ou caminho de saída inválido".to_string());
    }
    let options = DownloadOptions {
        section: section_start.zip(section_end),
        sub_langs,
        extra_args,
    };
    manager.start_download(&app, &url, &format, title, Some(output_path), options)
}

#[tauri::command]
pub fn cancel_download(manager: State<DownloadManager>, id: String) {
    manager.cancel_download(&id);
}

#[tauri::command]
pub fn get_history(manager: State<DownloadManager>) -> Vec<HistoryEntry> {
    manager.history_entries()
}

#[tauri::command]
pub fn clear_history(manager: State<DownloadManager>) {
    manager.clear_history();
}

#[tauri::command]
pub fn select_download_path(app: AppHandle) -> Option<String> {
    app.dialog()
        .file()
        .blocking_pick_folder()
        .map(|p| p.to_string())
}

#[tauri::command]
pub fn get_downloads_path(app: AppHandle) -> Option<String> {
    app.path()
        .download_dir()
        .ok()
        .map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn update_ytdlp(
    app: AppHandle,
    manager: State<'_, DownloadManager>,
) -> Result<String, String> {
    let manager = manager.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let version = crate::ytdlp_updater::update(&app)?;
        if let Some(bin) = crate::paths::updated_ytdlp_path(&app) {
            manager.set_ytdlp_bin(bin.to_string_lossy().to_string());
        }
        Ok(version)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn open_path(app: AppHandle, path: String) -> Result<(), String> {
    app.opener()
        .open_path(path, None::<&str>)
        .map_err(|e| e.to_string())
}
