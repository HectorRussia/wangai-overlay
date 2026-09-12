use std::{
    io::{BufRead, BufReader, Write},
    process::{Child, Command, Stdio},
    sync::{
        mpsc::{self, SyncSender, TrySendError},
        Arc, Mutex, RwLock,
    },
    thread,
};

use anyhow::{anyhow, Context, Result};
#[cfg(debug_assertions)]
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Manager};

use crate::{
    models::{AppSettings, StreamKind, WorkerEvent, WorkerStatusEvent},
    pipeline,
};

const FRAME_AUDIO: u8 = 1;
const FRAME_RESET: u8 = 2;
const FRAME_FINALIZE: u8 = 3;
const FRAME_SHUTDOWN: u8 = 4;

enum WorkerCommand {
    Audio(StreamKind, u64, Vec<f32>),
    Reset(StreamKind),
    Finalize(StreamKind),
    Shutdown,
}

#[derive(Clone, Default)]
pub struct WorkerManager {
    sender: Arc<RwLock<Option<SyncSender<WorkerCommand>>>>,
    child: Arc<Mutex<Option<Child>>>,
}

impl WorkerManager {
    #[cfg(feature = "release-test")]
    pub fn test_pid(&self) -> Option<u32> {
        self.child.lock().unwrap().as_ref().map(|child| child.id())
    }
    pub fn start(&self, app: AppHandle, settings: &AppSettings) -> Result<()> {
        let state = app.state::<crate::state::AppState>();
        let _operation = state.lifecycle.operation()?;
        self.stop()?;
        emit_status(&app, "starting", "กำลังเปิด Silero VAD worker", None);
        let vad_threshold = active_vad_threshold(settings);

        #[cfg(debug_assertions)]
        let mut command = {
            let worker_path = resolve_worker_path(&app)?;
            let python = resolve_python(&worker_path);
            let mut command = Command::new(&python);
            if python
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.eq_ignore_ascii_case("py.exe"))
            {
                command.arg("-3");
            }
            command.arg("-u").arg(&worker_path);
            command
        };
        #[cfg(not(debug_assertions))]
        let mut command = {
            let path = app.path().resource_dir()?.join("worker/wangai-worker.exe");
            if !path.is_file() {
                return Err(anyhow!("ไม่พบ worker ที่มากับตัวติดตั้ง กรุณาติดตั้ง WANGAI ใหม่"));
            }
            let path = wangai_portable::platform::dependency_executable(&path)?;
            let mut command = Command::new(&path);
            command.current_dir(path.parent().unwrap());
            command
        };
        command
            .env("PYTHONDONTWRITEBYTECODE", "1")
            .arg("--vad-threshold")
            .arg(vad_threshold.to_string())
            .arg("--adaptive-floor")
            .arg(adaptive_vad_floor(settings, vad_threshold).to_string())
            .arg("--silence-ms")
            .arg(settings.vad.silence_ms.to_string())
            .arg("--max-utterance-ms")
            .arg(settings.vad.max_utterance_ms.to_string())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        if cfg!(debug_assertions) && std::env::var("GAMELINGO_MOCK_VAD").as_deref() == Ok("1") {
            command.arg("--mock");
        }

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x0800_0000);
        }

        let mut child = command
            .spawn()
            .context("เปิด Silero worker ไม่สำเร็จ กรุณาตรวจไฟล์ติดตั้งและ DLL")?;
        let stdin = child
            .stdin
            .take()
            .context("เปิด stdin ของ speech worker ไม่สำเร็จ")?;
        let stdout = child
            .stdout
            .take()
            .context("เปิด stdout ของ speech worker ไม่สำเร็จ")?;
        let stderr = child
            .stderr
            .take()
            .context("เปิด stderr ของ speech worker ไม่สำเร็จ")?;

        let (tx, rx) = mpsc::sync_channel::<WorkerCommand>(256);
        *self.sender.write().expect("worker sender lock poisoned") = Some(tx);

        thread::Builder::new()
            .name("gamelingo-worker-writer".into())
            .spawn(move || {
                let mut stdin = stdin;
                while let Ok(message) = rx.recv() {
                    let is_shutdown = matches!(message, WorkerCommand::Shutdown);
                    if write_frame(&mut stdin, message).is_err() {
                        break;
                    }
                    if is_shutdown {
                        break;
                    }
                }
            })?;

        let event_app = app.clone();
        thread::Builder::new()
            .name("gamelingo-worker-events".into())
            .spawn(move || {
                for line in BufReader::new(stdout).lines() {
                    let Ok(line) = line else { break };
                    if line.trim().is_empty() {
                        continue;
                    }
                    match serde_json::from_str::<WorkerEvent>(&line) {
                        Ok(event) => pipeline::handle_worker_event(event_app.clone(), event),
                        Err(error) => {
                            let _ = event_app.emit(
                                "worker-log",
                                format!("worker event ไม่ถูกต้อง: {error}: {line}"),
                            );
                        }
                    }
                }
                emit_status(&event_app, "stopped", "speech worker หยุดทำงาน", None);
            })?;

        let log_app = app.clone();
        thread::Builder::new()
            .name("gamelingo-worker-stderr".into())
            .spawn(move || {
                for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                    let _ = log_app.emit("worker-log", line);
                }
            })?;

        *self.child.lock().expect("worker child lock poisoned") = Some(child);
        Ok(())
    }

    pub fn stop(&self) -> Result<()> {
        if let Some(sender) = self
            .sender
            .write()
            .expect("worker sender lock poisoned")
            .take()
        {
            let _ = sender.try_send(WorkerCommand::Shutdown);
        }
        let child = self
            .child
            .lock()
            .expect("worker child lock poisoned")
            .take();
        if let Some(mut child) = child {
            let result = (|| -> Result<()> {
                if child.try_wait()?.is_some() {
                    return Ok(());
                }
                child.kill().context("หยุด Silero worker ไม่สำเร็จ")?;
                // Never block the UI/installer indefinitely waiting on a broken child.
                let deadline = std::time::Instant::now() + std::time::Duration::from_secs(3);
                while std::time::Instant::now() < deadline {
                    if child.try_wait()?.is_some() {
                        return Ok(());
                    }
                    thread::sleep(std::time::Duration::from_millis(20));
                }
                Err(anyhow!("Silero worker ยังไม่หยุดภายในเวลาที่กำหนด"))
            })();
            if result.is_err() {
                *self.child.lock().unwrap() = Some(child);
            }
            return result;
        }
        Ok(())
    }

    pub fn send_audio(
        &self,
        stream: StreamKind,
        start_sample_cursor: u64,
        samples: Vec<f32>,
    ) -> bool {
        let sender = self
            .sender
            .read()
            .expect("worker sender lock poisoned")
            .clone();
        let Some(sender) = sender else { return false };
        match sender.try_send(WorkerCommand::Audio(stream, start_sample_cursor, samples)) {
            Ok(()) => true,
            Err(TrySendError::Full(_)) | Err(TrySendError::Disconnected(_)) => false,
        }
    }

    pub fn reset_stream(&self, stream: StreamKind) {
        if let Some(sender) = self
            .sender
            .read()
            .expect("worker sender lock poisoned")
            .clone()
        {
            let _ = sender.send(WorkerCommand::Reset(stream));
        }
    }

    pub fn finalize_stream(&self, stream: StreamKind) {
        if let Some(sender) = self
            .sender
            .read()
            .expect("worker sender lock poisoned")
            .clone()
        {
            let _ = sender.send(WorkerCommand::Finalize(stream));
        }
    }
}

