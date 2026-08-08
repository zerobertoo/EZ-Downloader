mod commands;
mod dependency_checker;
mod download_manager;
mod format_parser;
mod paths;
mod process_runner;

use dependency_checker::check_dependencies;
use download_manager::DownloadManager;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

fn build_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let file_menu = Submenu::with_items(
        app,
        "Arquivo",
        true,
        &[&MenuItem::with_id(
            app,
            "quit",
            "Sair",
            true,
            Some("CmdOrCtrl+Q"),
        )?],
    )?;

    let edit_menu = Submenu::with_items(
        app,
        "Editar",
        true,
        &[
            &PredefinedMenuItem::undo(app, Some("Desfazer"))?,
            &PredefinedMenuItem::redo(app, Some("Refazer"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, Some("Cortar"))?,
            &PredefinedMenuItem::copy(app, Some("Copiar"))?,
            &PredefinedMenuItem::paste(app, Some("Colar"))?,
        ],
    )?;

    let help_menu = Submenu::with_items(
        app,
        "Ajuda",
        true,
        &[
            &MenuItem::with_id(app, "about", "Sobre", true, None::<&str>)?,
            &MenuItem::with_id(
                app,
                "check-updates",
                "Verificar Atualizações",
                true,
                None::<&str>,
            )?,
        ],
    )?;

    Menu::with_items(app, &[&file_menu, &edit_menu, &help_menu])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let handle: AppHandle = app.handle().clone();

            let ytdlp_bin = paths::get_ytdlp_bin(&handle);
            let ffmpeg_bin = paths::get_ffmpeg_bin(&handle);

            let deps = check_dependencies(&ytdlp_bin, &ffmpeg_bin);
            if !deps.ytdlp.available {
                handle
                    .dialog()
                    .message(
                        "Instale via:\n  pip install yt-dlp\n  ou\n  winget install yt-dlp\n\nReinicie o aplicativo após a instalação.",
                    )
                    .title("Dependência não encontrada: yt-dlp não foi encontrado no PATH.")
                    .kind(MessageDialogKind::Error)
                    .buttons(MessageDialogButtons::Ok)
                    .blocking_show();
                handle.exit(1);
                return Ok(());
            }
            if !deps.ffmpeg.available {
                eprintln!("Aviso: ffmpeg não encontrado — mesclagem de vídeo+áudio pode falhar em alguns formatos.");
            }

            let default_download_path = handle
                .path()
                .download_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("."));
            let manager = DownloadManager::new(ytdlp_bin, Some(ffmpeg_bin), default_download_path);
            app.manage(manager);

            let menu = build_menu(&handle)?;
            app.set_menu(menu)?;

            let about_handle = handle.clone();
            app.on_menu_event(move |_app, event| match event.id().as_ref() {
                "quit" => about_handle.exit(0),
                "about" => {
                    about_handle
                        .dialog()
                        .message(format!(
                            "Versão {}\n\nA user-friendly desktop application for downloading videos and audio from YouTube and other platforms using yt-dlp\n\nGitHub: https://github.com/zerobertoo/EZ-Downloader",
                            env!("CARGO_PKG_VERSION")
                        ))
                        .title("Sobre EZ Downloader")
                        .kind(MessageDialogKind::Info)
                        .blocking_show();
                }
                "check-updates" => {
                    about_handle
                        .dialog()
                        .message("As atualizações são verificadas automaticamente em segundo plano.")
                        .title("Atualização Automática")
                        .kind(MessageDialogKind::Info)
                        .blocking_show();
                }
                _ => {}
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_version,
            commands::get_app_info,
            commands::get_formats,
            commands::start_download,
            commands::cancel_download,
            commands::select_download_path,
            commands::get_downloads_path,
            commands::open_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
