use std::{
    collections::VecDeque,
    sync::{
        atomic::{AtomicU64, AtomicUsize, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};

use anyhow::{anyhow, Context, Result};
use async_trait::async_trait;
use reqwest::{multipart, StatusCode};
use serde::Deserialize;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::Semaphore;
use uuid::Uuid;

use crate::{
    models::{StreamKind, TranscriptEvent, TranscriptKind},
    pipeline,
    settings::groq_key,
    state::AppState,
};

const SAMPLE_RATE: usize = 16_000;
const MAX_CAPTURE_SAMPLES: usize = SAMPLE_RATE * 30;
const MIN_GAME_SAMPLES: usize = SAMPLE_RATE / 4;
const MIN_MICROPHONE_SAMPLES: usize = SAMPLE_RATE / 5;
const GAME_PROBE_SAMPLES: usize = SAMPLE_RATE * 6;
const AUTO_SCAN_WINDOW_SAMPLES: usize = SAMPLE_RATE * 8;
const AUTO_SCAN_STEP_SAMPLES: u64 = (SAMPLE_RATE * 6) as u64;
const RECENT_GAME_TEXT_LIMIT: usize = 8;
const NEAR_SILENCE_DBFS: f32 = -60.0;
const TRANSCRIPTIONS_ENDPOINT: &str = "https://api.groq.com/openai/v1/audio/transcriptions";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AudioSpan {
    pub start_sample_cursor: u64,
    pub end_sample_cursor: u64,
}

#[derive(Clone)]
pub struct GroqSttManager {
    inner: Arc<Mutex<CaptureState>>,
    provider: GroqSpeechToText,
    game_queue: Arc<StreamQueue>,
    voice_chat_queue: Arc<StreamQueue>,
    microphone_queue: Arc<StreamQueue>,
    busy_jobs: Arc<AtomicUsize>,
}

impl GroqSttManager {
    pub fn new(pre_roll_ms: u64, silence_ms: u64, max_utterance_ms: u64) -> Self {
        Self {
            inner: Arc::new(Mutex::new(CaptureState::new(
                pre_roll_ms,
                silence_ms,
                max_utterance_ms,
            ))),
            provider: GroqSpeechToText::default(),
            game_queue: Arc::new(StreamQueue::default()),
            voice_chat_queue: Arc::new(StreamQueue::default()),
            microphone_queue: Arc::new(StreamQueue::default()),
            busy_jobs: Arc::new(AtomicUsize::new(0)),
        }
    }

    pub fn configure_game_buffer(&self, pre_roll_ms: u64, silence_ms: u64, max_utterance_ms: u64) {
        let mut inner = self.inner.lock().expect("Groq STT capture lock poisoned");
        inner.pre_roll_samples = millis_to_samples(pre_roll_ms);
        inner.game_ring_capacity = game_ring_capacity(silence_ms, max_utterance_ms);
        let cap = inner.game_ring_capacity;
        truncate_ring(&mut inner.game, cap);
        truncate_ring(&mut inner.voice_chat, cap);
    }

    pub fn ingest_audio(&self, stream: StreamKind, samples: &[f32]) -> AudioSpan {
        let mut inner = self.inner.lock().expect("Groq STT capture lock poisoned");
        let ring_capacity = inner.game_ring_capacity;
        let buffer = inner.stream_mut(stream);
        let start_sample_cursor = buffer.next_sample_cursor;
        let end_sample_cursor = start_sample_cursor.saturating_add(samples.len() as u64);
        buffer.next_sample_cursor = end_sample_cursor;

        match stream {
            StreamKind::Game | StreamKind::VoiceChat => {
                buffer
                    .ring
                    .extend(samples.iter().copied().map(f32_to_pcm16));
                truncate_ring(buffer, ring_capacity);
            }
            StreamKind::Microphone if buffer.microphone_active => {
                let remaining = MAX_CAPTURE_SAMPLES.saturating_sub(buffer.microphone_samples.len());
                buffer
                    .microphone_samples
                    .extend(samples.iter().take(remaining).copied().map(f32_to_pcm16));
                if remaining < samples.len() {
                    buffer.microphone_truncated = true;
                }
            }
            StreamKind::Microphone => {}
        }

        AudioSpan {
            start_sample_cursor,
            end_sample_cursor,
        }
    }

    pub fn start_game_speech(&self, app: AppHandle, utterance_id: u64, sample_cursor: u64) {
        self.start_playback_speech(app, StreamKind::Game, utterance_id, sample_cursor);
    }

    pub fn start_voice_chat_speech(&self, app: AppHandle, utterance_id: u64, sample_cursor: u64) {
        self.start_playback_speech(app, StreamKind::VoiceChat, utterance_id, sample_cursor);
    }

    fn start_playback_speech(
        &self,
        app: AppHandle,
        stream: StreamKind,
        utterance_id: u64,
        sample_cursor: u64,
    ) {
        let state = app.state::<AppState>();
        let settings = state.settings.snapshot();
        if !settings.groq.configured {
            report_stt_error(&app, "ตั้งค่า Groq API key ก่อนเริ่มถอดเสียง");
            return;
        }
        if state.settings.budget_exhausted() {
            report_stt_error(&app, "ถึงงบ Groq รายเดือนแล้ว");
            return;
        }

        let mut inner = self.inner.lock().expect("Groq STT capture lock poisoned");
        let pre_roll_samples = inner.pre_roll_samples as u64;
        let buffer = inner.stream_mut(stream);
        buffer.last_vad_activity_cursor = Some(sample_cursor);
        if buffer
            .game_utterance
            .as_ref()
            .is_some_and(|active| active.utterance_id == utterance_id)
        {
            return;
        }
        let start_cursor = sample_cursor.saturating_sub(pre_roll_samples);
        if start_cursor < buffer.ring_start_cursor || sample_cursor > buffer.next_sample_cursor {
            drop(inner);
            report_audio_gap(&app, "ตำแหน่งเริ่มคำพูดอยู่นอก audio buffer");
            return;
        }
        let buffered_samples = buffer.next_sample_cursor.saturating_sub(start_cursor) as usize;
        buffer.game_utterance = Some(GameUtterance {
            utterance_id,
            start_cursor,
            segment_id: Uuid::new_v4().to_string(),
            started_at_ms: chrono::Utc::now()
                .timestamp_millis()
                .saturating_sub(samples_to_millis(buffered_samples) as i64),
        });
        let runtime = state.update_runtime(|runtime| {
            runtime.groq_status = "กำลังฟัง…".into();
            runtime.last_error = None;
        });
        let _ = app.emit("runtime-state", runtime);
    }

    pub fn end_game_speech(&self, app: AppHandle, utterance_id: u64, sample_cursor: u64) {
        self.end_playback_speech(app, StreamKind::Game, utterance_id, sample_cursor);
    }

    pub fn end_voice_chat_speech(&self, app: AppHandle, utterance_id: u64, sample_cursor: u64) {
        self.end_playback_speech(app, StreamKind::VoiceChat, utterance_id, sample_cursor);
    }

    fn end_playback_speech(
        &self,
        app: AppHandle,
        stream: StreamKind,
        utterance_id: u64,
        sample_cursor: u64,
    ) {
        let utterance = {
            let mut inner = self.inner.lock().expect("Groq STT capture lock poisoned");
            let buffer = inner.stream_mut(stream);
            buffer.last_vad_activity_cursor = Some(sample_cursor);
            let Some(active) = buffer.game_utterance.take() else {
                return;
            };
            if active.utterance_id != utterance_id {
                buffer.game_utterance = Some(active);
                return;
            }
            let end_cursor = sample_cursor.min(buffer.next_sample_cursor);
            let Some(samples) = slice_ring(buffer, active.start_cursor, end_cursor) else {
                drop(inner);
                report_audio_gap(&app, "ช่วงคำพูดหลุดออกจาก audio buffer ก่อน VAD ตอบกลับ");
                return;
            };
            if samples.len() < MIN_GAME_SAMPLES {
                let _ = app.emit(
                    "pipeline-status",
                    format!("ข้ามเสียง {:?} ที่สั้นกว่า 250 ms", stream),
                );
                return;
            }
            SttJob {
                stream,
                samples,
                segment_id: active.segment_id,
                started_at_ms: active.started_at_ms,
                generation: buffer.generation.load(Ordering::Relaxed),
                diagnostic_probe: false,
                automatic_cloud_scan: false,
            }
        };

        self.enqueue_job(app, utterance);
    }

    pub fn cancel_game_utterance(&self, app: &AppHandle) {
        self.cancel_playback_utterance(app, StreamKind::Game);
    }

    pub fn cancel_voice_chat_utterance(&self, app: &AppHandle) {
        self.cancel_playback_utterance(app, StreamKind::VoiceChat);
    }

    fn cancel_playback_utterance(&self, app: &AppHandle, stream: StreamKind) {
        let mut inner = self.inner.lock().expect("Groq STT capture lock poisoned");
        inner.stream_mut(stream).game_utterance = None;
        drop(inner);
        report_audio_gap(app, "audio จาก VAD ไม่ต่อเนื่อง จึงยกเลิกวลีนี้");
    }

    pub fn start_microphone(&self, app: &AppHandle) {
        let state = app.state::<AppState>();
        let mut inner = self.inner.lock().expect("Groq STT capture lock poisoned");
        let buffer = inner.stream_mut(StreamKind::Microphone);
        buffer.microphone_active = true;
        buffer.microphone_samples.clear();
        buffer.microphone_truncated = false;
        buffer.microphone_segment_id = Some(Uuid::new_v4().to_string());
        buffer.microphone_started_at_ms = chrono::Utc::now().timestamp_millis();
        let runtime = state.update_runtime(|runtime| {
            runtime.groq_status = "กำลังฟังไมค์…".into();
            runtime.last_error = None;
        });
        let _ = app.emit("runtime-state", runtime);
    }

    pub fn end_microphone(&self, app: AppHandle) {
        let utterance = {
            let mut inner = self.inner.lock().expect("Groq STT capture lock poisoned");
            let buffer = inner.stream_mut(StreamKind::Microphone);
            if !buffer.microphone_active {
                return;
            }
            buffer.microphone_active = false;
            let samples = std::mem::take(&mut buffer.microphone_samples);
            let truncated = std::mem::take(&mut buffer.microphone_truncated);
            let segment_id = buffer
                .microphone_segment_id
                .take()
                .unwrap_or_else(|| Uuid::new_v4().to_string());
            if samples.len() < MIN_MICROPHONE_SAMPLES {
                let _ = app.emit("pipeline-status", "ไม่ได้ส่งไมค์: กด F9 สั้นกว่า 200 ms");
                return;
            }
            if rms_dbfs(&samples) < NEAR_SILENCE_DBFS {
                let _ = app.emit("pipeline-status", "ไม่ได้ส่งไมค์: ไม่พบระดับเสียงที่ชัดเจน");
                return;
            }
            if truncated {
                let _ = app.emit("pipeline-status", "เสียง F9 ถูกจำกัดไว้ที่ 30 วินาที");
            }
            SttJob {
                stream: StreamKind::Microphone,
                samples,
                segment_id,
                started_at_ms: buffer.microphone_started_at_ms,
                generation: buffer.generation.load(Ordering::Relaxed),
                diagnostic_probe: false,
                automatic_cloud_scan: false,
            }
        };

        self.enqueue_job(app, utterance);
    }

    pub fn probe_recent_game_audio(&self, app: AppHandle) -> Result<()> {
        self.probe_recent_audio(app, StreamKind::Game)
    }

    pub fn probe_recent_audio(&self, app: AppHandle, stream: StreamKind) -> Result<()> {
        if stream == StreamKind::Microphone {
            return Err(anyhow!("การตรวจเสียงย้อนหลังรองรับเฉพาะ GAME และ VOICE CHAT"));
        }
        let state = app.state::<AppState>();
        let settings = state.settings.snapshot();
        if !settings.groq.configured {
            return Err(anyhow!("ตั้งค่า Groq API key ก่อนทดสอบเสียงเกม"));
        }
        if state.settings.budget_exhausted() {
            return Err(anyhow!("ถึงงบ Groq รายเดือนแล้ว"));
        }
        if !state.runtime.read().unwrap().listening {
            return Err(anyhow!("เริ่มฟังเกมก่อนทดสอบเสียงย้อนหลัง"));
        }

        let job = {
            let inner = self.inner.lock().expect("Groq STT capture lock poisoned");
            let buffer = inner.stream(stream);
            let end_cursor = buffer.next_sample_cursor;
            let available = end_cursor.saturating_sub(buffer.ring_start_cursor) as usize;
            if available < SAMPLE_RATE {
                return Err(anyhow!("ยังมีเสียงใน buffer ไม่ถึง 1 วินาที กรุณารอสักครู่"));
            }
            let sample_count = available.min(GAME_PROBE_SAMPLES);
            let start_cursor = end_cursor.saturating_sub(sample_count as u64);
            let samples = slice_ring(buffer, start_cursor, end_cursor)
                .context("อ่านเสียงย้อนหลังจาก game buffer ไม่สำเร็จ")?;
            let samples = normalize_pcm16_for_probe(samples);
            SttJob {
                stream,
                samples: automatic_scan_samples(samples),
                segment_id: Uuid::new_v4().to_string(),
                started_at_ms: chrono::Utc::now()
                    .timestamp_millis()
                    .saturating_sub(samples_to_millis(sample_count) as i64),
                generation: buffer.generation.load(Ordering::Relaxed),
                diagnostic_probe: true,
                automatic_cloud_scan: false,
            }
        };

        let runtime = state.update_runtime(|runtime| {
            runtime.capture_warning = None;
            runtime.status_message = "กำลังส่งเสียงเกม 6 วินาทีล่าสุดไปตรวจด้วย Groq".into();
        });
        let _ = app.emit("runtime-state", runtime);
        self.enqueue_job(app, job);
        Ok(())
    }

    pub fn maybe_enqueue_auto_scan(&self, app: AppHandle, stream: StreamKind) -> bool {
        if stream == StreamKind::Microphone {
            return false;
        }
        let state = app.state::<AppState>();
        let settings = state.settings.snapshot();
        let budget_exhausted = state.settings.budget_exhausted();
        let runtime = state.runtime.read().unwrap();
        let enabled = match stream {
            StreamKind::Game => {
                settings.game_capture_mode == crate::models::GameCaptureMode::SystemOutput
                    && settings.system_output_cloud_scan
            }
            StreamKind::VoiceChat => settings.voice_chat.enabled && settings.voice_chat.rescue_scan,
            StreamKind::Microphone => false,
        };
        if !enabled
            || !settings.groq.configured
            || budget_exhausted
            || runtime.budget_exhausted
            || !runtime.listening
        {
            return false;
        }
        drop(runtime);

        let job = {
            let mut inner = self.inner.lock().expect("Groq STT capture lock poisoned");
            let buffer = inner.stream_mut(stream);
            if buffer.last_vad_activity_cursor.is_some_and(|cursor| {
                buffer.next_sample_cursor.saturating_sub(cursor) < AUTO_SCAN_WINDOW_SAMPLES as u64
            }) {
                return false;
            }
            let Some((start_cursor, end_cursor)) = next_auto_scan_window(buffer) else {
                return false;
            };
            let Some(samples) = slice_ring(buffer, start_cursor, end_cursor) else {
                buffer.last_auto_scan_end_cursor = None;
                return false;
            };
            buffer.last_auto_scan_end_cursor = Some(end_cursor);
            let sample_count = samples.len();
            SttJob {
                stream,
                samples,
                segment_id: Uuid::new_v4().to_string(),
                started_at_ms: chrono::Utc::now()
                    .timestamp_millis()
                    .saturating_sub(samples_to_millis(sample_count) as i64),
                generation: buffer.generation.load(Ordering::Relaxed),
                diagnostic_probe: false,
                automatic_cloud_scan: true,
            }
        };

        self.enqueue_job(app, job)
    }

    fn enqueue_job(&self, app: AppHandle, utterance: SttJob) -> bool {
        let stream = utterance.stream;
        let automatic_cloud_scan = utterance.automatic_cloud_scan;

        let queue = self.queue(stream);
        if !queue.try_enqueue() {
            if automatic_cloud_scan {
                let _ = app.emit(
                    "pipeline-status",
                    "ข้ามรอบ Auto Cloud Scan เพราะ Groq ยังประมวลผลรอบก่อนอยู่",
                );
            } else {
                report_stt_error(&app, "ระบบตามเสียงไม่ทัน: คิวถอดเสียงเต็ม");
            }
            return false;
        }

        let manager = self.clone();
        tauri::async_runtime::spawn(async move {
            let permit = queue
                .semaphore
                .acquire()
                .await
                .expect("STT semaphore closed");
            if manager.generation(utterance.stream) != utterance.generation {
                drop(permit);
                queue.queued.fetch_sub(1, Ordering::AcqRel);
                return;
            }

            let busy = manager.busy_jobs.fetch_add(1, Ordering::AcqRel) + 1;
            set_stt_busy(&app, busy > 0, "กำลังส่งเสียงให้ Groq Whisper");
            let result = manager.process_job(&app, utterance).await;
            let remaining_busy = manager.busy_jobs.fetch_sub(1, Ordering::AcqRel) - 1;
            drop(permit);
            queue.queued.fetch_sub(1, Ordering::AcqRel);

            match result {
                Ok(()) => set_stt_busy(&app, remaining_busy > 0, "Groq พร้อมใช้งาน"),
                Err(error) => {
                    set_stt_busy(&app, remaining_busy > 0, "ถอดเสียงด้วย Groq ไม่สำเร็จ");
                    report_stt_error(&app, &error.to_string());
                }
            }
        });
        true
    }

    pub fn reset_stream(&self, stream: StreamKind) {
        let mut inner = self.inner.lock().expect("Groq STT capture lock poisoned");
        {
            let buffer = inner.stream_mut(stream);
            buffer.ring.clear();
            buffer.ring_start_cursor = 0;
            buffer.next_sample_cursor = 0;
            buffer.game_utterance = None;
            buffer.microphone_active = false;
            buffer.microphone_samples.clear();
            buffer.microphone_segment_id = None;
            buffer.microphone_truncated = false;
            buffer.last_auto_scan_end_cursor = None;
            buffer.last_vad_activity_cursor = None;
            buffer.generation.fetch_add(1, Ordering::AcqRel);
        }
        match stream {
            StreamKind::Game => inner.recent_game_texts.clear(),
            StreamKind::VoiceChat => inner.recent_voice_chat_texts.clear(),
            StreamKind::Microphone => {}
        }
    }

    async fn process_job(&self, app: &AppHandle, job: SttJob) -> Result<()> {
        let state = app.state::<AppState>();
        let settings = state.settings.snapshot();
        let model = selected_stt_model(&settings, job.stream).to_string();
        let language = match job.stream {
            StreamKind::Game | StreamKind::VoiceChat => "en",
            StreamKind::Microphone => "th",
        };
        if job.automatic_cloud_scan && !has_adaptive_speech_activity(&job.samples) {
            let _ = app.emit(
                "pipeline-status",
                format!(
                    "ข้าม {:?} rescue scan: ไม่พบช่วงเสียงพูดที่เด่นจาก noise floor",
                    job.stream
                ),
            );
            return Ok(());
        }
        let actual_millis = samples_to_millis(job.samples.len());

        state
            .settings
            .reserve_audio_request(actual_millis, &model)
            .context("ตรวจงบ Groq ไม่ผ่าน")?;
        let key = groq_key()?;
        let request = SttRequest {
            wav: encode_wav_pcm16(&job.samples, SAMPLE_RATE as u32),
            model,
            language: language.into(),
        };
        let transcription = self.provider.transcribe(&key, request).await?;

        if self.generation(job.stream) != job.generation {
            return Ok(());
        }
        if transcription.is_low_confidence() {
            if job.diagnostic_probe {
                report_probe_result(
                    app,
                    "Groq ไม่พบเสียงพูดใน 6 วินาทีล่าสุด แปลว่า endpoint นี้มีเสียงเกมแต่ไม่มีเสียงเพื่อนที่ชัดเจน",
                );
            }
            let _ = app.emit(
                "pipeline-status",
                "ข้ามเสียงที่ Whisper ประเมินว่าไม่ชัดหรือไม่ใช่คำพูด",
            );
            return Ok(());
        }
        let text = transcription.text.trim();
        if text.is_empty() {
            if job.diagnostic_probe {
                report_probe_result(
                    app,
                    "Groq ได้เสียงจาก endpoint แล้ว แต่ผลถอดเสียง 6 วินาทีล่าสุดว่างเปล่า",
                );
            }
            let _ = app.emit("pipeline-status", "ข้ามผลถอดเสียงว่างจาก Groq Whisper");
            return Ok(());
        }
        if job.diagnostic_probe {
            report_probe_result(app, &format!("Groq ได้ยินเสียงพูดจาก endpoint นี้: {text}"));
        }
        if job.stream != StreamKind::Microphone
            && self.should_skip_or_record_playback_text(job.stream, text, job.automatic_cloud_scan)
        {
            let _ = app.emit("pipeline-status", "ข้ามข้อความซ้ำจาก Auto Cloud Scan");
            return Ok(());
        }
        let ended_at_ms = chrono::Utc::now().timestamp_millis();
        let transcript = TranscriptEvent {
            segment_id: job.segment_id,
            stream: job.stream,
            source_display_name: source_display_name(&state, job.stream),
            language: language.into(),
            text: text.into(),
            kind: TranscriptKind::Final,
            started_at_ms: job.started_at_ms,
            ended_at_ms,
        };
        pipeline::handle_transcript_event(app.clone(), transcript).await;
        Ok(())
    }

    fn queue(&self, stream: StreamKind) -> Arc<StreamQueue> {
        match stream {
            StreamKind::Game => self.game_queue.clone(),
            StreamKind::VoiceChat => self.voice_chat_queue.clone(),
            StreamKind::Microphone => self.microphone_queue.clone(),
        }
    }

    fn generation(&self, stream: StreamKind) -> u64 {
        let inner = self.inner.lock().expect("Groq STT capture lock poisoned");
        inner.stream(stream).generation.load(Ordering::Relaxed)
    }

    fn should_skip_or_record_playback_text(
        &self,
        stream: StreamKind,
        text: &str,
        automatic_cloud_scan: bool,
    ) -> bool {
        let normalized = normalize_transcript_for_dedupe(text);
        if normalized.is_empty() {
            return automatic_cloud_scan;
        }
        let mut inner = self.inner.lock().expect("Groq STT capture lock poisoned");
        let recent = match stream {
            StreamKind::Game => &mut inner.recent_game_texts,
            StreamKind::VoiceChat => &mut inner.recent_voice_chat_texts,
            StreamKind::Microphone => return false,
        };
        let duplicate = automatic_cloud_scan
            && recent.iter().any(|previous| {
                previous == &normalized
                    || (normalized.len() >= 8
                        && previous.len() >= normalized.len()
                        && previous.contains(&normalized))
                    || (normalized.len() >= 8
                        && normalized.len().saturating_sub(previous.len()) <= 12
                        && normalized.contains(previous))
            });
        if duplicate {
            return true;
        }
        recent.push_back(normalized);
        while recent.len() > RECENT_GAME_TEXT_LIMIT {
            recent.pop_front();
        }
        false
    }
}

#[async_trait]
pub trait SpeechToText: Send + Sync {
    async fn transcribe(&self, key: &str, request: SttRequest) -> Result<TranscriptionResponse>;
}

#[derive(Clone)]
pub struct GroqSpeechToText {
    client: reqwest::Client,
    endpoint: String,
}

impl Default for GroqSpeechToText {
    fn default() -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()
            .expect("valid reqwest client");
        Self {
            client,
            endpoint: TRANSCRIPTIONS_ENDPOINT.into(),
        }
    }
}

impl GroqSpeechToText {
    #[cfg(test)]
    fn with_endpoint(endpoint: impl Into<String>) -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()
            .expect("valid reqwest client");
        Self {
            client,
            endpoint: endpoint.into(),
        }
    }
}

