use crate::{error::AppError, persistence::DataStore};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::{
    collections::{HashMap, HashSet},
    env, fs,
    path::{Path, PathBuf},
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationResult {
    pub success: bool,
    pub migrated_counts: HashMap<String, usize>,
    pub errors: Vec<String>,
}

impl MigrationResult {
    fn new() -> Self {
        Self {
            success: true,
            migrated_counts: HashMap::new(),
            errors: Vec::new(),
        }
    }

    fn add(&mut self, key: &str, count: usize) {
        if count > 0 {
            *self.migrated_counts.entry(key.to_owned()).or_default() += count;
        }
    }
}

pub fn discover_electron_data_dirs() -> Vec<PathBuf> {
    let mut bases = Vec::new();
    #[cfg(target_os = "macos")]
    if let Some(home) = env::var_os("HOME") {
        bases.push(PathBuf::from(home).join("Library/Application Support"));
    }
    #[cfg(target_os = "windows")]
    if let Some(app_data) = env::var_os("APPDATA") {
        bases.push(PathBuf::from(app_data));
    }
    #[cfg(target_os = "linux")]
    if let Some(config) = env::var_os("XDG_CONFIG_HOME") {
        bases.push(PathBuf::from(config));
    } else if let Some(home) = env::var_os("HOME") {
        bases.push(PathBuf::from(home).join(".config"));
    }
    let mut candidates = Vec::new();
    for base in bases {
        for name in ["Pawcast", "pawcast", "com.pawcast.app"] {
            let path = base.join(name);
            if path.is_dir() {
                candidates.push(path);
            }
        }
    }
    candidates.sort();
    candidates.dedup();
    candidates
}

pub fn migrate_electron_source(
    store: &DataStore,
    electron_user_data: &Path,
) -> Result<MigrationResult, AppError> {
    let mut result = MigrationResult::new();
    if let Ok(pointer) = fs::read_to_string(electron_user_data.join(".pawcast-datadir")) {
        let canonical = PathBuf::from(pointer.trim());
        if canonical.is_dir()
            && canonical.join("manifest.json").is_file()
            && canonical != store.root()
        {
            if let Err(error) = import_canonical_directory(store, &canonical, &mut result) {
                result
                    .errors
                    .push(format!("canonical-data: {}", error.message));
            }
        }
    }

    let config_path = electron_user_data.join("app-config.json");
    if config_path.exists() {
        match fs::read(&config_path)
            .map_err(|error| AppError::io("read_electron_config", error))
            .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).map_err(AppError::from))
        {
            Ok(config) => {
                if let Err(error) = import_electron_config(store, &config, &mut result) {
                    result
                        .errors
                        .push(format!("electron-store: {}", error.message));
                }
            }
            Err(error) => result
                .errors
                .push(format!("electron-store: {}", error.message)),
        }
    }
    result.success = result.errors.is_empty();
    store.set_migration_status(if result.success {
        "completed"
    } else {
        "failed"
    })?;
    Ok(result)
}

