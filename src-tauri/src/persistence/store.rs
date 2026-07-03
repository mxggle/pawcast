use crate::{
    error::AppError,
    persistence::{
        journal::{append_journal, read_journal, JournalEntry},
        manifest::{
            atomic_write, checksum_bytes, checksum_file, load_manifest, replace_file,
            save_manifest, DataManifest,
        },
        paths::{resolve_data_path, CANONICAL_DIRECTORIES},
    },
};
use parking_lot::Mutex;
use serde::Serialize;
use serde_json::Value;
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::{Arc, OnceLock, Weak},
};

static DIRECTORY_LOCKS: OnceLock<Mutex<HashMap<PathBuf, Weak<Mutex<()>>>>> = OnceLock::new();

#[derive(Clone)]
pub struct DataStore {
    root: PathBuf,
    app_version: String,
    mutation_lock: Arc<Mutex<()>>,
}

impl DataStore {
    pub fn open(
        root: impl Into<PathBuf>,
        app_version: impl Into<String>,
    ) -> Result<Self, AppError> {
        let root = root.into();
        fs::create_dir_all(&root).map_err(|error| AppError::io("create_data_root", error))?;
        for directory in CANONICAL_DIRECTORIES {
            fs::create_dir_all(root.join(directory))
                .map_err(|error| AppError::io("create_canonical_directory", error))?;
        }
        let root = root
            .canonicalize()
            .map_err(|error| AppError::io("canonicalize_data_root", error))?;
        let app_version = app_version.into();
        let mutation_lock = directory_lock(&root);
        let store = Self {
            root,
            app_version,
            mutation_lock,
        };
        let _guard = store.mutation_lock.lock();
        if !store.root.join("manifest.json").exists() {
            let mut manifest = DataManifest::new(&store.root, &store.app_version);
            save_manifest(&store.root, &mut manifest)?;
        } else {
            load_manifest(&store.root)?;
        }
        drop(_guard);
        Ok(store)
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn manifest(&self) -> Result<DataManifest, AppError> {
        let _guard = self.mutation_lock.lock();
        load_manifest(&self.root)
    }

    pub fn set_migration_status(&self, status: &str) -> Result<(), AppError> {
        let _guard = self.mutation_lock.lock();
        let mut manifest = load_manifest(&self.root)?;
        manifest.migration_status = Some(status.to_owned());
        save_manifest(&self.root, &mut manifest)
    }

    pub fn get_json(&self, relative: impl AsRef<Path>) -> Result<Option<Value>, AppError> {
        let path = resolve_data_path(&self.root, relative)?;
        if !path.exists() {
            return Ok(None);
        }
        let bytes = fs::read(path).map_err(|error| AppError::io("read_json", error))?;
        Ok(Some(serde_json::from_slice(&bytes)?))
    }

    pub fn put_json(
        &self,
        relative: impl AsRef<Path>,
        value: &impl Serialize,
    ) -> Result<(), AppError> {
        let bytes = serde_json::to_vec_pretty(value)?;
        self.put_bytes(relative.as_ref(), &bytes, true)
    }

    pub fn get_binary(&self, relative: impl AsRef<Path>) -> Result<Vec<u8>, AppError> {
        let path = resolve_data_path(&self.root, relative)?;
        fs::read(path).map_err(|error| AppError::io("read_binary", error))
    }

    pub fn put_binary(&self, relative: impl AsRef<Path>, bytes: &[u8]) -> Result<(), AppError> {
        self.put_bytes(relative.as_ref(), bytes, true)
    }

    fn put_bytes(&self, relative: &Path, bytes: &[u8], journaled: bool) -> Result<(), AppError> {
        let _guard = self.mutation_lock.lock();
        let target = resolve_data_path(&self.root, relative)?;
        let relative = relative.to_string_lossy().replace('\\', "/");
        let before = checksum_file(&target).ok();
        let after = checksum_bytes(bytes);
        let mut entry = JournalEntry::pending("write", &relative, before, Some(after.clone()));
        if journaled {
            append_journal(&self.root, &entry)?;
        }

        fs::create_dir_all(target.parent().unwrap())
            .map_err(|error| AppError::io("create_parent_directory", error))?;
        let temporary = target.with_file_name(format!(
            "{}.tmp-{}",
            target.file_name().unwrap_or_default().to_string_lossy(),
            entry.operation_id
        ));
        let result = (|| {
            use std::io::Write;
            let mut file = fs::File::create(&temporary)
                .map_err(|error| AppError::io("create_data_temporary", error))?;
            file.write_all(bytes)
                .map_err(|error| AppError::io("write_data_temporary", error))?;
            file.sync_all()
                .map_err(|error| AppError::io("sync_data_temporary", error))?;
            replace_file(&temporary, &target)
                .map_err(|error| AppError::io("replace_data_file", error))?;
            let mut manifest = load_manifest(&self.root)?;
            manifest.update_file(&relative, after);
            save_manifest(&self.root, &mut manifest)?;
            entry.status = "committed".to_owned();
            if journaled {
                append_journal(&self.root, &entry)?;
            }
            Ok(())
        })();
        if result.is_err() {
            let _ = fs::remove_file(temporary);
        }
        result
    }

    pub fn delete(&self, relative: impl AsRef<Path>) -> Result<(), AppError> {
        let _guard = self.mutation_lock.lock();
        let relative_path = relative.as_ref();
        let target = resolve_data_path(&self.root, relative_path)?;
        let relative = relative_path.to_string_lossy().replace('\\', "/");
        let before = checksum_file(&target).ok();
        let mut entry = JournalEntry::pending("delete", &relative, before, None);
        append_journal(&self.root, &entry)?;
        if target.exists() {
            fs::remove_file(&target).map_err(|error| AppError::io("delete_data_file", error))?;
        }
        let mut manifest = load_manifest(&self.root)?;
        manifest.files.retain(|file| file.path != relative);
        save_manifest(&self.root, &mut manifest)?;
        entry.status = "committed".to_owned();
        append_journal(&self.root, &entry)
    }

    pub fn list(&self, relative: impl AsRef<Path>) -> Result<Vec<String>, AppError> {
        let directory = resolve_data_path(&self.root, relative)?;
        if !directory.exists() {
            return Ok(Vec::new());
        }
        let mut files = fs::read_dir(directory)
            .map_err(|error| AppError::io("list_data_directory", error))?
            .filter_map(Result::ok)
            .filter(|entry| {
                entry
                    .file_type()
                    .map(|kind| kind.is_file())
                    .unwrap_or(false)
            })
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .collect::<Vec<_>>();
        files.sort();
        Ok(files)
    }

    pub fn journal_entries(&self) -> Result<Vec<JournalEntry>, AppError> {
        read_journal(&self.root)
    }

    #[doc(hidden)]
    pub fn create_pending_write_for_test(
        &self,
        relative: &str,
        bytes: &[u8],
    ) -> Result<(), AppError> {
        let target = resolve_data_path(&self.root, relative)?;
        fs::create_dir_all(target.parent().unwrap())
            .map_err(|error| AppError::io("test_pending_parent", error))?;
        let entry = JournalEntry::pending("write", relative, None, Some(checksum_bytes(bytes)));
        let temporary = target.with_file_name(format!(
            "{}.tmp-{}",
            target.file_name().unwrap_or_default().to_string_lossy(),
            entry.operation_id
        ));
        fs::write(temporary, bytes).map_err(|error| AppError::io("test_pending_write", error))?;
        append_journal(&self.root, &entry)
    }

    #[doc(hidden)]
    pub fn create_unsafe_pending_write_for_test(
        &self,
        relative: &str,
        bytes: &[u8],
    ) -> Result<(), AppError> {
        let target = resolve_data_path(&self.root, relative)?;
        fs::create_dir_all(target.parent().unwrap())
            .map_err(|error| AppError::io("test_pending_parent", error))?;
        let entry =
            JournalEntry::pending("write", relative, None, Some(checksum_bytes(b"expected")));
        let temporary = target.with_file_name(format!(
            "{}.tmp-{}",
            target.file_name().unwrap_or_default().to_string_lossy(),
            entry.operation_id
        ));
        fs::write(temporary, bytes).map_err(|error| AppError::io("test_pending_write", error))?;
        append_journal(&self.root, &entry)
    }
}

pub fn change_data_directory(
    store: &DataStore,
    destination_base: impl AsRef<Path>,
    pointer_path: impl AsRef<Path>,
) -> Result<PathBuf, AppError> {
    let destination_base = destination_base.as_ref();
    fs::create_dir_all(destination_base)
        .map_err(|error| AppError::io("create_destination_directory", error))?;
    let canonical_destination = destination_base
        .canonicalize()
        .map_err(|error| AppError::io("canonicalize_destination", error))?;
    if canonical_destination == store.root || canonical_destination.starts_with(&store.root) {
        return Err(AppError::new(
            "invalid_data_directory",
            "The new data directory cannot be inside the active data directory",
        )
        .operation("data_change_directory"));
    }
    let final_path = canonical_destination.join("PawcastData");
    if final_path.exists() {
        return Err(AppError::new(
            "data_directory_exists",
            "A PawcastData directory already exists at the destination",
        )
        .operation("data_change_directory"));
    }
    let staging =
        canonical_destination.join(format!(".PawcastData.staging-{}", uuid::Uuid::new_v4()));
    let result = (|| {
        copy_directory(store.root(), &staging)?;
        verify_manifest_at(&staging)?;
        let mut staged_manifest = load_manifest(&staging)?;
        staged_manifest.active_data_dir = final_path.to_string_lossy().into_owned();
        save_manifest(&staging, &mut staged_manifest)?;
        fs::rename(&staging, &final_path)
            .map_err(|error| AppError::io("activate_data_directory", error))?;
        let pointer = pointer_path.as_ref();
        atomic_write(pointer, final_path.to_string_lossy().as_bytes())?;
        Ok(final_path.clone())
    })();
    if result.is_err() {
        let _ = fs::remove_dir_all(&staging);
        let _ = fs::remove_dir_all(&final_path);
    }
    result
}

pub fn verify_manifest_at(root: &Path) -> Result<(), AppError> {
    let manifest = load_manifest(root)?;
    for file in manifest.files {
        let path = resolve_data_path(root, &file.path)?;
        if checksum_file(&path)? != file.checksum {
            return Err(AppError::new(
                "checksum_mismatch",
                "Copied Pawcast data did not pass verification",
            )
            .operation("verify_data_directory"));
        }
    }
    Ok(())
}

fn copy_directory(source: &Path, destination: &Path) -> Result<(), AppError> {
    fs::create_dir_all(destination)
        .map_err(|error| AppError::io("create_staging_directory", error))?;
    for entry in walkdir::WalkDir::new(source).follow_links(false) {
        let entry = entry.map_err(|error| AppError::io("walk_data_directory", error))?;
        let relative = entry
            .path()
            .strip_prefix(source)
            .map_err(|error| AppError::io("copy_data_directory", error))?;
        if relative.as_os_str().is_empty() {
            continue;
        }
        let target = destination.join(relative);
        if entry.file_type().is_dir() {
            fs::create_dir_all(target)
                .map_err(|error| AppError::io("copy_data_directory", error))?;
        } else if entry.file_type().is_file() {
            fs::copy(entry.path(), target)
                .map_err(|error| AppError::io("copy_data_file", error))?;
        } else {
            return Err(AppError::new(
                "unsupported_data_entry",
                "The data directory contains an unsupported symbolic link",
            )
            .operation("copy_data_directory"));
        }
    }
    Ok(())
}

fn directory_lock(root: &Path) -> Arc<Mutex<()>> {
    let locks = DIRECTORY_LOCKS.get_or_init(|| Mutex::new(HashMap::new()));
    let mut locks = locks.lock();
    if let Some(lock) = locks.get(root).and_then(Weak::upgrade) {
        return lock;
    }
    let lock = Arc::new(Mutex::new(()));
    locks.insert(root.to_owned(), Arc::downgrade(&lock));
    lock
}
