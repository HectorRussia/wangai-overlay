use std::{
    fs,
    path::PathBuf,
    sync::{Mutex, RwLock},
    time::{Duration, Instant},
};

use anyhow::{anyhow, Context, Result};

use crate::models::{
    AppSettings, GameCaptureMode, GameVadProfile, GroqModelKind, GroqModelOption, HotkeySettings,
    OverlaySettings, VadSettings,
};

const KEYRING_SERVICE: &str = "GameLingo";
const GROQ_KEYRING_USER: &str = "groq-api-key";
const MONTHLY_BUDGET_MICROUSD: u64 = 2_000_000;
const MINIMUM_BILLED_AUDIO_MS: u64 = 10_000;

pub const STT_TURBO_MODEL: &str = "whisper-large-v3-turbo";
pub const STT_ACCURATE_MODEL: &str = "whisper-large-v3";
pub const TRANSLATION_FAST_MODEL: &str = "openai/gpt-oss-20b";
pub const TRANSLATION_ACCURATE_MODEL: &str = "openai/gpt-oss-120b";

pub struct SettingsManager {
    path: PathBuf,
    inner: RwLock<AppSettings>,
    pending_microusd: Mutex<u64>,
    last_usage_save: Mutex<Instant>,
}

impl SettingsManager {
    pub fn load(path: PathBuf) -> Result<Self> {
        let mut settings = if path.exists() {
            let data = fs::read_to_string(&path)
                .with_context(|| format!("อ่าน settings ไม่ได้: {}", path.display()))?;
            let mut value = serde_json::from_str::<serde_json::Value>(&data)
                .with_context(|| format!("settings ไม่ถูกต้อง: {}", path.display()))?;
            migrate_serialized_settings(&mut value);
            serde_json::from_value::<AppSettings>(value)
                .with_context(|| format!("settings ไม่ถูกต้อง: {}", path.display()))?
        } else {
            AppSettings::default()
        };

        reset_usage_month(&mut settings);
        settings.groq.configured = groq_key().is_ok_and(|value| !value.trim().is_empty());
        normalize(&mut settings)?;

        let manager = Self {
            path,
            inner: RwLock::new(settings),
            pending_microusd: Mutex::new(0),
            last_usage_save: Mutex::new(Instant::now() - Duration::from_secs(2)),
        };
        manager.save()?;
        Ok(manager)
    }

    pub fn snapshot(&self) -> AppSettings {
        self.inner.read().expect("settings lock poisoned").clone()
    }

    pub fn update<F>(&self, update: F) -> Result<AppSettings>
    where
        F: FnOnce(&mut AppSettings) -> Result<()>,
    {
        let mut guard = self.inner.write().expect("settings lock poisoned");
        let mut candidate = guard.clone();
        reset_usage_month(&mut candidate);
        update(&mut candidate)?;
        normalize(&mut candidate)?;
        self.save_value(&candidate)?;
        *guard = candidate.clone();
        Ok(candidate)
    }

    pub fn save(&self) -> Result<()> {
        let guard = self.inner.read().expect("settings lock poisoned");
        self.save_value(&guard)
    }

