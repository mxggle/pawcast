use crate::error::AppError;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Write,
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};
use uuid::Uuid;

pub const SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataManifest {
    pub schema_version: u32,
    pub app_version: String,
    pub device_id: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub active_data_dir: String,
    pub files: Vec<ManifestFileEntry>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latest_snapshot: Option<SnapshotRef>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub migration_status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestFileEntry {
    pub path: String,
    pub version: u32,
    pub updated_at: i64,
    pub checksum: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotRef {
    pub path: String,
    pub created_at: i64,
    pub checksum: String,
}

impl DataManifest {
    pub fn new(data_dir: &Path, app_version: &str) -> Self {
        let now = now_millis();
        Self {
            schema_version: SCHEMA_VERSION,
            app_version: app_version.to_owned(),
            device_id: Uuid::new_v4().to_string(),
            created_at: now,
            updated_at: now,
            active_data_dir: data_dir.to_string_lossy().into_owned(),
            files: Vec::new(),
            latest_snapshot: None,
            migration_status: None,
        }
    }

    pub fn update_file(&mut self, path: &str, checksum: String) {
        let now = now_millis();
        if let Some(file) = self.files.iter_mut().find(|file| file.path == path) {
            file.version += 1;
            file.updated_at = now;
            file.checksum = checksum;
        } else {
            self.files.push(ManifestFileEntry {
                path: path.to_owned(),
                version: 1,
                updated_at: now,
                checksum,
            });
        }
    }
}

pub fn load_manifest(data_dir: &Path) -> Result<DataManifest, AppError> {
    let path = data_dir.join("manifest.json");
    let bytes = fs::read(&path).map_err(|error| AppError::io("load_manifest", error))?;
    let manifest: DataManifest = serde_json::from_slice(&bytes).map_err(|error| {
        let backup = data_dir.join(format!("manifest.json.corrupted.{}", now_millis()));
        let _ = fs::write(backup, &bytes);
        AppError::new("manifest_corrupt", "The Pawcast data manifest is corrupted")
            .operation("load_manifest")
            .retryable(false)
            .tap_log(error)
    })?;
    if manifest.schema_version > SCHEMA_VERSION {
        return Err(AppError::new(
            "unsupported_schema_version",
            "This Pawcast data directory was created by a newer version",
        )
        .operation("load_manifest"));
    }
    Ok(manifest)
}

pub fn save_manifest(data_dir: &Path, manifest: &mut DataManifest) -> Result<(), AppError> {
    manifest.updated_at = now_millis();
    atomic_write(
        &data_dir.join("manifest.json"),
        &serde_json::to_vec_pretty(manifest)?,
    )
}

pub fn checksum_file(path: &Path) -> Result<String, AppError> {
    let bytes = fs::read(path).map_err(|error| AppError::io("checksum_file", error))?;
    Ok(checksum_bytes(&bytes))
}

pub fn checksum_bytes(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

pub fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), AppError> {
    let parent = path
        .parent()
        .ok_or_else(|| AppError::new("invalid_data_path", "Invalid data path"))?;
    fs::create_dir_all(parent).map_err(|error| AppError::io("create_data_directory", error))?;
    let temporary = path.with_file_name(format!(
        "{}.tmp-{}",
        path.file_name().unwrap_or_default().to_string_lossy(),
        Uuid::new_v4()
    ));
    let result = (|| {
        let mut file = fs::File::create(&temporary)
            .map_err(|error| AppError::io("create_temporary_file", error))?;
        file.write_all(bytes)
            .map_err(|error| AppError::io("write_temporary_file", error))?;
        file.sync_all()
            .map_err(|error| AppError::io("sync_temporary_file", error))?;
        replace_file(&temporary, path).map_err(|error| AppError::io("replace_data_file", error))?;
        if let Ok(directory) = fs::File::open(parent) {
            let _ = directory.sync_all();
        }
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(temporary);
    }
    result
}

#[cfg(not(windows))]
pub fn replace_file(source: &Path, destination: &Path) -> std::io::Result<()> {
    fs::rename(source, destination)
}

#[cfg(windows)]
pub fn replace_file(source: &Path, destination: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };
    let source = source
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect::<Vec<_>>();
    let destination = destination
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect::<Vec<_>>();
    let success = unsafe {
        MoveFileExW(
            source.as_ptr(),
            destination.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if success == 0 {
        Err(std::io::Error::last_os_error())
    } else {
        Ok(())
    }
}

pub fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

trait LogError: Sized {
    fn tap_log(self, error: impl std::fmt::Display) -> Self;
}

impl LogError for AppError {
    fn tap_log(self, error: impl std::fmt::Display) -> Self {
        eprintln!(
            "{}: {error}",
            self.operation.as_deref().unwrap_or("operation")
        );
        self
    }
}
