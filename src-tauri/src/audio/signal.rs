//! Gain, metering and voice-preserving downmix on captured samples.
#[derive(Debug, Default)]
pub(super) struct VadAutoLeveler {
    pub(super) auto_gain_db: f32,
}

impl VadAutoLeveler {
    pub(super) fn process(
        &mut self,
        samples: &[f32],
        manual_gain_db: f32,
        enabled: bool,
    ) -> Vec<f32> {
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

pub(super) fn accumulate_levels(
    samples: &[f32],
    sum_squares: &mut f64,
    peak: &mut f32,
    count: &mut u64,
) {
    for sample in samples.iter().copied() {
        let sample = sample.clamp(-1.0, 1.0);
        *sum_squares += f64::from(sample) * f64::from(sample);
        *peak = peak.max(sample.abs());
    }
    *count = count.saturating_add(samples.len() as u64);
}

pub(super) fn downmix_stereo_voice_preserving(stereo: &[f32]) -> Vec<f32> {
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

pub(super) fn apply_gain(samples: &[f32], gain_db: f32) -> Vec<f32> {
    apply_gain_db(samples, gain_db.clamp(0.0, 18.0))
}

pub(super) fn apply_gain_db(samples: &[f32], gain_db: f32) -> Vec<f32> {
    let gain = 10.0_f32.powf(gain_db.clamp(0.0, 42.0) / 20.0);
    samples
        .iter()
        .map(|sample| (sample * gain).clamp(-1.0, 1.0))
        .collect()
}

pub(super) fn rms_and_peak(samples: &[f32]) -> (f32, f32) {
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

pub(super) fn amplitude_to_dbfs(amplitude: f32) -> f32 {
    if amplitude <= 0.000_015_848_932 {
        -96.0
    } else {
        (20.0 * amplitude.log10()).clamp(-96.0, 0.0)
    }
}
