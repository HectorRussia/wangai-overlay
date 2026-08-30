use crate::{
    hotkeys,
    models::{
        AppSettings, AppSnapshot, CaptureSource, GlossaryTerm, GroqModelOption, HotkeySettings,
        OverlayPresentation, OverlaySettings, VadSettings,
    },
    pipeline, processes,
    settings::{clear_groq_key, groq_model_catalog, set_groq_key},
    state::AppState,
    translator::Translator,
};
use anyhow::Context;
use tauri::{
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, PhysicalSize, State, WebviewWindow,
};

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
pub fn configure_groq(
    app: AppHandle,
    state: State<'_, AppState>,
    key: String,
) -> CommandResult<AppSettings> {
    set_groq_key(&key).map_err(|error| error.to_string())?;
    let settings = state
        .settings
        .update(|settings| {
            settings.groq.configured = true;
            Ok(())
        })
        .map_err(|error| error.to_string())?;
    let runtime = state.update_runtime(|runtime| {
        runtime.groq_status = "Groq พร้อมใช้งาน".into();
        runtime.last_error = None;
    });
    let _ = app.emit("runtime-state", runtime);
    Ok(settings)
}

#[tauri::command]
pub fn clear_groq_credentials(
    app: AppHandle,
    state: State<'_, AppState>,
) -> CommandResult<AppSettings> {
    clear_groq_key().map_err(|error| error.to_string())?;
    state.groq_stt.reset_stream(crate::models::StreamKind::Game);
    state
        .groq_stt
        .reset_stream(crate::models::StreamKind::Microphone);
    let settings = state
        .settings
        .update(|settings| {
            settings.groq.configured = false;
            Ok(())
        })
        .map_err(|error| error.to_string())?;
    let runtime = state.update_runtime(|runtime| {
        runtime.groq_stt_busy = false;
        runtime.groq_status = "ยังไม่ได้ตั้งค่า Groq".into();
    });
    let _ = app.emit("runtime-state", runtime);
    Ok(settings)
}

#[tauri::command]
pub async fn test_groq_configuration(state: State<'_, AppState>) -> CommandResult<String> {
    let result = state
        .translator
        .translate(
            &state.settings,
            "groq-test",
            "Enemy on the left",
            "en",
            "th",
        )
        .await;
    result
        .translated_text
        .ok_or_else(|| result.message.unwrap_or_else(|| "Groq test ล้มเหลว".into()))
}

#[tauri::command]
pub fn get_groq_model_catalog() -> Vec<GroqModelOption> {
    groq_model_catalog()
}

