use anyhow::{Context, Result};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutEvent, ShortcutState};

use crate::{models::HotkeySettings, pipeline, state::AppState};

pub fn handle_shortcut(app: &AppHandle, shortcut: &Shortcut, event: ShortcutEvent) {
    let app_handle = app.clone();
    let state = app.state::<AppState>();
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
        let listening = !state
            .runtime
            .read()
            .expect("runtime lock poisoned")
            .listening;
        if let Err(error) = pipeline::set_listening(&app_handle, listening) {
            emit_shortcut_error(&app_handle, error.to_string());
        }
    } else if shortcut_matches(shortcut, &hotkeys.copy_latest) {
        let _ = copy_latest(&app_handle);
    } else if shortcut_matches(shortcut, &hotkeys.edit_overlay) {
        let enabled = !state
            .runtime
            .read()
            .expect("runtime lock poisoned")
            .overlay_edit_mode;
        let _ = set_overlay_edit_mode(&app_handle, enabled);
    }
}

fn emit_shortcut_error(app: &AppHandle, message: String) {
    let state = app.state::<AppState>();
    let runtime = state.update_runtime(|runtime| runtime.last_error = Some(message.clone()));
    let _ = app.emit("pipeline-error", message);
    let _ = app.emit("runtime-state", runtime);
}

pub fn register_hotkeys(app: &AppHandle, hotkeys: &HotkeySettings) -> Result<()> {
    let manager = app.global_shortcut();
    manager.unregister_all()?;
    manager
        .register_multiple([
            hotkeys.toggle_listening.as_str(),
            hotkeys.push_to_talk.as_str(),
            hotkeys.copy_latest.as_str(),
            hotkeys.edit_overlay.as_str(),
        ])
        .context("ลงทะเบียน global hotkeys ไม่สำเร็จ")
}

pub fn set_overlay_edit_mode(app: &AppHandle, enabled: bool) -> Result<bool> {
    let state = app.state::<AppState>();
    let overlay = app
        .get_webview_window("overlay")
        .context("ไม่พบ overlay window")?;
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
