use std::{
    collections::VecDeque,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};

use anyhow::{anyhow, Context, Result};
use futures_util::{
    stream::{SplitSink, SplitStream},
    SinkExt, StreamExt,
};
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager};
use tokio::{net::TcpStream, sync::mpsc};
use tokio_tungstenite::{
    connect_async,
    tungstenite::{
        client::IntoClientRequest,
        http::{header::AUTHORIZATION, HeaderValue},
        Message,
    },
    MaybeTlsStream, WebSocketStream,
};
use uuid::Uuid;

use crate::{
    models::{StreamKind, TranscriptEvent, TranscriptKind},
    pipeline,
    settings::xai_key,
    state::AppState,
};

const XAI_STT_ENDPOINT: &str = "wss://api.x.ai/v1/stt";
const SAMPLE_RATE: usize = 16_000;
// flexaudio normally yields ~10 ms chunks, so this caps connection-time audio
// at roughly two seconds without ever spilling it to disk.
const SESSION_QUEUE: usize = 200;

type Socket = WebSocketStream<MaybeTlsStream<TcpStream>>;
type SocketSink = SplitSink<Socket, Message>;
type SocketSource = SplitStream<Socket>;

#[derive(Debug)]
enum SessionCommand {
    Audio(Vec<i16>),
    Finalize,
    Close,
}

#[derive(Default)]
struct StreamBuffer {
    pre_roll: VecDeque<i16>,
    active: bool,
    segment_id: Option<String>,
    sender: Option<mpsc::Sender<SessionCommand>>,
}

#[derive(Default)]
struct CloudInner {
    game: StreamBuffer,
    microphone: StreamBuffer,
}

impl CloudInner {
    fn stream_mut(&mut self, stream: StreamKind) -> &mut StreamBuffer {
        match stream {
            StreamKind::Game => &mut self.game,
            StreamKind::Microphone => &mut self.microphone,
        }
    }
}

#[derive(Clone)]
pub struct CloudSttManager {
    inner: Arc<Mutex<CloudInner>>,
    pre_roll_samples: Arc<AtomicUsize>,
    connections: Arc<AtomicUsize>,
}

impl Default for CloudSttManager {
    fn default() -> Self {
        Self::new(200)
    }
}

impl CloudSttManager {
    pub fn new(pre_roll_ms: u64) -> Self {
        Self {
            inner: Arc::new(Mutex::new(CloudInner::default())),
            pre_roll_samples: Arc::new(AtomicUsize::new(
                (pre_roll_ms as usize * SAMPLE_RATE / 1_000).min(SAMPLE_RATE),
            )),
            connections: Arc::new(AtomicUsize::new(0)),
        }
    }

    pub fn set_pre_roll_ms(&self, pre_roll_ms: u64) {
        self.pre_roll_samples.store(
            (pre_roll_ms as usize * SAMPLE_RATE / 1_000).min(SAMPLE_RATE),
            Ordering::Relaxed,
        );
    }

    pub fn ingest_audio(&self, stream: StreamKind, samples: &[f32]) -> bool {
        let pcm = f32_to_pcm16(samples);
        let mut inner = self.inner.lock().expect("cloud STT lock poisoned");
        let buffer = inner.stream_mut(stream);
        if buffer.active {
            if let Some(sender) = &buffer.sender {
                return sender.try_send(SessionCommand::Audio(pcm)).is_ok();
            }
            return false;
        }

        let keep = self.pre_roll_samples.load(Ordering::Relaxed);
        buffer.pre_roll.extend(pcm);
        while buffer.pre_roll.len() > keep {
            buffer.pre_roll.pop_front();
        }
        true
    }

