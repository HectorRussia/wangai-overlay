mod migration;
mod persistence;
mod validation;
use migration::migrate_serialized_settings;
use validation::normalize;
pub use validation::validate_portable_import;
#[cfg(test)]
use crate::models::CaptureMode;

use std::{fs, path::PathBuf, sync::RwLock};

use anyhow::{Context, Result};

use crate::models::{
    AppSettings, HotkeySettings, OverlaySettings, VadSettings,
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
                < 16
            {
                let backup = path.with_extension(if value["schemaVersion"].as_u64().unwrap_or(0) < 14 { "pre-v14.json" } else { "pre-v16.json" });
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
        persistence::save_value(&self.path, settings)
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

    pub fn update_microphone_device(&self, device_id: Option<String>) -> Result<AppSettings> {
        self.update(|settings| { settings.microphone_device_id = device_id; Ok(()) })
    }

    pub fn update_rescue_scan(&self, enabled: bool) -> Result<AppSettings> {
        self.update(|settings| {
            settings.rescue_scan_enabled = enabled;
            Ok(())
        })
    }
}





#[cfg(test)]
mod tests;
