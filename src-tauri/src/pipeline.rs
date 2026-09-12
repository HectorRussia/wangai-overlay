use std::time::Duration;

use anyhow::Result;
use tauri::{AppHandle, Emitter, Manager};

use crate::{
    audio::{self, IncomingCaptureConfig},
    commands,
    models::{
        CaptureMode, StreamKind, TranscriptEvent, TranscriptKind, TranslationResult, WorkerEvent,
        WorkerStatusEvent,
    },
    processes,
    state::AppState,
    translator::Translator,
};

pub fn handle_worker_event(app: AppHandle, event: WorkerEvent) {
    if app.state::<AppState>().lifecycle.is_closing() {
        return;
    }
    let state = app.state::<AppState>();
    match event {
        WorkerEvent::Ready { model, device } => {
            let runtime = state.update_runtime(|runtime| {
                runtime.worker_ready = true;
                runtime.worker_model = Some(model.clone());
                runtime.status_message = format!("Silero VAD พร้อมใช้งานบน {device}");
                runtime.last_error = None;
            });
            let _ = app.emit(
                "worker-status",
                WorkerStatusEvent {
                    state: "ready".into(),
                    message: runtime.status_message,
                    model: Some(model),
                },
            );
        }
        WorkerEvent::Status { message } => {
            state.update_runtime(|runtime| runtime.status_message = message.clone());
            let _ = app.emit("pipeline-status", message);
        }
        WorkerEvent::SpeechState {
            stream,
            active,
            utterance_id,
            sample_cursor,
        } => {
            if stream != StreamKind::Incoming {
                return;
            }
            let runtime = state.update_runtime(|runtime| {
                runtime.vad_active = active;
                if active {
                    runtime.capture_warning = None;
                }
            });
            if active {
                state
                    .ai_stt
                    .start_incoming_speech(app.clone(), utterance_id, sample_cursor);
            } else {
                state
                    .ai_stt
                    .end_incoming_speech(app.clone(), utterance_id, sample_cursor);
            }
            let _ = app.emit("speech-state", (stream, active));
            let _ = app.emit("runtime-state", runtime);
        }
        WorkerEvent::AudioGap {
            stream,
            expected_sample_cursor,
            actual_sample_cursor,
        } => {
            if stream != StreamKind::Incoming {
                return;
            }
            state.ai_stt.cancel_incoming_utterance(&app);
            let warning = format!("audio ขาเข้าขาดช่วง (คาด {expected_sample_cursor}, ได้ {actual_sample_cursor}) จึงยกเลิกวลีนี้");
            let runtime = state.update_runtime(|runtime| {
                runtime.vad_active = false;
                runtime.capture_warning = Some(warning.clone());
                runtime.status_message = "audio ขาเข้าขาดช่วง".into();
            });
            let _ = app.emit("pipeline-error", warning);
            let _ = app.emit("runtime-state", runtime);
        }
        WorkerEvent::Error { message, .. } => {
            let runtime = state.update_runtime(|runtime| {
                runtime.worker_ready = false;
                runtime.vad_active = false;
                runtime.last_error = Some(message.clone());
                runtime.status_message = "Silero VAD worker มีปัญหา".into();
            });
            let _ = app.emit("pipeline-error", message);
            let _ = app.emit("runtime-state", runtime);
        }
    }
}

pub async fn handle_transcript_event(
    app: AppHandle,
    mut transcript: TranscriptEvent,
    generation: u64,
) {
    transcript.text = transcript.text.trim().to_string();
    if transcript.text.is_empty() {
        return;
    }
    let state = app.state::<AppState>();
    if transcript.kind == TranscriptKind::Partial {
        if state.lifecycle.is_closing() {
            return;
        }
        state.set_partial(Some(transcript.clone()));
        let _ = app.emit("transcript", transcript);
        return;
    }
    if state.lifecycle.is_closing() || state.ai_stt.generation(transcript.stream) != generation {
        return;
    }
    state.set_partial(None);
    let item = state.add_final(&transcript);
    let _ = app.emit("transcript", transcript.clone());
    let _ = app.emit("subtitle-item", item);

    let (from, to) = match transcript.stream {
        StreamKind::Incoming => ("en", "th"),
        StreamKind::Microphone => ("th", "en"),
    };
    let result = state
        .translator
        .translate(
            &state.settings,
            &transcript.segment_id,
            &transcript.text,
            from,
            to,
        )
        .await;
    if !state.apply_translation_for_generation(&result, transcript.stream, generation) {
        return;
    }
    if result.status == crate::models::TranslationStatus::Error {
        let runtime = state.update_runtime(|runtime| {
            runtime.last_error = result.message.clone();
            runtime.ai_status = state.gateway.status().message;
        });
        let _ = app.emit("runtime-state", runtime);
    }
    let _ = app.emit("translation-result", result);
    let _ = app.emit("settings-updated", state.settings.snapshot());
}

