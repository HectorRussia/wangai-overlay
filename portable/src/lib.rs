//! Shared, fail-closed Portable package and transaction primitives. No network or UI.
pub mod package;
pub mod transaction;
pub mod platform;

use anyhow::{bail, ensure, Context, Result};
use serde::{Deserialize, Serialize};
use std::{fs::{self, File, OpenOptions}, io::Write, path::{Component, Path, PathBuf}};

pub const PRODUCT: &str = "dev.gamelingo.overlay.portable";
pub const PUBLIC_KEY: &str = match option_env!("WANGAI_UPDATER_PUBLIC_KEY") { Some(v) => v, None => "" };
pub const MAX_ARCHIVE: u64 = 1024 * 1024 * 1024;
pub const MAX_EXPANDED: u64 = 4 * 1024 * 1024 * 1024;
pub const MANIFEST: &str = "package-manifest.json";
pub const MANIFEST_SIG: &str = "package-manifest.json.sig";

#[derive(Clone, Debug)]
pub struct PortableLayout { pub root: PathBuf }
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ActiveVersion { pub format: u32, pub current: String, pub previous: Option<String> }

impl PortableLayout {
    pub fn open(root: &Path) -> Result<Self> {
        no_links(root)?;
        let root = root.canonicalize()?;
        let marker: serde_json::Value = read_json(&root.join("App/portable.json")).context("โฟลเดอร์มีไฟล์อื่นและไม่ใช่ WANGAI Portable กรุณาเลือกโฟลเดอร์ว่าง")?;
        ensure!(marker["product"] == PRODUCT && marker["format"] == 1, "โฟลเดอร์นี้ไม่ใช่ WANGAI Portable");
        let layout = Self { root };
        for path in [layout.data(), layout.app(), layout.updates(), layout.app().join("versions")] { no_links(&path)?; }
        Ok(layout)
    }
    pub fn initialize(root: &Path) -> Result<Self> {
        no_links(root)?;
        platform::validate_destination(root)?;
        if root.exists() && fs::read_dir(root)?.next().is_some() { return Self::open(root); }
        fs::create_dir_all(root)?;
        let root = root.canonicalize()?;
        let layout = Self { root };
        for path in [layout.data(), layout.updates(), layout.app().join("versions")] { fs::create_dir_all(path)?; }
        atomic_json(&layout.app().join("portable.json"), &serde_json::json!({"product": PRODUCT, "format":1}))?;
        Ok(layout)
    }
    pub fn from_core(exe: &Path) -> Result<Self> {
        let version_dir = exe.parent().context("Missing executable directory")?;
        validate_version(version_dir.file_name().and_then(|s| s.to_str()).context("Invalid version directory")?)?;
        let versions = version_dir.parent().context("Missing versions directory")?;
        ensure!(versions.file_name().is_some_and(|p| p == "versions"), "ต้องเปิดผ่าน WANGAI.exe ในโฟลเดอร์ Portable");
        let app = versions.parent().context("Missing App directory")?;
        ensure!(app.file_name().is_some_and(|p| p == "App"), "Invalid Portable App directory");
        Self::open(app.parent().context("Missing Portable root")?)
    }
    pub fn app(&self) -> PathBuf { self.root.join("App") }
    pub fn data(&self) -> PathBuf { self.root.join("Data") }
    pub fn updates(&self) -> PathBuf { self.app().join(".update") }
    pub fn version(&self, version: &str) -> Result<PathBuf> {
        validate_version(version)?;
        let path = self.app().join("versions").join(version); no_links(&path)?; Ok(path)
    }
    pub fn active(&self) -> Result<ActiveVersion> {
        let value: ActiveVersion = read_json(&self.app().join("active.json"))?;
        ensure!(value.format == 1, "Unsupported active version format");
        validate_version(&value.current)?;
        if let Some(previous) = &value.previous { validate_version(previous)?; }
        Ok(value)
    }
    pub fn transaction(&self, nonce: &str) -> Result<PathBuf> {
        validate_nonce(nonce)?;
        let path = self.updates().join(nonce); no_links(&path)?; Ok(path)
    }
    pub fn new_transaction(&self) -> Result<(String, PathBuf)> {
        let nonce = uuid::Uuid::new_v4().to_string();
        let path = self.transaction(&nonce)?;
        fs::create_dir(&path)?;
        atomic_json(&path.join("owner.json"), &serde_json::json!({"product":PRODUCT,"nonce":nonce}))?;
        Ok((nonce, path))
    }
    pub fn lock(&self) -> Result<File> {
        use fs2::FileExt;
        let path = self.app().join("operation.lock"); no_links(&path)?;
        let file = OpenOptions::new().read(true).write(true).create(true).truncate(false).open(path)?;
        file.try_lock_exclusive().context("WANGAI กำลังเตรียมไฟล์หรืออัปเดตอยู่ กรุณารอสักครู่")?;
        Ok(file)
    }
    pub fn cleanup_transaction(&self, nonce: &str) -> Result<()> {
        let path = self.transaction(nonce)?;
        if !path.exists() { return Ok(()); }
        let owner: serde_json::Value = read_json(&path.join("owner.json"))?;
        ensure!(owner["product"] == PRODUCT && owner["nonce"] == nonce, "Unowned transaction directory");
        no_links_tree(&path)?;
        fs::remove_dir_all(path)?;
        Ok(())
    }
}