pub struct SttRequest {
    wav: Vec<u8>,
    model: String,
    language: String,
}

#[derive(Debug, Deserialize)]
pub struct TranscriptionResponse {
    text: String,
    #[serde(default)]
    segments: Vec<TranscriptionSegment>,
}

impl TranscriptionResponse {
    fn is_low_confidence(&self) -> bool {
        if self.segments.is_empty() {
            return false;
        }
        let accepted = self.segments.iter().filter(|segment| {
            segment.no_speech_prob.unwrap_or(1.0) < 0.5
                && segment.avg_logprob.unwrap_or(f32::NEG_INFINITY) > -1.0
                && segment.compression_ratio.unwrap_or(f32::INFINITY) < 2.4
        });
        let mut accepted_count = 0_usize;
        let mut accepted_duration = 0.0_f32;
        let mut has_duration = false;
        for segment in accepted {
            accepted_count += 1;
            if let (Some(start), Some(end)) = (segment.start, segment.end) {
                has_duration = true;
                accepted_duration += (end - start).max(0.0);
            }
        }
        accepted_count == 0 || (has_duration && accepted_duration < 0.25)
    }
}

#[derive(Debug, Deserialize)]
struct TranscriptionSegment {
    #[serde(default)]
    start: Option<f32>,
    #[serde(default)]
    end: Option<f32>,
    #[serde(default)]
    avg_logprob: Option<f32>,
    #[serde(default)]
    no_speech_prob: Option<f32>,
    #[serde(default)]
    compression_ratio: Option<f32>,
}

