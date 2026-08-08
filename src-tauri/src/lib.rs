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
use tauri_plugin_updater::UpdaterExt;

async fn check_for_update(app: AppHandle, silent: bool) {
    let updater = match app.updater() {
        Ok(updater) => updater,
        Err(err) => {
            if !silent {
                app.dialog()
                    .message(format!("Erro ao verificar atualizações: {err}"))
                    .title("Erro")
                    .kind(MessageDialogKind::Error)
                    .blocking_show();
            }
            return;
        }
    };

    let update = match updater.check().await {
        Ok(update) => update,
        Err(err) => {
            if !silent {
                app.dialog()
                    .message(format!("Erro ao verificar atualizações: {err}"))
                    .title("Erro")
                    .kind(MessageDialogKind::Error)
                    .blocking_show();
            }
            return;
        }
    };

    let Some(update) = update else {
        if !silent {
            app.dialog()
                .message("Você já está usando a versão mais recente.")
                .title("Sem atualizações")
                .kind(MessageDialogKind::Info)
                .blocking_show();
        }
        return;
    };

    let should_install = app
        .dialog()
        .message(format!(
            "Nova versão disponível: {}\n\nDeseja baixar e instalar agora?",
            update.version
        ))
        .title("Atualização disponível")
        .kind(MessageDialogKind::Info)
        .buttons(MessageDialogButtons::YesNo)
        .blocking_show();

    if !should_install {
        return;
    }

    if let Err(err) = update.download_and_install(|_, _| {}, || {}).await {
        app.dialog()
            .message(format!("Falha ao instalar atualização: {err}"))
            .title("Erro")
            .kind(MessageDialogKind::Error)
            .blocking_show();
        return;
    }

    app.request_restart();
}

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

            tauri::async_runtime::spawn(check_for_update(handle.clone(), true));

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
                    let handle = about_handle.clone();
                    tauri::async_runtime::spawn(check_for_update(handle, false));
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
