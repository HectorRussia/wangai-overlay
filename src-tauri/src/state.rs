use std::{collections::VecDeque, path::PathBuf, sync::RwLock};

use anyhow::Result;

use crate::{
    audio::AudioManager,
    cloud_stt::CloudSttManager,
    models::{
        AppSnapshot, RuntimeState, StreamKind, SubtitleItem, TranscriptEvent, TranslationResult,
    },
    settings::SettingsManager,
    translator::GrokTranslator,
    worker::WorkerManager,
};

pub struct AppState {
    pub settings: SettingsManager,
    pub runtime: RwLock<RuntimeState>,
    pub history: RwLock<VecDeque<SubtitleItem>>,
    pub partial: RwLock<Option<TranscriptEvent>>,
    pub audio: AudioManager,
    pub worker: WorkerManager,
    pub cloud_stt: CloudSttManager,
    pub translator: GrokTranslator,
}

impl AppState {
    pub fn new(settings_path: PathBuf) -> Result<Self> {
        let settings = SettingsManager::load(settings_path)?;
        let snapshot = settings.snapshot();
        let pre_roll_ms = snapshot.vad.pre_roll_ms;
        let mut runtime = RuntimeState::default();
        if snapshot.xai.configured {
            runtime.xai_status = "พร้อมเชื่อมต่อ xAI เมื่อพบเสียงพูด".into();
        }
        runtime.budget_exhausted =
            snapshot.xai.estimated_spend_microusd >= snapshot.xai.monthly_budget_microusd;
        Ok(Self {
            settings,
            runtime: RwLock::new(runtime),
            history: RwLock::new(VecDeque::with_capacity(100)),
            partial: RwLock::new(None),
            audio: AudioManager::default(),
            worker: WorkerManager::default(),
            cloud_stt: CloudSttManager::new(pre_roll_ms),
            translator: GrokTranslator::default(),
        })
    }

    pub fn snapshot(&self) -> AppSnapshot {
        AppSnapshot {
            settings: self.settings.snapshot(),
            runtime: self.runtime.read().expect("runtime lock poisoned").clone(),
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
        runtime.clone()
    }

    pub fn set_partial(&self, partial: Option<TranscriptEvent>) {
        *self.partial.write().expect("partial lock poisoned") = partial;
    }

    pub fn add_final(&self, event: &TranscriptEvent) -> SubtitleItem {
        let item = SubtitleItem {
            segment_id: event.segment_id.clone(),
            stream: event.stream,
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
        history.push_back(item.clone());
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
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{TranscriptKind, TranslationStatus};

    #[test]
    fn history_is_bounded_and_translation_updates_item() {
        let temp = tempfile::tempdir().expect("tempdir");
        let state = AppState::new(temp.path().join("settings.json")).expect("state");
        for index in 0..105 {
            state.add_final(&TranscriptEvent {
                segment_id: format!("s-{index}"),
                stream: StreamKind::Game,
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
}
