mod buffer;
mod constants;
mod dedupe;
mod jobs;
mod queue;
mod signal;
mod transcription;
mod wav;
use buffer::*;
use constants::*;
use dedupe::*;
use queue::StreamQueue;
use signal::*;
use transcription::TranscriptionResponse;
use wav::*;

use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc, Mutex,
};

use anyhow::{anyhow, Context, Result};
use tauri::{AppHandle, Emitter, Manager};
use uuid::Uuid;

use crate::{
    models::{StreamKind, TranscriptEvent, TranscriptKind},
    state::AppState,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AudioSpan {
    pub start_sample_cursor: u64,
    pub end_sample_cursor: u64,
}

#[derive(Clone)]
pub struct AiSttManager {
    inner: Arc<Mutex<CaptureState>>,
    incoming_queue: Arc<StreamQueue>,
    microphone_queue: Arc<StreamQueue>,
    busy_jobs: Arc<AtomicUsize>,
}

impl AiSttManager {
    pub fn new(pre_roll_ms: u64, silence_ms: u64, max_utterance_ms: u64) -> Self {
        Self {
            inner: Arc::new(Mutex::new(CaptureState::new(
                pre_roll_ms,
                silence_ms,
                max_utterance_ms,
            ))),
            incoming_queue: Arc::new(StreamQueue::default()),
            microphone_queue: Arc::new(StreamQueue::default()),
            busy_jobs: Arc::new(AtomicUsize::new(0)),
        }
    }

    pub fn configure_incoming_buffer(
        &self,
        pre_roll_ms: u64,
        silence_ms: u64,
        max_utterance_ms: u64,
    ) {
        let mut inner = self
            .inner
            .lock()
            .expect("บริการ AI STT capture lock poisoned");
        inner.pre_roll_samples = millis_to_samples(pre_roll_ms);
        inner.incoming_ring_capacity = incoming_ring_capacity(silence_ms, max_utterance_ms);
        let cap = inner.incoming_ring_capacity;
        truncate_ring(&mut inner.incoming, cap);
    }

    pub fn ingest_audio(&self, stream: StreamKind, samples: &[f32]) -> AudioSpan {
        let mut inner = self
            .inner
            .lock()
            .expect("บริการ AI STT capture lock poisoned");
        let ring_capacity = inner.incoming_ring_capacity;
        let buffer = inner.stream_mut(stream);
        let start_sample_cursor = buffer.next_sample_cursor;
        let end_sample_cursor = start_sample_cursor.saturating_add(samples.len() as u64);
        buffer.next_sample_cursor = end_sample_cursor;

        match stream {
            StreamKind::Incoming => {
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

    pub fn start_incoming_speech(&self, app: AppHandle, utterance_id: u64, sample_cursor: u64) {
        self.start_playback_speech(app, StreamKind::Incoming, utterance_id, sample_cursor);
    }

    fn start_playback_speech(
        &self,
        app: AppHandle,
        stream: StreamKind,
        utterance_id: u64,
        sample_cursor: u64,
    ) {
        let state = app.state::<AppState>();
        if !state.gateway.can_submit() {
            return;
        }

        let mut inner = self
            .inner
            .lock()
            .expect("บริการ AI STT capture lock poisoned");
        let pre_roll_samples = inner.pre_roll_samples as u64;
        let buffer = inner.stream_mut(stream);
        buffer.last_vad_activity_cursor = Some(sample_cursor);
        if buffer
            .incoming_utterance
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
        buffer.incoming_utterance = Some(IncomingUtterance {
            utterance_id,
            start_cursor,
            segment_id: Uuid::new_v4().to_string(),
            started_at_ms: chrono::Utc::now()
                .timestamp_millis()
                .saturating_sub(samples_to_millis(buffered_samples) as i64),
        });
        let runtime = state.update_runtime(|runtime| {
            runtime.ai_status = "กำลังฟัง…".into();
            runtime.last_error = None;
        });
        let _ = app.emit("runtime-state", runtime);
    }

    pub fn end_incoming_speech(&self, app: AppHandle, utterance_id: u64, sample_cursor: u64) {
        self.end_playback_speech(app, StreamKind::Incoming, utterance_id, sample_cursor);
    }

    fn end_playback_speech(
        &self,
        app: AppHandle,
        stream: StreamKind,
        utterance_id: u64,
        sample_cursor: u64,
    ) {
        let utterance = {
            let mut inner = self
                .inner
                .lock()
                .expect("บริการ AI STT capture lock poisoned");
            let buffer = inner.stream_mut(stream);
            buffer.last_vad_activity_cursor = Some(sample_cursor);
            let Some(active) = buffer.incoming_utterance.take() else {
                return;
            };
            if active.utterance_id != utterance_id {
                buffer.incoming_utterance = Some(active);
                return;
            }
            let end_cursor = sample_cursor.min(buffer.next_sample_cursor);
            let Some(samples) = slice_ring(buffer, active.start_cursor, end_cursor) else {
                drop(inner);
                report_audio_gap(&app, "ช่วงคำพูดหลุดออกจาก audio buffer ก่อน VAD ตอบกลับ");
                return;
            };
            if samples.len() < MIN_INCOMING_SAMPLES {
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
                source_display_name: source_display_name(&app.state::<AppState>(), stream),
            }
        };

        self.enqueue_job(app, utterance);
    }

    pub fn cancel_incoming_utterance(&self, app: &AppHandle) {
        self.cancel_playback_utterance(app, StreamKind::Incoming);
    }

    fn cancel_playback_utterance(&self, app: &AppHandle, stream: StreamKind) {
        let mut inner = self
            .inner
            .lock()
            .expect("บริการ AI STT capture lock poisoned");
        inner.stream_mut(stream).incoming_utterance = None;
        drop(inner);
        report_audio_gap(app, "audio จาก VAD ไม่ต่อเนื่อง จึงยกเลิกวลีนี้");
    }

    pub fn start_microphone(&self, app: &AppHandle) {
        let state = app.state::<AppState>();
        let mut inner = self
            .inner
            .lock()
            .expect("บริการ AI STT capture lock poisoned");
        let buffer = inner.stream_mut(StreamKind::Microphone);
        buffer.microphone_active = true;
        buffer.microphone_samples.clear();
        buffer.microphone_truncated = false;
        buffer.microphone_segment_id = Some(Uuid::new_v4().to_string());
        buffer.microphone_started_at_ms = chrono::Utc::now().timestamp_millis();
        let runtime = state.update_runtime(|runtime| {
            runtime.ai_status = "กำลังฟังไมค์…".into();
            runtime.last_error = None;
        });
        let _ = app.emit("runtime-state", runtime);
    }

    pub fn end_microphone(&self, app: AppHandle) {
        let utterance = {
            let mut inner = self
                .inner
                .lock()
                .expect("บริการ AI STT capture lock poisoned");
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
                source_display_name: Some("F9 REPLY".into()),
            }
        };

        self.enqueue_job(app, utterance);
    }

    pub fn probe_recent_audio(&self, app: AppHandle) -> Result<()> {
        let stream = StreamKind::Incoming;
        let state = app.state::<AppState>();
        if !state.gateway.can_submit() {
            return Err(anyhow!(state.gateway.status().message));
        }
        if !state.runtime.read().unwrap().listening {
            return Err(anyhow!("เริ่มฟังแหล่งเสียงก่อนทดสอบเสียงย้อนหลัง"));
        }

        let job = {
            let inner = self
                .inner
                .lock()
                .expect("บริการ AI STT capture lock poisoned");
            let buffer = inner.stream(stream);
            let end_cursor = buffer.next_sample_cursor;
            let available = end_cursor.saturating_sub(buffer.ring_start_cursor) as usize;
            if available < SAMPLE_RATE {
                return Err(anyhow!("ยังมีเสียงใน buffer ไม่ถึง 1 วินาที กรุณารอสักครู่"));
            }
            let sample_count = available.min(INCOMING_PROBE_SAMPLES);
            let start_cursor = end_cursor.saturating_sub(sample_count as u64);
            let samples = slice_ring(buffer, start_cursor, end_cursor)
                .context("อ่านเสียงย้อนหลังจาก incoming buffer ไม่สำเร็จ")?;
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
                source_display_name: source_display_name(&state, stream),
            }
        };

        let runtime = state.update_runtime(|runtime| {
            runtime.capture_warning = None;
            runtime.status_message = "กำลังส่งเสียง 6 วินาทีล่าสุดไปตรวจด้วย บริการ AI".into();
        });
        let _ = app.emit("runtime-state", runtime);
        self.enqueue_job(app, job);
        Ok(())
    }

    pub fn maybe_enqueue_auto_scan(&self, app: AppHandle) -> bool {
        let stream = StreamKind::Incoming;
        let state = app.state::<AppState>();
        let settings = state.settings.snapshot();
        let runtime = state.runtime.read().unwrap();
        let enabled = settings.rescue_scan_enabled;
        if !enabled || !state.gateway.can_submit() || !runtime.listening {
            return false;
        }
        drop(runtime);

        let job = {
            let mut inner = self
                .inner
                .lock()
                .expect("บริการ AI STT capture lock poisoned");
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
                source_display_name: source_display_name(&state, stream),
            }
        };

        self.enqueue_job(app, job)
    }

    pub fn reset_stream(&self, stream: StreamKind) {
        let mut inner = self
            .inner
            .lock()
            .expect("บริการ AI STT capture lock poisoned");
        {
            let buffer = inner.stream_mut(stream);
            buffer.ring.clear();
            buffer.ring_start_cursor = 0;
            buffer.next_sample_cursor = 0;
            buffer.incoming_utterance = None;
            buffer.microphone_active = false;
            buffer.microphone_samples.clear();
            buffer.microphone_segment_id = None;
            buffer.microphone_truncated = false;
            buffer.last_auto_scan_end_cursor = None;
            buffer.last_vad_activity_cursor = None;
            buffer.generation.fetch_add(1, Ordering::AcqRel);
        }
        match stream {
            StreamKind::Incoming => inner.recent_incoming_texts.clear(),
            StreamKind::Microphone => {}
        }
    }

    fn queue(&self, stream: StreamKind) -> Arc<StreamQueue> {
        match stream {
            StreamKind::Incoming => self.incoming_queue.clone(),
            StreamKind::Microphone => self.microphone_queue.clone(),
        }
    }

    pub fn generation(&self, stream: StreamKind) -> u64 {
        let inner = self
            .inner
            .lock()
            .expect("บริการ AI STT capture lock poisoned");
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
        let mut inner = self
            .inner
            .lock()
            .expect("บริการ AI STT capture lock poisoned");
        let recent = match stream {
            StreamKind::Incoming => &mut inner.recent_incoming_texts,
            StreamKind::Microphone => return false,
        };
        should_skip_or_record(recent, normalized, automatic_cloud_scan)
    }
}

struct CompletedTranscription {
    transcript: TranscriptEvent,
    generation: u64,
}

struct SttJob {
    stream: StreamKind,
    samples: Vec<i16>,
    segment_id: String,
    started_at_ms: i64,
    generation: u64,
    diagnostic_probe: bool,
    automatic_cloud_scan: bool,
    source_display_name: Option<String>,
}

fn set_stt_busy(app: &AppHandle, busy: bool, status: &str) {
    let state = app.state::<AppState>();
    let runtime = state.update_runtime(|runtime| {
        runtime.ai_stt_busy = busy;
        runtime.ai_status = status.into();
    });
    let _ = app.emit("runtime-state", runtime);
    let _ = app.emit("settings-updated", state.settings.snapshot());
}

fn report_stt_error(app: &AppHandle, message: &str) {
    let state = app.state::<AppState>();
    let runtime = state.update_runtime(|runtime| {
        runtime.last_error = Some(message.into());
        runtime.ai_status = message.into();
    });
    let _ = app.emit("runtime-state", runtime);
    let _ = app.emit("settings-updated", state.settings.snapshot());
    let _ = app.emit("pipeline-error", message.to_string());
}

fn report_audio_gap(app: &AppHandle, message: &str) {
    let state = app.state::<AppState>();
    let runtime = state.update_runtime(|runtime| {
        runtime.last_error = Some(message.into());
        runtime.ai_status = "ข้ามวลีที่ audio ไม่ต่อเนื่อง".into();
    });
    let _ = app.emit("runtime-state", runtime);
    let _ = app.emit("pipeline-status", message.to_string());
    let _ = app.emit("capture-log", message.to_string());
}

fn report_probe_result(app: &AppHandle, stream: StreamKind, message: &str) {
    let state = app.state::<AppState>();
    let runtime = state.update_runtime(|runtime| {
        match stream {
            StreamKind::Incoming => runtime.capture_warning = Some(message.into()),
            StreamKind::Microphone => {}
        }
        runtime.status_message = message.into();
    });
    let _ = app.emit("runtime-state", runtime);
    let _ = app.emit("pipeline-status", message.to_string());
}

fn source_display_name(state: &AppState, stream: StreamKind) -> Option<String> {
    let settings = state.settings.snapshot();
    let runtime = state.runtime.read().expect("runtime lock poisoned");
    match stream {
        StreamKind::Incoming
            if settings.capture_mode == crate::models::CaptureMode::SystemOutput =>
        {
            Some("MIXED".into())
        }
        StreamKind::Incoming => runtime
            .attached_source
            .as_ref()
            .map(|process| process.display_name.clone())
            .or_else(|| Some("INCOMING".into())),
        StreamKind::Microphone => Some("F9 REPLY".into()),
    }
}

#[cfg(test)]
mod tests;