#[async_trait]
impl SpeechToText for GroqSpeechToText {
    async fn transcribe(&self, key: &str, request: SttRequest) -> Result<TranscriptionResponse> {
        let mut last_error = None;
        for attempt in 0..2 {
            let file = multipart::Part::bytes(request.wav.clone())
                .file_name("speech.wav")
                .mime_str("audio/wav")?;
            let form = multipart::Form::new()
                .part("file", file)
                .text("model", request.model.clone())
                .text("language", request.language.clone())
                .text("response_format", "verbose_json")
                .text("temperature", "0");

            match self
                .client
                .post(&self.endpoint)
                .bearer_auth(key)
                .multipart(form)
                .send()
                .await
            {
                Ok(response) if response.status().is_success() => {
                    return response
                        .json::<TranscriptionResponse>()
                        .await
                        .context("อ่านผล Groq Whisper ไม่สำเร็จ");
                }
                Ok(response) => {
                    let status = response.status();
                    let delay = retry_after(&response);
                    let body = response.text().await.unwrap_or_default();
                    let error = anyhow!(friendly_stt_error(status, &body));
                    if attempt == 0 && retryable(status) {
                        last_error = Some(error);
                        tokio::time::sleep(delay).await;
                        continue;
                    }
                    return Err(error);
                }
                Err(error) => {
                    let error = anyhow!("เชื่อมต่อ Groq Whisper ไม่สำเร็จ: {error}");
                    if attempt == 0 {
                        last_error = Some(error);
                        tokio::time::sleep(Duration::from_millis(250)).await;
                        continue;
                    }
                    return Err(error);
                }
            }
        }
        Err(last_error.unwrap_or_else(|| anyhow!("Groq Whisper ไม่ตอบสนอง")))
    }
}

