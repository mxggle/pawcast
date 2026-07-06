use crate::{error::AppError, persistence::manifest::atomic_write, state::AppState};
use serde::Serialize;
use serde_json::{Map, Value};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Arc,
};
use tauri::{AppHandle, Emitter, State};

#[derive(Clone, Serialize)]
struct ConfigChanged<'a> {
    key: &'a str,
}

fn config_path(state: &AppState) -> PathBuf {
    state.config_directory.join("app-config.json")
}

pub fn migrate_legacy_config(
    config_directory: &Path,
    legacy_directories: &[PathBuf],
) -> Result<usize, AppError> {
    let destination = config_directory.join("app-config.json");
    let mut config = if destination.exists() {
        let bytes =
            fs::read(&destination).map_err(|error| AppError::io("read_tauri_config", error))?;
        serde_json::from_slice::<Value>(&bytes)?
            .as_object()
            .cloned()
            .ok_or_else(|| {
                AppError::new(
                    "config_corrupt",
                    "Desktop configuration is not a JSON object",
                )
                .operation("migrate_config")
            })?
    } else {
        Map::new()
    };
    let mut imported = 0;
    for directory in legacy_directories {
        let source = directory.join("app-config.json");
        if source == destination || !source.is_file() {
            continue;
        }
        let bytes = fs::read(&source).map_err(|error| AppError::io("read_legacy_config", error))?;
        let legacy = serde_json::from_slice::<Value>(&bytes)?;
        let legacy = legacy.as_object().ok_or_else(|| {
            AppError::new(
                "invalid_migration_source",
                "Legacy desktop configuration is not a JSON object",
            )
            .operation("migrate_config")
        })?;
        for (key, value) in legacy {
            if !config.contains_key(key) {
                config.insert(key.clone(), value.clone());
                imported += 1;
            }
        }
    }
    if imported > 0 {
        fs::create_dir_all(config_directory)
            .map_err(|error| AppError::io("create_config_directory", error))?;
        atomic_write(&destination, &serde_json::to_vec_pretty(&config)?)?;
    }
    Ok(imported)
}

fn read_config(state: &AppState) -> Result<Map<String, Value>, AppError> {
    let path = config_path(state);
    if !path.exists() {
        return Ok(Map::new());
    }
    let bytes = fs::read(path).map_err(|error| AppError::io("config_get_all", error))?;
    serde_json::from_slice::<Value>(&bytes)?
        .as_object()
        .cloned()
        .ok_or_else(|| {
            AppError::new(
                "config_corrupt",
                "Desktop configuration is not a JSON object",
            )
            .operation("config_get_all")
        })
}

fn mutation_lock(state: &AppState) -> Arc<tokio::sync::Mutex<()>> {
    state
        .config_mutation_locks
        .lock()
        .entry("__config_file__".to_owned())
        .or_insert_with(|| Arc::new(tokio::sync::Mutex::new(())))
        .clone()
}

#[tauri::command]
pub async fn config_get(
    state: State<'_, AppState>,
    key: String,
) -> Result<Option<Value>, AppError> {
    Ok(read_config(&state)?.get(&key).cloned())
}

#[tauri::command]
pub async fn config_get_all(state: State<'_, AppState>) -> Result<Map<String, Value>, AppError> {
    read_config(&state)
}

#[tauri::command]
pub async fn config_set(
    app: AppHandle,
    state: State<'_, AppState>,
    key: String,
    value: Value,
) -> Result<(), AppError> {
    let lock = mutation_lock(&state);
    let _guard = lock.lock().await;
    let mut config = read_config(&state)?;
    if value.is_null() {
        config.remove(&key);
    } else {
        config.insert(key.clone(), value);
    }
    atomic_write(&config_path(&state), &serde_json::to_vec_pretty(&config)?)?;
    app.emit("config-changed", ConfigChanged { key: &key })
        .map_err(|error| {
            AppError::new(
                "event_failed",
                "Configuration was saved but other windows could not be notified",
            )
            .operation("config_set")
            .retryable(true)
            .tap_log(error)
        })?;
    Ok(())
}

#[tauri::command]
pub fn broadcast_ai_settings(app: AppHandle, payload: Map<String, Value>) -> Result<(), AppError> {
    app.emit("ai-settings-changed", payload).map_err(|error| {
        AppError::new(
            "event_failed",
            "AI settings could not be synchronized with other windows",
        )
        .operation("broadcast_ai_settings")
        .retryable(true)
        .tap_log(error)
    })
}

trait LogError: Sized {
    fn tap_log(self, error: impl std::fmt::Display) -> Self;
}
impl LogError for AppError {
    fn tap_log(self, error: impl std::fmt::Display) -> Self {
        eprintln!("config event: {error}");
        self
    }
}
