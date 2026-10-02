use crate::models::AppSettings;
use anyhow::{anyhow, Context, Result};
use std::{fs, path::Path};

pub(super) fn save_value(path: &Path, settings: &AppSettings) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("สร้างโฟลเดอร์ settings ไม่ได้: {}", parent.display()))?;
    }
    let data = serde_json::to_string_pretty(settings)?;
    wangai_portable::atomic_write(&path, data.as_bytes())
        .with_context(|| format!("บันทึก settings ไม่ได้: {}", path.display()))?;
    let persisted = fs::read_to_string(&path)
        .with_context(|| format!("ตรวจสอบ settings ไม่ได้: {}", path.display()))?;
    if persisted != data {
        return Err(anyhow!(
            "ตรวจสอบ settings ไม่ผ่าน: ค่าที่อ่านกลับไม่ตรงกับค่าที่บันทึก ({})",
            path.display()
        ));
    }
    Ok(())
}
