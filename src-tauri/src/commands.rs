//! Tauri IPC adapter. Business operations live in application; native windows in desktop_windows.
use crate::{
    application::{self, CommandResult},
    desktop_windows, hotkeys,
    models::{
        AppSettings, AppSnapshot, AudioOutputDevice, CaptureMode, CaptureSource, GlossaryTerm,
        HotkeySettings, OverlaySettings, VadSettings,
    },
    state::AppState,
    web_companion::{WebCompanionInfo, WebCompanionManager},
};
use tauri::{AppHandle, State, WebviewWindow};

// Legacy discovery/default-device and demo commands remain registered for existing clients.
#[tauri::command]
pub fn get_snapshot(state: State<'_, AppState>) -> AppSnapshot {
    application::get_snapshot(&state)
}

#[tauri::command]
pub fn list_capture_sources() -> Vec<CaptureSource> {
    application::list_capture_sources()
}

#[tauri::command]
pub async fn list_running_apps() -> CommandResult<Vec<crate::models::RunningApp>> {
    application::list_running_apps().await
}

#[tauri::command]
pub fn list_output_devices() -> CommandResult<Vec<AudioOutputDevice>> {
    application::list_output_devices()
}

#[tauri::command]
pub fn default_microphone_name() -> CommandResult<Option<String>> {
    application::default_microphone_name()
}

#[tauri::command]
pub fn list_microphone_devices() -> CommandResult<Vec<AudioOutputDevice>> {
    application::list_microphone_devices()
}

#[tauri::command]
pub fn update_microphone_device(
    app: AppHandle,
    state: State<'_, AppState>,
    device_id: Option<String>,
) -> CommandResult<AppSettings> {
    application::settings::update_microphone_device(app, &state, device_id)
}

#[tauri::command]
pub fn get_web_companion_info(web: State<'_, WebCompanionManager>) -> WebCompanionInfo {
    web.info()
}