fn active_vad_threshold(settings: &AppSettings) -> f32 {
    settings
        .vad
        .active_profile(settings.capture_mode)
        .vad_threshold
}

fn adaptive_vad_floor(settings: &AppSettings, threshold: f32) -> f32 {
    match settings.capture_mode {
        crate::models::CaptureMode::SystemOutput => (threshold * 0.25).clamp(0.05, 0.12),
        crate::models::CaptureMode::ProcessTree => threshold,
    }
}

impl Drop for WorkerManager {
    fn drop(&mut self) {
        if Arc::strong_count(&self.child) == 1 {
            let _ = self.stop();
        }
    }
}

fn write_frame(mut writer: impl Write, message: WorkerCommand) -> std::io::Result<()> {
    let (kind, stream, start_sample_cursor, payload) = match message {
        WorkerCommand::Audio(stream, start_sample_cursor, samples) => {
            let mut payload = Vec::with_capacity(samples.len() * 4);
            for sample in samples {
                payload.extend_from_slice(&sample.to_le_bytes());
            }
            (FRAME_AUDIO, stream.id(), start_sample_cursor, payload)
        }
        WorkerCommand::Reset(stream) => (FRAME_RESET, stream.id(), 0, Vec::new()),
        WorkerCommand::Finalize(stream) => (FRAME_FINALIZE, stream.id(), 0, Vec::new()),
        WorkerCommand::Shutdown => (FRAME_SHUTDOWN, 0, 0, Vec::new()),
    };
    let length = (12 + payload.len()) as u32;
    writer.write_all(&length.to_le_bytes())?;
    writer.write_all(&[kind, stream, 0, 0])?;
    writer.write_all(&start_sample_cursor.to_le_bytes())?;
    writer.write_all(&payload)?;
    writer.flush()
}

