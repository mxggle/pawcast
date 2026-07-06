use crate::commands::filesystem::remove_window_watchers;
use crate::error::AppError;
use crate::state::AppState;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NavigatePayload {
    route: String,
    entry_id: Option<String>,
}

fn settings_fragment(tab: Option<&str>, section: Option<&str>) -> String {
    let mut query = url::form_urlencoded::Serializer::new(String::new());
    if let Some(tab) = tab.filter(|value| matches!(*value, "general" | "ai" | "data")) {
        query.append_pair("tab", tab);
    }
    if let Some(section) = section.map(str::trim).filter(|value| !value.is_empty()) {
        query.append_pair("section", section);
    }
    let query = query.finish();
    if query.is_empty() {
        "/settings-window".into()
    } else {
        format!("/settings-window?{query}")
    }
}

fn focus_or_create(
    app: &AppHandle,
    label: &str,
    title: &str,
    fragment: &str,
) -> Result<(), AppError> {
    if let Some(window) = app.get_webview_window(label) {
        let mut url = window
            .url()
            .map_err(|error| AppError::io("window_url", error))?;
        url.set_fragment(Some(fragment));
        window
            .navigate(url)
            .map_err(|error| AppError::io("window_navigate", error))?;
        let _ = window.unminimize();
        window
            .set_focus()
            .map_err(|error| AppError::io("window_focus", error))?;
        return Ok(());
    }
    let app_path = format!("index.html#{fragment}");
    #[allow(unused_mut)]
    let mut builder = WebviewWindowBuilder::new(app, label, WebviewUrl::App(app_path.into()))
        .title(title)
        .inner_size(960.0, 760.0)
        .min_inner_size(720.0, 560.0);
    // Match the main window's unified title bar: content extends under the
    // (hidden) macOS title bar and the shell header provides the drag region.
    // tao positions the buttons so their vertical CENTER sits `y` px from the
    // window top; the shells render a 52px title bar, so y = 52 / 2 = 26.
    #[cfg(target_os = "macos")]
    {
        builder = builder
            .title_bar_style(tauri::TitleBarStyle::Overlay)
            .hidden_title(true)
            .traffic_light_position(tauri::LogicalPosition::new(16.0, 26.0));
    }
    let window = builder
        .build()
        .map_err(|error| AppError::io("window_create", error))?;
    window
        .set_focus()
        .map_err(|error| AppError::io("window_focus", error))?;
    Ok(())
}

#[tauri::command]
pub fn open_settings_window(
    app: AppHandle,
    tab: Option<String>,
    section: Option<String>,
) -> Result<(), AppError> {
    focus_or_create(
        &app,
        "settings",
        "Settings",
        &settings_fragment(tab.as_deref(), section.as_deref()),
    )
}

#[tauri::command]
pub fn close_settings_window(app: AppHandle, state: State<'_, AppState>) -> Result<(), AppError> {
    remove_window_watchers(&state, "settings");
    if let Some(window) = app.get_webview_window("settings") {
        window
            .close()
            .map_err(|error| AppError::io("close_settings_window", error))?;
    }
    Ok(())
}

#[tauri::command]
pub fn open_glossary_window(app: AppHandle) -> Result<(), AppError> {
    focus_or_create(&app, "glossary", "Glossary", "/glossary-window")
}

#[tauri::command]
pub fn close_glossary_window(app: AppHandle, state: State<'_, AppState>) -> Result<(), AppError> {
    remove_window_watchers(&state, "glossary");
    if let Some(window) = app.get_webview_window("glossary") {
        window
            .close()
            .map_err(|error| AppError::io("close_glossary_window", error))?;
    }
    Ok(())
}

#[tauri::command]
pub fn navigate_in_main_window(
    app: AppHandle,
    route: String,
    entry_id: Option<String>,
) -> Result<(), AppError> {
    let window = app.get_webview_window("main").ok_or_else(|| {
        AppError::new("window_not_found", "Main window is unavailable")
            .operation("navigate_in_main_window")
    })?;
    let _ = window.unminimize();
    window
        .set_focus()
        .map_err(|error| AppError::io("navigate_in_main_window", error))?;
    window
        .emit("navigate", NavigatePayload { route, entry_id })
        .map_err(|error| AppError::io("navigate_in_main_window", error))?;
    Ok(())
}

#[tauri::command]
pub fn play_glossary_entry_in_main_window(
    app: AppHandle,
    entry_id: String,
) -> Result<(), AppError> {
    let window = app.get_webview_window("main").ok_or_else(|| {
        AppError::new("window_not_found", "Main window is unavailable")
            .operation("play_glossary_entry_in_main_window")
    })?;
    window
        .emit(
            "play-glossary-entry",
            serde_json::json!({ "entryId": entry_id }),
        )
        .map_err(|error| AppError::io("play_glossary_entry_in_main_window", error))?;
    Ok(())
}
