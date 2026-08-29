use std::{
    fs,
    path::PathBuf,
    sync::{Mutex, RwLock},
    time::{Duration, Instant},
};

use anyhow::{anyhow, Context, Result};

use crate::models::{AppSettings, HotkeySettings, OverlaySettings, VadSettings, XaiSettings};

const KEYRING_SERVICE: &str = "GameLingo";
const KEYRING_USER: &str = "xai-api-key";
const STT_MICROUSD_PER_HOUR: u64 = 200_000;
const INPUT_MICROUSD_PER_MILLION_TOKENS: u64 = 1_250_000;
const OUTPUT_MICROUSD_PER_MILLION_TOKENS: u64 = 2_500_000;

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
        settings.xai.configured = xai_key().is_ok_and(|value| !value.trim().is_empty());
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

    pub fn reserve_audio_ms(&self, milliseconds: u64) -> Result<AppSettings> {
        let mut guard = self.inner.write().expect("settings lock poisoned");
        if reset_usage_month(&mut guard) {
            *self.pending_microusd.lock().expect("budget lock poisoned") = 0;
        }
        let pending = *self.pending_microusd.lock().expect("budget lock poisoned");
        let next_audio = guard.xai.audio_millis.saturating_add(milliseconds);
        let mut projected = guard.xai.clone();
        projected.audio_millis = next_audio;
        projected.estimated_spend_microusd = estimated_spend_microusd(&projected);
        if projected.estimated_spend_microusd.saturating_add(pending)
            > guard.xai.monthly_budget_microusd
        {
            return Err(anyhow!("ถึงงบ xAI รายเดือนแล้ว"));
        }
        guard.xai = projected;
        let mut last_save = self
            .last_usage_save
            .lock()
            .expect("usage save lock poisoned");
        if last_save.elapsed() >= Duration::from_secs(1) {
            self.save_value(&guard)?;
            *last_save = Instant::now();
        }
        Ok(guard.clone())
    }

    pub fn reserve_translation(&self, prompt_tokens: u64, completion_tokens: u64) -> Result<u64> {
        let mut guard = self.inner.write().expect("settings lock poisoned");
        if reset_usage_month(&mut guard) {
            *self.pending_microusd.lock().expect("budget lock poisoned") = 0;
        }
        let reserve = translation_cost_microusd(prompt_tokens, completion_tokens);
        let mut pending = self.pending_microusd.lock().expect("budget lock poisoned");
        if guard
            .xai
            .estimated_spend_microusd
            .saturating_add(*pending)
            .saturating_add(reserve)
            > guard.xai.monthly_budget_microusd
        {
            return Err(anyhow!("ถึงงบ xAI รายเดือนแล้ว"));
        }
        *pending = pending.saturating_add(reserve);
        Ok(reserve)
    }

    pub fn complete_translation(
        &self,
        reservation_microusd: u64,
        prompt_tokens: u64,
        completion_tokens: u64,
    ) -> Result<AppSettings> {
        let mut guard = self.inner.write().expect("settings lock poisoned");
        let mut pending = self.pending_microusd.lock().expect("budget lock poisoned");
        *pending = pending.saturating_sub(reservation_microusd);
        guard.xai.prompt_tokens = guard.xai.prompt_tokens.saturating_add(prompt_tokens);
        guard.xai.completion_tokens = guard
            .xai
            .completion_tokens
            .saturating_add(completion_tokens);
        guard.xai.estimated_spend_microusd = estimated_spend_microusd(&guard.xai);
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
            .xai
            .estimated_spend_microusd
            .saturating_add(pending)
            >= settings.xai.monthly_budget_microusd
    }
}

pub fn set_xai_key(key: &str) -> Result<()> {
    if key.trim().is_empty() {
        return Err(anyhow!("xAI API key ว่าง"));
    }
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)?;
    entry
        .set_password(key.trim())
        .context("บันทึก xAI API key ใน Windows Credential Manager ไม่สำเร็จ")
}

pub fn xai_key() -> Result<String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)?;
    entry.get_password().context("ยังไม่ได้ตั้ง xAI API key")
}

pub fn clear_xai_key() -> Result<()> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.into()),
    }
}