#[tauri::command]
pub fn update_groq_models(
    state: State<'_, AppState>,
    stt_model: String,
    translation_model: String,
) -> CommandResult<AppSettings> {
    state
        .settings
        .update_groq_models(stt_model, translation_model)
        .map_err(|error| error.to_string())
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
    state.groq_stt.set_pre_roll_ms(settings.vad.pre_roll_ms);
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
pub fn set_overlay_presentation(
    app: AppHandle,
    state: State<'_, AppState>,
    presentation: OverlayPresentation,
) -> CommandResult<()> {
    let overlay = app
        .get_webview_window("overlay")
        .context("ไม่พบ overlay window")
        .map_err(|error| error.to_string())?;
    let settings = state.settings.snapshot();
    let logical_size = match presentation {
        OverlayPresentation::Collapsed => (332, 52),
        OverlayPresentation::Expanded => (settings.overlay.width, settings.overlay.height),
    };
    resize_overlay_anchored(&overlay, logical_size).map_err(|error| error.to_string())
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
    let scale_factor = overlay.scale_factor().map_err(|error| error.to_string())?;
    let edit_mode = state
        .runtime
        .read()
        .expect("runtime lock poisoned")
        .overlay_edit_mode;
    state
        .settings
        .update(|settings| {
            settings.overlay.x = Some(position.x);
            settings.overlay.y = Some(position.y);
            if edit_mode {
                settings.overlay.width = physical_to_logical(size.width, scale_factor);
                settings.overlay.height = physical_to_logical(size.height, scale_factor);
            }
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
        .set_size(LogicalSize::new(
            settings.overlay.width as f64,
            settings.overlay.height as f64,
        ))
        .map_err(|error| error.to_string())?;
    overlay
        .set_ignore_cursor_events(true)
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn physical_to_logical(value: u32, scale_factor: f64) -> u32 {
    if !scale_factor.is_finite() || scale_factor <= 0.0 {
        return value;
    }
    (value as f64 / scale_factor).round().max(1.0) as u32
}

fn resize_overlay_anchored(window: &WebviewWindow, logical_size: (u32, u32)) -> anyhow::Result<()> {
    let current_position = window.outer_position()?;
    let current_size = window.outer_size()?;
    let scale_factor = window.scale_factor()?;
    let target_size = PhysicalSize::new(
        (logical_size.0 as f64 * scale_factor).round().max(1.0) as u32,
        (logical_size.1 as f64 * scale_factor).round().max(1.0) as u32,
    );

    if let Some(monitor) = window.current_monitor()? {
        let work_area = monitor.work_area();
        let next = anchored_overlay_position(
            current_position,
            current_size,
            target_size,
            work_area.position,
            work_area.size,
        );
        window.set_position(next)?;
    }
    window.set_size(LogicalSize::new(
        logical_size.0 as f64,
        logical_size.1 as f64,
    ))?;
    Ok(())
}

fn anchored_overlay_position(
    current_position: PhysicalPosition<i32>,
    current_size: PhysicalSize<u32>,
    target_size: PhysicalSize<u32>,
    work_position: PhysicalPosition<i32>,
    work_size: PhysicalSize<u32>,
) -> PhysicalPosition<i32> {
    let work_left = work_position.x as i64;
    let work_top = work_position.y as i64;
    let work_right = work_left + work_size.width as i64;
    let work_bottom = work_top + work_size.height as i64;
    let current_left = current_position.x as i64;
    let current_top = current_position.y as i64;
    let current_right = current_left + current_size.width as i64;
    let current_bottom = current_top + current_size.height as i64;

    let anchor_right = (work_right - current_right).abs() < (current_left - work_left).abs();
    let anchor_bottom = (work_bottom - current_bottom).abs() < (current_top - work_top).abs();
    let target_width = target_size.width.min(work_size.width) as i64;
    let target_height = target_size.height.min(work_size.height) as i64;

    let preferred_x = if anchor_right {
        current_right - target_width
    } else {
        current_left
    };
    let preferred_y = if anchor_bottom {
        current_bottom - target_height
    } else {
        current_top
    };
    let max_x = (work_right - target_width).max(work_left);
    let max_y = (work_bottom - target_height).max(work_top);

    PhysicalPosition::new(
        preferred_x.clamp(work_left, max_x) as i32,
        preferred_y.clamp(work_top, max_y) as i32,
    )
}

#[cfg(test)]
mod overlay_geometry_tests {
    use super::*;

    #[test]
    fn resize_keeps_the_nearest_bottom_right_corner() {
        let position = anchored_overlay_position(
            PhysicalPosition::new(1500, 800),
            PhysicalSize::new(420, 236),
            PhysicalSize::new(332, 52),
            PhysicalPosition::new(0, 0),
            PhysicalSize::new(1920, 1040),
        );
        assert_eq!(position, PhysicalPosition::new(1588, 984));
    }

    #[test]
    fn resize_clamps_the_window_to_the_monitor_work_area() {
        let position = anchored_overlay_position(
            PhysicalPosition::new(-25, -10),
            PhysicalSize::new(420, 236),
            PhysicalSize::new(520, 300),
            PhysicalPosition::new(0, 0),
            PhysicalSize::new(1920, 1040),
        );
        assert_eq!(position, PhysicalPosition::new(0, 0));
    }
}
