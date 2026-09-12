//! Real minisign/ZIP tests using an isolated disposable key. Fake PE fixtures are
//! intentionally not runnable: the separate artifact acceptance harness tests that.
use std::{collections::BTreeMap,fs,io::Write,path::{Path,PathBuf},sync::{OnceLock,atomic::AtomicBool}};
use wangai_portable::{*,package::*,transaction::*};
use sha2::{Digest,Sha256};

struct Signer { _temp:tempfile::TempDir,key:PathBuf,public:String }
fn signer()->&'static Signer {
    static SIGNER:OnceLock<Signer>=OnceLock::new();
    SIGNER.get_or_init(|| {
        let temp=tempfile::tempdir().unwrap();let key=temp.path().join("fixture.key");
        let output=std::process::Command::new("node").arg(cli()).args(["signer","generate","--ci","-p","fixture-only","-w"]).arg(&key).output().unwrap();
        assert!(output.status.success(),"Could not create isolated test key");
        let public=fs::read_to_string(key.with_extension("key.pub")).unwrap();
        Signer{_temp:temp,key,public}
    })
}
fn cli()->PathBuf { Path::new(env!("CARGO_MANIFEST_DIR")).join("../node_modules/@tauri-apps/cli/tauri.js") }
fn sign(path:&Path)->String {
    let output=std::process::Command::new("node").arg(cli()).args(["signer","sign","-p","fixture-only","-f"]).arg(&signer().key).arg(path).output().unwrap();
    assert!(output.status.success(),"Could not sign fixture");
    fs::read_to_string(format!("{}.sig",path.display())).unwrap()
}
fn pe()->Vec<u8> {
    let mut pe=vec![0;256];pe[..2].copy_from_slice(b"MZ");pe[60..64].copy_from_slice(&64u32.to_le_bytes());
    pe[64..68].copy_from_slice(b"PE\0\0");pe[68..70].copy_from_slice(&0x8664u16.to_le_bytes());pe[88..90].copy_from_slice(&0x20bu16.to_le_bytes());pe[156..158].copy_from_slice(&2u16.to_le_bytes());pe
}
fn fixture(version:&str)->(PackageManifestV1,BTreeMap<String,Vec<u8>>) {
    let mut files=BTreeMap::new();
    for name in ["WANGAI.exe","gamelingo.exe","worker/wangai-worker.exe","worker/_internal/python312.dll","worker/_internal/silero_vad/data/silero_vad.onnx","web/index.html","webview2/msedgewebview2.exe","THIRD-PARTY-NOTICES.md"] {
        let mut bytes=if name.ends_with(".exe"){pe()}else{b"offline fixture".to_vec()};bytes.extend_from_slice(version.as_bytes());files.insert(name.to_owned(),bytes);
    }
    let manifest=PackageManifestV1{format:1,product:PRODUCT.into(),version:version.into(),architecture:"x86_64".into(),bootstrap_min:1,bootstrap_max:1,webview_version:"152.0.4191.62".into(),files:files.iter().map(|(name,bytes)|(name.clone(),PackageFile{size:bytes.len() as u64,sha256:format!("{:x}",Sha256::digest(bytes))})).collect()};
    (manifest,files)
}
fn archive(root:&Path,manifest:&PackageManifestV1,files:&BTreeMap<String,Vec<u8>>,extra:Option<(&str,bool)>)->(PathBuf,String) {
    let metadata=root.join(MANIFEST);atomic_json(&metadata,manifest).unwrap();let sig=sign(&metadata);
    let path=root.join("payload.zip");let mut zip=zip::ZipWriter::new(fs::File::create(&path).unwrap());
    let options=zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    for (name,bytes) in files {zip.start_file(name,options).unwrap();zip.write_all(bytes).unwrap();}
    zip.start_file(MANIFEST,options).unwrap();zip.write_all(&fs::read(metadata).unwrap()).unwrap();
    zip.start_file(MANIFEST_SIG,options).unwrap();zip.write_all(sig.as_bytes()).unwrap();
    if let Some((name,link))=extra {if link {zip.add_symlink(name,"../../Data",options).unwrap();} else {zip.start_file(name,options).unwrap();zip.write_all(b"unexpected").unwrap();}}
    zip.finish().unwrap();let signature=sign(&path);(path,signature)
}
fn stage(layout:&PortableLayout,version:&str)->String {
    let (nonce,folder)=layout.new_transaction().unwrap();let (manifest,files)=fixture(version);let (path,sig)=archive(&folder,&manifest,&files,None);
    unpack(&path,&sig,&signer().public,&folder.join("staged"),Some(version),&AtomicBool::new(false),&|_,_|{}).unwrap();nonce
}
#[test] fn signed_archive_verifies_and_uses_bounded_manifest() {
    let temp=tempfile::tempdir().unwrap();let layout=PortableLayout::initialize(temp.path()).unwrap();let nonce=stage(&layout,"0.3.0");
    let dir=layout.transaction(&nonce).unwrap().join("staged");
    assert_eq!(verify_installed(&dir,&signer().public,true).unwrap().version,"0.3.0");
    fs::write(dir.join("web/index.html"),b"tampered").unwrap();assert!(verify_installed(&dir,&signer().public,true).is_err());
}
#[test] fn rejects_signed_traversal_symlinks_and_undeclared_files() {
    for extra in [("../escape",false),("Data/settings.json",false),("web/link",true)] {
        let temp=tempfile::tempdir().unwrap();let (manifest,files)=fixture("0.3.0");let (path,sig)=archive(temp.path(),&manifest,&files,Some(extra));
        assert!(unpack(&path,&sig,&signer().public,&temp.path().join("staged"),None,&AtomicBool::new(false),&|_,_|{}).is_err(),"{extra:?}");
        assert!(!temp.path().join("Data").exists());
    }
}
#[test] fn rejects_signature_version_architecture_and_manifest_limits() {
    let temp=tempfile::tempdir().unwrap();let (mut manifest,files)=fixture("0.3.0");let (path,sig)=archive(temp.path(),&manifest,&files,None);
    assert!(verify_archive(&path,"bad",&signer().public).is_err());
    assert!(unpack(&path,&sig,&signer().public,&temp.path().join("staged"),Some("0.3.1"),&AtomicBool::new(false),&|_,_|{}).is_err());
    manifest.architecture="arm64".into();assert!(manifest.validate().is_err());manifest.architecture="x86_64".into();
    manifest.files.get_mut("web/index.html").unwrap().size=MAX_EXPANDED+1;assert!(manifest.validate().is_err());
    let (mut manifest,_)=fixture("0.3.0");manifest.files.insert("wAngai.exe".into(),manifest.files["WANGAI.exe"].clone());assert!(manifest.validate().is_err());
}
#[test] fn cancellation_preserves_active_and_data() {
    let temp=tempfile::tempdir().unwrap();let layout=PortableLayout::initialize(temp.path()).unwrap();fs::write(layout.data().join("settings.json"),"keep").unwrap();
    let (nonce,folder)=layout.new_transaction().unwrap();let (manifest,files)=fixture("0.3.0");let (path,sig)=archive(&folder,&manifest,&files,None);
    assert!(unpack(&path,&sig,&signer().public,&folder.join("staged"),None,&AtomicBool::new(true),&|_,_|{}).is_err());
    layout.cleanup_transaction(&nonce).unwrap();assert_eq!(fs::read(layout.data().join("settings.json")).unwrap(),b"keep");assert!(layout.active().is_err());
}
#[test] fn interrupted_swap_restores_launcher_and_never_rolls_back_data() {
    let temp=tempfile::tempdir().unwrap();let layout=PortableLayout::initialize(temp.path()).unwrap();
    let first=stage(&layout,"0.3.0");begin(&layout,&first,&signer().public).unwrap();commit(&layout,&signer().public).unwrap();
    let launcher=fs::read(layout.root.join("WANGAI.exe")).unwrap();
    let next=stage(&layout,"0.3.1");begin(&layout,&next,&signer().public).unwrap();
    fs::write(layout.data().join("settings.json"),b"new settings must survive rollback").unwrap();
    assert_eq!(rollback(&layout,&signer().public).unwrap().as_deref(),Some("0.3.0"));
    assert_eq!(layout.active().unwrap().current,"0.3.0");assert_eq!(fs::read(layout.root.join("WANGAI.exe")).unwrap(),launcher);
    assert_eq!(fs::read(layout.data().join("settings.json")).unwrap(),b"new settings must survive rollback");assert!(journal(&layout).unwrap().is_none());
}
#[test] fn rejects_downgrade_and_retains_one_previous_version() {
    let temp=tempfile::tempdir().unwrap();let layout=PortableLayout::initialize(temp.path()).unwrap();
    for version in ["0.3.0","0.3.1","0.3.2"] {let nonce=stage(&layout,version);begin(&layout,&nonce,&signer().public).unwrap();commit(&layout,&signer().public).unwrap();}
    assert!(!layout.version("0.3.0").unwrap().exists());assert_eq!(layout.active().unwrap().previous.as_deref(),Some("0.3.1"));
    let old=stage(&layout,"0.3.0");assert!(begin(&layout,&old,&signer().public).is_err());assert_eq!(layout.active().unwrap().current,"0.3.2");
}
#[test] fn locked_launcher_keeps_recoverable_journal() {
    let temp=tempfile::tempdir().unwrap();let layout=PortableLayout::initialize(temp.path()).unwrap();let first=stage(&layout,"0.3.0");begin(&layout,&first,&signer().public).unwrap();commit(&layout,&signer().public).unwrap();
    let lock=readonly_file(&layout.root.join("WANGAI.exe")).unwrap();let next=stage(&layout,"0.3.1");
    assert!(begin(&layout,&next,&signer().public).is_err());assert!(journal(&layout).unwrap().is_some());drop(lock);
    rollback(&layout,&signer().public).unwrap();assert_eq!(layout.active().unwrap().current,"0.3.0");
}