struct SttJob {
    stream: StreamKind,
    samples: Vec<i16>,
    segment_id: String,
    started_at_ms: i64,
    generation: u64,
    diagnostic_probe: bool,
    automatic_cloud_scan: bool,
}

struct StreamQueue {
    semaphore: Semaphore,
    queued: AtomicUsize,
}

impl Default for StreamQueue {
    fn default() -> Self {
        Self {
            semaphore: Semaphore::new(1),
            queued: AtomicUsize::new(0),
        }
    }
}

impl StreamQueue {
    fn try_enqueue(&self) -> bool {
        let mut current = self.queued.load(Ordering::Acquire);
        loop {
            if current >= 2 {
                return false;
            }
            match self.queued.compare_exchange_weak(
                current,
                current + 1,
                Ordering::AcqRel,
                Ordering::Acquire,
            ) {
                Ok(_) => return true,
                Err(actual) => current = actual,
            }
        }
    }
}

struct CaptureState {
    pre_roll_samples: usize,
    game_ring_capacity: usize,
    game: StreamBuffer,
    voice_chat: StreamBuffer,
    microphone: StreamBuffer,
    recent_game_texts: VecDeque<String>,
    recent_voice_chat_texts: VecDeque<String>,
}

impl CaptureState {
    fn new(pre_roll_ms: u64, silence_ms: u64, max_utterance_ms: u64) -> Self {
        Self {
            pre_roll_samples: millis_to_samples(pre_roll_ms),
            game_ring_capacity: game_ring_capacity(silence_ms, max_utterance_ms),
            game: StreamBuffer::default(),
            voice_chat: StreamBuffer::default(),
            microphone: StreamBuffer::default(),
            recent_game_texts: VecDeque::new(),
            recent_voice_chat_texts: VecDeque::new(),
        }
    }