#[cfg(debug_assertions)]
fn resolve_worker_path(app: &AppHandle) -> Result<PathBuf> {
    let dev_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("src-tauri has parent")
        .join("worker")
        .join("main.py");
    if dev_path.exists() {
        return Ok(dev_path);
    }
    let resource_path = app.path().resource_dir()?.join("worker").join("main.py");
    if resource_path.exists() {
        Ok(resource_path)
    } else {
        Err(anyhow!("ไม่พบ worker/main.py"))
    }
}

#[cfg(debug_assertions)]
fn resolve_python(worker_path: &Path) -> PathBuf {
    if let Ok(value) = std::env::var("GAMELINGO_PYTHON") {
        let path = PathBuf::from(value);
        if path.exists() {
            return path;
        }
    }
    if let Some(root) = worker_path.parent().and_then(Path::parent) {
        let venv = root.join(".venv").join("Scripts").join("python.exe");
        if venv.exists() {
            return venv;
        }
    }
    PathBuf::from("python")
}

pub fn emit_status(app: &AppHandle, state: &str, message: &str, model: Option<String>) {
    let _ = app.emit(
        "worker-status",
        WorkerStatusEvent {
            state: state.into(),
            message: message.into(),
            model,
        },
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn audio_frame_has_expected_header_and_payload() {
        let mut data = Vec::new();
        write_frame(
            &mut data,
            WorkerCommand::Audio(StreamKind::Incoming, 320, vec![0.5, -0.5]),
        )
        .expect("write");
        assert_eq!(u32::from_le_bytes(data[0..4].try_into().unwrap()), 20);
        assert_eq!(data[4], FRAME_AUDIO);
        assert_eq!(data[5], StreamKind::Incoming.id());
        assert_eq!(u64::from_le_bytes(data[8..16].try_into().unwrap()), 320);
        assert_eq!(data.len(), 24);
    }

    #[test]
    fn finalize_frame_has_no_payload() {
        let mut data = Vec::new();
        write_frame(&mut data, WorkerCommand::Finalize(StreamKind::Microphone)).expect("write");
        assert_eq!(u32::from_le_bytes(data[0..4].try_into().unwrap()), 12);
        assert_eq!(data[4], FRAME_FINALIZE);
        assert_eq!(data[5], StreamKind::Microphone.id());
    }

    #[test]
    fn only_incoming_and_microphone_stream_ids_remain() {
        assert_eq!(StreamKind::Incoming.id(), 1);
        assert_eq!(StreamKind::Microphone.id(), 2);
    }

    #[test]
    fn system_output_uses_its_own_vad_threshold() {
        let mut settings = AppSettings::default();
        assert_eq!(active_vad_threshold(&settings), 0.5);
        settings.capture_mode = crate::models::CaptureMode::SystemOutput;
        assert_eq!(active_vad_threshold(&settings), 0.35);
    }

    #[test]
    fn system_output_enables_a_lower_adaptive_speech_floor() {
        let mut settings = AppSettings::default();
        settings.capture_mode = crate::models::CaptureMode::SystemOutput;
        settings.vad.system_output.vad_threshold = 0.2;

        assert_eq!(adaptive_vad_floor(&settings, 0.2), 0.05);
        settings.capture_mode = crate::models::CaptureMode::ProcessTree;
        assert_eq!(adaptive_vad_floor(&settings, 0.5), 0.5);
    }
}
