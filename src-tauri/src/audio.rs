use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};

use anyhow::{anyhow, Result};
use flexaudio::{devices, open, DeviceInfo, OutputFormat, ProcessMode, SourceKind, StreamConfig};
use tauri::{AppHandle, Emitter, Manager};

use crate::{
    cloud_stt::GroqSttManager,
    models::{AudioOutputDevice, GameCaptureMode, StreamKind},
    processes,
    state::AppState,
    worker::WorkerManager,
};

struct CaptureHandle {
    stop: Arc<AtomicBool>,
    join: Option<JoinHandle<()>>,
}

#[derive(Debug, Default)]
struct VadAutoLeveler {
    auto_gain_db: f32,
}

impl VadAutoLeveler {
    fn process(&mut self, samples: &[f32], manual_gain_db: f32, enabled: bool) -> Vec<f32> {
        let manual_gain_db = manual_gain_db.clamp(0.0, 18.0);
        if !enabled {
            self.auto_gain_db = 0.0;
            return apply_gain(samples, manual_gain_db);
        }

        let (rms, peak) = rms_and_peak(samples);
        let rms_dbfs = amplitude_to_dbfs(rms);
        let peak_dbfs = amplitude_to_dbfs(peak);
        let desired_gain = if peak_dbfs <= -68.0 || rms_dbfs <= -78.0 {
            0.0
        } else {
            let rms_gain = -20.0 - (rms_dbfs + manual_gain_db);
            let peak_room = -3.0 - (peak_dbfs + manual_gain_db);
            rms_gain.min(peak_room).clamp(0.0, 24.0)
        };

        if desired_gain >= self.auto_gain_db {
            self.auto_gain_db = desired_gain;
        } else {
            self.auto_gain_db = self.auto_gain_db * 0.9 + desired_gain * 0.1;
            if self.auto_gain_db < 0.05 {
                self.auto_gain_db = 0.0;
            }
        }
        apply_gain_db(samples, manual_gain_db + self.auto_gain_db)
    }
}

#[derive(Debug, Clone)]
pub(crate) struct GameCaptureConfig {
    pub selected_pid: u32,
    pub effective_pid: u32,
    pub capture_mode: GameCaptureMode,
    pub vad_gain_db: f32,
    pub output_device_id: Option<String>,
    pub output_device_name: Option<String>,
    pub cloud_scan_enabled: bool,
}

pub(crate) fn list_game_output_devices() -> Result<Vec<AudioOutputDevice>> {
    let mut outputs = map_output_devices(devices()?);
    outputs.sort_by(|left, right| {
        right
            .is_default
            .cmp(&left.is_default)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });
    Ok(outputs)
}

fn map_output_devices(devices: Vec<DeviceInfo>) -> Vec<AudioOutputDevice> {
    devices
        .into_iter()
        .filter(|device| device.source_kind == SourceKind::SystemLoopback)
        .map(|device| AudioOutputDevice {
            id: device.id,
            name: device.name,
            is_default: device.is_default,
            sample_rate: device.sample_rate,
            channels: device.channels,
        })
        .collect()
}

pub(crate) fn resolve_game_output_device(selected_id: Option<&str>) -> Result<AudioOutputDevice> {
    let devices = list_game_output_devices()?;
    match selected_id {
        Some(id) => devices
            .into_iter()
            .find(|device| device.id == id)
            .ok_or_else(|| anyhow!("ไม่พบอุปกรณ์ output ที่เลือก: {id}")),
        None => devices
            .into_iter()
            .find(|device| device.is_default)
            .ok_or_else(|| anyhow!("ไม่พบ Windows default output device")),
    }
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
    voice_chat: Mutex<Option<CaptureHandle>>,
    microphone: Mutex<Option<CaptureHandle>>,
}

