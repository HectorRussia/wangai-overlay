use std::{
    collections::VecDeque,
    path::PathBuf,
    sync::{atomic::AtomicBool, RwLock},
};

use anyhow::Result;

use crate::{
    audio::AudioManager,
    cloud_stt::AiSttManager,
    gateway::GatewayClient,
    models::{
        AppSnapshot, RuntimeState, StreamKind, SubtitleItem, TranscriptEvent, TranslationResult,
    },
    settings::SettingsManager,
    translator::GatewayTranslator,
    worker::WorkerManager,
};

pub struct AppState {
    pub overlay_collapsed: AtomicBool,
    pub settings: SettingsManager,
    pub runtime: RwLock<RuntimeState>,
    pub history: RwLock<VecDeque<SubtitleItem>>,
    pub partial: RwLock<Option<TranscriptEvent>>,
    pub audio: AudioManager,
    pub worker: WorkerManager,
    pub ai_stt: AiSttManager,
    pub translator: GatewayTranslator,
    pub gateway: GatewayClient,
}

impl AppState {
    pub fn new(settings_path: PathBuf) -> Result<Self> {
        let settings = SettingsManager::load(settings_path)?;
        let snapshot = settings.snapshot();
        let vad = snapshot.vad.clone();
        let mut runtime = RuntimeState::default();
        let gateway = GatewayClient::new(snapshot.installation_id.clone())?;
        let active_profile = snapshot.vad.active_profile(snapshot.capture_mode);
        runtime.effective_vad_threshold = active_profile.vad_threshold;
        runtime.effective_vad_gain_db = active_profile.gain_db;
        Ok(Self {
            overlay_collapsed: AtomicBool::new(true),
            settings,
            runtime: RwLock::new(runtime),
            history: RwLock::new(VecDeque::with_capacity(100)),
            partial: RwLock::new(None),
            audio: AudioManager::default(),
            worker: WorkerManager::default(),
            ai_stt: AiSttManager::new(vad.pre_roll_ms, vad.silence_ms, vad.max_utterance_ms),
            translator: GatewayTranslator(gateway.clone()),
            gateway,
        })
    }

    pub fn snapshot(&self) -> AppSnapshot {
        AppSnapshot {
            settings: self.settings.snapshot(),
            runtime: {
                let mut runtime = self.runtime.read().expect("runtime lock poisoned").clone();
                runtime.ai_service = self.gateway.status();
                runtime
            },
            history: self
                .history
                .read()
                .expect("history lock poisoned")
                .iter()
                .rev()
                .cloned()
                .collect(),
            partial: self.partial.read().expect("partial lock poisoned").clone(),
        }
    }

    pub fn update_runtime<F>(&self, update: F) -> RuntimeState
    where
        F: FnOnce(&mut RuntimeState),
    {
        let mut runtime = self.runtime.write().expect("runtime lock poisoned");
        update(&mut runtime);
        runtime.ai_service = self.gateway.status();
        runtime.clone()
    }

    pub fn set_partial(&self, partial: Option<TranscriptEvent>) {
        *self.partial.write().expect("partial lock poisoned") = partial;
    }

    pub fn add_final(&self, event: &TranscriptEvent) -> SubtitleItem {
        let item = SubtitleItem {
            segment_id: event.segment_id.clone(),
            stream: event.stream,
            source_display_name: event.source_display_name.clone(),
            original_language: event.language.clone(),
            original_text: event.text.clone(),
            translated_text: None,
            status: crate::models::TranslationStatus::Pending,
            created_at_ms: event.ended_at_ms,
        };
        let mut history = self.history.write().expect("history lock poisoned");
        if let Some(existing) = history
            .iter_mut()
            .find(|value| value.segment_id == item.segment_id)
        {
            *existing = item.clone();
            return item;
        }
        let insert_at = history
            .iter()
            .position(|value| value.created_at_ms > item.created_at_ms)
            .unwrap_or(history.len());
        history.insert(insert_at, item.clone());
        while history.len() > 100 {
            history.pop_front();
        }
        item
    }

    pub fn apply_translation(&self, result: &TranslationResult) -> Option<SubtitleItem> {
        let mut history = self.history.write().expect("history lock poisoned");
        let item = history
            .iter_mut()
            .find(|value| value.segment_id == result.segment_id)?;
        item.translated_text = result.translated_text.clone();
        item.status = result.status;
        Some(item.clone())
    }

