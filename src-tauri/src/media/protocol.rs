use crate::commands::filesystem::canonicalize_approved_path;
use crate::error::AppError;
use crate::state::AppState;
use percent_encoding::percent_decode_str;
use serde::Serialize;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use tauri::Manager;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MediaMethod {
    Get,
    Head,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct ByteRange {
    pub start: u64,
    pub end: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MediaResponsePlan {
    pub status: u16,
    pub file_path: PathBuf,
    pub file_size: u64,
    pub content_length: u64,
    pub content_range: Option<String>,
    pub mime_type: String,
    pub range: ByteRange,
    pub include_body: bool,
}

fn unsatisfied(file_path: PathBuf, file_size: u64, mime_type: String) -> MediaResponsePlan {
    MediaResponsePlan {
        status: 416,
        file_path,
        file_size,
        content_length: 0,
        content_range: Some(format!("bytes */{file_size}")),
        mime_type,
        range: ByteRange { start: 0, end: 0 },
        include_body: false,
    }
}

fn parse_range(value: &str, size: u64) -> Option<ByteRange> {
    let value = value.trim();
    let range = value.strip_prefix("bytes=")?;
    if range.contains(',') || size == 0 {
        return None;
    }
    let (start, end) = range.split_once('-')?;
    if start.is_empty() {
        let length = end.parse::<u64>().ok()?;
        if length == 0 {
            return None;
        }
        return Some(ByteRange {
            start: size.saturating_sub(length),
            end: size - 1,
        });
    }
    let start = start.parse::<u64>().ok()?;
    if start >= size {
        return None;
    }
    let end = if end.is_empty() {
        size - 1
    } else {
        end.parse::<u64>().ok()?.min(size - 1)
    };
    (end >= start).then_some(ByteRange { start, end })
}

pub fn prepare_media_response(
    path: &Path,
    method: MediaMethod,
    range_header: Option<&str>,
    approved_roots: &[PathBuf],
) -> Result<MediaResponsePlan, AppError> {
    let path = canonicalize_approved_path(path, approved_roots)?;
    let metadata = path
        .metadata()
        .map_err(|error| AppError::io("local_media_metadata", error))?;
    if !metadata.is_file() {
        return Err(
            AppError::new("media_not_found", "Media file was not found").operation("local_media")
        );
    }
    let file_size = metadata.len();
    let mime_type = mime_guess::from_path(&path)
        .first_or_octet_stream()
        .essence_str()
        .to_owned();
    let full = ByteRange {
        start: 0,
        end: file_size.saturating_sub(1),
    };
    if method == MediaMethod::Head {
        return Ok(MediaResponsePlan {
            status: 200,
            file_path: path,
            file_size,
            content_length: file_size,
            content_range: None,
            mime_type,
            range: full,
            include_body: false,
        });
    }
    let Some(header) = range_header else {
        return Ok(MediaResponsePlan {
            status: 200,
            file_path: path,
            file_size,
            content_length: file_size,
            content_range: None,
            mime_type,
            range: full,
            include_body: true,
        });
    };
    let Some(range) = parse_range(header, file_size) else {
        return Ok(unsatisfied(path, file_size, mime_type));
    };
    Ok(MediaResponsePlan {
        status: 206,
        file_path: path,
        file_size,
        content_length: range.end - range.start + 1,
        content_range: Some(format!("bytes {}-{}/{file_size}", range.start, range.end)),
        mime_type,
        range,
        include_body: true,
    })
}

pub fn decode_protocol_path(url: &url::Url) -> Result<PathBuf, AppError> {
    let native_scheme =
        url.scheme() == "local-media" && matches!(url.host_str(), Some("localhost" | "media"));
    let windows_webview_scheme =
        url.scheme() == "http" && url.host_str() == Some("local-media.localhost");
    if !native_scheme && !windows_webview_scheme {
        return Err(
            AppError::new("invalid_media_url", "Media URL is invalid").operation("local_media")
        );
    }
    let encoded_path = if url
        .path()
        .get(1..4)
        .is_some_and(|prefix| prefix.eq_ignore_ascii_case("%2f"))
    {
        &url.path()[1..]
    } else {
        url.path()
    };
    let decoded = percent_decode_str(encoded_path)
        .decode_utf8()
        .map_err(|_| {
            AppError::new("invalid_media_url", "Media URL encoding is invalid")
                .operation("local_media")
        })?;
    #[cfg(windows)]
    let decoded_path: &str = decoded
        .strip_prefix('/')
        .filter(|path| path.as_bytes().get(1) == Some(&b':'))
        .unwrap_or(&decoded);
    #[cfg(not(windows))]
    let decoded_path: &str = decoded.as_ref();
    Ok(PathBuf::from(decoded_path))
}

pub fn read_planned_body(plan: &MediaResponsePlan) -> Result<Vec<u8>, AppError> {
    if !plan.include_body || plan.content_length == 0 {
        return Ok(Vec::new());
    }
    let length = usize::try_from(plan.content_length).map_err(|_| {
        AppError::new("media_too_large", "Requested media range is too large")
            .operation("local_media")
    })?;
    let mut file =
        File::open(&plan.file_path).map_err(|error| AppError::io("local_media_open", error))?;
    file.seek(SeekFrom::Start(plan.range.start))
        .map_err(|error| AppError::io("local_media_seek", error))?;
    let mut body = Vec::with_capacity(length.min(1024 * 1024));
    file.take(plan.content_length)
        .read_to_end(&mut body)
        .map_err(|error| AppError::io("local_media_read", error))?;
    Ok(body)
}

pub fn handle_protocol_request(
    app: &tauri::AppHandle,
    request: tauri::http::Request<Vec<u8>>,
) -> tauri::http::Response<Vec<u8>> {
    let response = (|| {
        let url = url::Url::parse(&request.uri().to_string()).map_err(|_| {
            AppError::new("invalid_media_url", "Media URL is invalid").operation("local_media")
        })?;
        let path = decode_protocol_path(&url)?;
        let method = match *request.method() {
            tauri::http::Method::GET => MediaMethod::Get,
            tauri::http::Method::HEAD => MediaMethod::Head,
            _ => {
                return Ok(tauri::http::Response::builder()
                    .status(tauri::http::StatusCode::METHOD_NOT_ALLOWED)
                    .body(Vec::new())
                    .expect("static protocol response"));
            }
        };
        let roots = app
            .state::<AppState>()
            .approved_paths
            .read()
            .iter()
            .cloned()
            .collect::<Vec<_>>();
        let range = request
            .headers()
            .get(tauri::http::header::RANGE)
            .and_then(|value| value.to_str().ok());
        let plan = prepare_media_response(&path, method, range, &roots)?;
        let body = read_planned_body(&plan)?;
        let mut response = tauri::http::Response::builder()
            .status(plan.status)
            .header(tauri::http::header::ACCEPT_RANGES, "bytes")
            .header(tauri::http::header::CONTENT_TYPE, plan.mime_type)
            .header(tauri::http::header::CONTENT_LENGTH, plan.content_length)
            .header(tauri::http::header::CACHE_CONTROL, "no-store")
            .header(tauri::http::header::ACCESS_CONTROL_ALLOW_ORIGIN, "*");
        if let Some(content_range) = plan.content_range {
            response = response.header(tauri::http::header::CONTENT_RANGE, content_range);
        }
        Ok(response.body(body).expect("validated protocol response"))
    })();
    response.unwrap_or_else(|error: AppError| {
        let status = if error.code == "path_not_approved" {
            tauri::http::StatusCode::FORBIDDEN
        } else if error.code == "media_not_found" {
            tauri::http::StatusCode::NOT_FOUND
        } else {
            tauri::http::StatusCode::BAD_REQUEST
        };
        tauri::http::Response::builder()
            .status(status)
            .header(
                tauri::http::header::CONTENT_TYPE,
                "text/plain; charset=utf-8",
            )
            .body(error.message.into_bytes())
            .expect("static protocol error response")
    })
}
