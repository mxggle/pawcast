use crate::error::AppError;
use std::path::{Component, Path, PathBuf};

pub const CANONICAL_DIRECTORIES: &[&str] = &[
    "settings",
    "library",
    "study/transcripts",
    "study/transcript-study",
    "recordings/shadowing/files",
    "recordings/sentence-practice/files",
    "media/imported/files",
    "cache/waveform",
    "backups/snapshots",
    "backups/journal",
];

pub fn resolve_data_path(root: &Path, relative: impl AsRef<Path>) -> Result<PathBuf, AppError> {
    let relative = relative.as_ref();
    if relative.as_os_str().is_empty()
        || relative.is_absolute()
        || relative
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err(invalid_path());
    }

    let canonical_root = root
        .canonicalize()
        .map_err(|error| AppError::io("resolve_data_root", error))?;
    let target = canonical_root.join(relative);

    let mut existing = target.as_path();
    while !existing.exists() {
        existing = existing.parent().ok_or_else(invalid_path)?;
    }
    let canonical_parent = existing
        .canonicalize()
        .map_err(|error| AppError::io("resolve_data_path", error))?;
    if canonical_parent != canonical_root && !canonical_parent.starts_with(&canonical_root) {
        return Err(invalid_path());
    }
    Ok(target)
}

fn invalid_path() -> AppError {
    AppError::new(
        "invalid_data_path",
        "The requested path is outside the Pawcast data directory",
    )
    .operation("data_path")
}
