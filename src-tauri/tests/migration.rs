use pawcast_lib::persistence::{
    electron_data_candidates, migrate_browser_payload, migrate_electron_source, DataStore,
};
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
    assert_ne!(
        store.manifest().unwrap().migration_status.as_deref(),
        Some("completed"),
        "native migration alone must not suppress the renderer browser-data phase"
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
    assert_ne!(
        store.manifest().unwrap().migration_status.as_deref(),
        Some("completed")
    );

    fs::write(electron.join("app-config.json"), b"{}").unwrap();
    let retried = migrate_electron_source(&store, &electron).unwrap();
    assert!(retried.success);
    assert_ne!(
        store.manifest().unwrap().migration_status.as_deref(),
        Some("completed")
    );
}

#[test]
fn browser_payload_is_idempotent_with_duplicate_ids() {
    let temp = tempfile::tempdir().unwrap();
    let store = DataStore::open(temp.path().join("PawcastData"), "test").unwrap();
    let local_storage = json!({});
    let indexed_db = json!({
        "mediaFiles": [
            {"id":"same","fileData":[1,2],"fileType":"audio/wav","fileName":"a.wav","fileSize":2,"timestamp":1},
            {"id":"same","fileData":[1,2],"fileType":"audio/wav","fileName":"a.wav","fileSize":2,"timestamp":1}
        ],
        "transcripts": []
    });

    migrate_browser_payload(&store, &local_storage, &indexed_db).unwrap();
    migrate_browser_payload(&store, &local_storage, &indexed_db).unwrap();

    let index = store
        .get_json("media/imported/index.json")
        .unwrap()
        .unwrap();
    assert_eq!(index["files"].as_array().unwrap().len(), 1);
}

#[test]
fn canonical_import_rejects_checksum_mismatch_before_copying() {
    let temp = tempfile::tempdir().unwrap();
    let electron = temp.path().join("electron-user-data");
    let legacy = electron.join("PawcastData");
    let legacy_store = DataStore::open(&legacy, "old").unwrap();
    legacy_store
        .put_json(
            "library/media-history.json",
            &json!({"version":1,"items":[]}),
        )
        .unwrap();
    fs::write(
        legacy.join("library/media-history.json"),
        br#"{"version":1,"items":[{"id":"corrupt"}]}"#,
    )
    .unwrap();
    fs::create_dir_all(&electron).unwrap();
    fs::write(
        electron.join(".pawcast-datadir"),
        legacy.to_string_lossy().as_bytes(),
    )
    .unwrap();

    let destination = DataStore::open(temp.path().join("new/PawcastData"), "new").unwrap();
    let result = migrate_electron_source(&destination, &electron).unwrap();
    assert!(!result.success);
    assert!(result.errors.iter().any(|error| error.contains("checksum")));
    assert!(destination
        .get_json("library/media-history.json")
        .unwrap()
        .is_none());
}

#[test]
fn canonical_import_skips_missing_manifest_files() {
    let temp = tempfile::tempdir().unwrap();
    let electron = temp.path().join("electron-user-data");
    let legacy = electron.join("PawcastData");
    let legacy_store = DataStore::open(&legacy, "old").unwrap();
    legacy_store
        .put_json(
            "library/media-history.json",
            &json!({"version":1,"items":[{"id":"keep","mediaId":"m1","type":"file","name":"Keep","accessedAt":1}]}),
        )
        .unwrap();
    legacy_store
        .put_json("study/bookmarks.json", &json!({"version":1,"bookmarks":[]}))
        .unwrap();
    fs::remove_file(legacy.join("study/bookmarks.json")).unwrap();
    fs::create_dir_all(&electron).unwrap();
    fs::write(
        electron.join(".pawcast-datadir"),
        legacy.to_string_lossy().as_bytes(),
    )
    .unwrap();

    let destination = DataStore::open(temp.path().join("new/PawcastData"), "new").unwrap();
    let result = migrate_electron_source(&destination, &electron).unwrap();

    assert!(result.success);
    assert_eq!(result.migrated_counts.get("mediaHistory"), Some(&1));
    assert!(destination
        .get_json("study/bookmarks.json")
        .unwrap()
        .is_none());
}

#[test]
fn electron_config_deduplicates_repeated_incoming_ids() {
    let temp = tempfile::tempdir().unwrap();
    let electron = temp.path().join("electron-user-data");
    fs::create_dir_all(&electron).unwrap();
    let player_state = json!({
        "state": {
            "mediaHistory": [
                {"id":"duplicate","mediaId":"m1","type":"file","name":"One","accessedAt":1},
                {"id":"duplicate","mediaId":"m1","type":"file","name":"One","accessedAt":1}
            ]
        },
        "version": 0
    });
    fs::write(
        electron.join("app-config.json"),
        serde_json::to_vec(&json!({
            "abloop-player-storage": serde_json::to_string(&player_state).unwrap()
        }))
        .unwrap(),
    )
    .unwrap();
    let store = DataStore::open(temp.path().join("PawcastData"), "test").unwrap();

    migrate_electron_source(&store, &electron).unwrap();

    let history = store
        .get_json("library/media-history.json")
        .unwrap()
        .unwrap();
    assert_eq!(history["items"].as_array().unwrap().len(), 1);
}

#[test]
fn electron_data_candidates_cover_supported_operating_system_locations() {
    let home = std::path::Path::new("/home/learner");
    let appdata = std::path::Path::new("C:/Users/learner/AppData/Roaming");
    let xdg = std::path::Path::new("/custom/config");

    assert!(electron_data_candidates("macos", Some(home), None, None)
        .contains(&home.join("Library/Application Support/Pawcast")));
    assert!(
        electron_data_candidates("windows", Some(home), Some(appdata), None)
            .contains(&appdata.join("com.pawcast.app"))
    );
    assert!(
        electron_data_candidates("linux", Some(home), None, Some(xdg))
            .contains(&xdg.join("pawcast"))
    );
    assert!(electron_data_candidates("linux", Some(home), None, None)
        .contains(&home.join(".config/Pawcast")));
}