    fn stream(&self, stream: StreamKind) -> &StreamBuffer {
        match stream {
            StreamKind::Game => &self.game,
            StreamKind::VoiceChat => &self.voice_chat,
            StreamKind::Microphone => &self.microphone,
        }
    }

    fn stream_mut(&mut self, stream: StreamKind) -> &mut StreamBuffer {
        match stream {
            StreamKind::Game => &mut self.game,
            StreamKind::VoiceChat => &mut self.voice_chat,
            StreamKind::Microphone => &mut self.microphone,
        }
    }
}

#[derive(Default)]
struct StreamBuffer {
    ring: VecDeque<i16>,
    ring_start_cursor: u64,
    next_sample_cursor: u64,
    game_utterance: Option<GameUtterance>,
    microphone_active: bool,
    microphone_samples: Vec<i16>,
    microphone_segment_id: Option<String>,
    microphone_started_at_ms: i64,
    microphone_truncated: bool,
    last_auto_scan_end_cursor: Option<u64>,
    last_vad_activity_cursor: Option<u64>,
    generation: Arc<AtomicU64>,
}

struct GameUtterance {
    utterance_id: u64,
    start_cursor: u64,
    segment_id: String,
    started_at_ms: i64,
}

fn set_stt_busy(app: &AppHandle, busy: bool, status: &str) {
    let state = app.state::<AppState>();
    let runtime = state.update_runtime(|runtime| {
        runtime.groq_stt_busy = busy;
        runtime.groq_status = status.into();
    });
    let _ = app.emit("runtime-state", runtime);
    let _ = app.emit("settings-updated", state.settings.snapshot());
}

fn report_stt_error(app: &AppHandle, message: &str) {
    let state = app.state::<AppState>();
    let is_budget = message.contains("งบ Groq");
    let is_fatal_cloud =
        message.contains("API key") || message.contains("ไม่มีเครดิต") || message.contains("ปฏิเสธสิทธิ์");
    if is_fatal_cloud {
        let _ = state.settings.update(|settings| {
            settings.groq.configured = false;
            Ok(())
        });
    }
    let runtime = state.update_runtime(|runtime| {
        runtime.last_error = Some(message.into());
        runtime.groq_status = message.into();
        runtime.budget_exhausted |= is_budget;
    });
    let _ = app.emit("runtime-state", runtime);
    let _ = app.emit("settings-updated", state.settings.snapshot());
    let _ = app.emit("pipeline-error", message.to_string());
}

fn report_audio_gap(app: &AppHandle, message: &str) {
    let state = app.state::<AppState>();
    let runtime = state.update_runtime(|runtime| {
        runtime.last_error = Some(message.into());
        runtime.groq_status = "ข้ามวลีที่ audio ไม่ต่อเนื่อง".into();
    });
    let _ = app.emit("runtime-state", runtime);
    let _ = app.emit("pipeline-status", message.to_string());
    let _ = app.emit("capture-log", message.to_string());
}

fn report_probe_result(app: &AppHandle, message: &str) {
    let state = app.state::<AppState>();
    let runtime = state.update_runtime(|runtime| {
        runtime.capture_warning = Some(message.into());
        runtime.status_message = message.into();
    });
    let _ = app.emit("runtime-state", runtime);
    let _ = app.emit("pipeline-status", message.to_string());
}

