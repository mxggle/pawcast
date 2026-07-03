use crate::{error::AppError, persistence::manifest::atomic_write, state::AppState};
use serde::Serialize;
use serde_json::{Map, Value};
use std::{fs, path::PathBuf, sync::Arc};
use tauri::{AppHandle, Emitter, State};

#[derive(Clone, Serialize)]
struct ConfigChanged<'a> {
    key: &'a str,
}

fn config_path(state: &AppState) -> PathBuf {
    state.config_directory.join("app-config.json")
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

trait LogError: Sized {
    fn tap_log(self, error: impl std::fmt::Display) -> Self;
}
impl LogError for AppError {
    fn tap_log(self, error: impl std::fmt::Display) -> Self {
        eprintln!("config event: {error}");
        self
    }
}