    pub fn start_speech(&self, app: AppHandle, stream: StreamKind) {
        let settings = app.state::<AppState>().settings.snapshot();
        if !settings.xai.configured {
            report_error(&app, "ยังไม่ได้ตั้ง xAI API key", false, stream);
            return;
        }
        if app.state::<AppState>().settings.budget_exhausted() {
            report_error(&app, "ถึงงบ xAI รายเดือนแล้ว", true, stream);
            return;
        }

        let (tx, rx) = mpsc::channel(SESSION_QUEUE);
        let segment_id = Uuid::new_v4().to_string();
        let initial = {
            let mut inner = self.inner.lock().expect("cloud STT lock poisoned");
            let buffer = inner.stream_mut(stream);
            if buffer.active {
                return;
            }
            buffer.active = true;
            buffer.segment_id = Some(segment_id.clone());
            buffer.sender = Some(tx);
            buffer.pre_roll.drain(..).collect::<Vec<_>>()
        };
        let started_at_ms = chrono::Utc::now().timestamp_millis()
            - (initial.len() as i64 * 1_000 / SAMPLE_RATE as i64);
        let manager = self.clone();
        tauri::async_runtime::spawn(async move {
            let result = run_session(
                manager.clone(),
                app.clone(),
                stream,
                segment_id.clone(),
                started_at_ms,
                initial,
                rx,
            )
            .await;
            manager.session_finished(stream, &segment_id);
            if let Err(error) = result {
                let message = friendly_stt_error(&error);
                let quota = message.contains("ถึงงบ xAI");
                report_error(&app, &message, quota, stream);
            }
        });
    }

    pub fn end_speech(&self, stream: StreamKind) {
        let sender = {
            let mut inner = self.inner.lock().expect("cloud STT lock poisoned");
            let buffer = inner.stream_mut(stream);
            if !buffer.active {
                return;
            }
            buffer.active = false;
            buffer.sender.take()
        };
        if let Some(sender) = sender {
            let _ = sender.try_send(SessionCommand::Finalize);
        }
    }

    pub fn reset_stream(&self, stream: StreamKind) {
        let sender = {
            let mut inner = self.inner.lock().expect("cloud STT lock poisoned");
            let buffer = inner.stream_mut(stream);
            buffer.active = false;
            buffer.segment_id = None;
            buffer.pre_roll.clear();
            buffer.sender.take()
        };
        if let Some(sender) = sender {
            let _ = sender.try_send(SessionCommand::Close);
        }
    }

    fn session_finished(&self, stream: StreamKind, segment_id: &str) {
        let mut inner = self.inner.lock().expect("cloud STT lock poisoned");
        let buffer = inner.stream_mut(stream);
        if buffer.segment_id.as_deref() == Some(segment_id) {
            buffer.active = false;
            buffer.segment_id = None;
            buffer.sender = None;
        }
    }

    fn connection_opened(&self, app: &AppHandle) {
        self.connections.fetch_add(1, Ordering::SeqCst);
        update_connection_runtime(app, true, "xAI Streaming STT เชื่อมต่อแล้ว");
    }

    fn connection_closed(&self, app: &AppHandle) {
        let previous = self
            .connections
            .fetch_update(Ordering::SeqCst, Ordering::SeqCst, |value| {
                Some(value.saturating_sub(1))
            })
            .unwrap_or(0);
        if previous <= 1 {
            update_connection_runtime(app, false, "xAI STT พร้อมเชื่อมต่อเมื่อพบเสียงพูด");
        }
    }
}

struct ConnectionLease {
    manager: CloudSttManager,
    app: AppHandle,
    active: bool,
}

impl ConnectionLease {
    fn new(manager: CloudSttManager, app: AppHandle) -> Self {
        Self {
            manager,
            app,
            active: false,
        }
    }

    fn activate(&mut self) {
        if !self.active {
            self.manager.connection_opened(&self.app);
            self.active = true;
        }
    }
}

impl Drop for ConnectionLease {
    fn drop(&mut self) {
        if self.active {
            self.manager.connection_closed(&self.app);
        }
    }
}

async fn run_session(
    manager: CloudSttManager,
    app: AppHandle,
    stream: StreamKind,
    segment_id: String,
    started_at_ms: i64,
    initial: Vec<i16>,
    mut receiver: mpsc::Receiver<SessionCommand>,
) -> Result<()> {
    let mut last_error = None;
    for attempt in 0..2 {
        match run_session_attempt(
            manager.clone(),
            app.clone(),
            stream,
            &segment_id,
            started_at_ms,
            initial.clone(),
            &mut receiver,
        )
        .await
        {
            Ok(()) => return Ok(()),
            Err(error) => {
                if !retryable_stt_error(&error) {
                    return Err(error);
                }
                last_error = Some(error);
                if attempt == 0 {
                    tokio::time::sleep(Duration::from_millis(250)).await;
                }
            }
        }
    }
    Err(last_error.unwrap_or_else(|| anyhow!("WebSocket ไม่ตอบสนอง")))
}