pub fn migrate_browser_payload(
    store: &DataStore,
    local_storage: &Value,
    indexed_db: &Value,
) -> Result<MigrationResult, AppError> {
    let mut result = MigrationResult::new();
    let media_files = indexed_db
        .get("mediaFiles")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let media_by_id = media_files
        .iter()
        .filter_map(|file| Some((file.get("id")?.as_str()?.to_owned(), file.clone())))
        .collect::<HashMap<_, _>>();
    let mut recording_ids = HashSet::new();

    migrate_recording_store(
        store,
        local_storage.get("shadowing-store"),
        &media_by_id,
        "sessions",
        "segments",
        "segments",
        "recordings/shadowing/index.json",
        "recordings/shadowing/files",
        "shadowingSegments",
        &mut recording_ids,
        &mut result,
    )?;
    migrate_recording_store(
        store,
        local_storage.get("sentence-practice-store"),
        &media_by_id,
        "recordings",
        "recordings",
        "recordings",
        "recordings/sentence-practice/index.json",
        "recordings/sentence-practice/files",
        "sentenceRecordings",
        &mut recording_ids,
        &mut result,
    )?;

    let existing_index = store
        .get_json("media/imported/index.json")?
        .unwrap_or_else(|| json!({"version":1,"files":[]}));
    let mut index_files = existing_index
        .get("files")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut existing_ids = index_files
        .iter()
        .filter_map(|item| item.get("id").and_then(Value::as_str).map(str::to_owned))
        .collect::<HashSet<_>>();
    let mut imported = 0;
    for file in media_files {
        let Some(id) = file.get("id").and_then(Value::as_str) else {
            continue;
        };
        if recording_ids.contains(id) || existing_ids.contains(id) {
            continue;
        }
        let extension = file
            .get("fileType")
            .and_then(Value::as_str)
            .and_then(|kind| kind.split('/').nth(1))
            .unwrap_or("bin");
        let path = format!("media/imported/files/{id}.{extension}");
        store.put_binary(&path, &byte_array(file.get("fileData"))?)?;
        index_files.push(json!({
            "id":id,
            "fileName":file.get("fileName").cloned().unwrap_or(json!(id)),
            "fileType":file.get("fileType").cloned().unwrap_or(json!("application/octet-stream")),
            "fileSize":file.get("fileSize").cloned().unwrap_or(json!(0)),
            "filePath":path,
            "createdAt":file.get("timestamp").cloned().unwrap_or(json!(crate::persistence::manifest::now_millis()))
        }));
        existing_ids.insert(id.to_owned());
        imported += 1;
    }
    if imported > 0 {
        store.put_json(
            "media/imported/index.json",
            &json!({"version":1,"files":index_files}),
        )?;
        result.add("importedMedia", imported);
    }

    let mut transcripts = 0;
    for transcript in indexed_db
        .get("transcripts")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        let Some(media_id) = transcript.get("mediaId").and_then(Value::as_str) else {
            continue;
        };
        let transcript_path = format!("study/transcripts/{media_id}.json");
        let segments = transcript.get("segments").and_then(Value::as_array);
        if store.get_json(&transcript_path)?.is_none()
            && segments.is_some_and(|items| !items.is_empty())
        {
            store.put_json(&transcript_path, &json!({
                "version":1,"mediaId":media_id,
                "updatedAt":transcript.get("updatedAt").cloned().unwrap_or(json!(crate::persistence::manifest::now_millis())),
                "segments":segments
            }))?;
            transcripts += 1;
        }
        let study_path = format!("study/transcript-study/{media_id}.json");
        if store.get_json(&study_path)?.is_none() {
            if let Some(studies) = transcript.get("studyBySegment").and_then(Value::as_object) {
                let values = studies.iter().map(|(segment_id, study)| json!({
                    "segmentId":study.get("segmentId").cloned().unwrap_or(json!(segment_id)),
                    "levelSystem":study.get("levelSystem").cloned().unwrap_or(json!("cefr")),
                    "updatedAt":study.get("updatedAt").cloned().unwrap_or(json!(crate::persistence::manifest::now_millis())),
                    "items":study.get("items").cloned().unwrap_or(json!([]))
                })).collect::<Vec<_>>();
                if !values.is_empty() {
                    store.put_json(study_path, &json!({"version":1,"mediaId":media_id,"updatedAt":transcript.get("updatedAt"),"segmentStudies":values}))?;
                }
            }
        }
    }
    result.add("transcripts", transcripts);
    result.success = true;
    store.set_migration_status("completed")?;
    Ok(result)
}

fn import_canonical_directory(
    store: &DataStore,
    source: &Path,
    result: &mut MigrationResult,
) -> Result<(), AppError> {
    let manifest = crate::persistence::manifest::load_manifest(source)?;
    for entry in manifest.files {
        let collection = match entry.path.as_str() {
            "library/media-history.json" => Some(("items", "mediaHistory")),
            "study/bookmarks.json" => Some(("bookmarks", "bookmarks")),
            "study/glossary.json" => Some(("entries", "glossary")),
            "recordings/shadowing/index.json" => Some(("segments", "shadowingSegments")),
            "recordings/sentence-practice/index.json" => Some(("recordings", "sentenceRecordings")),
            "media/imported/index.json" => Some(("files", "importedMedia")),
            _ => None,
        };
        let source_path = source.join(&entry.path);
        let bytes = fs::read(&source_path)
            .map_err(|error| AppError::io("read_legacy_canonical_file", error))?;
        if let Some((field, count_key)) = collection {
            let value: Value = serde_json::from_slice(&bytes)?;
            if let Some(items) = value.get(field).and_then(Value::as_array) {
                copy_referenced_files(store, source, items)?;
            }
            merge_collection(
                store,
                &entry.path,
                field,
                value.get(field),
                count_key,
                result,
            )?;
            continue;
        }
        if store.root().join(&entry.path).exists() {
            continue;
        }
        if let Ok(value) = serde_json::from_slice::<Value>(&bytes) {
            store.put_json(&entry.path, &value)?;
        } else {
            store.put_binary(&entry.path, &bytes)?;
        }
        result.add("canonicalFiles", 1);
    }
    Ok(())
}