#[tauri::command]
pub fn open_web_companion(web: State<'_, WebCompanionManager>) -> CommandResult<()> {
    web.open().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn open_settings_window(app: AppHandle) -> CommandResult<()> {
    desktop_windows::open_settings_window(app)
}

#[tauri::command]
pub async fn select_listening_source(
    app: AppHandle,
    source: CaptureSource,
) -> CommandResult<AppSettings> {
    application::listening::select_listening_source(app, source).await
}

#[tauri::command]
pub async fn clear_listening_source(app: AppHandle) -> CommandResult<AppSettings> {
    application::listening::clear_listening_source(app).await
}

#[tauri::command]
pub fn update_output_device(
    app: AppHandle,
    state: State<'_, AppState>,
    device_id: Option<String>,
) -> CommandResult<AppSettings> {
    application::settings::update_output_device(app, &state, device_id)
}

#[tauri::command]
pub fn update_rescue_scan(
    app: AppHandle,
    state: State<'_, AppState>,
    enabled: bool,
) -> CommandResult<AppSettings> {
    application::settings::update_rescue_scan(app, &state, enabled)
}

#[tauri::command]
pub fn update_capture_mode(
    app: AppHandle,
    state: State<'_, AppState>,
    mode: CaptureMode,
) -> CommandResult<AppSettings> {
    application::settings::update_capture_mode(app, &state, mode)
}

#[tauri::command]
pub async fn toggle_listening(app: AppHandle) -> CommandResult<bool> {
    application::listening::toggle_listening(app).await
}

#[tauri::command]
pub async fn start_session(app: AppHandle) -> CommandResult<bool> {
    application::listening::start_session(app).await
}

#[tauri::command]
pub async fn set_listening(app: AppHandle, enabled: bool) -> CommandResult<bool> {
    application::listening::set_listening(app, enabled).await
}

#[tauri::command]
pub fn probe_recent_audio(app: AppHandle, state: State<'_, AppState>) -> CommandResult<()> {
    application::listening::probe_recent_audio(app, &state)
}

#[tauri::command]
pub fn update_hotkeys(
    app: AppHandle,
    state: State<'_, AppState>,
    hotkeys: HotkeySettings,
) -> CommandResult<AppSettings> {
    application::settings::update_hotkeys(app, &state, hotkeys)
}

#[tauri::command]
pub fn set_hotkey_capture_mode(
    app: AppHandle,
    window: tauri::WebviewWindow,
    state: State<'_, AppState>,
    enabled: bool,
) -> CommandResult<()> {
    if window.label() != "main" {
        return Err("ตั้งปุ่มลัดได้จากหน้าต่างหลักเท่านั้น".into());
    }
    hotkeys::set_capture_mode(&app, &state, enabled).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn update_overlay_settings(
    app: AppHandle,
    state: State<'_, AppState>,
    overlay: OverlaySettings,
) -> CommandResult<AppSettings> {
    application::settings::update_overlay_settings(app, &state, overlay)
}

#[tauri::command]
pub fn update_vad_settings(
    app: AppHandle,
    state: State<'_, AppState>,
    vad: VadSettings,
) -> CommandResult<AppSettings> {
    application::settings::update_vad_settings(app, &state, vad)
}

#[tauri::command]
pub fn update_glossary(
    app: AppHandle,
    state: State<'_, AppState>,
    glossary: Vec<GlossaryTerm>,
) -> CommandResult<AppSettings> {
    application::settings::update_glossary(app, &state, glossary)
}

#[tauri::command]
pub fn set_overlay_edit_mode(app: AppHandle, enabled: bool) -> CommandResult<bool> {
    application::set_overlay_edit_mode(app, enabled)
}

#[tauri::command]
pub fn save_overlay_bounds(window: WebviewWindow, state: State<'_, AppState>) -> CommandResult<()> {
    desktop_windows::save_overlay_bounds(window, &state)
}

#[tauri::command]
pub fn start_overlay_drag(window: WebviewWindow) -> CommandResult<()> {
    desktop_windows::start_overlay_drag(window)
}

#[tauri::command]
pub fn copy_latest_reply(app: AppHandle) -> CommandResult<bool> {
    application::copy_latest_reply(app)
}

#[tauri::command]
pub fn restart_worker(app: AppHandle, state: State<'_, AppState>) -> CommandResult<()> {
    application::settings::restart_worker(app, &state)
}

#[tauri::command]
pub fn inject_demo_transcript(app: AppHandle) {
    application::inject_demo_transcript(app)
}

#[tauri::command]
pub fn set_overlay_presentation(
    presentation: crate::models::OverlayPresentation,
) -> CommandResult<()> {
    let _ = presentation;
    Ok(())
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[cfg(test)]
mod overlay_geometry_tests {
    #[test]
    fn microphone_changes_are_rejected_during_push_to_talk_and_default_is_persisted() {
        let temp = tempfile::tempdir().unwrap();
        let state = crate::state::AppState::new(temp.path().join("settings.json")).unwrap();
        state
            .settings
            .update_microphone_device(Some("saved-device".into()))
            .unwrap();
        state.update_runtime(|runtime| runtime.microphone_active = true);
        assert!(
            application::settings::update_microphone_device_inner(&state, None)
                .unwrap_err()
                .contains("ปล่อยปุ่มพูด")
        );
        assert_eq!(
            state.settings.snapshot().microphone_device_id.as_deref(),
            Some("saved-device")
        );
        state.update_runtime(|runtime| runtime.microphone_active = false);
        assert_eq!(
            application::settings::update_microphone_device_inner(&state, None)
                .unwrap()
                .microphone_device_id,
            None
        );
    }

    #[test]
    fn legacy_collapse_command_is_harmless() {
        super::set_overlay_presentation(crate::models::OverlayPresentation::Collapsed).unwrap();
        super::set_overlay_presentation(crate::models::OverlayPresentation::Expanded).unwrap();
    }
    use super::*;
    use crate::desktop_windows::{anchored_overlay_position, centered_settings_position};
    use tauri::{PhysicalPosition, PhysicalSize};
    use tempfile::tempdir;

    #[test]
    fn settings_center_on_the_overlay_monitor_including_negative_coordinates() {
        assert_eq!(
            centered_settings_position(
                PhysicalSize::new(1180, 780),
                PhysicalPosition::new(-1920, 0),
                PhysicalSize::new(1920, 1040)
            ),
            PhysicalPosition::new(-1550, 130)
        );
        assert_eq!(
            centered_settings_position(
                PhysicalSize::new(1180, 780),
                PhysicalPosition::new(0, 0),
                PhysicalSize::new(980, 660)
            ),
            PhysicalPosition::new(0, 0)
        );
    }

    #[test]
    fn startup_opens_ready_room_and_keeps_overlay_hidden() {
        let config: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let windows = config["app"]["windows"].as_array().unwrap();
        let main = windows.iter().find(|w| w["label"] == "main").unwrap();
        assert_eq!(main["visible"], true);
        assert_eq!(main["focus"], true);
        assert_eq!(main["url"], "index.html#/settings/overview");
        let overlay = windows.iter().find(|w| w["label"] == "overlay").unwrap();
        assert_eq!(overlay["visible"], false);
        assert_eq!(overlay["width"], 420);
        assert_eq!(overlay["height"], 236);
    }

    #[test]
    fn listening_toggle_target_releases_the_runtime_lock() {
        let temp = tempdir().unwrap();
        let state = AppState::new(temp.path().join("settings.json")).unwrap();

        assert!(application::listening::listening_toggle_target(&state));
        assert!(state.runtime.try_write().is_ok());

        state.update_runtime(|runtime| runtime.listening = true);
        assert!(!application::listening::listening_toggle_target(&state));
        assert!(state.runtime.try_write().is_ok());
    }

    #[test]
    fn restored_position_clamps_to_the_monitor_work_area() {
        assert_eq!(
            anchored_overlay_position(
                PhysicalPosition::new(-25, -10),
                PhysicalSize::new(420, 236),
                PhysicalSize::new(520, 300),
                PhysicalPosition::new(0, 0),
                PhysicalSize::new(1920, 1040)
            ),
            PhysicalPosition::new(0, 0)
        );
    }
}