async fn run_session_attempt(
    manager: CloudSttManager,
    app: AppHandle,
    stream: StreamKind,
    segment_id: &str,
    started_at_ms: i64,
    initial: Vec<i16>,
    receiver: &mut mpsc::Receiver<SessionCommand>,
) -> Result<()> {
    let settings = app.state::<AppState>().settings.snapshot();
    let key = xai_key()?;
    let language = match stream {
        StreamKind::Game => "en",
        StreamKind::Microphone => "th",
    };
    let mut url = reqwest::Url::parse(XAI_STT_ENDPOINT)?;
    {
        let mut query = url.query_pairs_mut();
        query
            .append_pair("sample_rate", "16000")
            .append_pair("encoding", "pcm")
            .append_pair("interim_results", "true")
            .append_pair("endpointing", &settings.vad.silence_ms.to_string())
            .append_pair("language", language)
            .append_pair("vad_threshold", "0");
        for term in settings.glossary.iter().take(100) {
            let keyterm = match stream {
                StreamKind::Game => term.source.trim(),
                StreamKind::Microphone => term.target.trim(),
            };
            if !keyterm.is_empty() && keyterm.chars().count() <= 50 {
                query.append_pair("keyterm", keyterm);
            }
        }
    }
    let mut request = url.as_str().into_client_request()?;
    request.headers_mut().insert(
        AUTHORIZATION,
        HeaderValue::from_str(&format!("Bearer {key}"))?,
    );

    update_connection_runtime(&app, false, "กำลังเชื่อมต่อ xAI Streaming STT");
    let (socket, response) = tokio::time::timeout(Duration::from_secs(3), connect_async(request))
        .await
        .context("เชื่อมต่อ xAI STT timeout")??;
    if response.status() != tokio_tungstenite::tungstenite::http::StatusCode::SWITCHING_PROTOCOLS {
        return Err(anyhow!("xAI STT ตอบ {}", response.status()));
    }
    let (mut sink, mut source) = socket.split();
    wait_until_created(&mut source).await?;
    let mut lease = ConnectionLease::new(manager, app.clone());
    lease.activate();

    let session = session_event_loop(
        &app,
        &mut sink,
        &mut source,
        receiver,
        stream,
        segment_id,
        language,
        started_at_ms,
        initial,
        settings.vad.partial_interval_ms,
    );
    tokio::time::timeout(Duration::from_secs(30), session)
        .await
        .context("xAI STT session timeout")?
}

async fn wait_until_created(source: &mut SocketSource) -> Result<()> {
    tokio::time::timeout(Duration::from_secs(3), async {
        while let Some(message) = source.next().await {
            match message? {
                Message::Text(text) => {
                    let value: Value = serde_json::from_str(text.as_str())?;
                    match value.get("type").and_then(Value::as_str) {
                        Some("transcript.created") => return Ok(()),
                        Some("error") => {
                            return Err(anyhow!(
                                "{}",
                                value
                                    .get("message")
                                    .and_then(Value::as_str)
                                    .unwrap_or("xAI STT error")
                            ));
                        }
                        _ => {}
                    }
                }
                Message::Close(frame) => {
                    return Err(anyhow!("xAI ปิด connection ก่อนพร้อม: {frame:?}"));
                }
                _ => {}
            }
        }
        Err(anyhow!("xAI ปิด connection ก่อนส่ง transcript.created"))
    })
    .await
    .context("รอ xAI transcript.created timeout")?
}

