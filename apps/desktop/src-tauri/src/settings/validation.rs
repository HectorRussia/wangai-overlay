use crate::models::{AppSettings, CaptureMode, OverlaySettings};
use anyhow::{anyhow, Result};

pub fn validate_portable_import(bytes: &[u8]) -> Result<()> {
    anyhow::ensure!(bytes.len() <= 8 * 1024 * 1024, "Settings file is too large");
    let value: serde_json::Value = serde_json::from_slice(bytes)?;
    anyhow::ensure!(
        (14..=16).contains(&value["schemaVersion"].as_u64().unwrap_or(0)),
        "Only schema v14, v15 or v16 settings can be imported"
    );
    let id = value["installationId"]
        .as_str()
        .ok_or_else(|| anyhow!("Missing installation ID"))?;
    uuid::Uuid::parse_str(id)?;
    for key in ["captureMode", "hotkeys", "overlay", "vad", "glossary"] {
        anyhow::ensure!(value.get(key).is_some(), "Missing settings field: {key}");
    }
    let mut settings: AppSettings = serde_json::from_value(value)?;
    settings.schema_version = 16;
    let mut normalized = settings.clone();
    normalize(&mut normalized)?;
    anyhow::ensure!(
        normalized == settings,
        "Settings need repair in the installed app before importing"
    );
    Ok(())
}

pub(super) fn normalize(settings: &mut AppSettings) -> Result<()> {
    if settings.schema_version < 11 && settings.capture_mode == CaptureMode::SystemOutput {
        settings.capture_mode = CaptureMode::ProcessTree;
        settings.rescue_scan_enabled = false;
    }
    if settings.schema_version < 3
        && settings.overlay.width == 920
        && settings.overlay.height == 240
    {
        settings.overlay.width = OverlaySettings::default().width;
        settings.overlay.height = OverlaySettings::default().height;
    }
    if settings.schema_version < 10 && settings.overlay.max_items == 3 {
        settings.overlay.max_items = 4;
    }
    settings.schema_version = 16;
    if uuid::Uuid::parse_str(&settings.installation_id).is_err() {
        settings.installation_id = uuid::Uuid::new_v4().to_string();
    }
    settings.overlay.opacity = settings.overlay.opacity.clamp(0.2, 1.0);
    settings.overlay.bubble_opacity = settings.overlay.bubble_opacity.clamp(0.6, 1.0);
    settings.overlay.text_opacity = settings.overlay.text_opacity.clamp(0.8, 1.0);
    settings.overlay.font_scale = settings.overlay.font_scale.clamp(0.7, 1.8);
    settings.overlay.incoming_translation_scale =
        settings.overlay.incoming_translation_scale.clamp(0.8, 1.6);
    settings.overlay.incoming_original_scale =
        settings.overlay.incoming_original_scale.clamp(0.8, 1.6);
    settings.overlay.outgoing_translation_scale =
        settings.overlay.outgoing_translation_scale.clamp(0.8, 1.6);
    settings.overlay.outgoing_original_scale =
        settings.overlay.outgoing_original_scale.clamp(0.8, 1.6);
    settings.overlay.fade_seconds = settings.overlay.fade_seconds.clamp(2, 60);
    settings.overlay.max_items = settings.overlay.max_items.clamp(1, 5);
    settings.overlay.width = settings.overlay.width.clamp(340, 1920);
    settings.overlay.height = settings.overlay.height.clamp(190, 720);
    for profile in [
        &mut settings.vad.process_tree,
        &mut settings.vad.system_output,
    ] {
        profile.vad_threshold = profile.vad_threshold.clamp(0.1, 0.95);
        profile.gain_db = profile.gain_db.clamp(0.0, 18.0);
    }
    settings.vad.silence_ms = settings.vad.silence_ms.clamp(250, 2_000);
    settings.vad.pre_roll_ms = settings.vad.pre_roll_ms.clamp(0, 1_000);
    settings.vad.max_utterance_ms = settings.vad.max_utterance_ms.clamp(3_000, 30_000);
    settings
        .glossary
        .retain(|term| !term.source.trim().is_empty());
    if settings.glossary.len() > 200 {
        settings.glossary.truncate(200);
    }

    let hotkeys = [
        settings.hotkeys.toggle_listening.trim(),
        settings.hotkeys.push_to_talk.trim(),
        settings.hotkeys.copy_latest.trim(),
        settings.hotkeys.edit_overlay.trim(),
    ];
    if hotkeys.iter().any(|value| value.is_empty()) {
        return Err(anyhow!("hotkey ต้องไม่ว่าง"));
    }
    for (index, hotkey) in hotkeys.iter().enumerate() {
        hotkey
            .parse::<tauri_plugin_global_shortcut::Shortcut>()
            .map_err(|error| anyhow!("ปุ่มลัด {hotkey} ไม่ถูกต้อง: {error}"))?;
        if hotkeys
            .iter()
            .skip(index + 1)
            .any(|other| hotkey.eq_ignore_ascii_case(other))
        {
            return Err(anyhow!("hotkey ซ้ำกัน: {hotkey}"));
        }
    }
    Ok(())
}