fn friendly_stt_error(status: StatusCode, body: &str) -> String {
    match status {
        StatusCode::UNAUTHORIZED => "Groq API key ไม่ถูกต้อง กรุณาตรวจ key ที่ console.groq.com".into(),
        StatusCode::FORBIDDEN => "Groq ปฏิเสธสิทธิ์ กรุณาตรวจสิทธิ์ของ key และ Whisper model".into(),
        StatusCode::PAYMENT_REQUIRED => "บัญชี Groq ไม่มีเครดิตเพียงพอ".into(),
        StatusCode::TOO_MANY_REQUESTS => "Groq จำกัดคำขอชั่วคราว (429)".into(),
        _ => format!("Groq Whisper ตอบ {status}: {}", truncate(body, 180)),
    }
}

fn retry_after(response: &reqwest::Response) -> Duration {
    response
        .headers()
        .get(reqwest::header::RETRY_AFTER)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<u64>().ok())
        .map(|seconds| Duration::from_secs(seconds.min(5)))
        .unwrap_or_else(|| Duration::from_millis(250))
}

fn retryable(status: StatusCode) -> bool {
    status == StatusCode::TOO_MANY_REQUESTS || status.is_server_error()
}

fn truncate(value: &str, max_chars: usize) -> String {
    value.chars().take(max_chars).collect()
}

fn game_ring_capacity(silence_ms: u64, max_utterance_ms: u64) -> usize {
    millis_to_samples(
        max_utterance_ms
            .saturating_add(silence_ms)
            .saturating_add(2_000),
    )
    .clamp(SAMPLE_RATE * 3, SAMPLE_RATE * 35)
    .max(AUTO_SCAN_WINDOW_SAMPLES)
}

fn selected_stt_model(settings: &crate::models::AppSettings, stream: StreamKind) -> &str {
    match stream {
        StreamKind::Game | StreamKind::VoiceChat => &settings.groq.game_stt_model,
        StreamKind::Microphone => &settings.groq.microphone_stt_model,
    }
}

fn source_display_name(state: &AppState, stream: StreamKind) -> Option<String> {
    let settings = state.settings.snapshot();
    let runtime = state.runtime.read().expect("runtime lock poisoned");
    match stream {
        StreamKind::Game
            if settings.game_capture_mode == crate::models::GameCaptureMode::SystemOutput =>
        {
            Some("MIXED".into())
        }
        StreamKind::Game => runtime
            .attached_process
            .as_ref()
            .map(|process| process.display_name.clone())
            .or_else(|| Some("GAME".into())),
        StreamKind::VoiceChat => runtime
            .voice_chat_attached_process
            .as_ref()
            .map(|process| process.display_name.clone())
            .or_else(|| Some("VOICE CHAT".into())),
        StreamKind::Microphone => None,
    }
}

fn has_adaptive_speech_activity(samples: &[i16]) -> bool {
    const FRAME_SAMPLES: usize = SAMPLE_RATE / 50;
    const REQUIRED_ACTIVE_FRAMES: usize = 15;
    if samples.len() < SAMPLE_RATE / 4 {
        return false;
    }
    let peak = samples
        .iter()
        .map(|sample| i32::from(*sample).unsigned_abs())
        .max()
        .unwrap_or_default() as f32
        / i16::MAX as f32;
    if linear_to_dbfs(peak) < -55.0 {
        return false;
    }
    let mut frame_levels = samples
        .chunks_exact(FRAME_SAMPLES)
        .map(|frame| {
            let sum = frame.iter().fold(0.0_f64, |total, sample| {
                let normalized = f64::from(*sample) / f64::from(i16::MAX);
                total + normalized * normalized
            });
            linear_to_dbfs((sum / frame.len() as f64).sqrt() as f32)
        })
        .collect::<Vec<_>>();
    if frame_levels.is_empty() {
        return false;
    }
    let mut sorted = frame_levels.clone();
    sorted.sort_by(|left, right| left.total_cmp(right));
    let noise_floor = sorted[sorted.len() / 5];
    if sorted.last().copied().unwrap_or(noise_floor) - noise_floor < 3.0 {
        return false;
    }
    let activity_floor = (noise_floor + 6.0).clamp(-60.0, -35.0);
    frame_levels
        .drain(..)
        .filter(|level| *level >= activity_floor)
        .count()
        >= REQUIRED_ACTIVE_FRAMES
}

fn linear_to_dbfs(value: f32) -> f32 {
    if value <= 0.000_015_848_932 {
        -96.0
    } else {
        (20.0 * value.log10()).clamp(-96.0, 0.0)
    }
}

fn truncate_ring(buffer: &mut StreamBuffer, cap: usize) {
    while buffer.ring.len() > cap {
        buffer.ring.pop_front();
        buffer.ring_start_cursor = buffer.ring_start_cursor.saturating_add(1);
    }
}

fn slice_ring(buffer: &StreamBuffer, start_cursor: u64, end_cursor: u64) -> Option<Vec<i16>> {
    if start_cursor < buffer.ring_start_cursor
        || end_cursor < start_cursor
        || end_cursor > buffer.next_sample_cursor
    {
        return None;
    }
    let start = usize::try_from(start_cursor - buffer.ring_start_cursor).ok()?;
    let end = usize::try_from(end_cursor - buffer.ring_start_cursor).ok()?;
    if end > buffer.ring.len() {
        return None;
    }
    Some(
        buffer
            .ring
            .iter()
            .skip(start)
            .take(end - start)
            .copied()
            .collect(),
    )
}

fn next_auto_scan_window(buffer: &StreamBuffer) -> Option<(u64, u64)> {
    let end_cursor = buffer.next_sample_cursor;
    let available = end_cursor.saturating_sub(buffer.ring_start_cursor) as usize;
    if available < AUTO_SCAN_WINDOW_SAMPLES {
        return None;
    }
    if buffer
        .last_auto_scan_end_cursor
        .is_some_and(|last| end_cursor < last.saturating_add(AUTO_SCAN_STEP_SAMPLES))
    {
        return None;
    }
    let start_cursor = end_cursor.saturating_sub(AUTO_SCAN_WINDOW_SAMPLES as u64);
    (start_cursor >= buffer.ring_start_cursor).then_some((start_cursor, end_cursor))
}

