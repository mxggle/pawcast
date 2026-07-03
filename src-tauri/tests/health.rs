use pawcast_lib::persistence::{recover, run_health_check, DataStore};
use serde_json::json;
use std::fs;

#[test]
fn health_reports_checksum_failures_and_orphaned_index_references() {
    let temp = tempfile::tempdir().unwrap();
    let store = DataStore::open(temp.path().join("PawcastData"), "test").unwrap();
    store
        .put_json("settings/app-settings.json", &json!({"version":1}))
        .unwrap();
    store.put_json("recordings/shadowing/index.json", &json!({"version":1,"segments":[{"id":"r1","filePath":"recordings/shadowing/files/missing.webm"}]})).unwrap();
    fs::write(store.root().join("settings/app-settings.json"), b"tampered").unwrap();

    let health = run_health_check(&store).unwrap();
    assert!(health.manifest_ok);
    assert_eq!(health.status, "damaged");
    assert!(health
        .failed_checksums
        .contains(&"settings/app-settings.json".to_string()));
    assert!(health
        .orphaned_references
        .contains(&"recordings/shadowing/files/missing.webm".to_string()));
}

#[test]
fn journal_recovery_commits_matching_temporary_files_and_rolls_back_unsafe_ones() {
    let temp = tempfile::tempdir().unwrap();
    let store = DataStore::open(temp.path().join("PawcastData"), "test").unwrap();
    store
        .create_pending_write_for_test("library/recover.json", b"{\"ok\":true}")
        .unwrap();
    store
        .create_unsafe_pending_write_for_test("library/discard.json", b"bad")
        .unwrap();

    let result = recover(&store, "journal").unwrap();
    assert!(result.success);
    assert_eq!(
        store.get_json("library/recover.json").unwrap(),
        Some(json!({"ok":true}))
    );
    assert!(!store.root().join("library/discard.json").exists());
    assert_no_temporary_files(store.root());
}

#[test]
fn unsupported_recovery_is_a_typed_non_retryable_error() {
    let temp = tempfile::tempdir().unwrap();
    let store = DataStore::open(temp.path().join("PawcastData"), "test").unwrap();
    let error = recover(&store, "remigrate").unwrap_err();
    assert_eq!(error.code, "unsupported_recovery_strategy");
    assert!(!error.retryable);
}

fn assert_no_temporary_files(root: &std::path::Path) {
    for entry in walkdir::WalkDir::new(root) {
        let entry = entry.unwrap();
        assert!(!entry.file_name().to_string_lossy().contains(".tmp-"));
    }
}