#[allow(clippy::too_many_arguments)]
async fn session_event_loop(
    app: &AppHandle,
    sink: &mut SocketSink,
    source: &mut SocketSource,
    receiver: &mut mpsc::Receiver<SessionCommand>,
    stream: StreamKind,
    segment_id: &str,
    language: &str,
    started_at_ms: i64,
    initial: Vec<i16>,
    partial_interval_ms: u64,
) -> Result<()> {
    let mut sent_samples = 0_u64;
    if !initial.is_empty() {
        send_audio(app, sink, &initial, &mut sent_samples).await?;
    }
    let mut committed = String::new();
    let mut last_partial = Instant::now() - Duration::from_millis(partial_interval_ms);

    loop {
        tokio::select! {
            command = receiver.recv() => {
                match command {
                    Some(SessionCommand::Audio(samples)) => {
                        send_audio(app, sink, &samples, &mut sent_samples).await?;
                    }
                    Some(SessionCommand::Finalize) => {
                        sink.send(Message::Text(r#"{"type":"Finalize"}"#.into())).await?;
                    }
                    Some(SessionCommand::Close) | None => {
                        let _ = sink.send(Message::Text(r#"{"type":"audio.done"}"#.into())).await;
                        return Ok(());
                    }
                }
            }
            message = source.next() => {
                let Some(message) = message else {
                    return Err(anyhow!("xAI ปิด WebSocket กลางวลี"));
                };
                match message? {
                    Message::Text(text) => {
                        let value: Value = serde_json::from_str(text.as_str())?;
                        match value.get("type").and_then(Value::as_str) {
                            Some("transcript.partial") => {
                                let text = value.get("text").and_then(Value::as_str).unwrap_or("").trim();
                                let is_final = value.get("is_final").and_then(Value::as_bool).unwrap_or(false);
                                let speech_final = value.get("speech_final").and_then(Value::as_bool).unwrap_or(false);
                                let merged = merge_transcript(&committed, text);
                                if is_final && !speech_final {
                                    committed = merged.clone();
                                }
                                if speech_final {
                                    let final_text = merge_transcript(&committed, text);
                                    if !final_text.trim().is_empty() {
                                        let transcript = TranscriptEvent {
                                            segment_id: segment_id.into(),
                                            stream,
                                            language: language.into(),
                                            text: final_text,
                                            kind: TranscriptKind::Final,
                                            started_at_ms,
                                            ended_at_ms: chrono::Utc::now().timestamp_millis(),
                                        };
                                        let _ = sink.send(Message::Text(r#"{"type":"audio.done"}"#.into())).await;
                                        pipeline::handle_transcript_event(app.clone(), transcript).await;
                                    }
                                    return Ok(());
                                }
                                if !merged.is_empty() && last_partial.elapsed() >= Duration::from_millis(partial_interval_ms) {
                                    last_partial = Instant::now();
                                    let transcript = TranscriptEvent {
                                        segment_id: segment_id.into(),
                                        stream,
                                        language: language.into(),
                                        text: merged,
                                        kind: TranscriptKind::Partial,
                                        started_at_ms,
                                        ended_at_ms: chrono::Utc::now().timestamp_millis(),
                                    };
                                    pipeline::handle_transcript_event(app.clone(), transcript).await;
                                }
                            }
                            Some("error") => {
                                return Err(anyhow!(
                                    "{}",
                                    value.get("message").and_then(Value::as_str).unwrap_or("xAI STT error")
                                ));
                            }
                            _ => {}
                        }
                    }
                    Message::Close(frame) => return Err(anyhow!("xAI ปิด WebSocket: {frame:?}")),
                    _ => {}
                }
            }
        }
    }
}

async fn send_audio(
    app: &AppHandle,
    sink: &mut SocketSink,
    samples: &[i16],
    sent_samples: &mut u64,
) -> Result<()> {
    let previous_ms = sent_samples.saturating_mul(1_000) / SAMPLE_RATE as u64;
    let next_samples = sent_samples.saturating_add(samples.len() as u64);
    let next_ms = next_samples.saturating_mul(1_000) / SAMPLE_RATE as u64;
    let delta_ms = next_ms.saturating_sub(previous_ms);
    if delta_ms > 0 {
        app.state::<AppState>()
            .settings
            .reserve_audio_ms(delta_ms)?;
    }
    let mut bytes = Vec::with_capacity(samples.len() * 2);
    for sample in samples {
        bytes.extend_from_slice(&sample.to_le_bytes());
    }
    sink.send(Message::Binary(bytes.into())).await?;
    *sent_samples = next_samples;
    Ok(())
}

fn merge_transcript(committed: &str, next: &str) -> String {
    let committed = committed.trim();
    let next = next.trim();
    if committed.is_empty() {
        return next.into();
    }
    if next.is_empty() || committed.ends_with(next) {
        return committed.into();
    }
    if next.starts_with(committed) {
        return next.into();
    }
    format!("{committed} {next}")
}

pub(crate) fn f32_to_pcm16(samples: &[f32]) -> Vec<i16> {
    samples
        .iter()
        .map(|sample| {
            let clamped = sample.clamp(-1.0, 1.0);
            if clamped < 0.0 {
                (clamped * 32_768.0).round() as i16
            } else {
                (clamped * 32_767.0).round() as i16
            }
        })
        .collect()
}

fn update_connection_runtime(app: &AppHandle, connected: bool, status: &str) {
    let state = app.state::<AppState>();
    let runtime = state.update_runtime(|runtime| {
        runtime.xai_stt_connected = connected;
        runtime.xai_status = status.into();
        if connected {
            runtime.last_error = None;
            runtime.budget_exhausted = false;
        }
    });
    let _ = app.emit("runtime-state", runtime);
}

fn retryable_stt_error(error: &anyhow::Error) -> bool {
    let message = error.to_string();
    ![
        "API key",
        "ไม่มีเครดิต",
        "ถึงงบ",
        "400",
        "401",
        "402",
        "403",
        "404",
    ]
    .iter()
    .any(|marker| message.contains(marker))
}

fn friendly_stt_error(error: &anyhow::Error) -> String {
    let message = error.to_string();
    if message.contains("401") || message.contains("403") {
        "xAI API key ไม่ถูกต้อง กรุณาตรวจใน console.x.ai".into()
    } else if message.contains("402") {
        "บัญชี xAI ไม่มีเครดิตเพียงพอ".into()
    } else if message.contains("429") {
        "xAI จำกัดคำขอชั่วคราว กรุณาลองใหม่".into()
    } else {
        format!("xAI STT ใช้งานไม่ได้: {message}")
    }
}

fn report_error(app: &AppHandle, message: &str, budget_exhausted: bool, stream: StreamKind) {
    let state = app.state::<AppState>();
    let runtime = state.update_runtime(|runtime| {
        runtime.xai_stt_connected = false;
        runtime.xai_status = message.into();
        runtime.budget_exhausted = budget_exhausted;
        runtime.last_error = Some(message.into());
        match stream {
            StreamKind::Game => {
                runtime.listening = false;
                runtime.attached_process = None;
            }
            StreamKind::Microphone => runtime.microphone_active = false,
        }
    });
    match stream {
        StreamKind::Game => state.audio.stop_game(),
        StreamKind::Microphone => state.audio.stop_microphone(&state.worker, false),
    }
    let _ = app.emit("pipeline-error", message.to_string());
    let _ = app.emit("runtime-state", runtime);
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio_tungstenite::accept_async;

    #[test]
    fn converts_float_audio_to_pcm16() {
        assert_eq!(
            f32_to_pcm16(&[-2.0, -1.0, 0.0, 1.0, 2.0]),
            vec![-32768, -32768, 0, 32767, 32767]
        );
    }

    #[test]
    fn transcript_merge_avoids_duplicate_prefixes() {
        assert_eq!(
            merge_transcript("Enemy on", "Enemy on the left"),
            "Enemy on the left"
        );
        assert_eq!(
            merge_transcript("Enemy on", "the left"),
            "Enemy on the left"
        );
        assert_eq!(
            merge_transcript("Enemy on the left", "the left"),
            "Enemy on the left"
        );
    }

    #[test]
    fn pre_roll_is_bounded_and_only_for_inactive_stream() {
        let manager = CloudSttManager::new(200);
        assert!(manager.ingest_audio(StreamKind::Game, &vec![0.1; SAMPLE_RATE]));
        let inner = manager.inner.lock().unwrap();
        assert_eq!(inner.game.pre_roll.len(), 3_200);
    }

    #[test]
    fn authentication_and_bad_requests_are_not_retried() {
        assert!(!retryable_stt_error(&anyhow!(
            "HTTP error: 401 Unauthorized"
        )));
        assert!(!retryable_stt_error(&anyhow!(
            "HTTP error: 400 Bad Request"
        )));
        assert!(retryable_stt_error(&anyhow!("connection reset")));
        assert!(retryable_stt_error(&anyhow!(
            "HTTP error: 429 Too Many Requests"
        )));
    }

    #[tokio::test]
    async fn accepts_transcript_created_from_mock_websocket() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind mock websocket");
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            let mut socket = accept_async(stream).await.unwrap();
            socket
                .send(Message::Text(r#"{"type":"transcript.created"}"#.into()))
                .await
                .unwrap();
        });
        let (socket, _) = connect_async(format!("ws://{address}"))
            .await
            .expect("connect mock websocket");
        let (_sink, mut source) = socket.split();
        wait_until_created(&mut source)
            .await
            .expect("created event accepted");
        server.await.unwrap();
    }
}