fn normalize(settings: &mut AppSettings) -> Result<()> {
    settings.schema_version = 2;
    settings.overlay.opacity = settings.overlay.opacity.clamp(0.2, 1.0);
    settings.overlay.font_scale = settings.overlay.font_scale.clamp(0.7, 1.8);
    settings.overlay.fade_seconds = settings.overlay.fade_seconds.clamp(2, 30);
    settings.overlay.max_items = settings.overlay.max_items.clamp(1, 5);
    settings.overlay.width = settings.overlay.width.clamp(480, 1920);
    settings.overlay.height = settings.overlay.height.clamp(140, 720);
    settings.vad.partial_interval_ms = settings.vad.partial_interval_ms.clamp(750, 5_000);
    settings.vad.vad_threshold = settings.vad.vad_threshold.clamp(0.1, 0.95);
    settings.vad.silence_ms = settings.vad.silence_ms.clamp(250, 2_000);
    settings.vad.pre_roll_ms = settings.vad.pre_roll_ms.clamp(0, 1_000);
    settings.vad.max_utterance_ms = settings.vad.max_utterance_ms.clamp(3_000, 30_000);
    settings.xai.monthly_budget_microusd = 2_000_000;
    if settings.xai.model.trim().is_empty() {
        settings.xai.model = XaiSettings::default().model;
    }
    settings.xai.estimated_spend_microusd = estimated_spend_microusd(&settings.xai);
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
    if settings.xai.usage_month != month {
        settings.xai.usage_month = month;
        settings.xai.audio_millis = 0;
        settings.xai.prompt_tokens = 0;
        settings.xai.completion_tokens = 0;
        settings.xai.estimated_spend_microusd = 0;
        true
    } else {
        false
    }
}

pub fn estimated_spend_microusd(settings: &XaiSettings) -> u64 {
    let audio = div_ceil(
        settings.audio_millis as u128 * STT_MICROUSD_PER_HOUR as u128,
        3_600_000,
    );
    audio.saturating_add(translation_cost_microusd(
        settings.prompt_tokens,
        settings.completion_tokens,
    ))
}

fn translation_cost_microusd(prompt_tokens: u64, completion_tokens: u64) -> u64 {
    div_ceil(
        prompt_tokens as u128 * INPUT_MICROUSD_PER_MILLION_TOKENS as u128,
        1_000_000,
    )
    .saturating_add(div_ceil(
        completion_tokens as u128 * OUTPUT_MICROUSD_PER_MILLION_TOKENS as u128,
        1_000_000,
    ))
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
    fn migrates_v1_settings_without_losing_user_preferences() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = temp.path().join("settings.json");
        let mut value = serde_json::to_value(AppSettings::default()).expect("serialize");
        let object = value.as_object_mut().expect("object");
        object.insert("schemaVersion".into(), 1.into());
        object.remove("vad");
        object.remove("xai");
        object.insert(
            "stt".into(),
            serde_json::json!({ "model": "large-v3-turbo" }),
        );
        object.insert("azure".into(), serde_json::json!({ "usageChars": 123 }));
        object.insert("autoAttach".into(), false.into());
        fs::write(&path, serde_json::to_vec(&value).unwrap()).unwrap();

        let manager = SettingsManager::load(path).expect("migrate");
        let migrated = manager.snapshot();
        assert_eq!(migrated.schema_version, 2);
        assert!(!migrated.auto_attach);
        assert_eq!(migrated.vad, VadSettings::default());
        assert_eq!(migrated.xai.model, "grok-4.20-0309-non-reasoning");
    }

    #[test]
    fn audio_budget_stops_before_two_dollar_equivalent() {
        let temp = tempfile::tempdir().expect("tempdir");
        let manager = SettingsManager::load(temp.path().join("settings.json")).expect("load");
        manager
            .reserve_audio_ms(36_000_000)
            .expect("ten hours at $0.20/hour");
        assert!(manager.reserve_audio_ms(1).is_err());
        assert_eq!(manager.snapshot().xai.estimated_spend_microusd, 2_000_000);
    }

    #[test]
    fn published_rate_card_is_calculated_in_integer_microusd() {
        let usage = XaiSettings {
            audio_millis: 3_600_000,
            prompt_tokens: 1_000_000,
            completion_tokens: 1_000_000,
            ..XaiSettings::default()
        };
        assert_eq!(estimated_spend_microusd(&usage), 3_950_000);
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
