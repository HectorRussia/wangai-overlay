//! Tolerant desktop decoding intentionally differs from strict gateway DTOs.
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct TranscriptionResponse {
    pub(super) text: String,
    #[serde(default)]
    pub(super) segments: Vec<TranscriptionSegment>,
}

impl TranscriptionResponse {
    pub(super) fn is_low_confidence(&self) -> bool {
        if self.segments.is_empty() {
            return true;
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
pub(super) struct TranscriptionSegment {
    #[serde(default)]
    pub(super) start: Option<f32>,
    #[serde(default)]
    pub(super) end: Option<f32>,
    #[serde(default)]
    pub(super) avg_logprob: Option<f32>,
    #[serde(default)]
    pub(super) no_speech_prob: Option<f32>,
    #[serde(default)]
    pub(super) compression_ratio: Option<f32>,
}
