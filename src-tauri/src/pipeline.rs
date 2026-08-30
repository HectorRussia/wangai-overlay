use std::time::Duration;

use anyhow::Result;
use tauri::{AppHandle, Emitter, Manager};

use crate::{
    audio::{self, GameCaptureConfig},
    models::{
        StreamKind, TranscriptEvent, TranscriptKind, TranslationResult, WorkerEvent,
        WorkerStatusEvent,
    },
    processes,
    state::AppState,
    translator::Translator,
};

pub fn handle_worker_event(app: AppHandle, event: WorkerEvent) {
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
            if matches!(stream, StreamKind::Game | StreamKind::VoiceChat) {
                let runtime = state.update_runtime(|runtime| {
                    if stream == StreamKind::Game {
                        runtime.game_vad_active = active;
                    } else {
                        runtime.voice_chat_vad_active = active;
                    }
                    if active {
                        if stream == StreamKind::Game {
                            runtime.capture_warning = None;
                        } else {
                            runtime.voice_chat_capture_warning = None;
                        }
                    }
                });
                match (stream, active) {
                    (StreamKind::Game, true) => {
                        state
                            .groq_stt
                            .start_game_speech(app.clone(), utterance_id, sample_cursor)
                    }
                    (StreamKind::Game, false) => {
                        state
                            .groq_stt
                            .end_game_speech(app.clone(), utterance_id, sample_cursor)
                    }
                    (StreamKind::VoiceChat, true) => state.groq_stt.start_voice_chat_speech(
                        app.clone(),
                        utterance_id,
                        sample_cursor,
                    ),
                    (StreamKind::VoiceChat, false) => state.groq_stt.end_voice_chat_speech(
                        app.clone(),
                        utterance_id,
                        sample_cursor,
                    ),
                    (StreamKind::Microphone, _) => {}
                }
                let _ = app.emit("speech-state", (stream, active));
                let _ = app.emit("runtime-state", runtime);
            }
        }
        WorkerEvent::AudioGap {
            stream,
            expected_sample_cursor,
            actual_sample_cursor,
        } => {
            if matches!(stream, StreamKind::Game | StreamKind::VoiceChat) {
                if stream == StreamKind::Game {
                    state.groq_stt.cancel_game_utterance(&app);
                } else {
                    state.groq_stt.cancel_voice_chat_utterance(&app);
                }
                let source = if stream == StreamKind::Game {
                    "เกม"
                } else {
                    "voice chat"
                };
                let warning = format!(
                    "audio จาก{source}ขาดช่วง (คาด {expected_sample_cursor}, ได้ {actual_sample_cursor}) จึงยกเลิกวลีนี้"
                );
                let runtime = state.update_runtime(|runtime| {
                    if stream == StreamKind::Game {
                        runtime.game_vad_active = false;
                        runtime.capture_warning = Some(warning.clone());
                    } else {
                        runtime.voice_chat_vad_active = false;
                        runtime.voice_chat_capture_warning = Some(warning.clone());
                    }
                    runtime.status_message = format!("audio {source} ขาดช่วง");
                });
                let _ = app.emit("pipeline-error", warning);
                let _ = app.emit("runtime-state", runtime);
            }
        }
        WorkerEvent::Error { message, .. } => {
            state.update_runtime(|runtime| {
                runtime.last_error = Some(message.clone());
                runtime.status_message = "Silero VAD worker มีปัญหา".into();
            });
            let _ = app.emit("pipeline-error", message);
        }
    }
}

