//! Journal is written before changing the launcher or active pointer; Data is never rolled back.
use crate::*;
use anyhow::{ensure, Result};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Phase { Applying, AwaitingReady, Committed, RolledBack }
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Journal { pub format: u32, pub nonce: String, pub from: Option<ActiveVersion>, pub to: String, pub phase: Phase }
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateRequest { pub format: u32, pub nonce: String, pub version: String, pub parent_pid: u32, pub signature: String }
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StartupReady { pub nonce: String, pub version: String, pub pid: u32, pub worker_ready: bool, pub ui_ready: bool }

fn journal_path(layout: &PortableLayout) -> PathBuf { layout.app().join("transaction.json") }
pub fn journal(layout: &PortableLayout) -> Result<Option<Journal>> {
    let path = journal_path(layout);
    if !path.exists() { return Ok(None); }
    let value: Journal = read_json(&path)?;
    ensure!(value.format == 1, "Unsupported update transaction");
    validate_nonce(&value.nonce)?; validate_version(&value.to)?;
    if let Some(from) = &value.from {
        ensure!(from.format == 1, "Invalid rollback state"); validate_version(&from.current)?;
        if let Some(previous) = &from.previous { validate_version(previous)?; }
    }
    Ok(Some(value))
}
pub fn begin(layout: &PortableLayout, nonce: &str, key: &str) -> Result<Journal> {
    ensure!(journal(layout)?.is_none(), "An earlier update needs recovery first");
    let transaction = layout.transaction(nonce)?;
    let stage = transaction.join("staged");
    let manifest = package::verify_installed(&stage, key, true)?;
    let from = if layout.app().join("active.json").exists() { Some(layout.active()?) } else { None };
    if let Some(old) = &from {
        ensure!(semver::Version::parse(&manifest.version)? > semver::Version::parse(&old.current)?, "เวอร์ชันนี้ไม่ได้ใหม่กว่าโปรแกรมที่ใช้อยู่");
        package::verify_installed(&layout.version(&old.current)?, key, true)?;
    }
    let destination = layout.version(&manifest.version)?;
    ensure!(!destination.exists(), "Version directory already exists; recover the previous operation first");
    let mut journal = Journal { format:1, nonce:nonce.into(), from, to:manifest.version.clone(), phase:Phase::Applying };
    atomic_json(&journal_path(layout), &journal)?;
    fs::rename(&stage, &destination)?;
    platform::runtime_acl(&destination.join("webview2"))?;
    replace_launcher(layout, &destination)?;
    atomic_json(&layout.app().join("active.json"), &ActiveVersion { format:1, current:journal.to.clone(), previous:journal.from.as_ref().map(|v| v.current.clone()) })?;
    journal.phase = Phase::AwaitingReady;
    atomic_json(&journal_path(layout), &journal)?;
    Ok(journal)
}
fn replace_launcher(layout: &PortableLayout, version: &Path) -> Result<()> {
    // The supervisor runs from its own transaction directory, never this destination.
    let source = version.join("WANGAI.exe");
    package::assert_gui(&source)?;
    let bytes=fs::read(source)?;
    // A recovery copy may start while the root host is completing its exit.
    // Retry a bounded interval; never kill a process that holds the file.
    let mut result=atomic_write(&layout.root.join("WANGAI.exe"),&bytes);
    for _ in 0..20 {
        if result.is_ok() { break; }
        std::thread::sleep(std::time::Duration::from_millis(100));
        result=atomic_write(&layout.root.join("WANGAI.exe"),&bytes);
    }
    result
}
pub fn commit(layout: &PortableLayout, key: &str) -> Result<()> {
    let mut journal = journal(layout)?.ok_or_else(|| anyhow::anyhow!("No update to commit"))?;
    ensure!(journal.phase == Phase::AwaitingReady, "Update not awaiting readiness");
    ensure!(layout.active()?.current == journal.to, "Active update changed");
    journal.phase = Phase::Committed;
    atomic_json(&journal_path(layout), &journal)?;
    fs::remove_file(journal_path(layout))?;
    // Cleanup is best effort: a locked old file must not roll back a healthy new app.
    let _ = prune_versions(layout, key);
    Ok(())
}
pub fn rollback(layout: &PortableLayout, key: &str) -> Result<Option<String>> {
    let mut journal = journal(layout)?.ok_or_else(|| anyhow::anyhow!("No transaction to recover"))?;
    if journal.phase == Phase::Committed {
        fs::remove_file(journal_path(layout))?; return Ok(Some(layout.active()?.current));
    }
    if let Some(from) = &journal.from {
        let version = layout.version(&from.current)?;
        package::verify_installed(&version, key, true)?;
        replace_launcher(layout, &version)?;
        atomic_json(&layout.app().join("active.json"), from)?;
    } else if layout.app().join("active.json").exists() {
        ensure!(layout.active()?.current == journal.to, "Refusing to remove an unrelated active version");
        fs::remove_file(layout.app().join("active.json"))?;
    }
    journal.phase = Phase::RolledBack;
    atomic_json(&journal_path(layout), &journal)?;
    // Only delete the failed version after restoring a known-good active pointer.
    let failed = layout.version(&journal.to)?;
    if failed.exists() && package::verify_installed(&failed, key, true).is_ok() {
        no_links_tree(&failed)?;
        fs::remove_dir_all(&failed)?;
    }
    fs::remove_file(journal_path(layout))?;
    Ok(journal.from.map(|v| v.current))
}
fn prune_versions(layout: &PortableLayout, key: &str) -> Result<()> {
    let active = layout.active()?;
    for entry in fs::read_dir(layout.app().join("versions"))? {
        let entry = entry?; let name = entry.file_name().to_string_lossy().into_owned();
        if name == active.current || active.previous.as_deref() == Some(&name) { continue; }
        // Unrecognized/user-created directories are never cleanup targets.
        if validate_version(&name).is_err() || package::verify_installed(&entry.path(), key, true).is_err() { continue; }
        no_links_tree(&entry.path())?; fs::remove_dir_all(entry.path())?;
    }
    Ok(())
}
pub fn acknowledge(layout: &PortableLayout, ready: &StartupReady) -> Result<()> {
    validate_nonce(&ready.nonce)?; validate_version(&ready.version)?;
    ensure!(ready.worker_ready && ready.ui_ready && layout.active()?.current == ready.version, "Startup is not ready");
    let directory = layout.transaction(&ready.nonce)?;
    let owner: serde_json::Value = read_json(&directory.join("owner.json"))?;
    ensure!(owner["product"] == PRODUCT && owner["nonce"] == ready.nonce, "Startup nonce is not owned");
    atomic_json(&directory.join("ready.json"), ready)
}

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn malformed_journal_is_not_treated_as_success() {
        let temp = tempfile::tempdir().unwrap(); let layout = PortableLayout::initialize(temp.path()).unwrap();
        atomic_json(&journal_path(&layout), &serde_json::json!({"format":1,"nonce":"../../Data","to":"0.3.0","from":null,"phase":"applying"})).unwrap();
        fs::write(layout.data().join("settings.json"), b"keep").unwrap();
        assert!(journal(&layout).is_err()); assert!(rollback(&layout, "").is_err());
        assert_eq!(fs::read(layout.data().join("settings.json")).unwrap(), b"keep");
    }
    #[test] fn refuses_early_or_unowned_ready_acknowledgement() {
        let temp = tempfile::tempdir().unwrap(); let layout = PortableLayout::initialize(temp.path()).unwrap();
        atomic_json(&layout.app().join("active.json"), &ActiveVersion {format:1,current:"0.3.0".into(),previous:None}).unwrap();
        let (nonce, _) = layout.new_transaction().unwrap();
        let mut ready = StartupReady {nonce,version:"0.3.0".into(),pid:12,worker_ready:false,ui_ready:true};
        assert!(acknowledge(&layout,&ready).is_err());
        ready.worker_ready = true; acknowledge(&layout,&ready).unwrap();
        ready.nonce = uuid::Uuid::new_v4().to_string(); assert!(acknowledge(&layout,&ready).is_err());
    }
}
