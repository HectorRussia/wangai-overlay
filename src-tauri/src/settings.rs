use std::{fs, path::PathBuf, sync::RwLock};

use anyhow::{anyhow, Context, Result};

use crate::models::{
    AppSettings, CaptureMode, HotkeySettings, OverlaySettings, VadProfile, VadSettings,
};

pub struct SettingsManager {
    path: PathBuf,
    inner: RwLock<AppSettings>,
}

impl SettingsManager {
    pub fn load(path: PathBuf) -> Result<Self> {
        let mut settings = if path.exists() {
            let data = fs::read_to_string(&path)
                .with_context(|| format!("อ่าน settings ไม่ได้: {}", path.display()))?;
            let mut value = serde_json::from_str::<serde_json::Value>(&data)
                .with_context(|| format!("settings ไม่ถูกต้อง: {}", path.display()))?;
            if value
                .get("schemaVersion")
                .and_then(|v| v.as_u64())
                .unwrap_or(0)
                < 14
            {
                let backup = path.with_extension("pre-v14.json");
                if !backup.exists() {
                    fs::copy(&path, &backup).context("สำรอง settings ก่อน migration ไม่สำเร็จ")?;
                }
            }
            migrate_serialized_settings(&mut value);
            serde_json::from_value::<AppSettings>(value)
                .with_context(|| format!("settings ไม่ถูกต้อง: {}", path.display()))?
        } else {
            AppSettings::default()
        };

        normalize(&mut settings)?;

        let manager = Self {
            path,
            inner: RwLock::new(settings),
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

    pub fn update_output_device(&self, device_id: Option<String>) -> Result<AppSettings> {
        self.update(|settings| {
            settings.output_device_id = device_id;
            Ok(())
        })
    }

    pub fn update_rescue_scan(&self, enabled: bool) -> Result<AppSettings> {
        self.update(|settings| {
            settings.rescue_scan_enabled = enabled;
            Ok(())
        })
    }
}

fn normalize(settings: &mut AppSettings) -> Result<()> {
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
    settings.schema_version = 14;
    if uuid::Uuid::parse_str(&settings.installation_id).is_err() {
        settings.installation_id = uuid::Uuid::new_v4().to_string();
    }
    settings.overlay.opacity = settings.overlay.opacity.clamp(0.2, 1.0);
    settings.overlay.font_scale = settings.overlay.font_scale.clamp(0.7, 1.8);
    settings.overlay.fade_seconds = settings.overlay.fade_seconds.clamp(2, 30);
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
    if schema_version < 7 {
        if let Some(vad) = value
            .get_mut("vad")
            .and_then(serde_json::Value::as_object_mut)
        {
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
                let profile = VadProfile::system_output_default();
                serde_json::json!({
                    "vadThreshold": profile.vad_threshold,
                    "gainDb": profile.gain_db,
                })
            });
        }
    }

    if schema_version >= 13 {
        return;
    }