fn clear_incoming_runtime(runtime: &mut crate::models::RuntimeState) {
    runtime.attached_source = None;
    runtime.effective_capture_pid = None;
    runtime.effective_capture_name = None;
    runtime.effective_output_device_id = None;
    runtime.effective_output_device_name = None;
    runtime.effective_output_device_is_default = false;
    runtime.audio_rms_dbfs = None;
    runtime.audio_peak_dbfs = None;
    runtime.audio_last_seen_at_ms = None;
    runtime.vad_active = false;
    runtime.effective_vad_auto_gain_db = 0.0;
    runtime.dropped_audio_chunks = 0;
    runtime.capture_warning = None;
}

pub fn set_listening(app: &AppHandle, enabled: bool) -> Result<bool> {
    let state = app.state::<AppState>();
    anyhow::ensure!(!state.lifecycle.is_closing(), "กำลังปิดระบบเพื่ออัปเดต");
    if !enabled {
        state.audio.stop_incoming();
        state.worker.reset_stream(StreamKind::Incoming);
        state.ai_stt.reset_stream(StreamKind::Incoming);
        let runtime = state.update_runtime(|runtime| {
            runtime.listening = false;
            clear_incoming_runtime(runtime);
            runtime.status_message = "หยุดฟังเสียงขาเข้าแล้ว".into();
        });
        let _ = app.emit("runtime-state", runtime);
        commands::open_settings_window(app.clone()).map_err(anyhow::Error::msg)?;
        return Ok(false);
    }
    let settings = state.settings.snapshot();
    if !state.gateway.can_submit() {
        return Err(anyhow::anyhow!(state.gateway.status().message));
    }
    if settings.listening_source.is_none() {
        return Err(anyhow::anyhow!("เลือกแอปที่ต้องการฟังก่อน"));
    }
    state.update_runtime(|runtime| {
        runtime.listening = true;
        runtime.status_message = "กำลังเชื่อมต่อแหล่งเสียง".into();
    });
    if let Err(error) = attach_listening_source(app) {
        state.audio.stop_incoming();
        state.worker.reset_stream(StreamKind::Incoming);
        state.ai_stt.reset_stream(StreamKind::Incoming);
        let runtime = state.update_runtime(|runtime| {
            runtime.listening = false;
            clear_incoming_runtime(runtime);
            runtime.last_error = Some(error.to_string());
            runtime.status_message = "เริ่มฟังไม่สำเร็จ กรุณาตรวจการตั้งค่าเสียง".into();
        });
        let _ = app.emit("runtime-state", runtime);
        return Err(error);
    }
    let _ = app.emit("runtime-state", state.runtime.read().unwrap().clone());
    commands::show_listening_overlay(app).map_err(anyhow::Error::msg)?;
    Ok(true)
}

pub fn attach_listening_source(app: &AppHandle) -> Result<()> {
    let state = app.state::<AppState>();
    let _operation = state.lifecycle.operation()?;
    let settings = state.settings.snapshot();
    let Some(saved) = settings.listening_source.as_ref() else {
        state.audio.stop_incoming();
        state.update_runtime(|runtime| {
            clear_incoming_runtime(runtime);
            runtime.status_message = "เลือกแอปที่ต้องการฟังก่อน".into();
        });
        return Ok(());
    };
    let Some(resolved) = processes::resolve_saved_process(saved) else {
        state.audio.stop_incoming();
        state.update_runtime(|runtime| {
            clear_incoming_runtime(runtime);
            runtime.status_message = format!("รอ {} เปิดทำงาน", saved.display_name);
        });
        return Ok(());
    };
    if saved.last_pid != Some(resolved.selected.pid) {
        let updated = state.settings.update(|settings| {
            settings.listening_source = Some((&resolved.selected).into());
            Ok(())
        })?;
        let _ = app.emit("settings-updated", updated);
    }

    let active_vad = settings.vad.active_profile(settings.capture_mode);
    let output_device = if settings.capture_mode == CaptureMode::SystemOutput {
        match audio::resolve_output_device(settings.output_device_id.as_deref()) {
            Ok(device) => Some(device),
            Err(error) => {
                state.audio.stop_incoming();
                let message = error.to_string();
                state.update_runtime(|runtime| {
                    clear_incoming_runtime(runtime);
                    runtime.attached_source = Some(resolved.selected.clone());
                    runtime.capture_warning = Some(message.clone());
                    runtime.last_error = Some(message);
                    runtime.status_message = "เลือกอุปกรณ์เสียงใหม่".into();
                });
                return Err(error);
            }
        }
    } else {
        None
    };

    state.audio.start_incoming(
        app.clone(),
        IncomingCaptureConfig {
            selected_pid: resolved.selected.pid,
            effective_pid: resolved.capture_root.pid,
            capture_mode: settings.capture_mode,
            vad_gain_db: active_vad.gain_db,
            output_device_id: settings.output_device_id.clone(),
            output_device_name: output_device.as_ref().map(|device| device.name.clone()),
            cloud_scan_enabled: settings.rescue_scan_enabled,
        },
        state.worker.clone(),
        state.ai_stt.clone(),
    )?;

    let runtime = state.update_runtime(|runtime| {
        runtime.attached_source = Some(resolved.selected.clone());
        runtime.effective_capture_pid = Some(resolved.capture_root.pid);
        runtime.effective_capture_name = Some(resolved.capture_root.name.clone());
        runtime.effective_output_device_id = output_device.as_ref().map(|device| device.id.clone());
        runtime.effective_output_device_name =
            output_device.as_ref().map(|device| device.name.clone());
        runtime.effective_output_device_is_default = output_device
            .as_ref()
            .is_some_and(|device| device.is_default);
        runtime.audio_rms_dbfs = None;
        runtime.audio_peak_dbfs = None;
        runtime.audio_last_seen_at_ms = None;
        runtime.vad_active = false;
        runtime.effective_vad_threshold = active_vad.vad_threshold;
        runtime.effective_vad_gain_db = active_vad.gain_db;
        runtime.effective_vad_auto_gain_db = 0.0;
        runtime.dropped_audio_chunks = 0;
        runtime.capture_warning = None;
        runtime.status_message = match settings.capture_mode {
            CaptureMode::ProcessTree => format!(
                "กำลังฟัง {} ผ่าน process tree PID {}",
                resolved.selected.display_name, resolved.capture_root.pid
            ),
            CaptureMode::SystemOutput => format!(
                "กำลังฟัง System Output ขณะ {} ทำงาน · แสดงเป็น MIXED",
                resolved.selected.display_name
            ),
        };
        runtime.last_error = None;
    });
    let _ = app.emit("runtime-state", runtime);
    Ok(())
}

