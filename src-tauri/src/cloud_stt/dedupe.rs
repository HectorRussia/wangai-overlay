use super::constants::RECENT_INCOMING_TEXT_LIMIT;
use std::collections::VecDeque;

pub(super) fn normalize_transcript_for_dedupe(text: &str) -> String {
    text.to_lowercase()
        .chars()
        .map(|character| {
            if character.is_whitespace() || character.is_ascii_punctuation() {
                ' '
            } else {
                character
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

pub(super) fn should_skip_or_record(
    recent: &mut VecDeque<String>,
    normalized: String,
    automatic_cloud_scan: bool,
) -> bool {
    let duplicate = automatic_cloud_scan
        && recent.iter().any(|previous| {
            previous == &normalized
                || (normalized.len() >= 8
                    && previous.len() >= normalized.len()
                    && previous.contains(&normalized))
                || (normalized.len() >= 8
                    && normalized.len().saturating_sub(previous.len()) <= 12
                    && normalized.contains(previous))
        });
    if duplicate {
        return true;
    }
    recent.push_back(normalized);
    while recent.len() > RECENT_INCOMING_TEXT_LIMIT {
        recent.pop_front();
    }
    false
}
