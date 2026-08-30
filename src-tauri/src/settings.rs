use std::{
    fs,
    path::PathBuf,
    sync::{Mutex, RwLock},
    time::{Duration, Instant},
};

use anyhow::{anyhow, Context, Result};

use crate::models::{
    AppSettings, GroqModelKind, GroqModelOption, HotkeySettings, OverlaySettings, VadSettings,
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
            serde_json::from_str::<AppSettings>(&data)
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
        reset_usage_month(&mut guard);
        update(&mut guard)?;
        normalize(&mut guard)?;
        self.save_value(&guard)?;
        Ok(guard.clone())
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
        fs::write(&temp_path, data)
            .with_context(|| format!("เขียน settings ไม่ได้: {}", temp_path.display()))?;
        if self.path.exists() {
            fs::copy(&temp_path, &self.path)
                .with_context(|| format!("บันทึก settings ไม่ได้: {}", self.path.display()))?;
            fs::remove_file(&temp_path).ok();
        } else {
            fs::rename(&temp_path, &self.path)
                .with_context(|| format!("บันทึก settings ไม่ได้: {}", self.path.display()))?;
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

    pub fn update_groq_models(
        &self,
        stt_model: String,
        translation_model: String,
    ) -> Result<AppSettings> {
        validate_stt_model(&stt_model)?;
        validate_translation_model(&translation_model)?;
        self.update(|settings| {
            settings.groq.stt_model = stt_model;
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
    if settings.schema_version < 3
        && settings.overlay.width == 920
        && settings.overlay.height == 240
    {
        settings.overlay.width = OverlaySettings::default().width;
        settings.overlay.height = OverlaySettings::default().height;
    }
    settings.schema_version = 4;
    settings.overlay.opacity = settings.overlay.opacity.clamp(0.2, 1.0);
    settings.overlay.font_scale = settings.overlay.font_scale.clamp(0.7, 1.8);
    settings.overlay.fade_seconds = settings.overlay.fade_seconds.clamp(2, 30);
    settings.overlay.max_items = settings.overlay.max_items.clamp(1, 5);
    settings.overlay.width = settings.overlay.width.clamp(340, 1920);
    settings.overlay.height = settings.overlay.height.clamp(190, 720);
    settings.vad.vad_threshold = settings.vad.vad_threshold.clamp(0.1, 0.95);
    settings.vad.silence_ms = settings.vad.silence_ms.clamp(250, 2_000);
    settings.vad.pre_roll_ms = settings.vad.pre_roll_ms.clamp(0, 1_000);
    settings.vad.max_utterance_ms = settings.vad.max_utterance_ms.clamp(3_000, 30_000);
    settings.groq.monthly_budget_microusd = MONTHLY_BUDGET_MICROUSD;
    validate_stt_model(&settings.groq.stt_model)?;
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
        assert_eq!(migrated.schema_version, 4);
        assert!(!migrated.auto_attach);
        assert_eq!(migrated.groq.stt_model, STT_TURBO_MODEL);
        assert_eq!(migrated.groq.translation_model, TRANSLATION_FAST_MODEL);
        assert_eq!(migrated.groq.estimated_spend_microusd, 0);
    }

    #[test]
    fn migrates_legacy_default_overlay_size_without_losing_position() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = temp.path().join("settings.json");
        let mut settings = AppSettings::default();
        settings.schema_version = 2;
        settings.overlay.width = 920;
        settings.overlay.height = 240;
        settings.overlay.x = Some(320);
        settings.overlay.y = Some(640);
        fs::write(&path, serde_json::to_vec(&settings).unwrap()).unwrap();

        let migrated = SettingsManager::load(path).expect("migrate").snapshot();
        assert_eq!(migrated.schema_version, 4);
        assert_eq!(migrated.overlay.width, 420);
        assert_eq!(migrated.overlay.height, 236);
        assert_eq!(migrated.overlay.x, Some(320));
        assert_eq!(migrated.overlay.y, Some(640));
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
            .update_groq_models("custom-whisper".into(), TRANSLATION_FAST_MODEL.into())
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