fn copy_referenced_files(
    store: &DataStore,
    source: &Path,
    items: &[Value],
) -> Result<(), AppError> {
    for item in items {
        let Some(relative) = item.get("filePath").and_then(Value::as_str) else {
            continue;
        };
        if store.root().join(relative).exists() {
            continue;
        }
        let source_path = crate::persistence::paths::resolve_data_path(source, relative)?;
        if source_path.is_file() {
            let bytes = fs::read(source_path)
                .map_err(|error| AppError::io("read_legacy_media_file", error))?;
            store.put_binary(relative, &bytes)?;
        }
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn migrate_recording_store(
    store: &DataStore,
    raw_store: Option<&Value>,
    media_by_id: &HashMap<String, Value>,
    state_field: &str,
    nested_field: &str,
    output_field: &str,
    index_path: &str,
    file_directory: &str,
    count_key: &str,
    recording_ids: &mut HashSet<String>,
    result: &mut MigrationResult,
) -> Result<(), AppError> {
    let Some(raw_store) = raw_store.and_then(Value::as_str) else {
        return Ok(());
    };
    let parsed: Value = match serde_json::from_str(raw_store) {
        Ok(value) => value,
        Err(error) => {
            result.errors.push(format!("{state_field}: {error}"));
            return Ok(());
        }
    };
    let Some(groups) = parsed
        .get("state")
        .and_then(|state| state.get(state_field))
        .and_then(Value::as_object)
    else {
        return Ok(());
    };
    let existing = store.get_json(index_path)?.unwrap_or_else(|| {
        let mut object = Map::new();
        object.insert("version".into(), json!(1));
        object.insert(output_field.into(), json!([]));
        Value::Object(object)
    });
    let mut output = existing
        .get(output_field)
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let existing_ids = output
        .iter()
        .filter_map(|item| item.get("id").and_then(Value::as_str).map(str::to_owned))
        .collect::<HashSet<_>>();
    let mut additions = 0;
    for (group_id, group) in groups {
        let items = if nested_field == state_field {
            group.as_array()
        } else {
            group.get(nested_field).and_then(Value::as_array)
        };
        for item in items.into_iter().flatten() {
            let Some(id) = item.get("id").and_then(Value::as_str) else {
                continue;
            };
            if existing_ids.contains(id) {
                continue;
            }
            let storage_id = item
                .get("storageId")
                .or_else(|| item.get("filePath"))
                .and_then(Value::as_str)
                .unwrap_or(id);
            recording_ids.insert(storage_id.to_owned());
            let Some(media) = media_by_id.get(storage_id) else {
                result
                    .errors
                    .push(format!("recording file missing: {storage_id}"));
                continue;
            };
            let target = format!("{file_directory}/{storage_id}");
            store.put_binary(&target, &byte_array(media.get("fileData"))?)?;
            let mut migrated = item.clone();
            if let Some(object) = migrated.as_object_mut() {
                object.remove("storageId");
                object.insert("filePath".into(), json!(target));
                object.entry("mediaId").or_insert(json!(group_id));
                object
                    .entry("createdAt")
                    .or_insert(json!(crate::persistence::manifest::now_millis()));
            }
            output.push(migrated);
            additions += 1;
        }
    }
    if additions > 0 {
        let mut document = Map::new();
        document.insert("version".into(), json!(1));
        document.insert(output_field.into(), Value::Array(output));
        store.put_json(index_path, &Value::Object(document))?;
        result.add(count_key, additions);
    }
    Ok(())
}

fn byte_array(value: Option<&Value>) -> Result<Vec<u8>, AppError> {
    value
        .and_then(Value::as_array)
        .ok_or_else(|| {
            AppError::new(
                "invalid_migration_source",
                "Migrated binary data is invalid",
            )
        })?
        .iter()
        .map(|byte| {
            byte.as_u64()
                .and_then(|byte| u8::try_from(byte).ok())
                .ok_or_else(|| {
                    AppError::new(
                        "invalid_migration_source",
                        "Migrated binary data contains an invalid byte",
                    )
                })
        })
        .collect()
}

fn import_electron_config(
    store: &DataStore,
    config: &Value,
    result: &mut MigrationResult,
) -> Result<(), AppError> {
    let object = config.as_object().ok_or_else(|| {
        AppError::new(
            "invalid_migration_source",
            "Electron configuration is not a JSON object",
        )
    })?;
    if let Some(state) = persisted_state(object.get("abloop-player-storage")) {
        merge_collection(
            store,
            "library/media-history.json",
            "items",
            state.get("mediaHistory"),
            "mediaHistory",
            result,
        )?;
        merge_collection(
            store,
            "study/bookmarks.json",
            "bookmarks",
            flatten_bookmarks(state.get("mediaBookmarks")),
            "bookmarks",
            result,
        )?;
        merge_collection(
            store,
            "study/glossary.json",
            "entries",
            state.get("glossaryEntries"),
            "glossary",
            result,
        )?;
        write_if_absent(
            store,
            "library/media-sources.json",
            state
                .get("sourceFolders")
                .map(|folders| json!({"version":1,"folders":folders})),
        )?;
        write_if_absent(
            store,
            "library/media-folders.json",
            state
                .get("mediaFolders")
                .map(|folders| json!({"version":1,"folders":folders})),
        )?;
    } else {
        write_if_absent(
            store,
            "library/media-sources.json",
            object
                .get("sourceFolders")
                .map(|folders| json!({"version":1,"folders":folders})),
        )?;
    }

    if let Some(state) = persisted_state(object.get("abloop-settings-storage")) {
        write_if_absent(
            store,
            "settings/app-settings.json",
            Some(json!({
                "version": 1,
                "volume": state.get("volume").cloned().unwrap_or(json!(1)),
                "muted": state.get("muted").cloned().unwrap_or(json!(false)),
                "playbackRate": state.get("playbackRate").cloned().unwrap_or(json!(1)),
                "showTranscript": state.get("showTranscript").cloned().unwrap_or(json!(true)),
                "transcriptLanguage": state.get("transcriptLanguage").cloned().unwrap_or(json!("en")),
                "seekStepSeconds": state.get("seekStepSeconds").cloned().unwrap_or(json!(5)),
                "seekSmallStepSeconds": 1,
                "seekMode": state.get("seekMode").cloned().unwrap_or(json!("relative")),
                "waveformZoom": state.get("waveformZoom").cloned().unwrap_or(json!(1)),
                "showWaveform": state.get("showWaveform").cloned().unwrap_or(json!(true)),
                "videoSize": state.get("videoSize").cloned().unwrap_or(json!("md"))
            })),
        )?;
    }
    if let Some(state) = persisted_state(object.get("theme-storage")) {
        write_if_absent(
            store,
            "settings/theme-settings.json",
            Some(json!({
                "version":1,
                "theme":state.get("theme").cloned().unwrap_or(json!("dark")),
                "colors":state.get("colors").cloned().unwrap_or(json!({
                    "primary":"#a855f7","accent":"#22d3ee","success":"#22c55e","warning":"#f59e0b","error":"#ef4444","info":"#3b82f6"
                }))
            })),
        )?;
    }
    if let Some(state) = persisted_state(object.get("layout-storage")) {
        let mut layout = state.clone();
        if let Some(layout) = layout.as_object_mut() {
            layout.insert("version".to_owned(), json!(1));
            layout.entry("activeSidebarTab").or_insert(json!("history"));
        }
        write_if_absent(store, "settings/layout-settings.json", Some(layout))?;
    }
    Ok(())
}

fn persisted_state(value: Option<&Value>) -> Option<Value> {
    let value = value?;
    let parsed = if let Some(raw) = value.as_str() {
        serde_json::from_str(raw).ok()?
    } else {
        value.clone()
    };
    parsed.get("state").cloned()
}

fn flatten_bookmarks(value: Option<&Value>) -> Option<&Value> {
    value
}

fn merge_collection(
    store: &DataStore,
    path: &str,
    field: &str,
    incoming: Option<&Value>,
    count_key: &str,
    result: &mut MigrationResult,
) -> Result<(), AppError> {
    let Some(incoming) = incoming else {
        return Ok(());
    };
    let incoming_items: Vec<Value> = if let Some(array) = incoming.as_array() {
        array.clone()
    } else if let Some(map) = incoming.as_object() {
        map.values()
            .filter_map(Value::as_array)
            .flatten()
            .cloned()
            .collect()
    } else {
        Vec::new()
    };
    if incoming_items.is_empty() {
        return Ok(());
    }
    let existing = store
        .get_json(path)?
        .unwrap_or_else(|| json!({"version":1, field: []}));
    let mut output = existing
        .get(field)
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let existing_ids: HashSet<String> = output
        .iter()
        .filter_map(|item| item.get("id").and_then(Value::as_str).map(str::to_owned))
        .collect();
    let additions: Vec<Value> = incoming_items
        .into_iter()
        .filter(|item| {
            item.get("id")
                .and_then(Value::as_str)
                .map(|id| !existing_ids.contains(id))
                .unwrap_or(false)
        })
        .collect();
    let count = additions.len();
    output.extend(additions);
    if count > 0 {
        let mut document = Map::new();
        document.insert("version".to_owned(), json!(1));
        document.insert(field.to_owned(), Value::Array(output));
        store.put_json(path, &Value::Object(document))?;
        result.add(count_key, count);
    }
    Ok(())
}

fn write_if_absent(store: &DataStore, path: &str, value: Option<Value>) -> Result<(), AppError> {
    if store.get_json(path)?.is_none() {
        if let Some(value) = value {
            store.put_json(path, &value)?;
        }
    }
    Ok(())
}
