use std::time::Duration;

use anyhow::Result;
use tauri::{AppHandle, Emitter, Manager};

use crate::{
    models::{
        StreamKind, TranscriptEvent, TranscriptKind, TranslationResult, WorkerEvent,
        WorkerStatusEvent,
    },
    processes,
    state::AppState,
    translator::Translator,
};

pub async fn handle_worker_event(app: AppHandle, event: WorkerEvent) {
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
        WorkerEvent::SpeechState { stream, active } => {
            if stream == StreamKind::Microphone {
                state.update_runtime(|runtime| runtime.microphone_active = active);
            }
            if active {
                state.groq_stt.start_speech(app.clone(), stream);
            } else {
                state.groq_stt.end_speech(app.clone(), stream);
            }
            let _ = app.emit("speech-state", (stream, active));
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
        StreamKind::Game => ("en", "th"),
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
        state.worker.reset_stream(StreamKind::Game);
        state.groq_stt.reset_stream(StreamKind::Game);
        let runtime = state.update_runtime(|runtime| {
            runtime.listening = false;
            runtime.attached_process = None;
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
    let Some(saved) = settings.selected_process else {
        state.update_runtime(|runtime| {
            runtime.attached_process = None;
            runtime.status_message = "เลือก process เกมก่อนเริ่มฟัง".into();
        });
        return Ok(());
    };
    let Some(source) = processes::resolve_saved_process(&saved) else {
        state.update_runtime(|runtime| {
            runtime.attached_process = None;
            runtime.status_message = format!("รอ {} เปิดทำงาน", saved.display_name);
        });
        return Ok(());
    };
    state.audio.start_game(
        app.clone(),
        source.clone(),
        state.worker.clone(),
        state.groq_stt.clone(),
    )?;
    state.update_runtime(|runtime| {
        runtime.attached_process = Some(source.clone());
        runtime.status_message = format!("กำลังฟัง {}", source.display_name);
        runtime.last_error = None;
    });
    Ok(())
}

pub fn start_push_to_talk(app: &AppHandle) -> Result<()> {
    let state = app.state::<AppState>();
    if !state.settings.snapshot().groq.configured {
        return Err(anyhow::anyhow!("ตั้งค่า Groq API key ก่อนใช้ F9"));
    }
    if state.settings.budget_exhausted() {
        return Err(anyhow::anyhow!("ถึงงบ Groq รายเดือนแล้ว"));
    }
    state
        .audio
        .start_microphone(app.clone(), state.worker.clone(), state.groq_stt.clone())?;
    let runtime = state.update_runtime(|runtime| {
        runtime.microphone_active = true;
        runtime.status_message = "กำลังฟังไมค์ภาษาไทย".into();
    });
    let _ = app.emit("runtime-state", runtime);
    Ok(())
}

pub fn stop_push_to_talk(app: &AppHandle) {
    let state = app.state::<AppState>();
    state.audio.stop_microphone(&state.worker, true);
    state
        .groq_stt
        .end_speech(app.clone(), StreamKind::Microphone);
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
                continue;
            }
            state.audio.stop_game();
            state.groq_stt.reset_stream(StreamKind::Game);
            state.update_runtime(|runtime| runtime.attached_process = None);
            if let Err(error) = attach_saved_process(&app) {
                state.update_runtime(|runtime| {
                    runtime.last_error = Some(error.to_string());
                    runtime.status_message = "จับเสียงเกมไม่สำเร็จ จะลองใหม่".into();
                });
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