    fn save_value(&self, settings: &AppSettings) -> Result<()> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)
                .with_context(|| format!("สร้างโฟลเดอร์ settings ไม่ได้: {}", parent.display()))?;
        }
        let data = serde_json::to_string_pretty(settings)?;
        let temp_path = self.path.with_extension("json.tmp");
        fs::write(&temp_path, &data)
            .with_context(|| format!("เขียน settings ไม่ได้: {}", temp_path.display()))?;
        if self.path.exists() {
            fs::copy(&temp_path, &self.path)
                .with_context(|| format!("บันทึก settings ไม่ได้: {}", self.path.display()))?;
            fs::remove_file(&temp_path).ok();
        } else {
            fs::rename(&temp_path, &self.path)
                .with_context(|| format!("บันทึก settings ไม่ได้: {}", self.path.display()))?;
        }
        let persisted = fs::read_to_string(&self.path)
            .with_context(|| format!("ตรวจสอบ settings ไม่ได้: {}", self.path.display()))?;
        if persisted != data {
            return Err(anyhow!(
                "ตรวจสอบ settings ไม่ผ่าน: ค่าที่อ่านกลับไม่ตรงกับค่าที่บันทึก ({})",
                self.path.display()
            ));
        }
        Ok(())
    }

    pub fn update_hotkeys(&self, hotkeys: HotkeySettings) -> Result<AppSettings> {
        self.update(|settings| {
            settings.hotkeys = hotkeys;
            Ok(())
        })
    }

    pub fn update_overlay(&self, overlay: OverlaySettings) -> Result<AppSettings> {
        self.update(|settings| {
            settings.overlay = overlay;
            Ok(())
        })
    }

    pub fn update_vad(&self, vad: VadSettings) -> Result<AppSettings> {
        self.update(|settings| {
            settings.vad = vad;
            Ok(())
        })
    }

    pub fn update_game_output_device(&self, device_id: Option<String>) -> Result<AppSettings> {
        self.update(|settings| {
            settings.game_output_device_id = device_id;
            Ok(())
        })
    }

    pub fn update_system_output_cloud_scan(&self, enabled: bool) -> Result<AppSettings> {
        self.update(|settings| {
            settings.system_output_cloud_scan = enabled;
            Ok(())
        })
    }

    pub fn update_groq_models(
        &self,
        game_stt_model: String,
        microphone_stt_model: String,
        translation_model: String,
    ) -> Result<AppSettings> {
        validate_stt_model(&game_stt_model)?;
        validate_stt_model(&microphone_stt_model)?;
        validate_translation_model(&translation_model)?;
        self.update(|settings| {
            settings.groq.game_stt_model = game_stt_model;
            settings.groq.microphone_stt_model = microphone_stt_model;
            settings.groq.translation_model = translation_model;
            Ok(())
        })
    }

    pub fn reserve_audio_request(&self, actual_millis: u64, model: &str) -> Result<AppSettings> {
        validate_stt_model(model)?;
        let billed_millis = actual_millis.max(MINIMUM_BILLED_AUDIO_MS);
        let cost = audio_cost_microusd(model, billed_millis)?;
        let mut guard = self.inner.write().expect("settings lock poisoned");
        if reset_usage_month(&mut guard) {
            *self.pending_microusd.lock().expect("budget lock poisoned") = 0;
        }
        let pending = *self.pending_microusd.lock().expect("budget lock poisoned");
        if guard
            .groq
            .estimated_spend_microusd
            .saturating_add(pending)
            .saturating_add(cost)
            > guard.groq.monthly_budget_microusd
        {
            return Err(anyhow!("ถึงงบ Groq รายเดือนแล้ว"));
        }
        guard.groq.actual_audio_millis =
            guard.groq.actual_audio_millis.saturating_add(actual_millis);
        guard.groq.billed_audio_millis =
            guard.groq.billed_audio_millis.saturating_add(billed_millis);
        guard.groq.estimated_spend_microusd =
            guard.groq.estimated_spend_microusd.saturating_add(cost);
        self.save_usage_if_due(&guard)?;
        Ok(guard.clone())
    }

    pub fn reserve_translation(
        &self,
        model: &str,
        prompt_tokens: u64,
        completion_tokens: u64,
    ) -> Result<u64> {
        validate_translation_model(model)?;
        let mut guard = self.inner.write().expect("settings lock poisoned");
        if reset_usage_month(&mut guard) {
            *self.pending_microusd.lock().expect("budget lock poisoned") = 0;
        }
        let reserve = translation_cost_microusd(model, prompt_tokens, completion_tokens)?;
        let mut pending = self.pending_microusd.lock().expect("budget lock poisoned");
        if guard
            .groq
            .estimated_spend_microusd
            .saturating_add(*pending)
            .saturating_add(reserve)
            > guard.groq.monthly_budget_microusd
        {
            return Err(anyhow!("ถึงงบ Groq รายเดือนแล้ว"));
        }
        *pending = pending.saturating_add(reserve);
        Ok(reserve)
    }

    pub fn complete_translation(
        &self,
        reservation_microusd: u64,
        model: &str,
        prompt_tokens: u64,
        completion_tokens: u64,
    ) -> Result<AppSettings> {
        let actual_cost = translation_cost_microusd(model, prompt_tokens, completion_tokens)?;
        let mut guard = self.inner.write().expect("settings lock poisoned");
        let mut pending = self.pending_microusd.lock().expect("budget lock poisoned");
        *pending = pending.saturating_sub(reservation_microusd);
        guard.groq.prompt_tokens = guard.groq.prompt_tokens.saturating_add(prompt_tokens);
        guard.groq.completion_tokens = guard
            .groq
            .completion_tokens
            .saturating_add(completion_tokens);
        guard.groq.estimated_spend_microusd = guard
            .groq
            .estimated_spend_microusd
            .saturating_add(actual_cost);
        self.save_value(&guard)?;
        Ok(guard.clone())
    }

    pub fn cancel_translation(&self, reservation_microusd: u64) {
        let mut pending = self.pending_microusd.lock().expect("budget lock poisoned");
        *pending = pending.saturating_sub(reservation_microusd);
    }

    pub fn budget_exhausted(&self) -> bool {
        let mut settings = self.inner.write().expect("settings lock poisoned");
        if reset_usage_month(&mut settings) {
            *self.pending_microusd.lock().expect("budget lock poisoned") = 0;
            let _ = self.save_value(&settings);
        }
        let pending = *self.pending_microusd.lock().expect("budget lock poisoned");
        settings
            .groq
            .estimated_spend_microusd
            .saturating_add(pending)
            >= settings.groq.monthly_budget_microusd
    }

    fn save_usage_if_due(&self, settings: &AppSettings) -> Result<()> {
        let mut last_save = self
            .last_usage_save
            .lock()
            .expect("usage save lock poisoned");
        if last_save.elapsed() >= Duration::from_secs(1) {
            self.save_value(settings)?;
            *last_save = Instant::now();
        }
        Ok(())
    }
}

