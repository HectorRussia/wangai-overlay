use anyhow::{anyhow, Context, Result};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutEvent, ShortcutState};

use crate::{models::HotkeySettings, pipeline, state::AppState};

pub fn handle_shortcut(app: &AppHandle, shortcut: &Shortcut, event: ShortcutEvent) {
    let app_handle = app.clone();
    let state = app.state::<AppState>();
    if state
        .hotkey_capture_active
        .load(std::sync::atomic::Ordering::Relaxed)
    {
        return;
    }
    let hotkeys = state.settings.snapshot().hotkeys;
    let pressed = event.state == ShortcutState::Pressed;
    let released = event.state == ShortcutState::Released;

    if shortcut_matches(shortcut, &hotkeys.push_to_talk) {
        if pressed {
            if let Err(error) = pipeline::start_push_to_talk(&app_handle) {
                emit_shortcut_error(&app_handle, error.to_string());
            }
        } else if released {
            pipeline::stop_push_to_talk(&app_handle);
        }
        return;
    }
    if !pressed {
        return;
    }
    if shortcut_matches(shortcut, &hotkeys.toggle_listening) {
        toggle_listening(&app_handle);
    } else if shortcut_matches(shortcut, &hotkeys.copy_latest) {
        let _ = copy_latest(&app_handle);
    } else if shortcut_matches(shortcut, &hotkeys.edit_overlay) {
        toggle_overlay_edit_mode(&app_handle);
    }
}

fn emit_shortcut_error(app: &AppHandle, message: String) {
    let state = app.state::<AppState>();
    let runtime = state.update_runtime(|runtime| runtime.last_error = Some(message.clone()));
    let _ = app.emit("pipeline-error", message);
    let _ = app.emit("runtime-state", runtime);
}

pub fn register_hotkeys(app: &AppHandle, hotkeys: &HotkeySettings) -> Result<()> {
    let keyboard: Vec<&str> = [
        hotkeys.toggle_listening.as_str(),
        hotkeys.push_to_talk.as_str(),
        hotkeys.copy_latest.as_str(),
        hotkeys.edit_overlay.as_str(),
    ]
    .into_iter()
    .filter(|value| !value.trim().is_empty())
    .collect();
    for value in &keyboard {
        value
            .parse::<Shortcut>()
            .map_err(|error| anyhow!("ปุ่มลัด {value} ไม่ถูกต้อง: {error}"))?;
    }
    let manager = app.global_shortcut();
    manager.unregister_all()?;
    if !keyboard.is_empty() {
        manager
            .register_multiple(keyboard)
            .context("ลงทะเบียน global hotkeys ไม่สำเร็จ")?;
    }
    Ok(())
}

fn toggle_listening(app: &AppHandle) {
    let state = app.state::<AppState>();
    let listening = !state
        .runtime
        .read()
        .expect("runtime lock poisoned")
        .listening;
    match crate::application::listening::set_listening_sync(app, listening) {
        Ok(true) => {
            if let Err(error) = crate::desktop_windows::hide_main_for_session(app, true) {
                let _ = crate::application::listening::set_listening_sync(app, false);
                emit_shortcut_error(app, error);
            }
        }
        Ok(false) => {}
        Err(error) => emit_shortcut_error(app, error.to_string()),
    }
}

fn toggle_overlay_edit_mode(app: &AppHandle) {
    let state = app.state::<AppState>();
    let enabled = !state
        .runtime
        .read()
        .expect("runtime lock poisoned")
        .overlay_edit_mode;
    let _ = set_overlay_edit_mode(app, enabled);
}

pub fn set_capture_mode(app: &AppHandle, state: &AppState, enabled: bool) -> Result<()> {
    use std::sync::atomic::Ordering;
    let _operation = state.lifecycle.operation()?;
    if enabled {
        anyhow::ensure!(!state.runtime.read().expect("runtime lock poisoned").microphone_active,
            "ปล่อยปุ่มพูดก่อนเปลี่ยนปุ่มลัด");
        state.hotkey_capture_active.store(true, Ordering::Relaxed);
        if let Err(error) = app.global_shortcut().unregister_all() {
            state.hotkey_capture_active.store(false, Ordering::Relaxed);
            return Err(error.into());
        }
    } else {
        register_hotkeys(app, &state.settings.snapshot().hotkeys)?;
        state.hotkey_capture_active.store(false, Ordering::Relaxed);
    }
    Ok(())
}

pub fn set_overlay_edit_mode(app: &AppHandle, enabled: bool) -> Result<bool> {
    let state = app.state::<AppState>();
    let overlay = app
        .get_webview_window("overlay")
        .context("ไม่พบ overlay window")?;
    if !enabled {
        let position = overlay.outer_position()?;
        let size = overlay.outer_size()?;
        let scale_factor = overlay.scale_factor()?;
        let settings = state.settings.update(|settings| {
            settings.overlay.x = Some(position.x);
            settings.overlay.y = Some(position.y);
            settings.overlay.width = (size.width as f64 / scale_factor).round().max(1.0) as u32;
            settings.overlay.height = (size.height as f64 / scale_factor).round().max(1.0) as u32;
            Ok(())
        })?;
        let _ = app.emit("settings-updated", settings);
    }
    overlay.set_ignore_cursor_events(!enabled)?;
    overlay.set_resizable(enabled)?;
    if enabled {
        let _ = overlay.set_focus();
    }
    let runtime = state.update_runtime(|runtime| runtime.overlay_edit_mode = enabled);
    let _ = app.emit("runtime-state", runtime);
    Ok(enabled)
}

pub fn copy_latest(app: &AppHandle) -> Result<bool> {
    let state = app.state::<AppState>();
    let Some(text) = state.latest_reply() else {
        return Ok(false);
    };
    app.clipboard().write_text(text)?;
    Ok(true)
}

fn shortcut_matches(shortcut: &Shortcut, configured: &str) -> bool {
    configured
        .parse::<Shortcut>()
        .is_ok_and(|expected| expected == *shortcut)
}
