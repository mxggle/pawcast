pub mod commands;
pub mod error;
pub mod media;
pub mod persistence;
pub mod state;

use persistence::{discover_electron_data_dirs, migrate_electron_source, DataStore};
use state::AppState;
use std::fs;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .register_asynchronous_uri_scheme_protocol("local-media", |context, request, responder| {
            let app = context.app_handle().clone();
            std::thread::spawn(move || {
                responder.respond(media::protocol::handle_protocol_request(&app, request));
            });
        })
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                let state = window.state::<AppState>();
                commands::filesystem::remove_window_watchers(&state, window.label());
                state.cancel_waveform_jobs_for_window(window.label());
            }
        })
        .setup(|app| {
            let config_directory = app.path().app_config_dir()?;
            fs::create_dir_all(&config_directory)?;
            let default_data_directory = config_directory.join("PawcastData");
            let pointer = config_directory.join(".pawcast-datadir");
            let active_data_directory = fs::read_to_string(pointer)
                .ok()
                .map(|value| value.trim().into())
                .filter(|path: &std::path::PathBuf| !path.as_os_str().is_empty())
                .unwrap_or(default_data_directory);
            let store = DataStore::open(
                &active_data_directory,
                app.package_info().version.to_string(),
            )
            .map_err(Box::<dyn std::error::Error>::from)?;
            if store
                .manifest()
                .map(|manifest| manifest.migration_status.as_deref() != Some("completed"))
                .unwrap_or(true)
            {
                let mut migration_failed = false;
                for source in discover_electron_data_dirs()
                    .into_iter()
                    .filter(|source| source != &config_directory)
                {
                    match migrate_electron_source(&store, &source) {
                        Ok(result) if !result.success => {
                            migration_failed = true;
                            eprintln!(
                                "automatic Electron data migration failed: {}",
                                result.errors.join("; ")
                            );
                        }
                        Err(error) => {
                            migration_failed = true;
                            eprintln!("automatic Electron data migration failed: {error}");
                        }
                        Ok(_) => {}
                    }
                }
                if migration_failed {
                    store
                        .set_migration_status("failed")
                        .map_err(Box::<dyn std::error::Error>::from)?;
                }
            }
            app.manage(AppState::new(config_directory, active_data_directory));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::config::config_get,
            commands::config::config_set,
            commands::config::config_get_all,
            commands::data::data_get,
            commands::data::data_put,
            commands::data::data_delete,
            commands::data::data_list,
            commands::data::data_get_media_file,
            commands::data::data_put_media_file,
            commands::data::data_get_directory,
            commands::data::data_change_directory,
            commands::data::data_is_migrated,
            commands::migration::data_run_migration,
            commands::migration::data_health_check,
            commands::migration::data_recover,
            commands::filesystem::approve_path,
            commands::filesystem::list_media_files,
            commands::filesystem::list_media_tree,
            commands::filesystem::watch_media_tree,
            commands::filesystem::unwatch_media_tree,
            commands::filesystem::show_in_file_manager,
            commands::windows::open_settings_window,
            commands::windows::close_settings_window,
            commands::windows::open_glossary_window,
            commands::windows::close_glossary_window,
            commands::windows::navigate_in_main_window,
            commands::http::desktop_fetch,
            commands::waveform::waveform_analyze,
            commands::waveform::waveform_get_meta,
            commands::waveform::waveform_get_level,
            commands::waveform::waveform_delete,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Pawcast");
}