pub fn set_groq_key(key: &str) -> Result<()> {
    if key.trim().is_empty() {
        return Err(anyhow!("Groq API key ว่าง"));
    }
    let entry = keyring::Entry::new(KEYRING_SERVICE, GROQ_KEYRING_USER)?;
    entry
        .set_password(key.trim())
        .context("บันทึก Groq API key ใน Windows Credential Manager ไม่สำเร็จ")
}

pub fn groq_key() -> Result<String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, GROQ_KEYRING_USER)?;
    entry.get_password().context("ยังไม่ได้ตั้ง Groq API key")
}

pub fn clear_groq_key() -> Result<()> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, GROQ_KEYRING_USER)?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.into()),
    }
}

pub fn groq_model_catalog() -> Vec<GroqModelOption> {
    vec![
        GroqModelOption {
            id: STT_TURBO_MODEL.into(),
            label: "Whisper Large V3 Turbo".into(),
            description: "เร็วและประหยัด เหมาะกับการเล่นเกม".into(),
            kind: GroqModelKind::SpeechToText,
            input_microusd_per_million: 0,
            output_microusd_per_million: 0,
            audio_microusd_per_hour: 40_000,
        },
        GroqModelOption {
            id: STT_ACCURATE_MODEL.into(),
            label: "Whisper Large V3".into(),
            description: "แม่นกว่าเมื่อมีสำเนียงหรือเสียงเกมรบกวน".into(),
            kind: GroqModelKind::SpeechToText,
            input_microusd_per_million: 0,
            output_microusd_per_million: 0,
            audio_microusd_per_hour: 111_000,
        },
        GroqModelOption {
            id: TRANSLATION_FAST_MODEL.into(),
            label: "GPT-OSS 20B".into(),
            description: "เร็วและประหยัดสำหรับคำแปลสั้นในเกม".into(),
            kind: GroqModelKind::Translation,
            input_microusd_per_million: 75_000,
            output_microusd_per_million: 300_000,
            audio_microusd_per_hour: 0,
        },
        GroqModelOption {
            id: TRANSLATION_ACCURATE_MODEL.into(),
            label: "GPT-OSS 120B".into(),
            description: "เน้นคุณภาพภาษาไทยและบริบทที่ซับซ้อน".into(),
            kind: GroqModelKind::Translation,
            input_microusd_per_million: 150_000,
            output_microusd_per_million: 600_000,
            audio_microusd_per_hour: 0,
        },
    ]
}

pub fn validate_stt_model(model: &str) -> Result<()> {
    if matches!(model, STT_TURBO_MODEL | STT_ACCURATE_MODEL) {
        Ok(())
    } else {
        Err(anyhow!("ไม่รองรับ Groq STT model: {model}"))
    }
}

