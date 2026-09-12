use crate::*;
use anyhow::{ensure, Context, Result};
use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{collections::BTreeMap, io::{Read, Seek, SeekFrom}, sync::atomic::AtomicBool};

pub const FOOTER_MAGIC: &[u8; 16] = b"WANGAI_PORTABLE1";
pub const FOOTER_SIZE: u64 = 40;
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PackageManifestV1 {
    pub format: u32, pub product: String, pub version: String, pub architecture: String,
    pub bootstrap_min: u32, pub bootstrap_max: u32, pub webview_version: String,
    pub files: BTreeMap<String, PackageFile>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PackageFile { pub size: u64, pub sha256: String }

impl PackageManifestV1 {
    pub fn validate(&self) -> Result<u64> {
        ensure!(self.format == 1 && self.product == PRODUCT && self.architecture == "x86_64", "Unsupported Portable package");
        ensure!(self.bootstrap_min <= 1 && self.bootstrap_max >= 1, "Portable launcher needs a newer package format");
        validate_version(&self.version)?;
        ensure!(!self.files.is_empty() && self.files.len() <= 30_000, "Invalid package file count");
        let mut total = 0u64; let mut folded = std::collections::HashSet::new();
        for (path, item) in &self.files {
            safe_relative(path)?;
            ensure!(path != MANIFEST && path != MANIFEST_SIG && !path.starts_with("Data/") && !path.starts_with("App/") && !path.starts_with('.'), "Unexpected package namespace");
            ensure!(folded.insert(path.to_lowercase()), "Case-colliding package paths");
            ensure!(item.sha256.len() == 64 && item.sha256.bytes().all(|c| c.is_ascii_hexdigit()), "Invalid file hash");
            total = total.checked_add(item.size).context("Package length overflow")?;
        }
        ensure!(total <= MAX_EXPANDED, "Expanded package exceeds limit");
        for required in ["WANGAI.exe", "gamelingo.exe", "worker/wangai-worker.exe", "worker/_internal/python312.dll", "worker/_internal/silero_vad/data/silero_vad.onnx", "web/index.html", "webview2/msedgewebview2.exe", "THIRD-PARTY-NOTICES.md"] {
            ensure!(self.files.contains_key(required), "Missing packaged component: {required}");
        }
        Ok(total)
    }
}
pub fn verify_bytes(bytes: &[u8], signature: &str, public_key: &str) -> Result<()> {
    ensure!(signature.len() <= 4096 && public_key.len() <= 4096, "Invalid signature/key length");
    let decode = |value: &str| -> Result<String> { Ok(String::from_utf8(base64::engine::general_purpose::STANDARD.decode(value.trim())?)?) };
    let key = minisign_verify::PublicKey::decode(&decode(public_key)?)?;
    let signature = minisign_verify::Signature::decode(&decode(signature)?)?;
    key.verify(bytes, &signature, true).context("ลายเซ็นไฟล์ไม่ถูกต้อง ยังไม่ได้เปลี่ยนโปรแกรม")?;
    Ok(())
}
pub fn readonly_file(path: &Path) -> Result<File> {
    no_links(path)?;
    let mut options = OpenOptions::new(); options.read(true);
    #[cfg(windows)] { use std::os::windows::fs::OpenOptionsExt; options.share_mode(1); }
    Ok(options.open(path)?)
}
pub fn verify_archive(path: &Path, signature: &str, key: &str) -> Result<File> {
    let file = readonly_file(path)?;
    ensure!(file.metadata()?.len() <= MAX_ARCHIVE && file.metadata()?.len() > 0, "Archive size limit");
    let mapped = unsafe { memmap2::Mmap::map(&file)? };
    verify_bytes(&mapped, signature, key)?;
    drop(mapped); Ok(file)
}
pub fn signed_manifest(bytes: &[u8], signature: &str, key: &str) -> Result<PackageManifestV1> {
    verify_bytes(bytes, signature, key)?;
    let manifest: PackageManifestV1 = serde_json::from_slice(bytes)?;
    manifest.validate()?; Ok(manifest)
}
pub fn unpack(archive: &Path, signature: &str, key: &str, stage: &Path, expected: Option<&str>, cancel: &AtomicBool, progress: &dyn Fn(u64,u64)) -> Result<PackageManifestV1> {
    let file = verify_archive(archive, signature, key)?;
    let mut zip = zip::ZipArchive::new(file)?;
    ensure!(zip.len() <= 30_002, "Too many archive entries");
    let metadata = read_entry(&mut zip, MANIFEST, 8 * 1024 * 1024)?;
    let metadata_sig = String::from_utf8(read_entry(&mut zip, MANIFEST_SIG, 4096)?)?;
    let manifest = signed_manifest(&metadata, &metadata_sig, key)?;
    if let Some(expected) = expected { ensure!(manifest.version == expected, "Signed payload version does not match update"); }
    let total = manifest.validate()?;
    let parent = stage.parent().context("Staging parent missing")?;
    no_links(parent)?; require_space(parent, total.saturating_add(MAX_ARCHIVE))?;
    ensure!(!stage.exists(), "Staging directory already exists");
    fs::create_dir(stage)?;
    let mut found = std::collections::HashSet::new(); let mut done = 0u64;
    for index in 0..zip.len() {
        cancelled(cancel)?;
        let mut entry = zip.by_index(index)?;
        let name = entry.name().to_owned();
        safe_relative(&name)?;
        ensure!(found.insert(name.to_lowercase()), "Duplicate archive entry");
        ensure!(!entry.is_dir() && entry.unix_mode().is_none_or(|mode| mode & 0o170000 == 0 || mode & 0o170000 == 0o100000), "Archive links/directories not allowed");
        if name == MANIFEST || name == MANIFEST_SIG { continue; }
        let info = manifest.files.get(&name).context("Undeclared archive file")?;
        ensure!(entry.size() == info.size, "Wrong expanded file length");
        let target = stage.join(safe_relative(&name)?); no_links(&target)?;
        fs::create_dir_all(target.parent().unwrap())?;
        let mut output = OpenOptions::new().write(true).create_new(true).open(&target)?;
        let mut hash = Sha256::new(); let mut buffer = [0u8; 128 * 1024]; let mut size = 0u64;
        loop {
            cancelled(cancel)?;
            let read = entry.read(&mut buffer)?; if read == 0 { break; }
            size += read as u64; ensure!(size <= info.size, "Expanded archive file exceeds declared length");
            output.write_all(&buffer[..read])?; hash.update(&buffer[..read]); done += read as u64; progress(done,total);
        }
        ensure!(size == info.size && format!("{:x}", hash.finalize()) == info.sha256.to_lowercase(), "Package file hash mismatch: {name}");
        output.sync_all()?;
    }
    ensure!(found.len() == manifest.files.len() + 2, "Missing archive entries");
    atomic_write(&stage.join(MANIFEST), &metadata)?;
    atomic_write(&stage.join(MANIFEST_SIG), metadata_sig.as_bytes())?;
    for file in ["WANGAI.exe", "gamelingo.exe"] { assert_gui(&stage.join(file))?; }
    Ok(manifest)
}
fn read_entry<R: Read + Seek>(zip: &mut zip::ZipArchive<R>, name: &str, limit: u64) -> Result<Vec<u8>> {
    let mut entry = zip.by_name(name)?; ensure!(entry.size() <= limit, "Metadata too large");
    let mut bytes = Vec::new(); (&mut entry).take(limit+1).read_to_end(&mut bytes)?;
    ensure!(bytes.len() as u64 <= limit, "Metadata size exceeded"); Ok(bytes)
}
pub fn hash_file(path: &Path) -> Result<String> {
    let mut file = readonly_file(path)?; let mut hash = Sha256::new(); let mut buffer = [0u8; 128*1024];
    loop { let count = file.read(&mut buffer)?; if count == 0 { break; } hash.update(&buffer[..count]); }
    Ok(format!("{:x}", hash.finalize()))
}
pub fn verify_installed(path: &Path, key: &str, full: bool) -> Result<PackageManifestV1> {
    no_links(path)?;
    ensure!(fs::metadata(path.join(MANIFEST))?.len() <= 8*1024*1024 && fs::metadata(path.join(MANIFEST_SIG))?.len() <= 4096,"Installed metadata exceeds limit");
    no_links(&path.join(MANIFEST))?; no_links(&path.join(MANIFEST_SIG))?;
    let metadata = fs::read(path.join(MANIFEST))?;
    let signature = fs::read_to_string(path.join(MANIFEST_SIG))?;
    let manifest = signed_manifest(&metadata, &signature, key)?;
    if full { exact_tree(path,path,&manifest)?; }
    for (name, file) in &manifest.files {
        if full || ["WANGAI.exe", "gamelingo.exe", "worker/wangai-worker.exe", "webview2/msedgewebview2.exe"].contains(&name.as_str()) {
            let target = path.join(safe_relative(name)?);
            ensure!(fs::metadata(&target)?.len() == file.size && hash_file(&target)? == file.sha256, "Installed file changed: {name}");
        }
    }
    Ok(manifest)
}
fn exact_tree(root:&Path,path:&Path,manifest:&PackageManifestV1)->Result<()> {
    no_links(path)?;
    for entry in fs::read_dir(path)? {
        let entry=entry?;let path=entry.path();no_links(&path)?;
        if path.is_dir() {exact_tree(root,&path,manifest)?;} else {
            let relative=path.strip_prefix(root)?.to_str().context("Invalid package filename")?.replace('\\',"/");
            ensure!(relative==MANIFEST || relative==MANIFEST_SIG || manifest.files.contains_key(&relative),"Unrecognized file in installed version: {relative}");
        }
    }
    Ok(())
}
pub fn assert_gui(path: &Path) -> Result<()> {
    let mut file = readonly_file(path)?; let mut header = [0u8;64]; file.read_exact(&mut header)?;
    ensure!(&header[..2] == b"MZ", "Invalid Windows executable");
    let offset = u32::from_le_bytes(header[60..64].try_into().unwrap()) as u64;
    ensure!(offset + 94 <= file.metadata()?.len(), "Invalid PE offset");
    file.seek(SeekFrom::Start(offset))?; let mut pe = [0u8;94]; file.read_exact(&mut pe)?;
    ensure!(&pe[..4] == b"PE\0\0" && u16::from_le_bytes(pe[4..6].try_into().unwrap()) == 0x8664, "Expected Windows x64 PE");
    ensure!(u16::from_le_bytes(pe[24..26].try_into().unwrap()) == 0x20b,"Expected PE32+ executable");
    ensure!(u16::from_le_bytes(pe[92..94].try_into().unwrap()) == 2, "Portable launcher/core must use GUI subsystem"); Ok(())
}
pub fn embedded_payload(exe: &Path, destination: &Path, key: &str, cancel:&AtomicBool, progress:&dyn Fn(u64,u64)) -> Result<String> {
    let mut source = readonly_file(exe)?; let length = source.metadata()?.len();
    ensure!(length >= FOOTER_SIZE, "No embedded Portable payload");
    source.seek(SeekFrom::End(-(FOOTER_SIZE as i64)))?;
    let mut footer = [0u8;40]; source.read_exact(&mut footer)?;
    ensure!(&footer[..16] == FOOTER_MAGIC, "No embedded Portable payload");
    let number = |start| u64::from_le_bytes(footer[start..start+8].try_into().unwrap());
    let (offset, size, sig_size) = (number(16), number(24), number(32));
    ensure!(size <= MAX_ARCHIVE && size > 0 && sig_size <= 4096 && sig_size > 0 && offset.checked_add(size).and_then(|n| n.checked_add(sig_size)).and_then(|n| n.checked_add(FOOTER_SIZE)) == Some(length), "Invalid Portable payload bounds");
    require_space(destination.parent().context("Payload parent")?, size)?;
    source.seek(SeekFrom::Start(offset))?;
    let mut output = OpenOptions::new().write(true).create_new(true).open(destination)?;
    let mut left=size;let mut buffer=[0u8;128*1024];
    while left>0 {
        cancelled(cancel)?;
        let length=left.min(buffer.len() as u64) as usize;
        source.read_exact(&mut buffer[..length])?;output.write_all(&buffer[..length])?;
        left-=length as u64;progress(size-left,size);
    }
    output.sync_all()?; drop(output);
    let mut signature = vec![0u8;sig_size as usize]; source.read_exact(&mut signature)?;
    let signature = String::from_utf8(signature)?;
    verify_archive(destination, &signature, key)?; Ok(signature)
}
pub fn has_payload(exe: &Path) -> bool {
    (|| -> Result<bool> { let mut file = File::open(exe)?; if file.metadata()?.len() < FOOTER_SIZE { return Ok(false); }
        file.seek(SeekFrom::End(-(FOOTER_SIZE as i64)))?; let mut magic = [0u8;16]; file.read_exact(&mut magic)?; Ok(&magic == FOOTER_MAGIC) })().unwrap_or(false)
}
