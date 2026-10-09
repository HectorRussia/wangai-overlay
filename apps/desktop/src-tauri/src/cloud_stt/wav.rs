//! In-memory PCM conversion; capture samples are never written to disk.

pub fn f32_to_pcm16(sample: f32) -> i16 {
    if sample <= -1.0 {
        i16::MIN
    } else {
        (sample.clamp(-1.0, 1.0) * i16::MAX as f32).round() as i16
    }
}

#[cfg(any(not(feature = "local-stt"), test))]
pub fn encode_wav_pcm16(samples: &[i16], sample_rate: u32) -> Vec<u8> {
    let data_len = samples.len().saturating_mul(2).min(u32::MAX as usize) as u32;
    let mut wav = Vec::with_capacity(44 + data_len as usize);
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&(36_u32.saturating_add(data_len)).to_le_bytes());
    wav.extend_from_slice(b"WAVEfmt ");
    wav.extend_from_slice(&16_u32.to_le_bytes());
    wav.extend_from_slice(&1_u16.to_le_bytes());
    wav.extend_from_slice(&1_u16.to_le_bytes());
    wav.extend_from_slice(&sample_rate.to_le_bytes());
    wav.extend_from_slice(&sample_rate.saturating_mul(2).to_le_bytes());
    wav.extend_from_slice(&2_u16.to_le_bytes());
    wav.extend_from_slice(&16_u16.to_le_bytes());
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&data_len.to_le_bytes());
    for sample in samples.iter().take(data_len as usize / 2) {
        wav.extend_from_slice(&sample.to_le_bytes());
    }
    wav
}