pub fn validate_translation_model(model: &str) -> Result<()> {
    if matches!(model, TRANSLATION_FAST_MODEL | TRANSLATION_ACCURATE_MODEL) {
        Ok(())
    } else {
        Err(anyhow!("ไม่รองรับ Groq translation model: {model}"))
    }
}

fn normalize(settings: &mut AppSettings) -> Result<()> {
    if settings.schema_version < 11 && settings.game_capture_mode == GameCaptureMode::SystemOutput {
        settings.game_capture_mode = GameCaptureMode::ProcessTree;
        settings.system_output_cloud_scan = false;
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
    settings.schema_version = 11;
    settings.overlay.opacity = settings.overlay.opacity.clamp(0.2, 1.0);
    settings.overlay.font_scale = settings.overlay.font_scale.clamp(0.7, 1.8);
    settings.overlay.fade_seconds = settings.overlay.fade_seconds.clamp(2, 30);
    settings.overlay.max_items = settings.overlay.max_items.clamp(1, 5);
    settings.overlay.width = settings.overlay.width.clamp(340, 1920);
    settings.overlay.height = settings.overlay.height.clamp(190, 720);
    for profile in [
        &mut settings.vad.process_tree,
        &mut settings.vad.system_output,
        &mut settings.voice_chat.vad,
    ] {
        profile.vad_threshold = profile.vad_threshold.clamp(0.1, 0.95);
        profile.gain_db = profile.gain_db.clamp(0.0, 18.0);
    }
    settings.vad.silence_ms = settings.vad.silence_ms.clamp(250, 2_000);
    settings.vad.pre_roll_ms = settings.vad.pre_roll_ms.clamp(0, 1_000);
    settings.vad.max_utterance_ms = settings.vad.max_utterance_ms.clamp(3_000, 30_000);
    settings.groq.monthly_budget_microusd = MONTHLY_BUDGET_MICROUSD;
    validate_stt_model(&settings.groq.game_stt_model)?;
    validate_stt_model(&settings.groq.microphone_stt_model)?;
    validate_translation_model(&settings.groq.translation_model)?;
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

fn migrate_serialized_settings(value: &mut serde_json::Value) {
    let schema_version = value
        .get("schemaVersion")
        .and_then(serde_json::Value::as_u64)
        .unwrap_or_default();
    if schema_version >= 7 {
        return;
    }
    let Some(vad) = value
        .get_mut("vad")
        .and_then(serde_json::Value::as_object_mut)
    else {
        return;
    };

    let legacy_threshold = vad
        .remove("vadThreshold")
        .and_then(|value| value.as_f64())
        .unwrap_or(0.5);
    let legacy_gain = vad
        .remove("gameVadGainDb")
        .and_then(|value| value.as_f64())
        .unwrap_or(0.0);
    vad.insert(
        "processTree".into(),
        serde_json::json!({
            "vadThreshold": legacy_threshold,
            "gainDb": legacy_gain,
        }),
    );
    vad.entry("systemOutput").or_insert_with(|| {
        let profile = GameVadProfile::system_output_default();
        serde_json::json!({
            "vadThreshold": profile.vad_threshold,
            "gainDb": profile.gain_db,
        })
    });
}

fn reset_usage_month(settings: &mut AppSettings) -> bool {
    let month = chrono::Local::now().format("%Y-%m").to_string();
    if settings.groq.usage_month != month {
        settings.groq.usage_month = month;
        settings.groq.actual_audio_millis = 0;
        settings.groq.billed_audio_millis = 0;
        settings.groq.prompt_tokens = 0;
        settings.groq.completion_tokens = 0;
        settings.groq.estimated_spend_microusd = 0;
        true
    } else {
        false
    }
}

pub fn audio_cost_microusd(model: &str, billed_millis: u64) -> Result<u64> {
    let rate = match model {
        STT_TURBO_MODEL => 40_000_u64,
        STT_ACCURATE_MODEL => 111_000_u64,
        _ => return Err(anyhow!("ไม่รองรับ Groq STT model: {model}")),
    };
    Ok(div_ceil(billed_millis as u128 * rate as u128, 3_600_000))
}

pub fn translation_cost_microusd(
    model: &str,
    prompt_tokens: u64,
    completion_tokens: u64,
) -> Result<u64> {
    let (input_rate, output_rate) = match model {
        TRANSLATION_FAST_MODEL => (75_000_u64, 300_000_u64),
        TRANSLATION_ACCURATE_MODEL => (150_000_u64, 600_000_u64),
        _ => return Err(anyhow!("ไม่รองรับ Groq translation model: {model}")),
    };
    Ok(
        div_ceil(prompt_tokens as u128 * input_rate as u128, 1_000_000).saturating_add(div_ceil(
            completion_tokens as u128 * output_rate as u128,
            1_000_000,
        )),
    )
}

fn div_ceil(numerator: u128, denominator: u128) -> u64 {
    numerator
        .saturating_add(denominator - 1)
        .checked_div(denominator)
        .unwrap_or(0)
        .min(u64::MAX as u128) as u64
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn rejects_duplicate_hotkeys() {
        let temp = tempfile::tempdir().expect("tempdir");
        let manager = SettingsManager::load(temp.path().join("settings.json")).expect("load");
        let result = manager.update_hotkeys(HotkeySettings {
            toggle_listening: "F8".into(),
            push_to_talk: "F8".into(),
            copy_latest: "F10".into(),
            edit_overlay: "F7".into(),
        });
        assert!(result.is_err());
    }

    #[test]
    fn clamps_overlay_values() {
        let temp = tempfile::tempdir().expect("tempdir");
        let manager = SettingsManager::load(temp.path().join("settings.json")).expect("load");
        let overlay = OverlaySettings {
            opacity: 99.0,
            max_items: 99,
            ..OverlaySettings::default()
        };
        let settings = manager.update_overlay(overlay).expect("update");
        assert_eq!(settings.overlay.opacity, 1.0);
        assert_eq!(settings.overlay.max_items, 5);
    }

    #[test]
    fn settings_round_trip() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = temp.path().join("settings.json");
        let manager = SettingsManager::load(path.clone()).expect("load");
        manager
            .update(|settings| {
                settings.auto_attach = false;
                Ok(())
            })
            .expect("update");
        let loaded = SettingsManager::load(path).expect("reload");
        assert!(!loaded.snapshot().auto_attach);
    }

    #[test]
    fn failed_persistence_does_not_change_in_memory_settings() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = temp.path().join("settings.json");
        let manager = SettingsManager::load(path.clone()).expect("load");
        let before = manager.snapshot();
        fs::remove_file(&path).expect("remove settings file");
        fs::create_dir(&path).expect("replace settings file with directory");

        let result = manager.update(|settings| {
            settings.auto_attach = !settings.auto_attach;
            Ok(())
        });

        assert!(result.is_err());
        assert_eq!(manager.snapshot(), before);
    }

    #[test]
    fn migrates_v3_settings_without_losing_user_preferences() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = temp.path().join("settings.json");
        let mut value = serde_json::to_value(AppSettings::default()).expect("serialize");
        let object = value.as_object_mut().expect("object");
        object.insert("schemaVersion".into(), 3.into());
        object.remove("groq");
        object.insert(
            "xai".into(),
            serde_json::json!({
                "configured": true,
                "model": "grok-old",
                "monthlyBudgetMicrousd": 2_000_000,
                "usageMonth": "2026-08",
                "audioMillis": 999,
                "promptTokens": 999,
                "completionTokens": 999,
                "estimatedSpendMicrousd": 999
            }),
        );
        object.insert("autoAttach".into(), false.into());
        fs::write(&path, serde_json::to_vec(&value).unwrap()).unwrap();

        let migrated = SettingsManager::load(path).expect("migrate").snapshot();
        assert_eq!(migrated.schema_version, 11);
        assert!(!migrated.auto_attach);
        assert_eq!(migrated.groq.game_stt_model, STT_ACCURATE_MODEL);
        assert_eq!(migrated.groq.microphone_stt_model, STT_TURBO_MODEL);
        assert_eq!(migrated.groq.translation_model, TRANSLATION_FAST_MODEL);
        assert_eq!(migrated.groq.estimated_spend_microusd, 0);
    }

    #[test]
    fn migrates_v4_shared_stt_model_to_stream_defaults_and_keeps_usage() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = temp.path().join("settings.json");
        let mut value = serde_json::to_value(AppSettings::default()).expect("serialize");
        let object = value.as_object_mut().expect("object");
        object.insert("schemaVersion".into(), 4.into());
        let groq = object
            .get_mut("groq")
            .and_then(serde_json::Value::as_object_mut)
            .expect("groq");
        groq.remove("gameSttModel");
        groq.remove("microphoneSttModel");
        groq.insert("sttModel".into(), STT_TURBO_MODEL.into());
        groq.insert("translationModel".into(), TRANSLATION_ACCURATE_MODEL.into());
        groq.insert("actualAudioMillis".into(), 12_345.into());
        groq.insert("billedAudioMillis".into(), 20_000.into());
        groq.insert("estimatedSpendMicrousd".into(), 42_000.into());
        fs::write(&path, serde_json::to_vec(&value).unwrap()).unwrap();

        let migrated = SettingsManager::load(path).expect("migrate").snapshot();
        assert_eq!(migrated.schema_version, 11);
        assert_eq!(migrated.groq.game_stt_model, STT_ACCURATE_MODEL);
        assert_eq!(migrated.groq.microphone_stt_model, STT_TURBO_MODEL);
        assert_eq!(migrated.groq.translation_model, TRANSLATION_ACCURATE_MODEL);
        assert_eq!(migrated.groq.actual_audio_millis, 12_345);
        assert_eq!(migrated.groq.billed_audio_millis, 20_000);
        assert_eq!(migrated.groq.estimated_spend_microusd, 42_000);
    }

    #[test]
    fn migrates_v5_capture_defaults_without_losing_existing_vad_values() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = temp.path().join("settings.json");
        let mut value = serde_json::to_value(AppSettings::default()).expect("serialize");
        let object = value.as_object_mut().expect("object");
        object.insert("schemaVersion".into(), 5.into());
        object.remove("gameCaptureMode");
        let vad = object
            .get_mut("vad")
            .and_then(serde_json::Value::as_object_mut)
            .expect("vad");
        vad.remove("gameVadGainDb");
        vad.insert("vadThreshold".into(), serde_json::json!(0.2));
        fs::write(&path, serde_json::to_vec(&value).unwrap()).unwrap();

        let migrated = SettingsManager::load(path).expect("migrate").snapshot();
        assert_eq!(migrated.schema_version, 11);
        assert_eq!(migrated.game_capture_mode, GameCaptureMode::ProcessTree);
        assert_eq!(migrated.vad.process_tree.gain_db, 0.0);
        assert_eq!(migrated.vad.process_tree.vad_threshold, 0.2);
        assert_eq!(migrated.vad.system_output.gain_db, 9.0);
        assert_eq!(migrated.vad.system_output.vad_threshold, 0.35);
    }

    #[test]
    fn migrates_v6_vad_values_to_process_tree_and_adds_system_output_preset() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = temp.path().join("settings.json");
        let mut value = serde_json::to_value(AppSettings::default()).expect("serialize");
        let object = value.as_object_mut().expect("object");
        object.insert("schemaVersion".into(), 6.into());
        let vad = object
            .get_mut("vad")
            .and_then(serde_json::Value::as_object_mut)
            .expect("vad");
        vad.remove("processTree");
        vad.remove("systemOutput");
        vad.insert("vadThreshold".into(), serde_json::json!(0.42));
        vad.insert("gameVadGainDb".into(), serde_json::json!(4.0));
        fs::write(&path, serde_json::to_vec(&value).unwrap()).unwrap();

        let migrated = SettingsManager::load(path).expect("migrate").snapshot();
        assert_eq!(migrated.schema_version, 11);
        assert_eq!(migrated.vad.process_tree.vad_threshold, 0.42);
        assert_eq!(migrated.vad.process_tree.gain_db, 4.0);
        assert_eq!(migrated.vad.system_output.vad_threshold, 0.35);
        assert_eq!(migrated.vad.system_output.gain_db, 9.0);
    }

    #[test]
    fn system_output_profile_survives_save_and_reload() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = temp.path().join("settings.json");
        let manager = SettingsManager::load(path.clone()).expect("load");
        let mut vad = manager.snapshot().vad;
        vad.system_output.vad_threshold = 0.3;
        vad.system_output.gain_db = 12.0;
        manager.update_vad(vad).expect("update");

        let loaded = SettingsManager::load(path).expect("reload").snapshot();
        assert_eq!(loaded.vad.process_tree.vad_threshold, 0.5);
        assert_eq!(loaded.vad.process_tree.gain_db, 0.0);
        assert_eq!(loaded.vad.system_output.vad_threshold, 0.3);
        assert_eq!(loaded.vad.system_output.gain_db, 12.0);
    }

    #[test]
    fn migrates_v7_with_windows_default_output_device() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = temp.path().join("settings.json");
        let mut value = serde_json::to_value(AppSettings::default()).expect("serialize");
        let object = value.as_object_mut().expect("object");
        object.insert("schemaVersion".into(), 7.into());
        object.remove("gameOutputDeviceId");
        fs::write(&path, serde_json::to_vec(&value).unwrap()).unwrap();

        let migrated = SettingsManager::load(path).expect("migrate").snapshot();
        assert_eq!(migrated.schema_version, 11);
        assert_eq!(migrated.game_output_device_id, None);
    }

    #[test]
    fn selected_output_device_survives_save_and_reload() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = temp.path().join("settings.json");
        let manager = SettingsManager::load(path.clone()).expect("load");
        manager
            .update_game_output_device(Some("Speakers (PRO)".into()))
            .expect("update output device");

        let loaded = SettingsManager::load(path).expect("reload").snapshot();
        assert_eq!(
            loaded.game_output_device_id.as_deref(),
            Some("Speakers (PRO)")
        );
    }

    #[test]
    fn migrates_v8_with_cloud_scan_disabled_and_persists_opt_in() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = temp.path().join("settings.json");
        let mut value = serde_json::to_value(AppSettings::default()).expect("serialize");
        let object = value.as_object_mut().expect("object");
        object.insert("schemaVersion".into(), 8.into());
        object.remove("systemOutputCloudScan");
        fs::write(&path, serde_json::to_vec(&value).unwrap()).unwrap();

        let manager = SettingsManager::load(path.clone()).expect("migrate");
        assert_eq!(manager.snapshot().schema_version, 11);
        assert!(!manager.snapshot().system_output_cloud_scan);
        manager
            .update_system_output_cloud_scan(true)
            .expect("enable cloud scan");

        let loaded = SettingsManager::load(path).expect("reload").snapshot();
        assert!(loaded.system_output_cloud_scan);
    }

    #[test]
    fn migrates_legacy_default_overlay_size_without_losing_position() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = temp.path().join("settings.json");
        let mut settings = AppSettings {
            schema_version: 2,
            ..AppSettings::default()
        };
        settings.overlay.width = 920;
        settings.overlay.height = 240;
        settings.overlay.x = Some(320);
        settings.overlay.y = Some(640);
        fs::write(&path, serde_json::to_vec(&settings).unwrap()).unwrap();

        let migrated = SettingsManager::load(path).expect("migrate").snapshot();
        assert_eq!(migrated.schema_version, 11);
        assert_eq!(migrated.overlay.width, 420);
        assert_eq!(migrated.overlay.height, 236);
        assert_eq!(migrated.overlay.x, Some(320));
        assert_eq!(migrated.overlay.y, Some(640));
    }

    #[test]
    fn migrates_v9_overlay_from_three_to_four_messages() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = temp.path().join("settings.json");
        let mut value = serde_json::to_value(AppSettings::default()).expect("serialize");
        let object = value.as_object_mut().expect("object");
        object.insert("schemaVersion".into(), 9.into());
        object
            .get_mut("overlay")
            .and_then(serde_json::Value::as_object_mut)
            .expect("overlay")
            .insert("maxItems".into(), 3.into());
        fs::write(&path, serde_json::to_vec(&value).unwrap()).unwrap();

        let migrated = SettingsManager::load(path).expect("migrate").snapshot();
        assert_eq!(migrated.schema_version, 11);
        assert_eq!(migrated.overlay.max_items, 4);
    }

    #[test]
    fn migrates_v10_to_isolated_processes_and_enables_voice_chat_defaults() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = temp.path().join("settings.json");
        let mut value = serde_json::to_value(AppSettings::default()).expect("serialize");
        let object = value.as_object_mut().expect("object");
        object.insert("schemaVersion".into(), 10.into());
        object.insert("gameCaptureMode".into(), "system_output".into());
        object.insert("systemOutputCloudScan".into(), true.into());
        object.remove("voiceChat");
        fs::write(&path, serde_json::to_vec(&value).unwrap()).unwrap();

        let migrated = SettingsManager::load(path).expect("migrate").snapshot();
        assert_eq!(migrated.schema_version, 11);
        assert_eq!(migrated.game_capture_mode, GameCaptureMode::ProcessTree);
        assert!(!migrated.system_output_cloud_scan);
        assert!(migrated.voice_chat.enabled);
        assert!(migrated.voice_chat.auto_detect);
        assert!(migrated.voice_chat.rescue_scan);
        assert_eq!(migrated.voice_chat.vad.vad_threshold, 0.35);
        assert_eq!(migrated.voice_chat.vad.gain_db, 6.0);
    }

    #[test]
    fn minimum_audio_billing_is_ten_seconds() {
        let temp = tempfile::tempdir().expect("tempdir");
        let manager = SettingsManager::load(temp.path().join("settings.json")).expect("load");
        let settings = manager
            .reserve_audio_request(1, STT_TURBO_MODEL)
            .expect("reserve");
        assert_eq!(settings.groq.actual_audio_millis, 1);
        assert_eq!(settings.groq.billed_audio_millis, 10_000);
        assert_eq!(
            settings.groq.estimated_spend_microusd,
            audio_cost_microusd(STT_TURBO_MODEL, 10_000).unwrap()
        );
    }

    #[test]
    fn pricing_changes_with_selected_models() {
        assert_eq!(
            audio_cost_microusd(STT_TURBO_MODEL, 3_600_000).unwrap(),
            40_000
        );
        assert_eq!(
            audio_cost_microusd(STT_ACCURATE_MODEL, 3_600_000).unwrap(),
            111_000
        );
        assert_eq!(
            translation_cost_microusd(TRANSLATION_FAST_MODEL, 1_000_000, 1_000_000).unwrap(),
            375_000
        );
        assert_eq!(
            translation_cost_microusd(TRANSLATION_ACCURATE_MODEL, 1_000_000, 1_000_000).unwrap(),
            750_000
        );
    }

    #[test]
    fn rejects_unknown_models() {
        let temp = tempfile::tempdir().expect("tempdir");
        let manager = SettingsManager::load(temp.path().join("settings.json")).expect("load");
        assert!(manager
            .update_groq_models(
                "custom-whisper".into(),
                STT_TURBO_MODEL.into(),
                TRANSLATION_FAST_MODEL.into(),
            )
            .is_err());
    }

    #[test]
    fn model_price_changes_the_budget_decision() {
        let temp = tempfile::tempdir().expect("tempdir");
        let turbo = SettingsManager::load(temp.path().join("turbo.json")).expect("load");
        turbo
            .update(|settings| {
                settings.groq.estimated_spend_microusd = 1_999_800;
                Ok(())
            })
            .unwrap();
        assert!(turbo.reserve_audio_request(1_000, STT_TURBO_MODEL).is_ok());

        let accurate = SettingsManager::load(temp.path().join("accurate.json")).expect("load");
        accurate
            .update(|settings| {
                settings.groq.estimated_spend_microusd = 1_999_800;
                Ok(())
            })
            .unwrap();
        assert!(accurate
            .reserve_audio_request(1_000, STT_ACCURATE_MODEL)
            .is_err());
    }

    #[test]
    fn resets_groq_usage_when_month_changes() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = temp.path().join("settings.json");
        let mut settings = AppSettings::default();
        settings.groq.usage_month = "2000-01".into();
        settings.groq.actual_audio_millis = 12_345;
        settings.groq.billed_audio_millis = 20_000;
        settings.groq.prompt_tokens = 100;
        settings.groq.completion_tokens = 40;
        settings.groq.estimated_spend_microusd = 999;
        fs::write(&path, serde_json::to_vec(&settings).unwrap()).unwrap();

        let reset = SettingsManager::load(path).expect("load").snapshot();
        assert_eq!(
            reset.groq.usage_month,
            chrono::Local::now().format("%Y-%m").to_string()
        );
        assert_eq!(reset.groq.actual_audio_millis, 0);
        assert_eq!(reset.groq.billed_audio_millis, 0);
        assert_eq!(reset.groq.prompt_tokens, 0);
        assert_eq!(reset.groq.completion_tokens, 0);
        assert_eq!(reset.groq.estimated_spend_microusd, 0);
    }

    #[test]
    fn temp_path_is_under_requested_directory() {
        let path = Path::new("C:/test/settings.json");
        assert_eq!(
            path.with_extension("json.tmp"),
            Path::new("C:/test/settings.json.tmp")
        );
    }
}
