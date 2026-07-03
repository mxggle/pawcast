use crate::{
    error::AppError,
    persistence::{change_data_directory, DataStore},
    state::AppState,
};
use serde_json::Value;
use std::path::PathBuf;
use tauri::State;

fn store(state: &AppState) -> Result<DataStore, AppError> {
    DataStore::open(
        state.active_data_directory.read().clone(),
        env!("CARGO_PKG_VERSION"),
    )
}

#[tauri::command]
pub async fn data_get(state: State<'_, AppState>, path: String) -> Result<Option<Value>, AppError> {
    store(&state)?.get_json(path)
}

#[tauri::command]
pub async fn data_put(
    state: State<'_, AppState>,
    path: String,
    data: Value,
) -> Result<(), AppError> {
    store(&state)?.put_json(path, &data)
}

#[tauri::command]
pub async fn data_delete(state: State<'_, AppState>, path: String) -> Result<(), AppError> {
    store(&state)?.delete(path)
}

#[tauri::command]
pub async fn data_list(state: State<'_, AppState>, path: String) -> Result<Vec<String>, AppError> {
    store(&state)?.list(path)
}

#[tauri::command]
pub async fn data_get_media_file(
    state: State<'_, AppState>,
    path: String,
) -> Result<Vec<u8>, AppError> {
    store(&state)?.get_binary(path)
}

#[tauri::command]
pub async fn data_put_media_file(
    state: State<'_, AppState>,
    path: String,
    data: Vec<u8>,
) -> Result<(), AppError> {
    store(&state)?.put_binary(path, &data)
}

#[tauri::command]
pub async fn data_get_directory(state: State<'_, AppState>) -> Result<String, AppError> {
    Ok(state
        .active_data_directory
        .read()
        .to_string_lossy()
        .into_owned())
}

#[tauri::command]
pub async fn data_is_migrated(state: State<'_, AppState>) -> Result<bool, AppError> {
    Ok(store(&state)?.manifest()?.migration_status.as_deref() == Some("completed"))
}

#[tauri::command]
pub async fn data_change_directory(
    state: State<'_, AppState>,
    target_path: String,
) -> Result<(), AppError> {
    let current = store(&state)?;
    let pointer = state.config_directory.join(".pawcast-datadir");
    let new_directory = change_data_directory(&current, PathBuf::from(target_path), pointer)?;
    *state.active_data_directory.write() = new_directory;
    Ok(())
}
