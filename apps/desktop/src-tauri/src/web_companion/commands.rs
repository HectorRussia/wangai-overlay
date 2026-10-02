use super::WebCommand;
use crate::{
    application::listening::*,
    application::settings::*,
    application::{self, CommandResult},
    state::AppState,
};
use tauri::{AppHandle, Emitter, Manager};

pub async fn dispatch_web_command(
    app: &AppHandle,
    command: WebCommand,
) -> CommandResult<serde_json::Value> {
    let state = app.state::<AppState>();
    let value = match command {
        WebCommand::StartSession => serde_json::json!(start_session(app.clone()).await?),
        WebCommand::ToggleListening => serde_json::json!(
            apply_listening_state(app.clone(), listening_toggle_target(&state)).await?
        ),
        WebCommand::SetListening { enabled } => {
            serde_json::json!(apply_listening_state(app.clone(), enabled).await?)
        }
        WebCommand::SelectListeningSource { source } => {
            let settings = select_listening_source(app.clone(), source).await?;
            serde_json::to_value(settings).map_err(|error| error.to_string())?
        }
        WebCommand::ClearListeningSource => {
            let settings = clear_listening_source(app.clone()).await?;
            serde_json::to_value(settings).map_err(|error| error.to_string())?
        }
        WebCommand::UpdateCaptureMode { mode } => {
            let settings = update_capture_mode_inner(app, &state, mode)?;
            serde_json::to_value(settings).map_err(|error| error.to_string())?
        }
        WebCommand::UpdateOutputDevice { device_id } => {
            let settings = update_output_device_inner(app, &state, device_id)?;
            serde_json::to_value(settings).map_err(|error| error.to_string())?
        }
        WebCommand::UpdateMicrophoneDevice { device_id } => {
            let settings = update_microphone_device_inner(&state, device_id)?;
            let _ = app.emit("settings-updated", settings.clone());
            serde_json::to_value(settings).map_err(|error| error.to_string())?
        }
        WebCommand::UpdateRescueScan { enabled } => {
            serde_json::to_value(update_rescue_scan_inner(app, &state, enabled)?)
                .map_err(|error| error.to_string())?
        }
        WebCommand::ProbeRecentAudio => {
            probe_recent_audio(app.clone(), &state)?;
            serde_json::Value::Null
        }
        WebCommand::UpdateHotkeys { hotkeys: next } => {
            serde_json::to_value(update_hotkeys_inner(app, &state, next, false)?)
                .map_err(|error| error.to_string())?
        }
        WebCommand::UpdateOverlaySettings { overlay } => {
            serde_json::to_value(update_overlay_settings(app.clone(), &state, overlay)?)
                .map_err(|error| error.to_string())?
        }
        WebCommand::UpdateVadSettings { vad } => {
            let settings = update_vad_inner(app, &state, vad)?;
            serde_json::to_value(settings).map_err(|error| error.to_string())?
        }
        WebCommand::UpdateGlossary { glossary } => {
            serde_json::to_value(update_glossary_inner(app, &state, glossary)?)
                .map_err(|error| error.to_string())?
        }
        WebCommand::SetOverlayEditMode { enabled } => {
            serde_json::json!(application::set_overlay_edit_mode(app.clone(), enabled)?)
        }
        WebCommand::CopyLatestReply => {
            serde_json::json!(application::copy_latest_reply(app.clone())?)
        }
        WebCommand::RestartWorker => {
            restart_worker_inner(app, &state)?;
            serde_json::Value::Null
        }
    };
    let _ = app.emit("settings-updated", state.settings.snapshot());
    Ok(value)
}
