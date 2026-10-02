//! Operations shared by native commands and the authenticated local HTTP adapter.
pub(crate) mod listening;
pub(crate) mod settings;
pub(crate) mod transcripts;
pub(crate) type CommandResult<T> = Result<T, String>;
use crate::{
    audio, hotkeys,
    models::{AppSnapshot, AudioOutputDevice, CaptureSource},
    pipeline, processes,
    state::AppState,
};
use tauri::AppHandle;

pub fn get_snapshot(state: &AppState) -> AppSnapshot {
    state.snapshot()
}

pub fn list_capture_sources() -> Vec<CaptureSource> {
    processes::list_capture_sources()
}

pub async fn list_running_apps() -> CommandResult<Vec<crate::models::RunningApp>> {
    tauri::async_runtime::spawn_blocking(processes::list_running_apps)
        .await
        .map_err(|error| error.to_string())
}

pub fn list_output_devices() -> CommandResult<Vec<AudioOutputDevice>> {
    audio::list_output_devices().map_err(|error| error.to_string())
}

pub fn default_microphone_name() -> CommandResult<Option<String>> {
    audio::default_microphone_name().map_err(|error| error.to_string())
}

pub fn list_microphone_devices() -> CommandResult<Vec<AudioOutputDevice>> {
    audio::list_microphone_devices().map_err(|error| error.to_string())
}

pub fn set_overlay_edit_mode(app: AppHandle, enabled: bool) -> CommandResult<bool> {
    hotkeys::set_overlay_edit_mode(&app, enabled).map_err(|error| error.to_string())
}

pub fn copy_latest_reply(app: AppHandle) -> CommandResult<bool> {
    hotkeys::copy_latest(&app).map_err(|error| error.to_string())
}

pub fn inject_demo_transcript(app: AppHandle) {
    pipeline::inject_demo(&app);
}
