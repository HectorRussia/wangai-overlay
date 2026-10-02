use std::{collections::VecDeque, sync::{Arc, atomic::AtomicU64}};
use crate::models::StreamKind;
use super::constants::*;

pub(super) struct CaptureState {
    pub(super) pre_roll_samples: usize,
    pub(super) incoming_ring_capacity: usize,
    pub(super) incoming: StreamBuffer,
    pub(super) microphone: StreamBuffer,
    pub(super) recent_incoming_texts: VecDeque<String>,
}

impl CaptureState {
    pub(super) fn new(pre_roll_ms: u64, silence_ms: u64, max_utterance_ms: u64) -> Self {
        Self {
            pre_roll_samples: millis_to_samples(pre_roll_ms),
            incoming_ring_capacity: incoming_ring_capacity(silence_ms, max_utterance_ms),
            incoming: StreamBuffer::default(),
            microphone: StreamBuffer::default(),
            recent_incoming_texts: VecDeque::new(),
        }
    }

    pub(super) fn stream(&self, stream: StreamKind) -> &StreamBuffer {
        match stream {
            StreamKind::Incoming => &self.incoming,
            StreamKind::Microphone => &self.microphone,
        }
    }

    pub(super) fn stream_mut(&mut self, stream: StreamKind) -> &mut StreamBuffer {
        match stream {
            StreamKind::Incoming => &mut self.incoming,
            StreamKind::Microphone => &mut self.microphone,
        }
    }
}

#[derive(Default)]
pub(super) struct StreamBuffer {
    pub(super) ring: VecDeque<i16>,
    pub(super) ring_start_cursor: u64,
    pub(super) next_sample_cursor: u64,
    pub(super) incoming_utterance: Option<IncomingUtterance>,
    pub(super) microphone_active: bool,
    pub(super) microphone_samples: Vec<i16>,
    pub(super) microphone_segment_id: Option<String>,
    pub(super) microphone_started_at_ms: i64,
    pub(super) microphone_truncated: bool,
    pub(super) last_auto_scan_end_cursor: Option<u64>,
    pub(super) last_vad_activity_cursor: Option<u64>,
    pub(super) generation: Arc<AtomicU64>,
}

pub(super) struct IncomingUtterance {
    pub(super) utterance_id: u64,
    pub(super) start_cursor: u64,
    pub(super) segment_id: String,
    pub(super) started_at_ms: i64,
}

pub(super) fn incoming_ring_capacity(silence_ms: u64, max_utterance_ms: u64) -> usize {
    millis_to_samples(
        max_utterance_ms
            .saturating_add(silence_ms)
            .saturating_add(2_000),
    )
    .clamp(SAMPLE_RATE * 3, SAMPLE_RATE * 35)
    .max(AUTO_SCAN_WINDOW_SAMPLES)
}

pub(super) fn truncate_ring(buffer: &mut StreamBuffer, cap: usize) {
    while buffer.ring.len() > cap {
        buffer.ring.pop_front();
        buffer.ring_start_cursor = buffer.ring_start_cursor.saturating_add(1);
    }
}

pub(super) fn slice_ring(buffer: &StreamBuffer, start_cursor: u64, end_cursor: u64) -> Option<Vec<i16>> {
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

pub(super) fn next_auto_scan_window(buffer: &StreamBuffer) -> Option<(u64, u64)> {
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

pub(super) fn millis_to_samples(millis: u64) -> usize {
    (millis as usize).saturating_mul(SAMPLE_RATE) / 1_000
}

pub(super) fn samples_to_millis(samples: usize) -> u64 {
    (samples as u64).saturating_mul(1_000) / SAMPLE_RATE as u64
}

