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
const TRANSCRIPTIONS_ENDPOINT: &str = "https://api.groq.com/openai/v1/audio/transcriptions";

#[derive(Clone)]
pub struct GroqSttManager {
    inner: Arc<Mutex<CaptureState>>,
    provider: GroqSpeechToText,
    game_queue: Arc<StreamQueue>,
    microphone_queue: Arc<StreamQueue>,
    busy_jobs: Arc<AtomicUsize>,
}

impl GroqSttManager {
    pub fn new(pre_roll_ms: u64) -> Self {
        Self {
            inner: Arc::new(Mutex::new(CaptureState::new(pre_roll_ms))),
            provider: GroqSpeechToText::default(),
            game_queue: Arc::new(StreamQueue::default()),
            microphone_queue: Arc::new(StreamQueue::default()),
            busy_jobs: Arc::new(AtomicUsize::new(0)),
        }
    }

    pub fn set_pre_roll_ms(&self, pre_roll_ms: u64) {
        let mut inner = self.inner.lock().expect("Groq STT capture lock poisoned");
        inner.pre_roll_samples = millis_to_samples(pre_roll_ms);
        let cap = inner.pre_roll_samples;
        truncate_pre_roll(&mut inner.game.pre_roll, cap);
        truncate_pre_roll(&mut inner.microphone.pre_roll, cap);
    }

    pub fn ingest_audio(&self, stream: StreamKind, samples: &[f32]) -> bool {
        let mut inner = self.inner.lock().expect("Groq STT capture lock poisoned");
        let pre_roll_samples = inner.pre_roll_samples;
        let buffer = inner.stream_mut(stream);
        if buffer.active {
            let remaining = MAX_CAPTURE_SAMPLES.saturating_sub(buffer.samples.len());
            buffer
                .samples
                .extend(samples.iter().take(remaining).copied().map(f32_to_pcm16));
            remaining >= samples.len()
        } else {
            for sample in samples.iter().copied().map(f32_to_pcm16) {
                buffer.pre_roll.push_back(sample);
            }
            truncate_pre_roll(&mut buffer.pre_roll, pre_roll_samples);
            true
        }
    }

    pub fn start_speech(&self, app: AppHandle, stream: StreamKind) {
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

        let now = chrono::Utc::now().timestamp_millis();
        let mut inner = self.inner.lock().expect("Groq STT capture lock poisoned");
        let buffer = inner.stream_mut(stream);
        if buffer.active {
            return;
        }
        buffer.active = true;
        buffer.samples = buffer.pre_roll.iter().copied().collect();
        buffer.segment_id = Some(Uuid::new_v4().to_string());
        buffer.started_at_ms = now.saturating_sub(samples_to_millis(buffer.samples.len()) as i64);
        let runtime = state.update_runtime(|runtime| {
            runtime.groq_status = "กำลังฟัง…".into();
            runtime.last_error = None;
        });
        let _ = app.emit("runtime-state", runtime);
    }

    pub fn end_speech(&self, app: AppHandle, stream: StreamKind) {
        let utterance = {
            let mut inner = self.inner.lock().expect("Groq STT capture lock poisoned");
            let buffer = inner.stream_mut(stream);
            if !buffer.active {
                return;
            }
            buffer.active = false;
            let samples = std::mem::take(&mut buffer.samples);
            let segment_id = buffer
                .segment_id
                .take()
                .unwrap_or_else(|| Uuid::new_v4().to_string());
            if samples.len() < SAMPLE_RATE / 20 {
                return;
            }
            SttJob {
                stream,
                samples,
                segment_id,
                started_at_ms: buffer.started_at_ms,
                generation: buffer.generation.load(Ordering::Relaxed),
            }
        };

        let queue = self.queue(stream);
        if !queue.try_enqueue() {
            report_stt_error(&app, "ระบบตามเสียงไม่ทัน: คิวถอดเสียงเต็ม");
            return;
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
    }

    pub fn reset_stream(&self, stream: StreamKind) {
        let mut inner = self.inner.lock().expect("Groq STT capture lock poisoned");
        let buffer = inner.stream_mut(stream);
        buffer.active = false;
        buffer.samples.clear();
        buffer.pre_roll.clear();
        buffer.segment_id = None;
        buffer.generation.fetch_add(1, Ordering::AcqRel);
    }

    async fn process_job(&self, app: &AppHandle, job: SttJob) -> Result<()> {
        let state = app.state::<AppState>();
        let settings = state.settings.snapshot();
        let model = settings.groq.stt_model.clone();
        let language = match job.stream {
            StreamKind::Game => "en",
            StreamKind::Microphone => "th",
        };
        let prompt = glossary_prompt(&settings, job.stream);
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
            prompt,
        };
        let text = self.provider.transcribe(&key, request).await?;

        if self.generation(job.stream) != job.generation {
            return Ok(());
        }
        let text = text.trim();
        if text.is_empty() {
            return Err(anyhow!("Groq Whisper ส่งข้อความว่าง"));
        }
        let ended_at_ms = chrono::Utc::now().timestamp_millis();
        let transcript = TranscriptEvent {
            segment_id: job.segment_id,
            stream: job.stream,
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
            StreamKind::Microphone => self.microphone_queue.clone(),
        }
    }

