use crate::{
    error::AppError,
    persistence::{
        manifest::{checksum_file, now_millis, replace_file},
        paths::resolve_data_path,
    },
};
use chrono::Local;
use serde::{Deserialize, Serialize};
use std::{fs, io::Write, path::Path};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalEntry {
    pub operation_id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub target_path: String,
    pub before_checksum: Option<String>,
    pub after_checksum: Option<String>,
    pub timestamp: i64,
    pub status: String,
}

impl JournalEntry {
    pub fn pending(
        kind: &str,
        target_path: &str,
        before: Option<String>,
        after: Option<String>,
    ) -> Self {
        Self {
            operation_id: Uuid::new_v4().to_string(),
            kind: kind.to_owned(),
            target_path: target_path.to_owned(),
            before_checksum: before,
            after_checksum: after,
            timestamp: now_millis(),
            status: "pending".to_owned(),
        }
    }
}

pub fn append_journal(data_dir: &Path, entry: &JournalEntry) -> Result<(), AppError> {
    let directory = data_dir.join("backups/journal");
    fs::create_dir_all(&directory)
        .map_err(|error| AppError::io("create_journal_directory", error))?;
    let path = directory.join(format!("{}.jsonl", Local::now().format("%Y-%m-%d")));
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|error| AppError::io("open_journal", error))?;
    serde_json::to_writer(&mut file, entry)?;
    file.write_all(b"\n")
        .map_err(|error| AppError::io("append_journal", error))?;
    file.sync_data()
        .map_err(|error| AppError::io("sync_journal", error))
}

pub fn read_journal(data_dir: &Path) -> Result<Vec<JournalEntry>, AppError> {
    let directory = data_dir.join("backups/journal");
    if !directory.exists() {
        return Ok(Vec::new());
    }
    let mut files = fs::read_dir(directory)
        .map_err(|error| AppError::io("read_journal", error))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.extension().and_then(|ext| ext.to_str()) == Some("jsonl"))
        .collect::<Vec<_>>();
    files.sort();
    let mut entries = Vec::new();
    for path in files {
        for line in fs::read_to_string(path)
            .map_err(|error| AppError::io("read_journal_file", error))?
            .lines()
        {
            if let Ok(entry) = serde_json::from_str(line) {
                entries.push(entry);
            }
        }
    }
    Ok(entries)
}

pub fn recover_journal(data_dir: &Path) -> Result<Vec<String>, AppError> {
    let directory = data_dir.join("backups/journal");
    if !directory.exists() {
        return Ok(Vec::new());
    }
    let mut recovered = Vec::new();
    let mut files = fs::read_dir(&directory)
        .map_err(|error| AppError::io("read_journal", error))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.extension().and_then(|ext| ext.to_str()) == Some("jsonl"))
        .collect::<Vec<_>>();
    files.sort();
    for journal_path in files {
        let raw = fs::read_to_string(&journal_path)
            .map_err(|error| AppError::io("read_journal_file", error))?;
        let mut output = Vec::new();
        for line in raw.lines() {
            let Ok(mut entry) = serde_json::from_str::<JournalEntry>(line) else {
                output.push(line.to_owned());
                continue;
            };
            let target = resolve_data_path(data_dir, &entry.target_path)?;
            let temporary = target.with_file_name(format!(
                "{}.tmp-{}",
                target.file_name().unwrap_or_default().to_string_lossy(),
                entry.operation_id
            ));
            if entry.status == "committed" {
                let current = checksum_file(&target).ok();
                if current != entry.after_checksum
                    && temporary.exists()
                    && checksum_file(&temporary).ok() == entry.after_checksum
                {
                    replace_file(&temporary, &target)
                        .map_err(|error| AppError::io("replay_journal", error))?;
                    recovered.push(entry.target_path.clone());
                }
            } else if entry.status == "pending" {
                if entry.after_checksum.is_some()
                    && temporary.exists()
                    && checksum_file(&temporary).ok() == entry.after_checksum
                {
                    replace_file(&temporary, &target)
                        .map_err(|error| AppError::io("commit_pending_journal", error))?;
                    entry.status = "committed".to_owned();
                    recovered.push(entry.target_path.clone());
                } else {
                    let _ = fs::remove_file(&temporary);
                    entry.status = "rolled_back".to_owned();
                }
            }
            output.push(serde_json::to_string(&entry)?);
        }
        let serialized = if output.is_empty() {
            String::new()
        } else {
            format!("{}\n", output.join("\n"))
        };
        crate::persistence::manifest::atomic_write(&journal_path, serialized.as_bytes())?;
    }
    Ok(recovered)
}