fn normalize_transcript_for_dedupe(text: &str) -> String {
    text.to_lowercase()
        .chars()
        .map(|character| {
            if character.is_whitespace() || character.is_ascii_punctuation() {
                ' '
            } else {
                character
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn rms_dbfs(samples: &[i16]) -> f32 {
    if samples.is_empty() {
        return f32::NEG_INFINITY;
    }
    let mean_square = samples
        .iter()
        .map(|sample| {
            let normalized = *sample as f64 / i16::MAX as f64;
            normalized * normalized
        })
        .sum::<f64>()
        / samples.len() as f64;
    let rms = mean_square.sqrt();
    if rms <= f64::EPSILON {
        f32::NEG_INFINITY
    } else {
        (20.0 * rms.log10()) as f32
    }
}

fn normalize_pcm16_for_probe(mut samples: Vec<i16>) -> Vec<i16> {
    let peak = samples
        .iter()
        .map(|sample| sample.unsigned_abs() as f32)
        .fold(0.0_f32, f32::max);
    if peak <= 1.0 {
        return samples;
    }
    let gain = (i16::MAX as f32 * 0.85 / peak).clamp(1.0, 24.0);
    for sample in &mut samples {
        *sample = (*sample as f32 * gain)
            .clamp(i16::MIN as f32, i16::MAX as f32)
            .round() as i16;
    }
    samples
}

fn automatic_scan_samples(samples: Vec<i16>) -> Vec<i16> {
    samples
}

fn millis_to_samples(millis: u64) -> usize {
    (millis as usize).saturating_mul(SAMPLE_RATE) / 1_000
}

fn samples_to_millis(samples: usize) -> u64 {
    (samples as u64).saturating_mul(1_000) / SAMPLE_RATE as u64
}

pub fn f32_to_pcm16(sample: f32) -> i16 {
    if sample <= -1.0 {
        i16::MIN
    } else {
        (sample.clamp(-1.0, 1.0) * i16::MAX as f32).round() as i16
    }
}

pub fn encode_wav_pcm16(samples: &[i16], sample_rate: u32) -> Vec<u8> {
    let data_len = samples.len().saturating_mul(2).min(u32::MAX as usize) as u32;
    let mut wav = Vec::with_capacity(44 + data_len as usize);
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&(36_u32.saturating_add(data_len)).to_le_bytes());
    wav.extend_from_slice(b"WAVEfmt ");
    wav.extend_from_slice(&16_u32.to_le_bytes());
    wav.extend_from_slice(&1_u16.to_le_bytes());
    wav.extend_from_slice(&1_u16.to_le_bytes());
    wav.extend_from_slice(&sample_rate.to_le_bytes());
    wav.extend_from_slice(&sample_rate.saturating_mul(2).to_le_bytes());
    wav.extend_from_slice(&2_u16.to_le_bytes());
    wav.extend_from_slice(&16_u16.to_le_bytes());
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&data_len.to_le_bytes());
    for sample in samples.iter().take(data_len as usize / 2) {
        wav.extend_from_slice(&sample.to_le_bytes());
    }
    wav
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::AppSettings;
    use std::{
        io::{Read, Write},
        net::TcpListener,
        sync::mpsc,
        thread,
    };

    #[test]
    fn converts_float_samples_to_pcm16() {
        assert_eq!(f32_to_pcm16(-1.0), i16::MIN);
        assert_eq!(f32_to_pcm16(0.0), 0);
        assert_eq!(f32_to_pcm16(1.0), i16::MAX);
    }

    #[test]
    fn wav_header_is_pcm16_mono_16khz() {
        let wav = encode_wav_pcm16(&[1, -2, 3], 16_000);
        assert_eq!(&wav[0..4], b"RIFF");
        assert_eq!(&wav[8..12], b"WAVE");
        assert_eq!(u16::from_le_bytes([wav[22], wav[23]]), 1);
        assert_eq!(
            u32::from_le_bytes([wav[24], wav[25], wav[26], wav[27]]),
            16_000
        );
        assert_eq!(u32::from_le_bytes([wav[40], wav[41], wav[42], wav[43]]), 6);
        assert_eq!(wav.len(), 50);
    }

    #[test]
    fn rolling_ring_slices_delayed_boundaries_by_cursor() {
        let mut buffer = StreamBuffer::default();
        buffer.ring.extend(0_i16..1_000_i16);
        buffer.next_sample_cursor = 1_000;
        truncate_ring(&mut buffer, 700);

        assert_eq!(buffer.ring_start_cursor, 300);
        assert_eq!(
            slice_ring(&buffer, 450, 455),
            Some(vec![450, 451, 452, 453, 454])
        );
        assert!(slice_ring(&buffer, 200, 455).is_none());
    }

    #[test]
    fn auto_scan_waits_for_eight_seconds_then_advances_six_seconds() {
        let mut buffer = StreamBuffer::default();
        buffer.ring.extend(vec![1_i16; AUTO_SCAN_WINDOW_SAMPLES]);
        buffer.next_sample_cursor = AUTO_SCAN_WINDOW_SAMPLES as u64;

        assert_eq!(
            next_auto_scan_window(&buffer),
            Some((0, AUTO_SCAN_WINDOW_SAMPLES as u64))
        );
        buffer.last_auto_scan_end_cursor = Some(buffer.next_sample_cursor);
        buffer
            .ring
            .extend(vec![1_i16; AUTO_SCAN_STEP_SAMPLES as usize - 1]);
        buffer.next_sample_cursor += AUTO_SCAN_STEP_SAMPLES - 1;
        assert_eq!(next_auto_scan_window(&buffer), None);

        buffer.ring.push_back(1);
        buffer.next_sample_cursor += 1;
        truncate_ring(
            &mut buffer,
            AUTO_SCAN_WINDOW_SAMPLES + AUTO_SCAN_STEP_SAMPLES as usize,
        );
        assert_eq!(
            next_auto_scan_window(&buffer),
            Some((AUTO_SCAN_STEP_SAMPLES, buffer.next_sample_cursor))
        );
    }

    #[test]
    fn automatic_scan_dedupes_overlapping_transcripts() {
        let manager = GroqSttManager::new(200, 500, 12_000);

        assert!(!manager.should_skip_or_record_playback_text(
            StreamKind::Game,
            "Enemy on the left!",
            false
        ));
        assert!(manager.should_skip_or_record_playback_text(
            StreamKind::Game,
            "enemy, on the left",
            true
        ));
        assert!(!manager.should_skip_or_record_playback_text(
            StreamKind::Game,
            "Push the north gate",
            true
        ));
        assert!(manager.should_skip_or_record_playback_text(StreamKind::Game, "North gate", true));
        assert!(!manager.should_skip_or_record_playback_text(
            StreamKind::Game,
            "Push the north gate and wait for the healer to arrive",
            true
        ));
        assert!(!manager.should_skip_or_record_playback_text(
            StreamKind::VoiceChat,
            "Enemy on the left!",
            true
        ));
        assert_eq!(
            normalize_transcript_for_dedupe("  HELLO...  เพื่อน! "),
            "hello เพื่อน"
        );
    }

    #[test]
    fn audio_cursor_is_monotonic_and_f9_keeps_the_full_clip() {
        let manager = GroqSttManager::new(200, 500, 12_000);
        {
            let mut inner = manager.inner.lock().unwrap();
            inner.microphone.microphone_active = true;
        }
        let first = manager.ingest_audio(StreamKind::Microphone, &[0.25; 1_600]);
        let second = manager.ingest_audio(StreamKind::Microphone, &[0.5; 1_600]);

        assert_eq!(first.start_sample_cursor, 0);
        assert_eq!(first.end_sample_cursor, 1_600);
        assert_eq!(second.start_sample_cursor, 1_600);
        assert_eq!(second.end_sample_cursor, 3_200);
        let inner = manager.inner.lock().unwrap();
        assert_eq!(inner.microphone.microphone_samples.len(), 3_200);
        assert_eq!(inner.microphone.microphone_samples[0], f32_to_pcm16(0.25));
        assert_eq!(
            inner.microphone.microphone_samples[1_600],
            f32_to_pcm16(0.5)
        );
    }

    #[test]
    fn defaults_use_accurate_game_and_fast_microphone_models() {
        let settings = AppSettings::default();
        assert_eq!(
            selected_stt_model(&settings, StreamKind::Game),
            "whisper-large-v3"
        );
        assert_eq!(
            selected_stt_model(&settings, StreamKind::Microphone),
            "whisper-large-v3-turbo"
        );
    }

    #[test]
    fn microphone_silence_floor_rejects_only_near_silence() {
        assert!(rms_dbfs(&[0; 3_200]) < NEAR_SILENCE_DBFS);
        assert!(rms_dbfs(&[1_000; 3_200]) > NEAR_SILENCE_DBFS);
    }

    #[test]
    fn diagnostic_probe_normalizes_a_copy_without_clipping() {
        let input = vec![100_i16, -200, 50];
        let normalized = normalize_pcm16_for_probe(input.clone());

        assert_eq!(input, vec![100_i16, -200, 50]);
        assert!(
            normalized
                .iter()
                .map(|sample| sample.unsigned_abs())
                .max()
                .unwrap()
                > 4_000
        );
        assert!(normalized.iter().all(|sample| *sample <= i16::MAX));
    }

    #[test]
    fn automatic_scan_keeps_original_pcm_amplitude() {
        let input = vec![100_i16, -200, 50];
        assert_eq!(automatic_scan_samples(input.clone()), input);
    }

    #[test]
    fn queue_accepts_running_and_one_waiting_only() {
        let queue = StreamQueue::default();
        assert!(queue.try_enqueue());
        assert!(queue.try_enqueue());
        assert!(!queue.try_enqueue());
    }

    #[tokio::test]
    async fn sends_wav_language_and_model_without_prompt_as_multipart() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let (sender, receiver) = mpsc::channel();
        thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(2)))
                .unwrap();
            let request = read_http_request(&mut stream);
            sender
                .send(String::from_utf8_lossy(&request).into_owned())
                .unwrap();
            let body = r#"{"text":"Enemy on the left"}"#;
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            )
            .unwrap();
        });

        let provider = GroqSpeechToText::with_endpoint(format!("http://{address}/transcribe"));
        let transcription = provider
            .transcribe(
                "secret-test-key",
                SttRequest {
                    wav: encode_wav_pcm16(&[1, 2, 3], 16_000),
                    model: "whisper-large-v3-turbo".into(),
                    language: "en".into(),
                },
            )
            .await
            .unwrap();
        assert_eq!(transcription.text, "Enemy on the left");
        let request = receiver.recv_timeout(Duration::from_secs(2)).unwrap();
        assert!(request.contains("filename=\"speech.wav\""));
        assert!(request.contains("whisper-large-v3-turbo"));
        assert!(!request.contains("name=\"prompt\""));
        assert!(!request.contains("Game voice chat"));
        assert!(request.contains("verbose_json"));
        assert!(request.contains("\r\n\r\nen\r\n"));
    }

    #[test]
    fn rejects_only_consistently_low_confidence_segments() {
        let noisy = TranscriptionResponse {
            text: "Thank you for watching".into(),
            segments: vec![TranscriptionSegment {
                start: Some(0.0),
                end: Some(1.0),
                avg_logprob: Some(-1.5),
                no_speech_prob: Some(0.91),
                compression_ratio: Some(1.0),
            }],
        };
        assert!(noisy.is_low_confidence());

        let spoken = TranscriptionResponse {
            text: "Enemy on the left".into(),
            segments: vec![TranscriptionSegment {
                start: Some(0.0),
                end: Some(1.0),
                avg_logprob: Some(-0.35),
                no_speech_prob: Some(0.08),
                compression_ratio: Some(1.1),
            }],
        };
        assert!(!spoken.is_low_confidence());
    }

    #[test]
    fn adaptive_activity_gate_rejects_silence_and_constant_noise() {
        assert!(!has_adaptive_speech_activity(&vec![0; SAMPLE_RATE * 2]));
        assert!(!has_adaptive_speech_activity(&vec![2_000; SAMPLE_RATE * 2]));

        let mut speech_like = vec![100_i16; SAMPLE_RATE * 2];
        for sample in &mut speech_like[SAMPLE_RATE / 2..SAMPLE_RATE] {
            *sample = 6_000;
        }
        assert!(has_adaptive_speech_activity(&speech_like));
    }

    fn read_http_request(stream: &mut std::net::TcpStream) -> Vec<u8> {
        let mut request = Vec::new();
        let mut buffer = [0_u8; 4096];
        loop {
            let read = stream.read(&mut buffer).unwrap_or(0);
            if read == 0 {
                break;
            }
            request.extend_from_slice(&buffer[..read]);
            if let Some(header_end) = request.windows(4).position(|part| part == b"\r\n\r\n") {
                let headers = String::from_utf8_lossy(&request[..header_end]);
                let content_length = headers
                    .lines()
                    .find_map(|line| {
                        line.to_ascii_lowercase()
                            .strip_prefix("content-length:")
                            .and_then(|value| value.trim().parse::<usize>().ok())
                    })
                    .unwrap_or(0);
                if request.len() >= header_end + 4 + content_length {
                    break;
                }
            }
        }
        request
    }
}