    pub fn latest_reply(&self) -> Option<String> {
        self.history
            .read()
            .expect("history lock poisoned")
            .iter()
            .rev()
            .find(|item| item.stream == StreamKind::Microphone)
            .and_then(|item| item.translated_text.clone())
    }

    pub fn apply_translation_for_generation(
        &self,
        result: &TranslationResult,
        stream: StreamKind,
        generation: u64,
    ) -> bool {
        if self.ai_stt.generation(stream) != generation {
            self.history
                .write()
                .unwrap()
                .retain(|item| item.segment_id != result.segment_id);
            return false;
        }
        self.apply_translation(result).is_some()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{TranscriptKind, TranslationStatus};

    #[test]
    fn source_switch_discards_late_translation_but_does_not_reset_microphone() {
        let temp = tempfile::tempdir().unwrap();
        let state = AppState::new(temp.path().join("settings.json")).unwrap();
        let generation = state.ai_stt.generation(StreamKind::Incoming);
        let mic_generation = state.ai_stt.generation(StreamKind::Microphone);
        state.add_final(&TranscriptEvent {
            segment_id: "old".into(),
            stream: StreamKind::Incoming,
            source_display_name: Some("OLD APP".into()),
            language: "en".into(),
            text: "go".into(),
            kind: TranscriptKind::Final,
            started_at_ms: 0,
            ended_at_ms: 1,
        });
        state.ai_stt.reset_stream(StreamKind::Incoming);
        let result = TranslationResult {
            segment_id: "old".into(),
            from: "en".into(),
            to: "th".into(),
            source_text: "go".into(),
            translated_text: Some("ไป".into()),
            status: TranslationStatus::Success,
            message: None,
        };
        assert!(!state.apply_translation_for_generation(&result, StreamKind::Incoming, generation));
        assert!(state.snapshot().history.is_empty());
        assert_eq!(
            state.ai_stt.generation(StreamKind::Microphone),
            mic_generation
        );
    }

    #[test]
    fn history_is_bounded_and_translation_updates_item() {
        let temp = tempfile::tempdir().expect("tempdir");
        let state = AppState::new(temp.path().join("settings.json")).expect("state");
        for index in 0..105 {
            state.add_final(&TranscriptEvent {
                segment_id: format!("s-{index}"),
                stream: StreamKind::Incoming,
                source_display_name: Some("MISTFALL".into()),
                language: "en".into(),
                text: format!("text {index}"),
                kind: TranscriptKind::Final,
                started_at_ms: index,
                ended_at_ms: index,
            });
        }
        assert_eq!(state.history.read().unwrap().len(), 100);
        let result = TranslationResult {
            segment_id: "s-104".into(),
            from: "en".into(),
            to: "th".into(),
            source_text: "text 104".into(),
            translated_text: Some("ข้อความ".into()),
            status: TranslationStatus::Success,
            message: None,
        };
        let item = state.apply_translation(&result).expect("updated");
        assert_eq!(item.translated_text.as_deref(), Some("ข้อความ"));
    }

    #[test]
    fn history_snapshot_orders_incoming_and_microphone_by_spoken_time() {
        let temp = tempfile::tempdir().expect("tempdir");
        let state = AppState::new(temp.path().join("settings.json")).expect("state");
        for (segment_id, stream, ended_at_ms) in [
            ("incoming-old", StreamKind::Incoming, 100_i64),
            ("microphone-newer", StreamKind::Microphone, 200_i64),
        ] {
            state.add_final(&TranscriptEvent {
                segment_id: segment_id.into(),
                stream,
                source_display_name: Some(
                    if stream == StreamKind::Incoming {
                        "Discord"
                    } else {
                        "F9 REPLY"
                    }
                    .into(),
                ),
                language: "en".into(),
                text: segment_id.into(),
                kind: TranscriptKind::Final,
                started_at_ms: ended_at_ms - 50,
                ended_at_ms,
            });
        }

        let history = state.snapshot().history;
        assert_eq!(history[0].segment_id, "microphone-newer");
        assert_eq!(history[1].segment_id, "incoming-old");
        assert_eq!(history[1].source_display_name.as_deref(), Some("Discord"));
    }
}