pub fn validate_nonce(value: &str) -> Result<()> {
    ensure!(uuid::Uuid::parse_str(value)?.to_string() == value, "Invalid transaction nonce"); Ok(())
}
pub fn validate_version(value: &str) -> Result<()> {
    let parsed = semver::Version::parse(value)?;
    ensure!(parsed.to_string() == value && parsed.pre.is_empty() && parsed.build.is_empty(), "Expected stable semantic version"); Ok(())
}
pub fn safe_relative(value: &str) -> Result<PathBuf> {
    ensure!(!value.is_empty() && value.len() <= 1024 && !value.contains(['\\', ':', '\0']), "Invalid package path");
    for part in value.split('/') {
        ensure!(!part.is_empty() && part != "." && part != ".." && !part.ends_with(['.', ' ']) && !part.chars().any(|c| c < ' ' || "<>\"|?*".contains(c)), "Unsafe package component");
        let stem = part.split('.').next().unwrap().to_ascii_uppercase();
        ensure!(!["CON", "PRN", "AUX", "NUL", "CONIN$", "CONOUT$","COM¹","COM²","COM³","LPT¹","LPT²","LPT³"].contains(&stem.as_str()) && !(stem.len() == 4 && (stem.starts_with("COM") || stem.starts_with("LPT")) && stem.as_bytes()[3].is_ascii_digit()), "Reserved Windows path");
    }
    let path = PathBuf::from(value);
    ensure!(path.components().all(|c| matches!(c, Component::Normal(_))), "Absolute package path");
    Ok(path)
}
pub fn no_links(path: &Path) -> Result<()> {
    let mut current = PathBuf::new();
    for component in path.components() {
        current.push(component);
        // A drive prefix alone (C: or \\?\C:) is not an absolute filesystem object.
        if matches!(component, Component::Prefix(_)) { continue; }
        match fs::symlink_metadata(&current) {
            Ok(meta) => {
                ensure!(!meta.file_type().is_symlink(), "Symbolic links are not allowed: {}", current.display());
                #[cfg(windows)] { use std::os::windows::fs::MetadataExt; ensure!(meta.file_attributes() & 0x400 == 0, "Reparse points are not allowed: {}", current.display()); }
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
            Err(e) => return Err(e.into()),
        }
    }
    Ok(())
}
pub fn no_links_tree(path: &Path) -> Result<()> {
    no_links(path)?;
    if path.is_dir() { for entry in fs::read_dir(path)? { no_links_tree(&entry?.path())?; } }
    Ok(())
}
pub fn read_json<T: serde::de::DeserializeOwned>(path: &Path) -> Result<T> {
    no_links(path)?;
    ensure!(fs::metadata(path)?.len() <= 8 * 1024 * 1024, "Metadata too large");
    Ok(serde_json::from_slice(&fs::read(path)?)?)
}
pub fn atomic_json(path: &Path, value: &impl Serialize) -> Result<()> { atomic_write(path, &serde_json::to_vec_pretty(value)?) }
pub fn atomic_write(path: &Path, bytes: &[u8]) -> Result<()> {
    no_links(path)?;
    let parent = path.parent().context("Missing parent")?;
    fs::create_dir_all(parent)?;
    let temp = parent.join(format!(".write-{}", uuid::Uuid::new_v4()));
    let result = (|| {
        let mut file = OpenOptions::new().write(true).create_new(true).open(&temp)?;
        file.write_all(bytes)?; file.sync_all()?; drop(file);
        platform::replace_file(&temp, path)
    })();
    if result.is_err() { let _ = fs::remove_file(temp); }
    result
}
pub fn require_space(path: &Path, bytes: u64) -> Result<()> {
    ensure!(fs2::available_space(path)? >= bytes.saturating_add(128 * 1024 * 1024), "พื้นที่ว่างไม่พอ กรุณาเพิ่มพื้นที่แล้วลองใหม่"); Ok(())
}
pub fn cancelled(cancel: &std::sync::atomic::AtomicBool) -> Result<()> {
    if cancel.load(std::sync::atomic::Ordering::Relaxed) { bail!("ยกเลิกแล้ว ยังไม่ได้เปลี่ยนโปรแกรมเดิม"); } Ok(())
}

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn rejects_windows_escape_paths() {
        for path in ["../x", "/x", "C:/x", "a\\b", "a//b", "x/./b", "a:stream", "NUL.txt", "x/COM1", "x.", "x ", "x/*"] { assert!(safe_relative(path).is_err(), "{path}"); }
        assert!(safe_relative("worker/ภาษาไทย file.dll").is_ok());
    }
    #[test] fn refuses_unrelated_directory_and_never_removes_data() {
        let temp = tempfile::tempdir().unwrap();
        fs::write(temp.path().join("mine.txt"), "keep").unwrap();
        assert!(PortableLayout::initialize(temp.path()).is_err());
        assert_eq!(fs::read_to_string(temp.path().join("mine.txt")).unwrap(), "keep");
    }
    #[test] fn owns_only_uuid_transactions() {
        let temp = tempfile::tempdir().unwrap();
        let layout = PortableLayout::initialize(temp.path()).unwrap();
        let (nonce, _) = layout.new_transaction().unwrap();
        fs::write(layout.data().join("settings.json"), "keep").unwrap();
        assert!(layout.cleanup_transaction("../../Data").is_err());
        layout.cleanup_transaction(&nonce).unwrap();
        assert!(layout.data().join("settings.json").exists());
    }
    #[test] fn derives_root_from_executable_not_cwd() {
        let temp = tempfile::tempdir().unwrap();
        let layout = PortableLayout::initialize(temp.path()).unwrap();
        let version = layout.version("0.3.0").unwrap(); fs::create_dir_all(&version).unwrap();
        assert_eq!(PortableLayout::from_core(&version.join("gamelingo.exe")).unwrap().root, layout.root);
        assert!(PortableLayout::from_core(&temp.path().join("gamelingo.exe")).is_err());
    }
}
