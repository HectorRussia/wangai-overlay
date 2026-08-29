use crate::{
    hotkeys,
    models::{
        AppSettings, AppSnapshot, CaptureSource, GlossaryTerm, HotkeySettings, OverlaySettings,
        VadSettings,
    },
    pipeline, processes,
    settings::{clear_xai_key, set_xai_key},
    state::AppState,
    translator::Translator,
};
use anyhow::Context;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, State, WebviewWindow};

type CommandResult<T> = std::result::Result<T, String>;

#[tauri::command]
pub fn get_snapshot(state: State<'_, AppState>) -> AppSnapshot {
    state.snapshot()
}

#[tauri::command]
pub fn list_capture_sources() -> Vec<CaptureSource> {
    processes::list_capture_sources()
}

#[tauri::command]
pub fn select_capture_source(
    app: AppHandle,
    state: State<'_, AppState>,
    source: CaptureSource,
) -> CommandResult<AppSettings> {
    let settings = state
        .settings
        .update(|settings| {
            settings.selected_process = Some((&source).into());
            Ok(())
        })
        .map_err(|error| error.to_string())?;
    if state.runtime.read().unwrap().listening {
        pipeline::attach_saved_process(&app).map_err(|error| error.to_string())?;
    }
    Ok(settings)
}

#[tauri::command]
pub fn toggle_listening(app: AppHandle, state: State<'_, AppState>) -> CommandResult<bool> {
    let enabled = !state.runtime.read().unwrap().listening;
    pipeline::set_listening(&app, enabled).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn set_listening(app: AppHandle, enabled: bool) -> CommandResult<bool> {
    pipeline::set_listening(&app, enabled).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn configure_xai(
    app: AppHandle,
    state: State<'_, AppState>,
    key: String,
) -> CommandResult<AppSettings> {
    set_xai_key(&key).map_err(|error| error.to_string())?;
    let settings = state
        .settings
        .update(|settings| {
            settings.xai.configured = true;
            Ok(())
        })
        .map_err(|error| error.to_string())?;
    let runtime = state.update_runtime(|runtime| {
        runtime.xai_status = "พร้อมเชื่อมต่อ xAI เมื่อพบเสียงพูด".into();
        runtime.last_error = None;
    });
    let _ = app.emit("runtime-state", runtime);
    Ok(settings)
}

#[tauri::command]
pub fn clear_xai_credentials(
    app: AppHandle,
    state: State<'_, AppState>,
) -> CommandResult<AppSettings> {
    clear_xai_key().map_err(|error| error.to_string())?;
    state
        .cloud_stt
        .reset_stream(crate::models::StreamKind::Game);
    state
        .cloud_stt
        .reset_stream(crate::models::StreamKind::Microphone);
    let settings = state
        .settings
        .update(|settings| {
            settings.xai.configured = false;
            Ok(())
        })
        .map_err(|error| error.to_string())?;
    let runtime = state.update_runtime(|runtime| {
        runtime.xai_stt_connected = false;
        runtime.xai_status = "ยังไม่ได้ตั้งค่า xAI".into();
    });
    let _ = app.emit("runtime-state", runtime);
    Ok(settings)
}

#[tauri::command]
pub async fn test_xai_translation(state: State<'_, AppState>) -> CommandResult<String> {
    let result = state
        .translator
        .translate(&state.settings, "xai-test", "Enemy on the left", "en", "th")
        .await;
    result
        .translated_text
        .ok_or_else(|| result.message.unwrap_or_else(|| "xAI test ล้มเหลว".into()))
}

#[tauri::command]
pub fn update_hotkeys(
    app: AppHandle,
    state: State<'_, AppState>,
    hotkeys: HotkeySettings,
) -> CommandResult<AppSettings> {
    let old = state.settings.snapshot().hotkeys;
    hotkeys::register_hotkeys(&app, &hotkeys).map_err(|error| {
        let _ = hotkeys::register_hotkeys(&app, &old);
        error.to_string()
    })?;
    state.settings.update_hotkeys(hotkeys).map_err(|error| {
        let _ = hotkeys::register_hotkeys(&app, &old);
        error.to_string()
    })
}

#[tauri::command]
pub fn update_overlay_settings(
    state: State<'_, AppState>,
    overlay: OverlaySettings,
) -> CommandResult<AppSettings> {
    state
        .settings
        .update_overlay(overlay)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn update_vad_settings(
    app: AppHandle,
    state: State<'_, AppState>,
    vad: VadSettings,
) -> CommandResult<AppSettings> {
    let settings = state
        .settings
        .update_vad(vad)
        .map_err(|error| error.to_string())?;
    state.cloud_stt.set_pre_roll_ms(settings.vad.pre_roll_ms);
    state
        .worker
        .start(app, &settings)
        .map_err(|error| error.to_string())?;
    Ok(settings)
}

#[tauri::command]
pub fn update_glossary(
    state: State<'_, AppState>,
    glossary: Vec<GlossaryTerm>,
) -> CommandResult<AppSettings> {
    state
        .settings
        .update(|settings| {
            settings.glossary = glossary;
            Ok(())
        })
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn set_overlay_edit_mode(app: AppHandle, enabled: bool) -> CommandResult<bool> {
    hotkeys::set_overlay_edit_mode(&app, enabled).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_overlay_bounds(window: WebviewWindow, state: State<'_, AppState>) -> CommandResult<()> {
    let overlay = if window.label() == "overlay" {
        window
    } else {
        window
            .app_handle()
            .get_webview_window("overlay")
            .context("ไม่พบ overlay window")
            .map_err(|error| error.to_string())?
    };
    let position = overlay
        .outer_position()
        .map_err(|error| error.to_string())?;
    let size = overlay.outer_size().map_err(|error| error.to_string())?;
    state
        .settings
        .update(|settings| {
            settings.overlay.x = Some(position.x);
            settings.overlay.y = Some(position.y);
            settings.overlay.width = size.width;
            settings.overlay.height = size.height;
            Ok(())
        })
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn start_overlay_drag(window: WebviewWindow) -> CommandResult<()> {
    window.start_dragging().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn copy_latest_reply(app: AppHandle) -> CommandResult<bool> {
    hotkeys::copy_latest(&app).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn restart_worker(app: AppHandle, state: State<'_, AppState>) -> CommandResult<()> {
    state
        .worker
        .start(app, &state.settings.snapshot())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn inject_demo_transcript(app: AppHandle) {
    pipeline::inject_demo(&app);
}

pub fn restore_overlay_bounds(app: &AppHandle, settings: &AppSettings) -> CommandResult<()> {
    let overlay = app
        .get_webview_window("overlay")
        .context("ไม่พบ overlay window")
        .map_err(|error| error.to_string())?;
    if let (Some(x), Some(y)) = (settings.overlay.x, settings.overlay.y) {
        overlay
            .set_position(PhysicalPosition::new(x, y))
            .map_err(|error| error.to_string())?;
    }
    overlay
        .set_size(PhysicalSize::new(
            settings.overlay.width,
            settings.overlay.height,
        ))
        .map_err(|error| error.to_string())?;
    overlay
        .set_ignore_cursor_events(true)
        .map_err(|error| error.to_string())?;
    Ok(())
}