impl AudioManager {
    pub fn start_game(
        &self,
        app: AppHandle,
        config: GameCaptureConfig,
        worker: WorkerManager,
        groq_stt: GroqSttManager,
    ) -> Result<()> {
        self.stop_game();
        if !processes::process_is_alive(config.selected_pid) {
            return Err(anyhow!("process {} ไม่ได้ทำงานแล้ว", config.selected_pid));
        }
        if config.capture_mode == GameCaptureMode::ProcessTree
            && !processes::process_is_alive(config.effective_pid)
        {
            return Err(anyhow!(
                "process root {} ไม่ได้ทำงานแล้ว",
                config.effective_pid
            ));
        }
        worker.reset_stream(StreamKind::Game);
        groq_stt.reset_stream(StreamKind::Game);
        let handle = spawn_capture(app, StreamKind::Game, Some(config), Some(worker), groq_stt)?;
        *self.game.lock().expect("game capture lock poisoned") = Some(handle);
        Ok(())
    }

    pub fn stop_game(&self) {
        if let Some(handle) = self.game.lock().expect("game capture lock poisoned").take() {
            handle.stop();
        }
    }

    pub fn start_voice_chat(
        &self,
        app: AppHandle,
        config: GameCaptureConfig,
        worker: WorkerManager,
        groq_stt: GroqSttManager,
    ) -> Result<()> {
        self.stop_voice_chat();
        if !processes::process_is_alive(config.selected_pid) {
            return Err(anyhow!(
                "voice chat process {} ไม่ได้ทำงานแล้ว",
                config.selected_pid
            ));
        }
        if !processes::process_is_alive(config.effective_pid) {
            return Err(anyhow!(
                "voice chat process root {} ไม่ได้ทำงานแล้ว",
                config.effective_pid
            ));
        }
        worker.reset_stream(StreamKind::VoiceChat);
        groq_stt.reset_stream(StreamKind::VoiceChat);
        let handle = spawn_capture(
            app,
            StreamKind::VoiceChat,
            Some(config),
            Some(worker),
            groq_stt,
        )?;
        *self
            .voice_chat
            .lock()
            .expect("voice chat capture lock poisoned") = Some(handle);
        Ok(())
    }

    pub fn stop_voice_chat(&self) {
        if let Some(handle) = self
            .voice_chat
            .lock()
            .expect("voice chat capture lock poisoned")
            .take()
        {
            handle.stop();
        }
    }

    pub fn start_microphone(&self, app: AppHandle, groq_stt: GroqSttManager) -> Result<()> {
        let mut guard = self.microphone.lock().expect("mic capture lock poisoned");
        if guard.is_some() {
            return Ok(());
        }
        *guard = Some(spawn_capture(
            app,
            StreamKind::Microphone,
            None,
            None,
            groq_stt,
        )?);
        Ok(())
    }

    pub fn stop_microphone(&self) {
        if let Some(handle) = self
            .microphone
            .lock()
            .expect("mic capture lock poisoned")
            .take()
        {
            handle.stop();
        }
    }

    pub fn stop_all(&self) {
        self.stop_game();
        self.stop_voice_chat();
        self.stop_microphone();
    }
}

