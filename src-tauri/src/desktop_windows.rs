use crate::{hotkeys, models::AppSettings, state::AppState};
use anyhow::Context;
use tauri::{
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, PhysicalSize, WebviewWindow,
};
type CommandResult<T> = Result<T, String>;

pub fn open_settings_window(app: AppHandle) -> CommandResult<()> {
    let main = app
        .get_webview_window("main")
        .context("ไม่พบหน้าตั้งค่า")
        .map_err(|e| e.to_string())?;
    let overlay = app
        .get_webview_window("overlay")
        .context("ไม่พบ Overlay")
        .map_err(|e| e.to_string())?;
    let monitor = overlay
        .current_monitor()
        .map_err(|e| e.to_string())?
        .or(main.primary_monitor().map_err(|e| e.to_string())?);
    main.unminimize().map_err(|e| e.to_string())?;
    if let Some(monitor) = monitor {
        let area = monitor.work_area();
        let size = main.outer_size().map_err(|e| e.to_string())?;
        main.set_position(centered_settings_position(size, area.position, area.size))
            .map_err(|e| e.to_string())?;
    }
    main.show().map_err(|e| e.to_string())?;
    main.eval("window.location.hash = '#/settings/advanced'")
        .map_err(|e| e.to_string())?;
    main.set_focus().map_err(|e| e.to_string())?;
    overlay.hide().map_err(|e| e.to_string())
}

pub fn show_listening_overlay(app: &AppHandle) -> CommandResult<()> {
    let overlay = app
        .get_webview_window("overlay")
        .context("ไม่พบ Overlay")
        .map_err(|e| e.to_string())?;
    overlay.show().map_err(|e| e.to_string())
}

pub fn show_main_after_stop(app: &AppHandle) -> CommandResult<()> {
    let main = app
        .get_webview_window("main")
        .context("ไม่พบหน้าหลัก")
        .map_err(|e| e.to_string())?;
    let overlay = app
        .get_webview_window("overlay")
        .context("ไม่พบ Overlay")
        .map_err(|e| e.to_string())?;
    main.unminimize().map_err(|e| e.to_string())?;
    main.show().map_err(|e| e.to_string())?;
    main.eval("window.location.hash = '#/settings/overview'")
        .map_err(|e| e.to_string())?;
    main.set_focus().map_err(|e| e.to_string())?;
    overlay.hide().map_err(|e| e.to_string())
}

pub fn hide_main_for_session(app: &AppHandle, first_start: bool) -> CommandResult<()> {
    if first_start {
        // Offer placement immediately for a new session. Returning from Settings
        // keeps the user's saved click-through/edit mode instead.
        hotkeys::set_overlay_edit_mode(app, true).map_err(|error| error.to_string())?;
    }
    show_listening_overlay(app)?;
    let main = app
        .get_webview_window("main")
        .context("ไม่พบหน้าต่าง WANGAI")
        .map_err(|error| error.to_string())?;
    main.hide().map_err(|error| error.to_string())
}

pub(crate) fn centered_settings_position(
    size: PhysicalSize<u32>,
    origin: PhysicalPosition<i32>,
    area: PhysicalSize<u32>,
) -> PhysicalPosition<i32> {
    PhysicalPosition::new(
        origin.x + area.width.saturating_sub(size.width) as i32 / 2,
        origin.y + area.height.saturating_sub(size.height) as i32 / 2,
    )
}

pub fn save_overlay_bounds(window: WebviewWindow, state: &AppState) -> CommandResult<()> {
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
    let settings = state
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
        .map_err(|error| error.to_string())?;
    let _ = overlay.app_handle().emit("settings-updated", settings);
    Ok(())
}

pub fn start_overlay_drag(window: WebviewWindow) -> CommandResult<()> {
    window.start_dragging().map_err(|error| error.to_string())
}

pub fn restore_overlay_bounds(app: &AppHandle, settings: &AppSettings) -> CommandResult<()> {
    let overlay = app
        .get_webview_window("overlay")
        .context("ไม่พบ overlay window")
        .map_err(|error| error.to_string())?;
    overlay
        .set_size(LogicalSize::new(
            settings.overlay.width as f64,
            settings.overlay.height as f64,
        ))
        .map_err(|error| error.to_string())?;
    let monitors = overlay
        .available_monitors()
        .map_err(|error| error.to_string())?;
    let saved = settings
        .overlay
        .x
        .zip(settings.overlay.y)
        .map(|(x, y)| PhysicalPosition::new(x, y));
    let monitor = saved
        .and_then(|position| {
            monitors.iter().find(|monitor| {
                let area = monitor.work_area();
                position.x as i64 >= area.position.x as i64
                    && position.y as i64 >= area.position.y as i64
                    && (position.x as i64) < area.position.x as i64 + area.size.width as i64
                    && (position.y as i64) < area.position.y as i64 + area.size.height as i64
            })
        })
        .cloned()
        .or(overlay
            .primary_monitor()
            .map_err(|error| error.to_string())?);
    if let Some(monitor) = monitor {
        let area = monitor.work_area();
        let size = PhysicalSize::new(
            (settings.overlay.width as f64 * monitor.scale_factor()).round() as u32,
            (settings.overlay.height as f64 * monitor.scale_factor()).round() as u32,
        );
        let preferred = saved.unwrap_or(PhysicalPosition::new(
            area.position.x + area.size.width.saturating_sub(size.width + 24) as i32,
            area.position.y + 24,
        ));
        let position = anchored_overlay_position(preferred, size, size, area.position, area.size);
        overlay
            .set_position(position)
            .map_err(|error| error.to_string())?;
    }
    overlay
        .set_resizable(false)
        .map_err(|error| error.to_string())?;
    overlay
        .set_ignore_cursor_events(false)
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub(crate) fn physical_to_logical(value: u32, scale_factor: f64) -> u32 {
    if !scale_factor.is_finite() || scale_factor <= 0.0 {
        return value;
    }
    (value as f64 / scale_factor).round().max(1.0) as u32
}

pub(crate) fn anchored_overlay_position(
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
