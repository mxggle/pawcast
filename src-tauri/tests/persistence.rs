use pawcast_lib::persistence::{change_data_directory, DataStore};
use serde_json::json;
use std::{fs, path::Path};

#[test]
fn json_write_is_atomic_and_updates_manifest() {
    let temp = tempfile::tempdir().unwrap();
    let store = DataStore::open(temp.path().join("PawcastData"), "1.0.0-beta.3").unwrap();
    store
        .put_json("settings/app-settings.json", &json!({"version": 1}))
        .unwrap();
    assert_eq!(
        store.get_json("settings/app-settings.json").unwrap(),
        Some(json!({"version": 1}))
    );
    let manifest = store.manifest().unwrap();
    assert!(manifest
        .files
        .iter()
        .any(|file| file.path == "settings/app-settings.json"));
    assert_eq!(manifest.schema_version, 1);
    assert_no_temporary_files(store.root());
}

#[test]
fn rejects_parent_and_absolute_paths() {
    let temp = tempfile::tempdir().unwrap();
    let store = DataStore::open(temp.path().join("PawcastData"), "test").unwrap();
    assert_eq!(
        store
            .put_json("../escape.json", &json!({}))
            .unwrap_err()
            .code,
        "invalid_data_path"
    );
    assert_eq!(
        store
            .put_json(temp.path().join("absolute.json"), &json!({}))
            .unwrap_err()
            .code,
        "invalid_data_path"
    );
}

#[cfg(unix)]
#[test]
fn rejects_symlink_escape_for_new_targets() {
    use std::os::unix::fs::symlink;
    let temp = tempfile::tempdir().unwrap();
    let outside = temp.path().join("outside");
    fs::create_dir(&outside).unwrap();
    let store = DataStore::open(temp.path().join("PawcastData"), "test").unwrap();
    symlink(&outside, store.root().join("library/link")).unwrap();
    assert_eq!(
        store
            .put_json("library/link/escape.json", &json!({}))
            .unwrap_err()
            .code,
        "invalid_data_path"
    );
}

#[test]
fn delete_is_committed_to_journal_and_manifest() {
    let temp = tempfile::tempdir().unwrap();
    let store = DataStore::open(temp.path().join("PawcastData"), "test").unwrap();
    store
        .put_json("library/item.json", &json!({"id":"one"}))
        .unwrap();
    store.delete("library/item.json").unwrap();
    assert_eq!(store.get_json("library/item.json").unwrap(), None);
    assert!(!store
        .manifest()
        .unwrap()
        .files
        .iter()
        .any(|file| file.path == "library/item.json"));
    let journal = store.journal_entries().unwrap();
    assert!(journal
        .iter()
        .any(|entry| entry.target_path == "library/item.json"
            && entry.kind == "delete"
            && entry.status == "committed"));
}

#[test]
fn binary_data_round_trips_and_is_manifested() {
    let temp = tempfile::tempdir().unwrap();
    let store = DataStore::open(temp.path().join("PawcastData"), "test").unwrap();
    let bytes = vec![0, 1, 2, 127, 255];
    store
        .put_binary("media/imported/files/test.bin", &bytes)
        .unwrap();
    assert_eq!(
        store.get_binary("media/imported/files/test.bin").unwrap(),
        bytes
    );
    assert!(store
        .manifest()
        .unwrap()
        .files
        .iter()
        .any(|file| file.path == "media/imported/files/test.bin"));
}

#[test]
fn clones_serialize_mutations_for_the_same_directory() {
    let temp = tempfile::tempdir().unwrap();
    let store = DataStore::open(temp.path().join("PawcastData"), "test").unwrap();
    let other = store.clone();
    let first = std::thread::spawn(move || {
        for value in 0..20 {
            store
                .put_json("library/shared.json", &json!({"value": value}))
                .unwrap();
        }
    });
    let second = std::thread::spawn(move || {
        for value in 20..40 {
            other
                .put_json("library/shared.json", &json!({"value": value}))
                .unwrap();
        }
    });
    first.join().unwrap();
    second.join().unwrap();
    let reopened = DataStore::open(temp.path().join("PawcastData"), "test").unwrap();
    assert!(reopened.get_json("library/shared.json").unwrap().is_some());
    assert_eq!(
        reopened
            .manifest()
            .unwrap()
            .files
            .iter()
            .find(|f| f.path == "library/shared.json")
            .unwrap()
            .version,
        40
    );
}

#[test]
fn failed_directory_copy_rolls_back_staging_and_pointer() {
    let temp = tempfile::tempdir().unwrap();
    let source = DataStore::open(temp.path().join("source/PawcastData"), "test").unwrap();
    source
        .put_json("library/item.json", &json!({"id":"one"}))
        .unwrap();
    fs::write(source.root().join("library/item.json"), b"tampered").unwrap();
    let pointer = temp.path().join("config/.pawcast-datadir");
    fs::create_dir_all(pointer.parent().unwrap()).unwrap();
    fs::write(&pointer, source.root().to_string_lossy().as_bytes()).unwrap();

    assert!(change_data_directory(&source, temp.path().join("destination"), &pointer).is_err());
    assert_eq!(
        fs::read_to_string(&pointer).unwrap(),
        source.root().to_string_lossy()
    );
    assert!(!temp.path().join("destination/PawcastData").exists());
    let leftovers = fs::read_dir(temp.path().join("destination"))
        .unwrap()
        .count();
    assert_eq!(leftovers, 0);
}

#[test]
fn rejects_destination_nested_inside_active_directory() {
    let temp = tempfile::tempdir().unwrap();
    let source = DataStore::open(temp.path().join("PawcastData"), "test").unwrap();
    let error = change_data_directory(
        &source,
        source.root().join("nested"),
        temp.path().join("pointer"),
    )
    .unwrap_err();
    assert_eq!(error.code, "invalid_data_directory");
}

fn assert_no_temporary_files(root: &Path) {
    for entry in walkdir::WalkDir::new(root) {
        let entry = entry.unwrap();
        assert!(!entry.file_name().to_string_lossy().contains(".tmp-"));
    }
}
