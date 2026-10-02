use crate::{
    models::{StreamKind, TranscriptEvent, TranscriptKind},
    state::AppState,
    translator::Translator,
};
use tauri::{AppHandle, Emitter, Manager};

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