    fn generation(&self, stream: StreamKind) -> u64 {
        let inner = self.inner.lock().expect("Groq STT capture lock poisoned");
        inner.stream(stream).generation.load(Ordering::Relaxed)
    }
}

#[async_trait]
pub trait SpeechToText: Send + Sync {
    async fn transcribe(&self, key: &str, request: SttRequest) -> Result<String>;
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
    prompt: String,
}

#[derive(Deserialize)]
struct TranscriptionResponse {
    text: String,
}

#[async_trait]
impl SpeechToText for GroqSpeechToText {
    async fn transcribe(&self, key: &str, request: SttRequest) -> Result<String> {
        let mut last_error = None;
        for attempt in 0..2 {
            let file = multipart::Part::bytes(request.wav.clone())
                .file_name("speech.wav")
                .mime_str("audio/wav")?;
            let mut form = multipart::Form::new()
                .part("file", file)
                .text("model", request.model.clone())
                .text("language", request.language.clone())
                .text("response_format", "json")
                .text("temperature", "0");
            if !request.prompt.is_empty() {
                form = form.text("prompt", request.prompt.clone());
            }

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
                        .map(|response| response.text)
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
    game: StreamBuffer,
    microphone: StreamBuffer,
}

impl CaptureState {
    fn new(pre_roll_ms: u64) -> Self {
        Self {
            pre_roll_samples: millis_to_samples(pre_roll_ms),
            game: StreamBuffer::default(),
            microphone: StreamBuffer::default(),
        }
    }

    fn stream(&self, stream: StreamKind) -> &StreamBuffer {
        match stream {
            StreamKind::Game => &self.game,
            StreamKind::Microphone => &self.microphone,
        }
    }

    fn stream_mut(&mut self, stream: StreamKind) -> &mut StreamBuffer {
        match stream {
            StreamKind::Game => &mut self.game,
            StreamKind::Microphone => &mut self.microphone,
        }
    }
}

#[derive(Default)]
struct StreamBuffer {
    pre_roll: VecDeque<i16>,
    active: bool,
    samples: Vec<i16>,
    segment_id: Option<String>,
    started_at_ms: i64,
    generation: Arc<AtomicU64>,
}

fn glossary_prompt(settings: &crate::models::AppSettings, stream: StreamKind) -> String {
    settings
        .glossary
        .iter()
        .filter_map(|term| {
            let value = match stream {
                StreamKind::Game => term.source.trim(),
                StreamKind::Microphone => term.target.trim(),
            };
            (!value.is_empty()).then_some(value)
        })
        .take(100)
        .collect::<Vec<_>>()
        .join(", ")
        .chars()
        .take(1_000)
        .collect()
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

fn truncate_pre_roll(pre_roll: &mut VecDeque<i16>, cap: usize) {
    while pre_roll.len() > cap {
        pre_roll.pop_front();
    }
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
    fn glossary_prompt_uses_language_for_each_stream() {
        let settings = AppSettings::default();
        assert!(glossary_prompt(&settings, StreamKind::Game).contains("extract"));
        assert!(glossary_prompt(&settings, StreamKind::Microphone).contains("จุดถอนตัว"));
    }

    #[test]
    fn queue_accepts_running_and_one_waiting_only() {
        let queue = StreamQueue::default();
        assert!(queue.try_enqueue());
        assert!(queue.try_enqueue());
        assert!(!queue.try_enqueue());
    }

    #[tokio::test]
    async fn sends_wav_language_model_and_glossary_as_multipart() {
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
        let text = provider
            .transcribe(
                "secret-test-key",
                SttRequest {
                    wav: encode_wav_pcm16(&[1, 2, 3], 16_000),
                    model: "whisper-large-v3-turbo".into(),
                    language: "en".into(),
                    prompt: "Mistfall, extract".into(),
                },
            )
            .await
            .unwrap();
        assert_eq!(text, "Enemy on the left");
        let request = receiver.recv_timeout(Duration::from_secs(2)).unwrap();
        assert!(request.contains("filename=\"speech.wav\""));
        assert!(request.contains("whisper-large-v3-turbo"));
        assert!(request.contains("Mistfall, extract"));
        assert!(request.contains("\r\n\r\nen\r\n"));
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