    let primary = value
        .get("selectedProcess")
        .filter(|source| !source.is_null())
        .cloned();
    let browser = value
        .pointer("/browserMedia/selectedProcess")
        .filter(|source| !source.is_null())
        .cloned();
    let browser_enabled = value
        .pointer("/browserMedia/enabled")
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false);
    let voice = value
        .pointer("/voiceChat/selectedProcess")
        .filter(|source| !source.is_null())
        .cloned();
    let voice_enabled = value
        .pointer("/voiceChat/enabled")
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false);
    let (listening_source, source_origin) = if let Some(source) = primary {
        (Some(source), "primary")
    } else if browser_enabled && browser.is_some() {
        (browser, "browser")
    } else if voice_enabled && voice.is_some() {
        (voice, "voice")
    } else {
        (None, "none")
    };

    let capture_mode = value
        .get("gameCaptureMode")
        .cloned()
        .unwrap_or_else(|| serde_json::json!("process_tree"));
    let output_device = value
        .get("gameOutputDeviceId")
        .cloned()
        .unwrap_or(serde_json::Value::Null);
    let mut rescue_scan = value
        .get("systemOutputCloudScan")
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false);
    if source_origin == "voice" {
        rescue_scan = value
            .pointer("/voiceChat/rescueScan")
            .and_then(serde_json::Value::as_bool)
            .unwrap_or(rescue_scan);
    }

    if let Some(object) = value.as_object_mut() {
        object.insert(
            "listeningSource".into(),
            listening_source.unwrap_or(serde_json::Value::Null),
        );
        object.insert("captureMode".into(), capture_mode);
        object.insert("outputDeviceId".into(), output_device);
        object.insert("rescueScanEnabled".into(), rescue_scan.into());
    }

    if source_origin == "browser" {
        let threshold = value
            .pointer("/browserMedia/vadThreshold")
            .and_then(serde_json::Value::as_f64)
            .unwrap_or(0.5);
        let gain = value
            .pointer("/browserMedia/gainDb")
            .and_then(serde_json::Value::as_f64)
            .unwrap_or(0.0);
        if let Some(vad) = value
            .get_mut("vad")
            .and_then(serde_json::Value::as_object_mut)
        {
            vad.insert(
                "processTree".into(),
                serde_json::json!({ "vadThreshold": threshold, "gainDb": gain }),
            );
        }
    } else if source_origin == "voice" {
        if let Some(profile) = value.pointer("/voiceChat/vad").cloned() {
            if let Some(vad) = value
                .get_mut("vad")
                .and_then(serde_json::Value::as_object_mut)
            {
                vad.insert("processTree".into(), profile);
            }
        }
    }
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
        assert_eq!(migrated.schema_version, 14);
        assert!(!migrated.auto_attach);
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
        assert_eq!(migrated.schema_version, 14);
        assert_eq!(migrated.capture_mode, CaptureMode::ProcessTree);
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
        assert_eq!(migrated.schema_version, 14);
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
        assert_eq!(migrated.schema_version, 14);
        assert_eq!(migrated.output_device_id, None);
    }

    #[test]
    fn selected_output_device_survives_save_and_reload() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = temp.path().join("settings.json");
        let manager = SettingsManager::load(path.clone()).expect("load");
        manager
            .update_output_device(Some("Speakers (PRO)".into()))
            .expect("update output device");

        let loaded = SettingsManager::load(path).expect("reload").snapshot();
        assert_eq!(loaded.output_device_id.as_deref(), Some("Speakers (PRO)"));
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
        assert_eq!(manager.snapshot().schema_version, 14);
        assert!(!manager.snapshot().rescue_scan_enabled);
        manager.update_rescue_scan(true).expect("enable cloud scan");

        let loaded = SettingsManager::load(path).expect("reload").snapshot();
        assert!(loaded.rescue_scan_enabled);
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
        assert_eq!(migrated.schema_version, 14);
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
        assert_eq!(migrated.schema_version, 14);
        assert_eq!(migrated.overlay.max_items, 4);
    }

    #[test]
    fn migrates_v12_primary_process_to_single_listening_source() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = temp.path().join("settings.json");
        let mut value = serde_json::to_value(AppSettings::default()).expect("serialize");
        let object = value.as_object_mut().expect("object");
        object.insert("schemaVersion".into(), 12.into());
        object.remove("listeningSource");
        object.insert(
            "selectedProcess".into(),
            serde_json::json!({
                "executablePath": "C:\\Games\\MistfallHunter.exe",
                "executableName": "MistfallHunter.exe",
                "displayName": "Mistfall Hunter",
                "lastPid": 42
            }),
        );
        fs::write(&path, serde_json::to_vec(&value).unwrap()).unwrap();

        let migrated = SettingsManager::load(path).expect("migrate").snapshot();
        assert_eq!(migrated.schema_version, 14);
        assert_eq!(migrated.capture_mode, CaptureMode::ProcessTree);
        assert_eq!(
            migrated.listening_source.unwrap().display_name,
            "Mistfall Hunter"
        );
    }

    #[test]
    fn migrates_v12_browser_when_primary_process_is_missing() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = temp.path().join("settings.json");
        let mut value = serde_json::to_value(AppSettings::default()).expect("serialize");
        let object = value.as_object_mut().expect("object");
        object.insert("schemaVersion".into(), 12.into());
        object.remove("listeningSource");
        object.insert(
            "browserMedia".into(),
            serde_json::json!({
                "enabled": true,
                "selectedProcess": {
                    "executablePath": "C:\\Program Files\\Google\\Chrome\\chrome.exe",
                    "executableName": "chrome.exe",
                    "displayName": "Google Chrome",
                    "lastPid": 99
                },
                "vadThreshold": 0.31,
                "gainDb": 7.0
            }),
        );
        fs::write(&path, serde_json::to_vec(&value).unwrap()).unwrap();

        let migrated = SettingsManager::load(path).expect("migrate").snapshot();
        assert_eq!(migrated.schema_version, 14);
        assert_eq!(
            migrated.listening_source.unwrap().display_name,
            "Google Chrome"
        );
        assert_eq!(migrated.vad.process_tree.vad_threshold, 0.31);
        assert_eq!(migrated.vad.process_tree.gain_db, 7.0);
    }

    #[test]
    fn v14_migration_backs_up_legacy_usage_and_never_needs_a_key() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("settings.json");
        let mut old = serde_json::to_value(AppSettings::default()).unwrap();
        old["schemaVersion"] = 13.into();
        old.as_object_mut().unwrap().remove("installationId");
        old["groq"] = serde_json::json!({"configured":false,"estimatedSpendMicrousd":999999999,
            "monthlyBudgetMicrousd":2000000,"translationModel":"removed-provider-model"});
        old["listeningSource"] = serde_json::json!({"executablePath":"C:\\discord.exe",
            "executableName":"discord.exe","displayName":"Discord","lastPid":321});
        let original = serde_json::to_vec(&old).unwrap();
        fs::write(&path, &original).unwrap();
        let snapshot = SettingsManager::load(path.clone()).unwrap().snapshot();
        assert_eq!(snapshot.schema_version, 14);
        assert_eq!(
            snapshot.listening_source.as_ref().unwrap().display_name,
            "Discord"
        );
        assert_eq!(snapshot.hotkeys, AppSettings::default().hotkeys);
        assert_eq!(snapshot.glossary, AppSettings::default().glossary);
        assert_eq!(
            fs::read(path.with_extension("pre-v14.json")).unwrap(),
            original
        );
        assert!(uuid::Uuid::parse_str(&snapshot.installation_id).is_ok());
        let reloaded = SettingsManager::load(path.clone()).unwrap().snapshot();
        assert_eq!(snapshot.installation_id, reloaded.installation_id);
        assert!(serde_json::to_value(reloaded)
            .unwrap()
            .get("groq")
            .is_none());
        assert_eq!(
            fs::read(path.with_extension("pre-v14.json")).unwrap(),
            original
        );
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
