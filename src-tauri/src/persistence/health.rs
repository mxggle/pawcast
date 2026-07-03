use crate::{
    error::AppError,
    persistence::{
        journal::{read_journal, recover_journal},
        manifest::checksum_file,
        paths::resolve_data_path,
        DataStore,
    },
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthCheckResult {
    pub manifest_ok: bool,
    pub failed_checksums: Vec<String>,
    pub orphaned_references: Vec<String>,
    pub corrupted_files: Vec<String>,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryResult {
    pub success: bool,
    pub recovered_files: Vec<String>,
    pub failed_files: Vec<String>,
    pub message: String,
}

pub fn run_health_check(store: &DataStore) -> Result<HealthCheckResult, AppError> {
    let mut result = HealthCheckResult {
        manifest_ok: false,
        failed_checksums: Vec::new(),
        orphaned_references: Vec::new(),
        corrupted_files: Vec::new(),
        status: "healthy".to_owned(),
    };
    let manifest = match store.manifest() {
        Ok(manifest) => {
            result.manifest_ok = true;
            manifest
        }
        Err(_) => {
            result.status = "damaged".to_owned();
            return Ok(result);
        }
    };

    for entry in manifest.files {
        let path = match resolve_data_path(store.root(), &entry.path) {
            Ok(path) => path,
            Err(_) => {
                result.failed_checksums.push(entry.path.clone());
                result.corrupted_files.push(entry.path);
                continue;
            }
        };
        match checksum_file(&path) {
            Ok(checksum) if checksum == entry.checksum => {}
            Ok(_) => result.failed_checksums.push(entry.path),
            Err(_) => {
                result.failed_checksums.push(entry.path.clone());
                result.corrupted_files.push(entry.path);
            }
        }
    }

    for (index_path, collection) in [
        ("recordings/shadowing/index.json", "segments"),
        ("recordings/sentence-practice/index.json", "recordings"),
        ("media/imported/index.json", "files"),
    ] {
        match store.get_json(index_path) {
            Ok(Some(value)) => {
                if let Some(items) = value.get(collection).and_then(|value| value.as_array()) {
                    for item in items {
                        if let Some(reference) =
                            item.get("filePath").and_then(|value| value.as_str())
                        {
                            match resolve_data_path(store.root(), reference) {
                                Ok(path) if path.is_file() => {}
                                _ => result.orphaned_references.push(reference.to_owned()),
                            }
                        }
                    }
                } else {
                    result.corrupted_files.push(index_path.to_owned());
                }
            }
            Ok(None) => {}
            Err(_) => result.corrupted_files.push(index_path.to_owned()),
        }
    }

    if read_journal(store.root())?
        .iter()
        .any(|entry| entry.status == "pending")
    {
        result.status = "degraded".to_owned();
    }
    result.failed_checksums.sort();
    result.failed_checksums.dedup();
    result.orphaned_references.sort();
    result.orphaned_references.dedup();
    result.corrupted_files.sort();
    result.corrupted_files.dedup();
    if !result.failed_checksums.is_empty() || !result.corrupted_files.is_empty() {
        result.status = "damaged".to_owned();
    } else if !result.orphaned_references.is_empty() {
        result.status = "degraded".to_owned();
    }
    Ok(result)
}

pub fn recover(store: &DataStore, strategy: &str) -> Result<RecoveryResult, AppError> {
    if strategy != "journal" {
        return Err(AppError::new(
            "unsupported_recovery_strategy",
            "This recovery strategy is not supported",
        )
        .operation("data_recover")
        .retryable(false));
    }
    let recovered_files = recover_journal(store.root())?;
    Ok(RecoveryResult {
        success: true,
        recovered_files,
        failed_files: Vec::new(),
        message: "Journal replay completed".to_owned(),
    })
}
