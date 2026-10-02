//! Existing audio limits; changing these is a behavior change.

pub(super) const SAMPLE_RATE: usize = 16_000;
pub(super) const MAX_CAPTURE_SAMPLES: usize = SAMPLE_RATE * 30;
pub(super) const MIN_INCOMING_SAMPLES: usize = SAMPLE_RATE / 4;
pub(super) const MIN_MICROPHONE_SAMPLES: usize = SAMPLE_RATE / 5;
pub(super) const INCOMING_PROBE_SAMPLES: usize = SAMPLE_RATE * 6;
pub(super) const AUTO_SCAN_WINDOW_SAMPLES: usize = SAMPLE_RATE * 8;
pub(super) const AUTO_SCAN_STEP_SAMPLES: u64 = (SAMPLE_RATE * 6) as u64;
pub(super) const RECENT_INCOMING_TEXT_LIMIT: usize = 8;
pub(super) const NEAR_SILENCE_DBFS: f32 = -60.0;

