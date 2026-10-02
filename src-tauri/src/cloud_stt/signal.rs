use super::constants::SAMPLE_RATE;

pub(super) fn has_adaptive_speech_activity(samples: &[i16]) -> bool {
    const FRAME_SAMPLES: usize = SAMPLE_RATE / 50;
    const REQUIRED_ACTIVE_FRAMES: usize = 15;
    if samples.len() < SAMPLE_RATE / 4 {
        return false;
    }
    let peak = samples
        .iter()
        .map(|sample| i32::from(*sample).unsigned_abs())
        .max()
        .unwrap_or_default() as f32
        / i16::MAX as f32;
    if linear_to_dbfs(peak) < -55.0 {
        return false;
    }
    let mut frame_levels = samples
        .chunks_exact(FRAME_SAMPLES)
        .map(|frame| {
            let sum = frame.iter().fold(0.0_f64, |total, sample| {
                let normalized = f64::from(*sample) / f64::from(i16::MAX);
                total + normalized * normalized
            });
            linear_to_dbfs((sum / frame.len() as f64).sqrt() as f32)
        })
        .collect::<Vec<_>>();
    if frame_levels.is_empty() {
        return false;
    }
    let mut sorted = frame_levels.clone();
    sorted.sort_by(|left, right| left.total_cmp(right));
    let noise_floor = sorted[sorted.len() / 5];
    if sorted.last().copied().unwrap_or(noise_floor) - noise_floor < 3.0 {
        return false;
    }
    let activity_floor = (noise_floor + 6.0).clamp(-60.0, -35.0);
    frame_levels
        .drain(..)
        .filter(|level| *level >= activity_floor)
        .count()
        >= REQUIRED_ACTIVE_FRAMES
}

pub(super) fn linear_to_dbfs(value: f32) -> f32 {
    if value <= 0.000_015_848_932 {
        -96.0
    } else {
        (20.0 * value.log10()).clamp(-96.0, 0.0)
    }
}

pub(super) fn rms_dbfs(samples: &[i16]) -> f32 {
    if samples.is_empty() {
        return f32::NEG_INFINITY;
    }
    let mean_square = samples
        .iter()
        .map(|sample| {
            let normalized = *sample as f64 / i16::MAX as f64;
            normalized * normalized
        })
        .sum::<f64>()
        / samples.len() as f64;
    let rms = mean_square.sqrt();
    if rms <= f64::EPSILON {
        f32::NEG_INFINITY
    } else {
        (20.0 * rms.log10()) as f32
    }
}

pub(super) fn automatic_scan_samples(samples: Vec<i16>) -> Vec<i16> {
    samples
}