fn spawn_capture(
    app: AppHandle,
    stream_kind: StreamKind,
    game_config: Option<GameCaptureConfig>,
    worker: Option<WorkerManager>,
    groq_stt: GroqSttManager,
) -> Result<CaptureHandle> {
    let stop = Arc::new(AtomicBool::new(false));
    let thread_stop = stop.clone();
    let join = thread::Builder::new()
        .name(format!("gamelingo-capture-{stream_kind:?}"))
        .spawn(move || {
            let (source_kind, target_pid) =
                capture_source_config(stream_kind, game_config.as_ref());
            let device_id = capture_device_id(stream_kind, game_config.as_ref());
            let config = StreamConfig {
                kind: source_kind,
                device_id,
                target_pid,
                mode: ProcessMode::Include,
                output: OutputFormat {
                    sample_rate: 16_000,
                    channels: capture_output_channels(stream_kind),
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
            let capture_started = Instant::now();
            let mut last_meter_emit = Instant::now();
            let mut last_cloud_scan_check = Instant::now();
            let mut last_audio_received: Option<Instant> = None;
            let mut last_audible_received: Option<Instant> = None;
            let mut meter_sum_squares = 0.0_f64;
            let mut meter_peak = 0.0_f32;
            let mut meter_samples = 0_u64;
            let mut vad_leveler = VadAutoLeveler::default();
            let mut vad_auto_gain_db = 0.0_f32;
            let mut dropped = 0_u64;
            while !thread_stop.load(Ordering::Relaxed) {
                let mut had_audio = false;
                while let Some(chunk) = stream.poll_chunk() {
                    had_audio = true;
                    let mono_data = match stream_kind {
                        StreamKind::Game | StreamKind::VoiceChat => {
                            downmix_stereo_voice_preserving(&chunk.data)
                        }
                        StreamKind::Microphone => chunk.data,
                    };
                    if stream_kind != StreamKind::Microphone {
                        last_audio_received = Some(Instant::now());
                        if mono_data.iter().any(|sample| sample.abs() > 0.0001) {
                            last_audible_received = Some(Instant::now());
                        }
                        accumulate_levels(
                            &mono_data,
                            &mut meter_sum_squares,
                            &mut meter_peak,
                            &mut meter_samples,
                        );
                    }
                    let span = groq_stt.ingest_audio(stream_kind, &mono_data);
                    if let Some(worker) = worker.as_ref() {
                        let samples = game_config
                            .as_ref()
                            .map(|config| {
                                let samples = vad_leveler.process(
                                    &mono_data,
                                    config.vad_gain_db,
                                    config.capture_mode == GameCaptureMode::SystemOutput,
                                );
                                vad_auto_gain_db = vad_leveler.auto_gain_db;
                                samples
                            })
                            .unwrap_or(mono_data);
                        if !worker.send_audio(stream_kind, span.start_sample_cursor, samples) {
                            dropped += 1;
                        }
                    }
                }
                while let Some(event) = stream.poll_event() {
                    let _ = app.emit("capture-log", format!("{stream_kind:?}: {event:?}"));
                }
                if stream_kind != StreamKind::Microphone
                    && last_process_check.elapsed() >= Duration::from_secs(1)
                {
                    last_process_check = Instant::now();
                    if game_config
                        .as_ref()
                        .is_some_and(|config| !processes::process_is_alive(config.selected_pid))
                    {
                        let reason = match stream_kind {
                            StreamKind::Game => "game_process_exited",
                            StreamKind::VoiceChat => "voice_chat_process_exited",
                            StreamKind::Microphone => unreachable!(),
                        };
                        let _ = app.emit("capture-ended", reason);
                        break;
                    }
                }
                if stream_kind != StreamKind::Microphone
                    && last_meter_emit.elapsed() >= Duration::from_millis(200)
                {
                    emit_playback_audio_diagnostics(
                        &app,
                        stream_kind,
                        game_config.as_ref().expect("game capture config"),
                        capture_started,
                        last_audio_received,
                        last_audible_received,
                        meter_sum_squares,
                        meter_peak,
                        meter_samples,
                        vad_auto_gain_db,
                        dropped,
                    );
                    last_meter_emit = Instant::now();
                    meter_sum_squares = 0.0;
                    meter_peak = 0.0;
                    meter_samples = 0;
                }
                if stream_kind != StreamKind::Microphone
                    && game_config
                        .as_ref()
                        .is_some_and(|config| config.cloud_scan_enabled)
                    && last_cloud_scan_check.elapsed() >= Duration::from_millis(250)
                {
                    last_cloud_scan_check = Instant::now();
                    groq_stt.maybe_enqueue_auto_scan(app.clone(), stream_kind);
                }
                if !had_audio {
                    thread::sleep(Duration::from_millis(5));
                }
            }
            stream.stop();
            if let Some(worker) = worker.as_ref() {
                worker.finalize_stream(stream_kind);
            }
            if dropped > 0 {
                let _ = app.emit(
                    "capture-log",
                    format!("ทิ้ง audio chunks {dropped} ชุดเพราะ worker ช้า"),
                );
            }
            if stream_kind != StreamKind::Microphone {
                clear_playback_audio_diagnostics(&app, stream_kind);
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
        if stream_kind == StreamKind::Game {
            runtime.last_error = Some(message.clone());
            runtime.status_message = "เปิด audio capture ไม่สำเร็จ จะลองใหม่".into();
            runtime.attached_process = None;
            runtime.effective_capture_pid = None;
            runtime.effective_capture_name = None;
            runtime.effective_output_device_id = None;
            runtime.effective_output_device_name = None;
            runtime.effective_output_device_is_default = false;
            runtime.game_audio_rms_dbfs = None;
            runtime.game_audio_peak_dbfs = None;
            runtime.game_audio_last_seen_at_ms = None;
            runtime.game_vad_active = false;
            runtime.effective_vad_auto_gain_db = 0.0;
            runtime.capture_warning = Some(message.clone());
        } else if stream_kind == StreamKind::VoiceChat {
            runtime.status_message = "Voice chat capture มีปัญหา แต่ GAME ยังทำงานต่อ".into();
            runtime.voice_chat_attached_process = None;
            runtime.voice_chat_effective_capture_pid = None;
            runtime.voice_chat_effective_capture_name = None;
            runtime.voice_chat_audio_rms_dbfs = None;
            runtime.voice_chat_audio_peak_dbfs = None;
            runtime.voice_chat_audio_last_seen_at_ms = None;
            runtime.voice_chat_vad_active = false;
            runtime.voice_chat_capture_warning = Some(message.clone());
        } else {
            runtime.last_error = Some(message.clone());
            runtime.status_message = "เปิด audio capture ไม่สำเร็จ จะลองใหม่".into();
            runtime.microphone_active = false;
        }
    });
    let _ = app.emit("capture-error", message.clone());
    let _ = app.emit("pipeline-error", message);
    let _ = app.emit("runtime-state", runtime);
}

fn accumulate_levels(samples: &[f32], sum_squares: &mut f64, peak: &mut f32, count: &mut u64) {
    for sample in samples.iter().copied() {
        let sample = sample.clamp(-1.0, 1.0);
        *sum_squares += f64::from(sample) * f64::from(sample);
        *peak = peak.max(sample.abs());
    }
    *count = count.saturating_add(samples.len() as u64);
}

fn capture_source_config(
    stream_kind: StreamKind,
    game_config: Option<&GameCaptureConfig>,
) -> (SourceKind, Option<u32>) {
    match (stream_kind, game_config) {
        (StreamKind::Game, Some(config))
            if config.capture_mode == GameCaptureMode::SystemOutput =>
        {
            (SourceKind::SystemLoopback, None)
        }
        (StreamKind::Game, Some(config)) => {
            (SourceKind::ProcessLoopback, Some(config.effective_pid))
        }
        (StreamKind::VoiceChat, Some(config)) => {
            (SourceKind::ProcessLoopback, Some(config.effective_pid))
        }
        _ => (SourceKind::Mic, None),
    }
}

fn capture_device_id(
    stream_kind: StreamKind,
    game_config: Option<&GameCaptureConfig>,
) -> Option<String> {
    match (stream_kind, game_config) {
        (StreamKind::Game, Some(config))
            if config.capture_mode == GameCaptureMode::SystemOutput =>
        {
            config.output_device_id.clone()
        }
        _ => None,
    }
}

fn capture_output_channels(stream_kind: StreamKind) -> u16 {
    match stream_kind {
        StreamKind::Game | StreamKind::VoiceChat => 2,
        StreamKind::Microphone => 1,
    }
}

fn downmix_stereo_voice_preserving(stereo: &[f32]) -> Vec<f32> {
    if stereo.len() < 2 {
        return stereo.to_vec();
    }
    let mut left_energy = 0.0_f64;
    let mut right_energy = 0.0_f64;
    for frame in stereo.chunks_exact(2) {
        left_energy += f64::from(frame[0]) * f64::from(frame[0]);
        right_energy += f64::from(frame[1]) * f64::from(frame[1]);
    }
    let selected_channel = usize::from(right_energy > left_energy);
    stereo
        .chunks_exact(2)
        .map(|frame| frame[selected_channel])
        .collect()
}

fn apply_gain(samples: &[f32], gain_db: f32) -> Vec<f32> {
    apply_gain_db(samples, gain_db.clamp(0.0, 18.0))
}

fn apply_gain_db(samples: &[f32], gain_db: f32) -> Vec<f32> {
    let gain = 10.0_f32.powf(gain_db.clamp(0.0, 42.0) / 20.0);
    samples
        .iter()
        .map(|sample| (sample * gain).clamp(-1.0, 1.0))
        .collect()
}

fn rms_and_peak(samples: &[f32]) -> (f32, f32) {
    if samples.is_empty() {
        return (0.0, 0.0);
    }
    let mut sum_squares = 0.0_f64;
    let mut peak = 0.0_f32;
    for sample in samples.iter().copied() {
        let sample = sample.clamp(-1.0, 1.0);
        sum_squares += f64::from(sample) * f64::from(sample);
        peak = peak.max(sample.abs());
    }
    (((sum_squares / samples.len() as f64).sqrt()) as f32, peak)
}

fn amplitude_to_dbfs(amplitude: f32) -> f32 {
    if amplitude <= 0.000_015_848_932 {
        -96.0
    } else {
        (20.0 * amplitude.log10()).clamp(-96.0, 0.0)
    }
}

#[allow(clippy::too_many_arguments)]
fn emit_playback_audio_diagnostics(
    app: &AppHandle,
    stream_kind: StreamKind,
    config: &GameCaptureConfig,
    capture_started: Instant,
    last_audio_received: Option<Instant>,
    last_audible_received: Option<Instant>,
    sum_squares: f64,
    peak: f32,
    sample_count: u64,
    vad_auto_gain_db: f32,
    dropped: u64,
) {
    let levels = (sample_count > 0).then(|| {
        let rms = (sum_squares / sample_count as f64).sqrt() as f32;
        (amplitude_to_dbfs(rms), amplitude_to_dbfs(peak))
    });
    let no_audio_for = last_audio_received
        .map(|last| last.elapsed())
        .unwrap_or_else(|| capture_started.elapsed());
    let no_audible_for = last_audible_received
        .map(|last| last.elapsed())
        .unwrap_or_else(|| capture_started.elapsed());
    let source_label = if stream_kind == StreamKind::VoiceChat {
        "voice chat"
    } else {
        "เกม"
    };
    let warning = if dropped > 0 {
        Some(format!(
            "Silero VAD ตามเสียง {source_label} ไม่ทันและทิ้ง audio ไป {dropped} ชุด กรุณาลดภาระเครื่อง"
        ))
    } else if no_audio_for >= Duration::from_secs(3) {
        Some(match config.capture_mode {
            GameCaptureMode::ProcessTree if stream_kind == StreamKind::VoiceChat => {
                "ยังไม่พบเสียงจาก process voice chat กรุณาตรวจ process ที่เลือก".into()
            }
            GameCaptureMode::ProcessTree => {
                "ยังไม่พบเสียงจาก process เกม ลองเปิด System Output fallback".into()
            }
            GameCaptureMode::SystemOutput => format!(
                "ยังไม่ได้รับ audio frame จาก {} กรุณาเลือกอุปกรณ์ที่ได้ยิน Mistfall อยู่",
                config
                    .output_device_name
                    .as_deref()
                    .unwrap_or("System Output")
            ),
        })
    } else if no_audible_for >= Duration::from_secs(3) {
        Some(match config.capture_mode {
            GameCaptureMode::ProcessTree if stream_kind == StreamKind::VoiceChat => {
                "เสียงจาก process voice chat เป็น digital silence กรุณาตรวจ process ที่เลือก".into()
            }
            GameCaptureMode::ProcessTree => {
                "เสียงจาก process เกมเป็น digital silence ลองเปิด System Output fallback".into()
            }
            GameCaptureMode::SystemOutput => {
                format!(
                    "{} เป็น digital silence กรุณาตรวจว่า Mistfall ใช้อุปกรณ์นี้อยู่",
                    config
                        .output_device_name
                        .as_deref()
                        .unwrap_or("System Output")
                )
            }
        })
    } else {
        None
    };
    let state = app.state::<AppState>();
    let runtime = state.update_runtime(|runtime| {
        if stream_kind == StreamKind::VoiceChat {
            runtime.voice_chat_audio_rms_dbfs = levels.map(|value| value.0);
            runtime.voice_chat_audio_peak_dbfs = levels.map(|value| value.1);
            if sample_count > 0 {
                runtime.voice_chat_audio_last_seen_at_ms =
                    Some(chrono::Utc::now().timestamp_millis());
            }
            runtime.voice_chat_dropped_audio_chunks = dropped;
            runtime.voice_chat_capture_warning = warning;
        } else {
            runtime.game_audio_rms_dbfs = levels.map(|value| value.0);
            runtime.game_audio_peak_dbfs = levels.map(|value| value.1);
            if sample_count > 0 {
                runtime.game_audio_last_seen_at_ms = Some(chrono::Utc::now().timestamp_millis());
            }
            runtime.dropped_audio_chunks = dropped;
            runtime.effective_vad_auto_gain_db = vad_auto_gain_db;
            runtime.capture_warning = warning;
        }
    });
    let _ = app.emit("runtime-state", runtime);
}

fn clear_playback_audio_diagnostics(app: &AppHandle, stream_kind: StreamKind) {
    let state = app.state::<AppState>();
    let runtime = state.update_runtime(|runtime| {
        if stream_kind == StreamKind::VoiceChat {
            runtime.voice_chat_audio_rms_dbfs = None;
            runtime.voice_chat_audio_peak_dbfs = None;
            runtime.voice_chat_audio_last_seen_at_ms = None;
            runtime.voice_chat_vad_active = false;
            runtime.voice_chat_dropped_audio_chunks = 0;
            runtime.voice_chat_capture_warning = None;
        } else {
            runtime.game_audio_rms_dbfs = None;
            runtime.game_audio_peak_dbfs = None;
            runtime.game_audio_last_seen_at_ms = None;
            runtime.game_vad_active = false;
            runtime.effective_vad_auto_gain_db = 0.0;
            runtime.dropped_audio_chunks = 0;
            runtime.capture_warning = None;
        }
    });
    let _ = app.emit("runtime-state", runtime);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_known_amplitudes_to_dbfs() {
        assert!((amplitude_to_dbfs(1.0) - 0.0).abs() < 0.001);
        assert!((amplitude_to_dbfs(0.5) + 6.0206).abs() < 0.01);
        assert_eq!(amplitude_to_dbfs(0.0), -96.0);
    }

    #[test]
    fn vad_gain_clamps_without_changing_the_input() {
        let input = vec![0.25, -0.75];
        let gained = apply_gain(&input, 12.0);
        assert_eq!(input, vec![0.25, -0.75]);
        assert!(gained[0] > input[0]);
        assert_eq!(gained[1], -1.0);
    }

    #[test]
    fn system_output_auto_leveler_lifts_quiet_vad_copy_only() {
        let input = vec![0.004; 512];
        let mut leveler = VadAutoLeveler::default();
        let output = leveler.process(&input, 18.0, true);

        assert_eq!(input, vec![0.004; 512]);
        assert!(leveler.auto_gain_db > 9.5);
        assert!(rms_and_peak(&output).0 >= 0.08);
        assert!(output.iter().all(|sample| sample.abs() <= 1.0));
    }

    #[test]
    fn process_tree_uses_manual_gain_without_auto_leveling() {
        let input = vec![0.004; 512];
        let mut leveler = VadAutoLeveler::default();
        let output = leveler.process(&input, 9.0, false);

        assert_eq!(leveler.auto_gain_db, 0.0);
        assert!((output[0] - input[0] * 10.0_f32.powf(9.0 / 20.0)).abs() < 0.000_001);
    }

    #[test]
    fn level_accumulator_reports_rms_and_peak() {
        let mut sum = 0.0;
        let mut peak = 0.0;
        let mut count = 0;
        accumulate_levels(&[0.5, -0.5], &mut sum, &mut peak, &mut count);
        assert_eq!(count, 2);
        assert_eq!(peak, 0.5);
        assert!(((sum / count as f64).sqrt() - 0.5).abs() < 0.0001);
    }

    #[test]
    fn capture_mode_selects_process_or_system_loopback() {
        let mut config = GameCaptureConfig {
            selected_pid: 10,
            effective_pid: 20,
            capture_mode: GameCaptureMode::ProcessTree,
            vad_gain_db: 0.0,
            output_device_id: Some("Speakers (PRO)".into()),
            output_device_name: Some("Speakers (PRO)".into()),
            cloud_scan_enabled: false,
        };
        assert_eq!(
            capture_source_config(StreamKind::Game, Some(&config)),
            (SourceKind::ProcessLoopback, Some(20))
        );
        assert_eq!(capture_device_id(StreamKind::Game, Some(&config)), None);
        assert_eq!(
            capture_source_config(StreamKind::VoiceChat, Some(&config)),
            (SourceKind::ProcessLoopback, Some(20))
        );
        assert_eq!(
            capture_device_id(StreamKind::VoiceChat, Some(&config)),
            None
        );
        config.capture_mode = GameCaptureMode::SystemOutput;
        assert_eq!(
            capture_source_config(StreamKind::Game, Some(&config)),
            (SourceKind::SystemLoopback, None)
        );
        assert_eq!(
            capture_device_id(StreamKind::Game, Some(&config)).as_deref(),
            Some("Speakers (PRO)")
        );
        assert_eq!(
            capture_source_config(StreamKind::Microphone, None),
            (SourceKind::Mic, None)
        );
        assert_eq!(capture_output_channels(StreamKind::Game), 2);
        assert_eq!(capture_output_channels(StreamKind::VoiceChat), 2);
        assert_eq!(capture_output_channels(StreamKind::Microphone), 1);
    }

    #[test]
    fn stereo_downmix_preserves_out_of_phase_voice() {
        let stereo = vec![0.5, -0.5, -0.25, 0.25, 0.125, -0.125];
        let mono = downmix_stereo_voice_preserving(&stereo);

        assert_eq!(mono, vec![0.5, -0.25, 0.125]);
        assert!(mono.iter().any(|sample| sample.abs() > 0.1));
    }

    #[test]
    fn stereo_downmix_selects_the_stronger_channel_for_the_chunk() {
        let stereo = vec![0.01, 0.4, -0.01, -0.3, 0.02, 0.2];
        let mono = downmix_stereo_voice_preserving(&stereo);

        assert_eq!(mono, vec![0.4, -0.3, 0.2]);
        assert_eq!(mono.len(), stereo.len() / 2);
    }

    #[test]
    fn output_device_mapping_keeps_only_system_loopback_devices() {
        let devices = vec![
            DeviceInfo {
                id: "Microphone".into(),
                name: "Microphone".into(),
                source_kind: SourceKind::Mic,
                sample_rate: 48_000,
                channels: 1,
                is_loopback: false,
                is_default: true,
            },
            DeviceInfo {
                id: "Speakers (PRO)".into(),
                name: "Speakers (PRO)".into(),
                source_kind: SourceKind::SystemLoopback,
                sample_rate: 48_000,
                channels: 2,
                is_loopback: true,
                is_default: true,
            },
        ];

        let mapped = map_output_devices(devices);
        assert_eq!(mapped.len(), 1);
        assert_eq!(mapped[0].id, "Speakers (PRO)");
        assert_eq!(mapped[0].sample_rate, 48_000);
        assert_eq!(mapped[0].channels, 2);
        assert!(mapped[0].is_default);
    }
}
