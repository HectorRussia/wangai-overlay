use super::{listening::runtime_is_listening, CommandResult};
use crate::{
    audio, hotkeys,
    models::{
        AppSettings, CaptureMode, GlossaryTerm, HotkeySettings, OverlaySettings, StreamKind,
        VadSettings,
    },
    pipeline,
    state::AppState,
};
use tauri::{AppHandle, Emitter};

pub(crate) fn sync_active_vad_runtime(app: &AppHandle, state: &AppState, settings: &AppSettings) {
    let profile = settings.vad.active_profile(settings.capture_mode);
    let runtime = state.update_runtime(|runtime| {
        runtime.effective_vad_threshold = profile.vad_threshold;
        runtime.effective_vad_gain_db = profile.gain_db;
        runtime.last_error = None;
    });
    let _ = app.emit("runtime-state", runtime);
}

pub(crate) fn reattach_if_listening(app: &AppHandle, state: &AppState) -> CommandResult<()> {
    if runtime_is_listening(state) {
        state.ai_stt.reset_stream(StreamKind::Incoming);
        pipeline::attach_listening_source(app).map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub(crate) fn update_microphone_device_inner(
    state: &AppState,
    device_id: Option<String>,
) -> CommandResult<AppSettings> {
    let _operation = state
        .lifecycle
        .operation()
        .map_err(|error| error.to_string())?;
    if state
        .runtime
        .read()
        .expect("runtime lock poisoned")
        .microphone_active
    {
        return Err("ปล่อยปุ่มพูดก่อนเปลี่ยนไมโครโฟน".into());
    }
    let device_id = device_id.and_then(|id| {
        let id = id.trim();
        (!id.is_empty()).then(|| id.to_string())
    });
    if let Some(id) = device_id.as_deref() {
        audio::resolve_microphone_device(id).map_err(|error| error.to_string())?;
    }
    state
        .settings
        .update_microphone_device(device_id)
        .map_err(|error| error.to_string())
}

pub fn update_microphone_device(
    app: AppHandle,
    state: &AppState,
    device_id: Option<String>,
) -> CommandResult<AppSettings> {
    let settings = update_microphone_device_inner(&state, device_id)?;
    let _ = app.emit("settings-updated", settings.clone());
    Ok(settings)
}

pub(crate) fn update_output_device_inner(
    app: &AppHandle,
    state: &AppState,
    device_id: Option<String>,
) -> CommandResult<AppSettings> {
    let device_id = device_id.and_then(|value| {
        let value = value.trim();
        (!value.is_empty()).then(|| value.to_string())
    });
    if let Some(id) = device_id.as_deref() {
        audio::resolve_output_device(Some(id)).map_err(|error| error.to_string())?;
    }
    let settings = state
        .settings
        .update_output_device(device_id)
        .map_err(|error| error.to_string())?;
    reattach_if_listening(app, state)?;
    let _ = app.emit("settings-updated", settings.clone());
    Ok(settings)
}

pub fn update_output_device(
    app: AppHandle,
    state: &AppState,
    device_id: Option<String>,
) -> CommandResult<AppSettings> {
    update_output_device_inner(&app, &state, device_id)
}

pub fn update_rescue_scan(
    app: AppHandle,
    state: &AppState,
    enabled: bool,
) -> CommandResult<AppSettings> {
    let settings = update_rescue_scan_inner(&app, state, enabled)?;
    let _ = app.emit("settings-updated", settings.clone());
    Ok(settings)
}

pub(crate) fn update_capture_mode_inner(
    app: &AppHandle,
    state: &AppState,
    mode: CaptureMode,
) -> CommandResult<AppSettings> {
    let settings = state
        .settings
        .update(|settings| {
            settings.capture_mode = mode;
            Ok(())
        })
        .map_err(|error| error.to_string())?;
    state
        .worker
        .start(app.clone(), &settings)
        .map_err(|error| error.to_string())?;
    sync_active_vad_runtime(app, state, &settings);
    reattach_if_listening(app, state)?;
    let _ = app.emit("settings-updated", settings.clone());
    Ok(settings)
}

pub fn update_capture_mode(
    app: AppHandle,
    state: &AppState,
    mode: CaptureMode,
) -> CommandResult<AppSettings> {
    update_capture_mode_inner(&app, &state, mode)
}

pub fn update_hotkeys(
    app: AppHandle,
    state: &AppState,
    hotkeys: HotkeySettings,
) -> CommandResult<AppSettings> {
    let settings = update_hotkeys_inner(&app, state, hotkeys, true)?;
    let _ = app.emit("settings-updated", settings.clone());
    Ok(settings)
}

pub fn update_overlay_settings(
    app: AppHandle,
    state: &AppState,
    overlay: OverlaySettings,
) -> CommandResult<AppSettings> {
    let settings = state
        .settings
        .update_overlay(overlay)
        .map_err(|error| error.to_string())?;
    let _ = app.emit("settings-updated", settings.clone());
    Ok(settings)
}

pub(crate) fn update_vad_inner(
    app: &AppHandle,
    state: &AppState,
    vad: VadSettings,
) -> CommandResult<AppSettings> {
    let settings = state
        .settings
        .update_vad(vad)
        .map_err(|error| error.to_string())?;
    state.ai_stt.configure_incoming_buffer(
        settings.vad.pre_roll_ms,
        settings.vad.silence_ms,
        settings.vad.max_utterance_ms,
    );
    state
        .worker
        .start(app.clone(), &settings)
        .map_err(|error| error.to_string())?;
    sync_active_vad_runtime(app, state, &settings);
    reattach_if_listening(app, state)?;
    let _ = app.emit("settings-updated", settings.clone());
    Ok(settings)
}

pub fn update_vad_settings(
    app: AppHandle,
    state: &AppState,
    vad: VadSettings,
) -> CommandResult<AppSettings> {
    update_vad_inner(&app, &state, vad)
}

pub fn update_glossary(
    app: AppHandle,
    state: &AppState,
    glossary: Vec<GlossaryTerm>,
) -> CommandResult<AppSettings> {
    let settings = update_glossary_inner(&app, state, glossary)?;
    let _ = app.emit("settings-updated", settings.clone());
    Ok(settings)
}

pub fn restart_worker(app: AppHandle, state: &AppState) -> CommandResult<()> {
    let settings = restart_worker_inner(&app, state)?;
    sync_active_vad_runtime(&app, &state, &settings);
    Ok(())
}

// Desktop historically restores the previous registration even when registration fails;
// HTTP restores only when settings persistence fails. Preserve both policies.
pub(crate) fn update_hotkeys_inner(
    app: &AppHandle,
    state: &AppState,
    next: HotkeySettings,
    restore_on_registration_error: bool,
) -> CommandResult<AppSettings> {
    let old = state.settings.snapshot().hotkeys;
    hotkeys::register_hotkeys(app, &next).map_err(|error| {
        if restore_on_registration_error {
            let _ = hotkeys::register_hotkeys(app, &old);
        }
        error.to_string()
    })?;
    let settings = state.settings.update_hotkeys(next).map_err(|error| {
        let _ = hotkeys::register_hotkeys(app, &old);
        error.to_string()
    })?;
    Ok(settings)
}

pub(crate) fn update_rescue_scan_inner(
    app: &AppHandle,
    state: &AppState,
    enabled: bool,
) -> CommandResult<AppSettings> {
    let settings = state
        .settings
        .update_rescue_scan(enabled)
        .map_err(|error| error.to_string())?;
    reattach_if_listening(app, state)?;
    Ok(settings)
}

pub(crate) fn update_glossary_inner(
    _app: &AppHandle,
    state: &AppState,
    glossary: Vec<GlossaryTerm>,
) -> CommandResult<AppSettings> {
    let settings = state
        .settings
        .update(|settings| {
            settings.glossary = glossary;
            Ok(())
        })
        .map_err(|error| error.to_string())?;
    Ok(settings)
}

pub(crate) fn restart_worker_inner(
    app: &AppHandle,
    state: &AppState,
) -> CommandResult<AppSettings> {
    let settings = state.settings.snapshot();
    state
        .worker
        .start(app.clone(), &settings)
        .map_err(|error| error.to_string())?;
    Ok(settings)
}
