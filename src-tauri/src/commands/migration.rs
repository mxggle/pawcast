use crate::{
    error::AppError,
    persistence::{
        discover_electron_data_dirs, migrate_browser_payload, migrate_electron_source, recover,
        run_health_check, DataStore, HealthCheckResult, MigrationResult, RecoveryResult,
    },
    state::AppState,
};
use serde_json::Value;
use tauri::State;

fn store(state: &AppState) -> Result<DataStore, AppError> {
    DataStore::open(
        state.active_data_directory.read().clone(),
        env!("CARGO_PKG_VERSION"),
    )
}

#[tauri::command]
pub async fn data_run_migration(
    state: State<'_, AppState>,
    local_storage: Option<Value>,
    indexed_db: Option<Value>,
) -> Result<MigrationResult, AppError> {
    let store = store(&state)?;
    let mut combined = MigrationResult {
        success: true,
        migrated_counts: Default::default(),
        errors: Vec::new(),
    };
    for source in discover_electron_data_dirs() {
        let result = migrate_electron_source(&store, &source)?;
        for (key, count) in result.migrated_counts {
            *combined.migrated_counts.entry(key).or_default() += count;
        }
        combined.errors.extend(result.errors);
    }
    if let (Some(local_storage), Some(indexed_db)) = (local_storage, indexed_db) {
        let result = migrate_browser_payload(&store, &local_storage, &indexed_db)?;
        for (key, count) in result.migrated_counts {
            *combined.migrated_counts.entry(key).or_default() += count;
        }
        combined.errors.extend(result.errors);
    }
    combined.success = combined.errors.is_empty();
    store.set_migration_status(if combined.success {
        "completed"
    } else {
        "failed"
    })?;
    Ok(combined)
}

#[tauri::command]
pub async fn data_health_check(state: State<'_, AppState>) -> Result<HealthCheckResult, AppError> {
    run_health_check(&store(&state)?)
}

#[tauri::command]
pub async fn data_recover(
    state: State<'_, AppState>,
    strategy: String,
) -> Result<RecoveryResult, AppError> {
    recover(&store(&state)?, &strategy)
}
