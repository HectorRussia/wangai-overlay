//! One shutdown path for Quit and verified updates. Never install while cleanup is pending.
use crate::{models::StreamKind, state::AppState};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Condvar, Mutex, MutexGuard,
};
use std::time::Duration;
use tauri::{AppHandle, Manager};

#[derive(Default)]
pub struct Lifecycle {
    closing: AtomicBool,
    operations: Mutex<()>,
    result: Mutex<Option<Result<(), String>>>,
    finished: Condvar,
}
impl Lifecycle {
    pub fn is_closing(&self) -> bool {
        self.closing.load(Ordering::SeqCst)
    }
    pub fn operation(&self) -> anyhow::Result<MutexGuard<'_, ()>> {
        let guard = self.operations.lock().unwrap();
        anyhow::ensure!(!self.is_closing(), "กำลังปิดระบบเพื่ออัปเดต กรุณารอสักครู่");
        Ok(guard)
    }
}

pub fn shutdown(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    let lifecycle = &state.lifecycle;
    if !lifecycle.closing.swap(true, Ordering::SeqCst) {
        let handle = app.clone();
        std::thread::spawn(move || {
            let state = handle.state::<AppState>();
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                let _guard = state.lifecycle.operations.lock().unwrap();
                // Invalidates every pending result before touching native capture.
                state.ai_stt.reset_stream(StreamKind::Incoming);
                state.ai_stt.reset_stream(StreamKind::Microphone);
                let worker_result = state
                    .worker
                    .stop()
                    .map_err(|_| "หยุด Silero worker ไม่สำเร็จ จึงยังไม่ติดตั้งอัปเดต".to_string());
                state.audio.stop_all();
                state.update_runtime(|r| {
                    r.listening = false;
                    r.microphone_active = false;
                });
                state
                    .settings
                    .save()
                    .map_err(|_| "บันทึกการตั้งค่าก่อนอัปเดตไม่สำเร็จ".to_string())
                    .and(worker_result)
            }))
            .unwrap_or_else(|_| Err("ปิดระบบเสียงไม่สำเร็จ กรุณาปิดแอปแล้วลองใหม่".into()));
            *state.lifecycle.result.lock().unwrap() = Some(result);
            state.lifecycle.finished.notify_all();
        });
    }
    let (result, _) = lifecycle
        .finished
        .wait_timeout_while(
            lifecycle.result.lock().unwrap(),
            Duration::from_secs(10),
            |r| r.is_none(),
        )
        .unwrap();
    result
        .clone()
        .unwrap_or_else(|| Err("ระบบเสียงยังไม่หยุด จึงยังไม่ติดตั้งอัปเดต กรุณาปิดแอปแล้วลองใหม่".into()))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn closing_rejects_new_capture_operations() {
        let lifecycle = Lifecycle::default();
        assert!(lifecycle.operation().is_ok());
        lifecycle.closing.store(true, Ordering::SeqCst);
        assert!(lifecycle.operation().is_err());
    }
}
