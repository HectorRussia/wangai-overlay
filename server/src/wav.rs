use crate::{Failure, error::fail, UPLOAD_LIMIT};
use wangai_ai_protocol::ErrorCode;

pub fn validate_wav(bytes: &[u8]) -> Result<u64, Failure> {
    let invalid = || fail(ErrorCode::InvalidRequest);
    if bytes.len() < 44
        || bytes.len() > UPLOAD_LIMIT
        || &bytes[..4] != b"RIFF"
        || &bytes[8..12] != b"WAVE"
    {
        return Err(invalid());
    }
    let u32_at =
        |offset: usize| u32::from_le_bytes(bytes[offset..offset + 4].try_into().unwrap()) as usize;
    if u32_at(4) != bytes.len() - 8 {
        return Err(invalid());
    }
    let mut offset = 12usize;
    let mut fmt = false;
    let mut data = None;
    while offset + 8 <= bytes.len() {
        let len = u32_at(offset + 4);
        let start = offset + 8;
        let end = start
            .checked_add(len)
            .filter(|&end| end <= bytes.len())
            .ok_or_else(invalid)?;
        match &bytes[offset..offset + 4] {
            b"fmt " => {
                if fmt
                    || len < 16
                    || bytes[start..start + 4] != [1, 0, 1, 0]
                    || u32_at(start + 4) != 16_000
                    || u32_at(start + 8) != 32_000
                    || bytes[start + 12..start + 16] != [2, 0, 16, 0]
                {
                    return Err(invalid());
                }
                fmt = true;
            }
            b"data" => {
                if data.is_some() {
                    return Err(invalid());
                }
                data = Some(len);
            }
            _ => {}
        }
        offset = end + len % 2;
    }
    let size = data.ok_or_else(invalid)?;
    if !fmt || offset != bytes.len() || size == 0 || size % 2 != 0 || size > 30 * 32_000 {
        return Err(invalid());
    }
    Ok(size as u64 * 1000 / 32_000)
}