pub async fn handle_transcript_event(app: AppHandle, mut transcript: TranscriptEvent) {
    transcript.text = transcript.text.trim().to_string();
    if transcript.text.is_empty() {
        return;
    }
    let state = app.state::<AppState>();
    if transcript.kind == TranscriptKind::Partial {
        state.set_partial(Some(transcript.clone()));
        let _ = app.emit("transcript", transcript);
        return;
    }

    state.set_partial(None);
    let item = state.add_final(&transcript);
    let _ = app.emit("transcript", transcript.clone());
    let _ = app.emit("subtitle-item", item);

    let (from, to) = match transcript.stream {
        StreamKind::Game | StreamKind::VoiceChat => ("en", "th"),
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
    state.apply_translation(&result);
    if result.status == crate::models::TranslationStatus::Quota {
        let runtime = state.update_runtime(|runtime| {
            runtime.budget_exhausted = true;
            runtime.groq_status = "ถึงงบ Groq รายเดือนแล้ว".into();
            runtime.last_error = result.message.clone();
        });
        let _ = app.emit("runtime-state", runtime);
    } else if result.status == crate::models::TranslationStatus::Error {
        let fatal_cloud = result.message.as_deref().is_some_and(|message| {
            message.contains("API key")
                || message.contains("ไม่มีเครดิต")
                || message.contains("ปฏิเสธสิทธิ์")
        });
        if fatal_cloud {
            let _ = state.settings.update(|settings| {
                settings.groq.configured = false;
                Ok(())
            });
        }
        let runtime = state.update_runtime(|runtime| {
            runtime.last_error = result.message.clone();
            if fatal_cloud {
                runtime.groq_status = "Groq ต้องตรวจสอบ key หรือเครดิต".into();
            }
        });
        let _ = app.emit("runtime-state", runtime);
    }
    let _ = app.emit("translation-result", result);
    let _ = app.emit("settings-updated", state.settings.snapshot());
}

pub fn set_listening(app: &AppHandle, enabled: bool) -> Result<bool> {
    let state = app.state::<AppState>();
    if !enabled {
        state.audio.stop_game();
        state.audio.stop_voice_chat();
        state.worker.reset_stream(StreamKind::Game);
        state.worker.reset_stream(StreamKind::VoiceChat);
        state.groq_stt.reset_stream(StreamKind::Game);
        state.groq_stt.reset_stream(StreamKind::VoiceChat);
        let runtime = state.update_runtime(|runtime| {
            runtime.listening = false;
            runtime.attached_process = None;
            runtime.effective_capture_pid = None;
            runtime.effective_capture_name = None;
            runtime.effective_output_device_id = None;
            runtime.effective_output_device_name = None;
            runtime.effective_output_device_is_default = false;
            runtime.game_audio_rms_dbfs = None;
            runtime.game_audio_peak_dbfs = None;
            runtime.game_audio_last_seen_at_ms = None;
            runtime.game_vad_active = false;
            runtime.effective_vad_auto_gain_db = 0.0;
            runtime.dropped_audio_chunks = 0;
            runtime.capture_warning = None;
            clear_voice_chat_runtime(runtime);
            runtime.status_message = "หยุดฟังเสียงเกมแล้ว".into();
        });
        let _ = app.emit("runtime-state", runtime);
        return Ok(false);
    }

    let settings = state.settings.snapshot();
    if !settings.groq.configured {
        return Err(anyhow::anyhow!("ตั้งค่า Groq API key ก่อนเริ่มฟังเกม"));
    }
    if state.settings.budget_exhausted() {
        return Err(anyhow::anyhow!("ถึงงบ Groq รายเดือนแล้ว"));
    }

    state.update_runtime(|runtime| {
        runtime.listening = true;
        runtime.status_message = "กำลังหา process เกม".into();
    });
    attach_saved_process(app)?;
    let _ = app.emit("runtime-state", state.runtime.read().unwrap().clone());
    Ok(true)
}

pub fn attach_saved_process(app: &AppHandle) -> Result<()> {
    let state = app.state::<AppState>();
    let settings = state.settings.snapshot();
    let Some(saved) = settings.selected_process.as_ref() else {
        state.update_runtime(|runtime| {
            runtime.attached_process = None;
            runtime.status_message = "เลือก process เกมก่อนเริ่มฟัง".into();
        });
        return Ok(());
    };
    let Some(resolved) = processes::resolve_saved_process(saved) else {
        state.update_runtime(|runtime| {
            runtime.attached_process = None;
            runtime.effective_capture_pid = None;
            runtime.effective_capture_name = None;
            runtime.effective_output_device_id = None;
            runtime.effective_output_device_name = None;
            runtime.effective_output_device_is_default = false;
            runtime.status_message = format!("รอ {} เปิดทำงาน", saved.display_name);
        });
        return Ok(());
    };
    if saved.last_pid != Some(resolved.selected.pid) {
        let updated = state.settings.update(|settings| {
            settings.selected_process = Some((&resolved.selected).into());
            Ok(())
        })?;
        let _ = app.emit("settings-updated", updated);
    }
    let active_vad = settings.vad.active_profile(settings.game_capture_mode);
    let output_device =
        if settings.game_capture_mode == crate::models::GameCaptureMode::SystemOutput {
            match audio::resolve_game_output_device(settings.game_output_device_id.as_deref()) {
                Ok(device) => Some(device),
                Err(error) => {
                    state.audio.stop_game();
                    let message = error.to_string();
                    state.update_runtime(|runtime| {
                        runtime.attached_process = Some(resolved.selected.clone());
                        runtime.effective_output_device_id = None;
                        runtime.effective_output_device_name = None;
                        runtime.effective_output_device_is_default = false;
                        runtime.capture_warning = Some(message.clone());
                        runtime.last_error = Some(message.clone());
                        runtime.status_message = "เลือกอุปกรณ์เสียงสำหรับ Mistfall ใหม่".into();
                    });
                    return Err(error);
                }
            }
        } else {
            None
        };
    state.audio.start_game(
        app.clone(),
        GameCaptureConfig {
            selected_pid: resolved.selected.pid,
            effective_pid: resolved.capture_root.pid,
            capture_mode: settings.game_capture_mode,
            vad_gain_db: active_vad.gain_db,
            output_device_id: settings.game_output_device_id.clone(),
            output_device_name: output_device.as_ref().map(|device| device.name.clone()),
            cloud_scan_enabled: settings.game_capture_mode
                == crate::models::GameCaptureMode::SystemOutput
                && settings.system_output_cloud_scan,
        },
        state.worker.clone(),
        state.groq_stt.clone(),
    )?;
    if settings.game_capture_mode == crate::models::GameCaptureMode::ProcessTree {
        if let Err(error) = attach_voice_chat_process(app) {
            state.update_runtime(|runtime| {
                runtime.voice_chat_capture_warning = Some(error.to_string());
            });
        }
    } else {
        state.audio.stop_voice_chat();
        state.worker.reset_stream(StreamKind::VoiceChat);
        state.groq_stt.reset_stream(StreamKind::VoiceChat);
        state.update_runtime(clear_voice_chat_runtime);
    }
    let runtime = state.update_runtime(|runtime| {
        runtime.attached_process = Some(resolved.selected.clone());
        runtime.effective_capture_pid = Some(resolved.capture_root.pid);
        runtime.effective_capture_name = Some(resolved.capture_root.name.clone());
        runtime.effective_output_device_id = output_device.as_ref().map(|device| device.id.clone());
        runtime.effective_output_device_name =
            output_device.as_ref().map(|device| device.name.clone());
        runtime.effective_output_device_is_default = output_device
            .as_ref()
            .is_some_and(|device| device.is_default);
        runtime.game_audio_rms_dbfs = None;
        runtime.game_audio_peak_dbfs = None;
        runtime.game_audio_last_seen_at_ms = None;
        runtime.game_vad_active = false;
        runtime.effective_vad_threshold = active_vad.vad_threshold;
        runtime.effective_vad_gain_db = active_vad.gain_db;
        runtime.effective_vad_auto_gain_db = 0.0;
        runtime.dropped_audio_chunks = 0;
        runtime.capture_warning = None;
        runtime.status_message = match settings.game_capture_mode {
            crate::models::GameCaptureMode::ProcessTree => format!(
                "กำลังฟัง {} ผ่าน process tree PID {}",
                resolved.selected.display_name, resolved.capture_root.pid
            ),
            crate::models::GameCaptureMode::SystemOutput => format!(
                "กำลังฟัง System Output ขณะ {} ทำงาน{}",
                resolved.selected.display_name,
                if settings.system_output_cloud_scan {
                    " · Auto Cloud Scan เปิดอยู่"
                } else {
                    ""
                }
            ),
        };
        runtime.last_error = None;
    });
    let _ = app.emit("runtime-state", runtime);
    Ok(())
}

pub fn attach_voice_chat_process(app: &AppHandle) -> Result<()> {
    let state = app.state::<AppState>();
    let settings = state.settings.snapshot();
    if !settings.voice_chat.enabled
        || settings.game_capture_mode == crate::models::GameCaptureMode::SystemOutput
    {
        state.audio.stop_voice_chat();
        state.update_runtime(clear_voice_chat_runtime);
        return Ok(());
    }

    let mut resolved = settings
        .voice_chat
        .selected_process
        .as_ref()
        .and_then(processes::resolve_saved_voice_chat_process);
    if resolved.is_none() && settings.voice_chat.auto_detect {
        resolved = processes::auto_detect_voice_chat_process();
    }
    let Some(resolved) = resolved else {
        state.audio.stop_voice_chat();
        state.update_runtime(|runtime| {
            clear_voice_chat_runtime(runtime);
            runtime.voice_chat_capture_warning =
                Some("ยังไม่พบ Discord หรือ voice chat process".into());
        });
        return Ok(());
    };

    let saved_changed = settings
        .voice_chat
        .selected_process
        .as_ref()
        .is_none_or(|saved| saved.last_pid != Some(resolved.selected.pid));
    if saved_changed {
        let updated = state.settings.update(|settings| {
            settings.voice_chat.selected_process = Some((&resolved.selected).into());
            Ok(())
        })?;
        let _ = app.emit("settings-updated", updated);
    }

    state.audio.start_voice_chat(
        app.clone(),
        GameCaptureConfig {
            selected_pid: resolved.selected.pid,
            effective_pid: resolved.capture_root.pid,
            capture_mode: crate::models::GameCaptureMode::ProcessTree,
            vad_gain_db: settings.voice_chat.vad.gain_db,
            output_device_id: None,
            output_device_name: None,
            cloud_scan_enabled: settings.voice_chat.rescue_scan,
        },
        state.worker.clone(),
        state.groq_stt.clone(),
    )?;
    let runtime = state.update_runtime(|runtime| {
        runtime.voice_chat_attached_process = Some(resolved.selected.clone());
        runtime.voice_chat_effective_capture_pid = Some(resolved.capture_root.pid);
        runtime.voice_chat_effective_capture_name = Some(resolved.capture_root.name.clone());
        runtime.voice_chat_audio_rms_dbfs = None;
        runtime.voice_chat_audio_peak_dbfs = None;
        runtime.voice_chat_audio_last_seen_at_ms = None;
        runtime.voice_chat_vad_active = false;
        runtime.voice_chat_vad_threshold = settings.voice_chat.vad.vad_threshold;
        runtime.voice_chat_vad_gain_db = settings.voice_chat.vad.gain_db;
        runtime.voice_chat_dropped_audio_chunks = 0;
        runtime.voice_chat_capture_warning = None;
    });
    let _ = app.emit("runtime-state", runtime);
    Ok(())
}

fn clear_voice_chat_runtime(runtime: &mut crate::models::RuntimeState) {
    runtime.voice_chat_attached_process = None;
    runtime.voice_chat_effective_capture_pid = None;
    runtime.voice_chat_effective_capture_name = None;
    runtime.voice_chat_audio_rms_dbfs = None;
    runtime.voice_chat_audio_peak_dbfs = None;
    runtime.voice_chat_audio_last_seen_at_ms = None;
    runtime.voice_chat_vad_active = false;
    runtime.voice_chat_dropped_audio_chunks = 0;
    runtime.voice_chat_capture_warning = None;
}

pub fn start_push_to_talk(app: &AppHandle) -> Result<()> {
    let state = app.state::<AppState>();
    if !state.settings.snapshot().groq.configured {
        return Err(anyhow::anyhow!("ตั้งค่า Groq API key ก่อนใช้ F9"));
    }
    if state.settings.budget_exhausted() {
        return Err(anyhow::anyhow!("ถึงงบ Groq รายเดือนแล้ว"));
    }
    state.groq_stt.reset_stream(StreamKind::Microphone);
    state.groq_stt.start_microphone(app);
    if let Err(error) = state
        .audio
        .start_microphone(app.clone(), state.groq_stt.clone())
    {
        state.groq_stt.reset_stream(StreamKind::Microphone);
        return Err(error);
    }
    let runtime = state.update_runtime(|runtime| {
        runtime.microphone_active = true;
        runtime.status_message = "กำลังฟังไมค์ภาษาไทย".into();
    });
    let _ = app.emit("runtime-state", runtime);
    Ok(())
}

pub fn stop_push_to_talk(app: &AppHandle) {
    let state = app.state::<AppState>();
    state.audio.stop_microphone();
    state.groq_stt.end_microphone(app.clone());
    let runtime = state.update_runtime(|runtime| {
        runtime.microphone_active = false;
        runtime.status_message = if runtime.listening {
            "กำลังฟังเสียงเกม".into()
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
            if !runtime.listening {
                continue;
            }
            if runtime
                .attached_process
                .as_ref()
                .is_some_and(|process| processes::process_is_alive(process.pid))
            {
                let voice_alive = runtime
                    .voice_chat_attached_process
                    .as_ref()
                    .is_some_and(|process| processes::process_is_alive(process.pid));
                if !voice_alive {
                    state.audio.stop_voice_chat();
                    state.groq_stt.reset_stream(StreamKind::VoiceChat);
                    state.update_runtime(clear_voice_chat_runtime);
                    if let Err(error) = attach_voice_chat_process(&app) {
                        state.update_runtime(|runtime| {
                            runtime.voice_chat_capture_warning = Some(error.to_string());
                        });
                    }
                }
            } else {
                state.audio.stop_game();
                state.audio.stop_voice_chat();
                state.groq_stt.reset_stream(StreamKind::Game);
                state.groq_stt.reset_stream(StreamKind::VoiceChat);
                state.update_runtime(|runtime| {
                    runtime.attached_process = None;
                    clear_voice_chat_runtime(runtime);
                });
                if let Err(error) = attach_saved_process(&app) {
                    state.update_runtime(|runtime| {
                        runtime.last_error = Some(error.to_string());
                        runtime.status_message = "จับเสียงเกมไม่สำเร็จ จะลองใหม่".into();
                    });
                }
            }
            let _ = app.emit("runtime-state", state.runtime.read().unwrap().clone());
        }
    });
}

pub fn inject_demo(app: &AppHandle) {
    let state = app.state::<AppState>();
    let now = chrono::Utc::now().timestamp_millis();
    let event = TranscriptEvent {
        segment_id: format!("demo-{now}"),
        stream: StreamKind::Game,
        source_display_name: Some("GAME".into()),
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
