use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};

use anyhow::{anyhow, Result};
use flexaudio::{open, OutputFormat, ProcessMode, SourceKind, StreamConfig};
use tauri::{AppHandle, Emitter, Manager};

use crate::{
    cloud_stt::GroqSttManager,
    models::{CaptureSource, StreamKind},
    processes,
    state::AppState,
    worker::WorkerManager,
};

struct CaptureHandle {
    stop: Arc<AtomicBool>,
    join: Option<JoinHandle<()>>,
}

impl CaptureHandle {
    fn stop(mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(join) = self.join.take() {
            let _ = join.join();
        }
    }
}

#[derive(Default)]
pub struct AudioManager {
    game: Mutex<Option<CaptureHandle>>,
    microphone: Mutex<Option<CaptureHandle>>,
}

impl AudioManager {
    pub fn start_game(
        &self,
        app: AppHandle,
        source: CaptureSource,
        worker: WorkerManager,
        groq_stt: GroqSttManager,
    ) -> Result<()> {
        self.stop_game();
        if !processes::process_is_alive(source.pid) {
            return Err(anyhow!("process {} ไม่ได้ทำงานแล้ว", source.pid));
        }
        worker.reset_stream(StreamKind::Game);
        groq_stt.reset_stream(StreamKind::Game);
        let handle = spawn_capture(app, StreamKind::Game, Some(source.pid), worker, groq_stt)?;
        *self.game.lock().expect("game capture lock poisoned") = Some(handle);
        Ok(())
    }

    pub fn stop_game(&self) {
        if let Some(handle) = self.game.lock().expect("game capture lock poisoned").take() {
            handle.stop();
        }
    }

    pub fn start_microphone(
        &self,
        app: AppHandle,
        worker: WorkerManager,
        groq_stt: GroqSttManager,
    ) -> Result<()> {
        let mut guard = self.microphone.lock().expect("mic capture lock poisoned");
        if guard.is_some() {
            return Ok(());
        }
        worker.reset_stream(StreamKind::Microphone);
        groq_stt.reset_stream(StreamKind::Microphone);
        *guard = Some(spawn_capture(
            app,
            StreamKind::Microphone,
            None,
            worker,
            groq_stt,
        )?);
        Ok(())
    }

    pub fn stop_microphone(&self, worker: &WorkerManager, finalize: bool) {
        if let Some(handle) = self
            .microphone
            .lock()
            .expect("mic capture lock poisoned")
            .take()
        {
            handle.stop();
            if finalize {
                worker.finalize_stream(StreamKind::Microphone);
            }
        }
    }

    pub fn stop_all(&self, worker: &WorkerManager) {
        self.stop_game();
        self.stop_microphone(worker, false);
    }
}

fn spawn_capture(
    app: AppHandle,
    stream_kind: StreamKind,
    target_pid: Option<u32>,
    worker: WorkerManager,
    groq_stt: GroqSttManager,
) -> Result<CaptureHandle> {
    let stop = Arc::new(AtomicBool::new(false));
    let thread_stop = stop.clone();
    let join = thread::Builder::new()
        .name(format!("gamelingo-capture-{stream_kind:?}"))
        .spawn(move || {
            let config = StreamConfig {
                kind: if stream_kind == StreamKind::Game {
                    SourceKind::ProcessLoopback
                } else {
                    SourceKind::Mic
                },
                target_pid,
                mode: ProcessMode::Include,
                output: OutputFormat {
                    sample_rate: 16_000,
                    channels: 1,
                },
                ring_capacity_chunks: 100,
                ..Default::default()
            };
            let mut stream = match open(config) {
                Ok(stream) => stream,
                Err(error) => {
                    capture_failed(
                        &app,
                        stream_kind,
                        format!("เปิด {stream_kind:?} capture ไม่สำเร็จ: {error}"),
                    );
                    return;
                }
            };
            if let Err(error) = stream.start() {
                capture_failed(
                    &app,
                    stream_kind,
                    format!("เริ่ม {stream_kind:?} capture ไม่สำเร็จ: {error}"),
                );
                return;
            }
            let _ = app.emit("capture-started", stream_kind);
            let mut last_process_check = Instant::now();
            let mut dropped = 0_u64;
            while !thread_stop.load(Ordering::Relaxed) {
                let mut had_audio = false;
                while let Some(chunk) = stream.poll_chunk() {
                    had_audio = true;
                    if !groq_stt.ingest_audio(stream_kind, &chunk.data) {
                        dropped += 1;
                    }
                    if !worker.send_audio(stream_kind, chunk.data) {
                        dropped += 1;
                    }
                }
                while let Some(event) = stream.poll_event() {
                    let _ = app.emit("capture-log", format!("{stream_kind:?}: {event:?}"));
                }
                if stream_kind == StreamKind::Game
                    && last_process_check.elapsed() >= Duration::from_secs(1)
                {
                    last_process_check = Instant::now();
                    if target_pid.is_some_and(|pid| !processes::process_is_alive(pid)) {
                        let _ = app.emit("capture-ended", "game_process_exited");
                        break;
                    }
                }
                if !had_audio {
                    thread::sleep(Duration::from_millis(5));
                }
            }
            stream.stop();
            worker.finalize_stream(stream_kind);
            if dropped > 0 {
                let _ = app.emit(
                    "capture-log",
                    format!("ทิ้ง audio chunks {dropped} ชุดเพราะ worker ช้า"),
                );
            }
            let _ = app.emit("capture-stopped", stream_kind);
        })?;
    Ok(CaptureHandle {
        stop,
        join: Some(join),
    })
}

fn capture_failed(app: &AppHandle, stream_kind: StreamKind, message: String) {
    let state = app.state::<AppState>();
    let runtime = state.update_runtime(|runtime| {
        runtime.last_error = Some(message.clone());
        runtime.status_message = "เปิด audio capture ไม่สำเร็จ จะลองใหม่".into();
        if stream_kind == StreamKind::Game {
            runtime.attached_process = None;
        } else {
            runtime.microphone_active = false;
        }
    });
    let _ = app.emit("capture-error", message.clone());
    let _ = app.emit("pipeline-error", message);
    let _ = app.emit("runtime-state", runtime);
}
