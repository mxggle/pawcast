use pawcast_lib::persistence::{migrate_electron_source, DataStore};
use serde_json::json;
use std::fs;

#[test]
fn electron_store_migration_is_non_destructive_idempotent_and_canonical_wins() {
    let temp = tempfile::tempdir().unwrap();
    let electron = temp.path().join("electron-user-data");
    let legacy_data = electron.join("LegacyPawcastData");
    fs::create_dir_all(&legacy_data).unwrap();
    fs::write(
        electron.join(".pawcast-datadir"),
        legacy_data.to_string_lossy().as_bytes(),
    )
    .unwrap();
    fs::write(
        electron.join("app-config.json"),
        include_bytes!("fixtures/electron-app-config.json"),
    )
    .unwrap();
    let source_before = fs::read(electron.join("app-config.json")).unwrap();

    let store = DataStore::open(temp.path().join("tauri/PawcastData"), "1.0.0-beta.3").unwrap();
    store.put_json("library/media-history.json", &json!({"version":1,"items":[{"id":"canonical","mediaId":"m2","type":"file","name":"Canonical","accessedAt":2,"playbackTime":0,"folderId":null},{"id":"legacy","mediaId":"m1","type":"file","name":"Canonical wins","accessedAt":3,"playbackTime":5,"folderId":null}]})).unwrap();

    let first = migrate_electron_source(&store, &electron).unwrap();
    assert!(first.success);
    assert_eq!(first.migrated_counts.get("mediaHistory"), None);
    let history = store
        .get_json("library/media-history.json")
        .unwrap()
        .unwrap();
    assert_eq!(history["items"].as_array().unwrap().len(), 2);
    assert_eq!(history["items"][1]["name"], "Canonical wins");
    let second = migrate_electron_source(&store, &electron).unwrap();
    assert!(second.success);
    assert!(second.migrated_counts.values().all(|count| *count == 0));
    assert_eq!(
        fs::read(electron.join("app-config.json")).unwrap(),
        source_before
    );
    assert_eq!(
        store.manifest().unwrap().migration_status.as_deref(),
        Some("completed")
    );
}

#[test]
fn a_failed_stage_is_not_marked_complete_and_can_be_retried() {
    let temp = tempfile::tempdir().unwrap();
    let electron = temp.path().join("electron-user-data");
    fs::create_dir_all(&electron).unwrap();
    fs::write(electron.join("app-config.json"), b"not json").unwrap();
    let store = DataStore::open(temp.path().join("PawcastData"), "test").unwrap();

    let failed = migrate_electron_source(&store, &electron).unwrap();
    assert!(!failed.success);
    assert_eq!(
        store.manifest().unwrap().migration_status.as_deref(),
        Some("failed")
    );

    fs::write(electron.join("app-config.json"), b"{}").unwrap();
    let retried = migrate_electron_source(&store, &electron).unwrap();
    assert!(retried.success);
    assert_eq!(
        store.manifest().unwrap().migration_status.as_deref(),
        Some("completed")
    );
}