pub fn start_push_to_talk(app: &AppHandle) -> Result<()> {
    let state = app.state::<AppState>();
    let _operation = state.lifecycle.operation()?;
    if !state.gateway.can_submit() {
        return Err(anyhow::anyhow!(state.gateway.status().message));
    }
    state.ai_stt.reset_stream(StreamKind::Microphone);
    state.ai_stt.start_microphone(app);
    if let Err(error) = state
        .audio
        .start_microphone(app.clone(), state.ai_stt.clone())
    {
        state.ai_stt.reset_stream(StreamKind::Microphone);
        return Err(error);
    }
    let runtime = state.update_runtime(|runtime| {
        runtime.microphone_active = true;
        runtime.status_message = "กำลังฟังไมค์ภาษาไทย".into();
    });
    let _ = app.emit("runtime-state", runtime);
    commands::show_listening_overlay(app).map_err(anyhow::Error::msg)?;
    Ok(())
}

pub fn stop_push_to_talk(app: &AppHandle) {
    let state = app.state::<AppState>();
    let Ok(_operation) = state.lifecycle.operation() else {
        return;
    };
    state.audio.stop_microphone();
    state.ai_stt.end_microphone(app.clone());
    let runtime = state.update_runtime(|runtime| {
        runtime.microphone_active = false;
        runtime.status_message = if runtime.listening {
            "กำลังฟังเสียงขาเข้า".into()
        } else {
            "พร้อมใช้งาน".into()
        };
    });
    let _ = app.emit("runtime-state", runtime);
}

pub fn start_auto_attach_monitor(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut timer = tokio::time::interval(Duration::from_secs(2));
        loop {
            timer.tick().await;
            let state = app.state::<AppState>();
            let runtime = state.runtime.read().expect("runtime lock poisoned").clone();
            if state.lifecycle.is_closing() {
                break;
            }
            if !runtime.listening {
                continue;
            }
            let alive = runtime
                .attached_source
                .as_ref()
                .is_some_and(|source| processes::process_is_alive(source.pid));
            if !alive {
                state.audio.stop_incoming();
                state.ai_stt.reset_stream(StreamKind::Incoming);
                state.update_runtime(clear_incoming_runtime);
                if let Err(error) = attach_listening_source(&app) {
                    state.update_runtime(|runtime| {
                        runtime.last_error = Some(error.to_string());
                        runtime.status_message = "จับเสียงไม่สำเร็จ จะลองใหม่".into();
                    });
                }
                let _ = app.emit("runtime-state", state.runtime.read().unwrap().clone());
            }
        }
    });
}

pub fn inject_demo(app: &AppHandle) {
    let state = app.state::<AppState>();
    let now = chrono::Utc::now().timestamp_millis();
    let event = TranscriptEvent {
        segment_id: format!("demo-{now}"),
        stream: StreamKind::Incoming,
        source_display_name: Some("MISTFALL".into()),
        language: "en".into(),
        text: "Two enemies on the left. Fall back to the extraction point!".into(),
        kind: TranscriptKind::Final,
        started_at_ms: now - 1_200,
        ended_at_ms: now,
    };
    let item = state.add_final(&event);
    let _ = app.emit("transcript", event.clone());
    let _ = app.emit("subtitle-item", item);
    let result = TranslationResult {
        segment_id: event.segment_id,
        from: "en".into(),
        to: "th".into(),
        source_text: event.text,
        translated_text: Some("ศัตรูสองคนอยู่ทางซ้าย ถอยกลับไปที่จุดถอนตัว!".into()),
        status: crate::models::TranslationStatus::Success,
        message: None,
    };
    state.apply_translation(&result);
    let _ = app.emit("translation-result", result);
}
