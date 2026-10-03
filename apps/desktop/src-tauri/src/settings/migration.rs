use crate::models::VadProfile;

pub(super) fn migrate_serialized_settings(value: &mut serde_json::Value) {
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
