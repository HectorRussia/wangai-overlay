use super::*;

#[test]
fn v14_to_v16_preserves_preferences_and_backs_up_exact_bytes() {
    for version in 14..=16 {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("settings.json");
        let mut expected = AppSettings::default();
        expected.overlay.fade_seconds = 8;
        expected.overlay.x = Some(-400);
        expected.overlay.y = Some(150);
        expected.overlay.width = 700;
        expected.overlay.opacity = 0.7;
        expected.hotkeys.toggle_listening = "Ctrl+F8".into();
        expected.capture_mode = CaptureMode::SystemOutput;
        expected.vad.system_output.gain_db = 7.0;
        expected.glossary.push(crate::models::GlossaryTerm {
            source: "custom".into(),
            target: "คำศัพท์ของฉัน".into(),
        });
        let mut old = serde_json::to_value(&expected).unwrap();
        old["schemaVersion"] = version.into();
        if version < 16 {
            old.as_object_mut().unwrap().remove("microphoneDeviceId");
            for key in [
                "bubbleOpacity",
                "textOpacity",
                "incomingTranslationScale",
                "incomingOriginalScale",
                "outgoingTranslationScale",
                "outgoingOriginalScale",
            ] {
                old["overlay"].as_object_mut().unwrap().remove(key);
            }
        }
        let bytes = serde_json::to_vec_pretty(&old).unwrap();
        validate_portable_import(&bytes).unwrap();
        fs::write(&path, &bytes).unwrap();
        let manager = SettingsManager::load(path.clone()).unwrap();
        assert_eq!(manager.snapshot(), expected);
        assert_eq!(manager.snapshot().hotkeys.copy_latest, "F10");
        if version < 16 {
            assert_eq!(
                fs::read(path.with_extension("pre-v16.json")).unwrap(),
                bytes
            );
        }
        assert_eq!(SettingsManager::load(path).unwrap().snapshot(), expected);
    }
}

#[test]
fn new_appearance_and_microphone_round_trip_and_import_validation() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("settings.json");
    let manager = SettingsManager::load(path.clone()).unwrap();
    assert_eq!(manager.snapshot().overlay.fade_seconds, 30);
    assert_eq!(manager.snapshot().overlay.bubble_opacity, 1.0);
    assert_eq!(manager.snapshot().microphone_device_id, None);
    manager
        .update_microphone_device(Some("windows-endpoint-id".into()))
        .unwrap();
    let mut overlay = manager.snapshot().overlay;
    overlay.incoming_translation_scale = 1.4;
    overlay.outgoing_original_scale = 0.85;
    overlay.text_opacity = 0.9;
    manager.update_overlay(overlay).unwrap();
    assert_eq!(
        SettingsManager::load(path.clone()).unwrap().snapshot(),
        manager.snapshot()
    );
    validate_portable_import(&fs::read(path).unwrap()).unwrap();
    let mut invalid = serde_json::to_value(manager.snapshot()).unwrap();
    invalid["overlay"]["bubbleOpacity"] = 9.0.into();
    assert!(validate_portable_import(&serde_json::to_vec(&invalid).unwrap()).is_err());
    invalid["schemaVersion"] = 17.into();
    assert!(validate_portable_import(&serde_json::to_vec(&invalid).unwrap()).is_err());
}

#[test]
fn portable_import_validates_without_changing_source_or_id() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("settings.json");
    let manager = SettingsManager::load(path.clone()).unwrap();
    let id = manager.snapshot().installation_id;
    let bytes = fs::read(&path).unwrap();
    validate_portable_import(&bytes).unwrap();
    assert_eq!(fs::read(&path).unwrap(), bytes);
    assert_eq!(
        SettingsManager::load(path)
            .unwrap()
            .snapshot()
            .installation_id,
        id
    );
}
#[test]
fn portable_import_never_silently_repairs_corrupt_or_incomplete_data() {
    assert!(validate_portable_import(b"broken JSON").is_err());
    let mut settings = serde_json::to_value(AppSettings::default()).unwrap();
    settings["installationId"] = "not-a-uuid".into();
    assert!(validate_portable_import(&serde_json::to_vec(&settings).unwrap()).is_err());
    settings = serde_json::to_value(AppSettings::default()).unwrap();
    settings.as_object_mut().unwrap().remove("hotkeys");
    assert!(validate_portable_import(&serde_json::to_vec(&settings).unwrap()).is_err());
}
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
    assert_eq!(migrated.schema_version, 16);
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
    assert_eq!(migrated.schema_version, 16);
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
    assert_eq!(migrated.schema_version, 16);
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
    assert_eq!(migrated.schema_version, 16);
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
    assert_eq!(manager.snapshot().schema_version, 16);
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
    assert_eq!(migrated.schema_version, 16);
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
    assert_eq!(migrated.schema_version, 16);
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
    assert_eq!(migrated.schema_version, 16);
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
    assert_eq!(migrated.schema_version, 16);
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
    assert_eq!(snapshot.schema_version, 16);
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
