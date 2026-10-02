use super::{CommandResult, settings::reattach_if_listening};
use crate::{desktop_windows::hide_main_for_session, pipeline, processes, models::{AppSettings, CaptureSource}, state::AppState};
use tauri::{AppHandle, Emitter, Manager};

pub(crate) fn runtime_is_listening(state: &AppState) -> bool {
    state
        .runtime
        .read()
        .expect("runtime state lock poisoned")
        .listening
}

pub(crate) fn listening_toggle_target(state: &AppState) -> bool {
    !runtime_is_listening(state)
}

pub(crate) async fn apply_listening_state(app: AppHandle, enabled: bool) -> CommandResult<bool> {
    tauri::async_runtime::spawn_blocking(move || {
        set_listening_sync(&app, enabled)
    })
    .await
    .map_err(|error| format!("งานควบคุมการฟังหยุดทำงาน: {error}"))?
}

pub async fn select_listening_source(
    app: AppHandle,
    source: CaptureSource,
) -> CommandResult<AppSettings> {
    tauri::async_runtime::spawn_blocking(move || {
        let source = processes::validate_selection(&source).map_err(|error| error.to_string())?;
        let state = app.state::<AppState>();
        let settings = state
            .settings
            .update(|settings| {
                settings.listening_source = Some((&source).into());
                Ok(())
            })
            .map_err(|error| error.to_string())?;
        reattach_if_listening(&app, &state)?;
        let _ = app.emit("settings-updated", settings.clone());
        Ok(settings)
    })
    .await
    .map_err(|error| error.to_string())?
}

pub async fn clear_listening_source(app: AppHandle) -> CommandResult<AppSettings> {
    tauri::async_runtime::spawn_blocking(move || {
        set_listening_sync(&app, false)?;
        let state = app.state::<AppState>();
        let settings = state
            .settings
            .update(|settings| {
                settings.listening_source = None;
                Ok(())
            })
            .map_err(|error| error.to_string())?;
        let _ = app.emit("settings-updated", settings.clone());
        let runtime = state.update_runtime(|runtime| {
            runtime.status_message = "ยังไม่ได้เลือกแหล่งเสียง".into();
        });
        let _ = app.emit("runtime-state", runtime);
        Ok(settings)
    })
    .await
    .map_err(|error| error.to_string())?
}

pub async fn toggle_listening(app: AppHandle) -> CommandResult<bool> {
    let enabled = {
        let state = app.state::<AppState>();
        listening_toggle_target(&state)
    };
    apply_listening_state(app, enabled).await
}

pub async fn start_session(app: AppHandle) -> CommandResult<bool> {
    let was_listening = runtime_is_listening(&app.state::<AppState>());
    if !was_listening {
        apply_listening_state(app.clone(), true).await?;
    }
    if let Err(error) = hide_main_for_session(&app, !was_listening) {
        if !was_listening {
            let _ = apply_listening_state(app.clone(), false).await;
        }
        return Err(error);
    }
    Ok(true)
}

pub async fn set_listening(app: AppHandle, enabled: bool) -> CommandResult<bool> {
    apply_listening_state(app, enabled).await
}

pub fn probe_recent_audio(app: AppHandle, state: &AppState) -> CommandResult<()> {
    state
        .ai_stt
        .probe_recent_audio(app)
        .map_err(|error| error.to_string())
}

pub(crate) fn set_listening_sync(app: &AppHandle, enabled: bool) -> CommandResult<bool> {
    pipeline::set_listening(app, enabled).map_err(|error| error.to_string())
}
