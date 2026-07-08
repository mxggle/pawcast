use pawcast_lib::media::protocol::{
    decode_protocol_path, prepare_media_response, read_planned_body, ByteRange, MediaMethod,
};
use std::fs;

#[test]
fn parses_full_open_ended_and_suffix_ranges() {
    let temp = tempfile::tempdir().unwrap();
    let file = temp.path().join("clip.mp4");
    fs::write(&file, (0_u8..100).collect::<Vec<_>>()).unwrap();
    let roots = vec![temp.path().canonicalize().unwrap()];

    let full = prepare_media_response(&file, MediaMethod::Get, None, &roots).unwrap();
    assert_eq!(full.status, 200);
    assert_eq!(full.content_length, 100);
    assert_eq!(full.mime_type, "video/mp4");
    assert_eq!(full.range, ByteRange { start: 0, end: 99 });

    let bounded =
        prepare_media_response(&file, MediaMethod::Get, Some("bytes=10-19"), &roots).unwrap();
    assert_eq!(bounded.status, 206);
    assert_eq!(bounded.range, ByteRange { start: 10, end: 19 });
    assert_eq!(bounded.content_range.as_deref(), Some("bytes 10-19/100"));
    assert_eq!(
        read_planned_body(&bounded).unwrap(),
        (10_u8..20).collect::<Vec<_>>()
    );

    let open = prepare_media_response(&file, MediaMethod::Get, Some("bytes=90-"), &roots).unwrap();
    assert_eq!(open.range, ByteRange { start: 90, end: 99 });

    let suffix = prepare_media_response(&file, MediaMethod::Get, Some("bytes=-7"), &roots).unwrap();
    assert_eq!(suffix.range, ByteRange { start: 93, end: 99 });
}

#[test]
fn head_has_no_body_and_invalid_ranges_return_416_plan() {
    let temp = tempfile::tempdir().unwrap();
    let file = temp.path().join("audio.flac");
    fs::write(&file, [1_u8; 8]).unwrap();
    let roots = vec![temp.path().canonicalize().unwrap()];

    let head = prepare_media_response(&file, MediaMethod::Head, None, &roots).unwrap();
    assert_eq!(head.status, 200);
    assert!(!head.include_body);

    let invalid =
        prepare_media_response(&file, MediaMethod::Get, Some("bytes=20-30"), &roots).unwrap();
    assert_eq!(invalid.status, 416);
    assert_eq!(invalid.content_range.as_deref(), Some("bytes */8"));
    assert!(!invalid.include_body);
}

#[test]
fn rejects_unapproved_media() {
    let temp = tempfile::tempdir().unwrap();
    let approved = tempfile::tempdir().unwrap();
    let file = temp.path().join("audio.mp3");
    fs::write(&file, b"audio").unwrap();
    assert!(prepare_media_response(
        &file,
        MediaMethod::Get,
        None,
        &[approved.path().canonicalize().unwrap()],
    )
    .is_err());
}

#[test]
fn decodes_tauri_custom_protocol_urls_on_all_desktop_platforms() {
    let encoded = "%2FUsers%2Flearner%2FMedia%2Flesson%201.mp3";
    let unix = url::Url::parse(&format!("local-media://localhost/{encoded}")).unwrap();
    let windows_webview =
        url::Url::parse(&format!("http://local-media.localhost/{encoded}")).unwrap();
    let legacy = url::Url::parse(&format!("local-media://media/{encoded}")).unwrap();
    let expected = std::path::PathBuf::from("/Users/learner/Media/lesson 1.mp3");
    assert_eq!(decode_protocol_path(&unix).unwrap(), expected);
    assert_eq!(decode_protocol_path(&windows_webview).unwrap(), expected);
    assert_eq!(decode_protocol_path(&legacy).unwrap(), expected);
}

#[cfg(windows)]
#[test]
fn decodes_windows_drive_paths_without_unix_prefix() {
    let encoded = "%2FC%3A%2FUsers%2Flearner%2FMedia%2Flesson%201.mp3";
    let url = url::Url::parse(&format!("http://local-media.localhost/{encoded}")).unwrap();
    let expected = std::path::PathBuf::from("C:/Users/learner/Media/lesson 1.mp3");

    assert_eq!(decode_protocol_path(&url).unwrap(), expected);
}

#[cfg(not(windows))]
#[test]
fn preserves_drive_like_paths_on_unix_platforms() {
    let encoded = "%2FC%3A%2FUsers%2Flearner%2FMedia%2Flesson%201.mp3";
    let url = url::Url::parse(&format!("http://local-media.localhost/{encoded}")).unwrap();
    let expected = std::path::PathBuf::from("/C:/Users/learner/Media/lesson 1.mp3");

    assert_eq!(decode_protocol_path(&url).unwrap(), expected);
}
