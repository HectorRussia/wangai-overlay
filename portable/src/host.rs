use anyhow::{ensure, Context, Result};
use std::{fs, path::{Path,PathBuf}, process::Command, sync::{Arc,atomic::AtomicBool}, time::{Duration,Instant}};
use wangai_portable::{*, package, transaction::{self,UpdateRequest,StartupReady}};

#[derive(Clone)] pub enum Task { Prepare(PathBuf), Apply(String), Recover }
#[derive(Clone)] pub enum Progress { Status(String,u32,bool), Done(Option<String>) }
pub type Reporter = Arc<dyn Fn(Progress) + Send + Sync>;

pub fn entry() -> Result<()> {
    let host_lock=platform::HostLock::acquire()?;
    let exe = std::env::current_exe()?;
    let args: Vec<_> = std::env::args_os().collect();
    #[cfg(all(debug_assertions,feature="release-test"))]
    if args.len()==1 { return crate::ui::run(Task::Prepare(exe.clone()),exe.parent().unwrap().join("WANGAI UI preview")); }
    #[cfg(feature="release-test")]
    if args.len()==3 && args[1]=="--test-prepare" {
        return work(Task::Prepare(exe),PathBuf::from(&args[2]),false,Arc::new(AtomicBool::new(false)),Arc::new(|_|{}));
    }
    if args.len() >= 3 && args[1] == "--apply" {
        ensure!(args.len() == 4,"Invalid update arguments");
        let nonce = args[3].to_str().context("Invalid nonce")?.to_owned(); validate_nonce(&nonce)?;
        let layout = PortableLayout::open(Path::new(&args[2]))?;
        ensure!(exe.canonicalize()? == layout.transaction(&nonce)?.join("helper.exe").canonicalize()?,"Update helper must run inside its owned transaction");
        return crate::ui::run(Task::Apply(nonce),layout.root);
    }
    if args.len() == 4 && args[1] == "--recover" {
        let layout = PortableLayout::open(Path::new(&args[2]))?;
        let nonce = args[3].to_str().context("Invalid nonce")?;
        ensure!(exe.canonicalize()? == layout.transaction(nonce)?.join("helper.exe").canonicalize()?,"Recovery helper location mismatch");
        return crate::ui::run(Task::Recover,layout.root);
    }
    ensure!(args.len() == 1,"Unknown Portable launcher arguments");
    if package::has_payload(&exe) { return crate::ui::run(Task::Prepare(exe.clone()),exe.parent().unwrap().join("WANGAI")); }
    let layout = PortableLayout::open(exe.parent().context("Missing launcher directory")?)?;
    let _lock = layout.lock()?;
    if transaction::journal(&layout)?.is_some() {
        ensure_no_other_app(None)?;
        let (nonce,folder) = layout.new_transaction()?;
        let helper = folder.join("helper.exe"); fs::copy(&exe,&helper)?;
        drop(host_lock);
        Command::new(helper).arg("--recover").arg(&layout.root).arg(nonce).spawn()?;
        return Ok(());
    }
    let active = layout.active()?;
    // Finished helpers cannot remove their own executable on Windows. Only an
    // idle root launcher, holding both operation locks, collects owned leftovers.
    for entry in fs::read_dir(layout.updates())? {
        let entry=entry?;let nonce=entry.file_name().to_string_lossy().into_owned();
        if validate_nonce(&nonce).is_ok() { let _=layout.cleanup_transaction(&nonce); }
    }
    let version = layout.version(&active.current)?;
    package::verify_installed(&version,PUBLIC_KEY,true)?;
    ensure_no_other_app(Some(&version.join("gamelingo.exe")))?;
    // A second invocation focuses the existing single-instance app, without a fake readiness transaction.
    if core_running(&version.join("gamelingo.exe")) {
        Command::new(version.join("gamelingo.exe")).current_dir(&version).spawn()?;
        return Ok(());
    }
    let (nonce,_) = layout.new_transaction()?;
    let result = launch_ready(&layout,&nonce,&active.current);
    if result.is_ok() { let _ = layout.cleanup_transaction(&nonce); }
    result.context("เปิด WANGAI ไม่สำเร็จ กรุณารัน Portable.exe เพื่อซ่อมแซมหรือใช้โฟลเดอร์ใหม่ ข้อมูลใน Data ยังอยู่")
}
fn processes() -> sysinfo::System {
    let mut system = sysinfo::System::new();
    system.refresh_processes(sysinfo::ProcessesToUpdate::All,true); system
}
fn core_running(exe: &Path) -> bool {
    let expected = exe.canonicalize().ok();
    processes().processes().values().any(|p| p.exe().and_then(|p| p.canonicalize().ok()).is_some_and(|p| Some(p)==expected))
}
fn ensure_no_other_app(allowed: Option<&Path>) -> Result<()> {
    let allowed = allowed.and_then(|p|p.canonicalize().ok());
    for process in processes().processes().values() {
        if process.name().to_string_lossy().eq_ignore_ascii_case("gamelingo.exe") {
            let path = process.exe().and_then(|p|p.canonicalize().ok());
            ensure!(allowed.is_some() && path == allowed,"กรุณาปิด WANGAI รุ่นติดตั้งเดิมหรือ Portable อีกโฟลเดอร์ก่อน แล้วลองใหม่");
        }
    }
    Ok(())
}
pub fn legacy_settings() -> Option<PathBuf> {
    std::env::var_os("APPDATA").map(PathBuf::from).map(|p|p.join("dev.gamelingo.overlay/settings.json")).filter(|p|p.is_file())
}
pub fn work(task:Task, root:PathBuf, import:bool, cancel:Arc<AtomicBool>, report:Reporter) -> Result<()> {
    match task {
        Task::Prepare(exe) => {
            ensure_no_other_app(None)?;
            let layout = PortableLayout::initialize(&root)?; let _lock = layout.lock()?;
            ensure!(transaction::journal(&layout)?.is_none(),"มีการอัปเดตค้างอยู่ กรุณาเปิด WANGAI.exe เพื่อกู้คืนก่อน");
            let (nonce,folder) = layout.new_transaction()?;
            let result = (|| {
                report(Progress::Status("กำลังตรวจลายเซ็นแพ็กเกจ…".into(),0,true));
                let payload = folder.join("payload.zip");
                let signature = package::embedded_payload(&exe,&payload,PUBLIC_KEY,&cancel,&|_,_|{})?;
                cancelled(&cancel)?;
                let notify=report.clone();let event=std::sync::Mutex::new(Instant::now());
                let manifest = package::unpack(&payload,&signature,PUBLIC_KEY,&folder.join("staged"),None,&cancel,&move|done,total| {
                    let mut last=event.lock().unwrap();
                    if last.elapsed()>Duration::from_millis(100) {*last=Instant::now();notify(Progress::Status("กำลังเตรียมไฟล์…".into(),(done*90/total.max(1)) as u32,true));}
                })?;
                if !layout.data().join("settings.json").exists() && import {
                    let original = legacy_settings().context("ไม่พบ settings เดิม กรุณาเลือกเริ่มใหม่เอง")?;
                    let mut input = package::readonly_file(&original)?;
                    use std::io::Read;
                    ensure!(input.metadata()?.len() <= 8*1024*1024,"Settings เดิมมีขนาดผิดปกติ");
                    let mut bytes=Vec::new(); input.read_to_end(&mut bytes)?;
                    let candidate = folder.join("import-settings.json"); atomic_write(&candidate,&bytes)?;
                    use std::os::windows::process::CommandExt;
                    let validation = Command::new(folder.join("staged/gamelingo.exe")).arg("--validate-portable-settings").arg(&candidate).creation_flags(0x08000000).status()?;
                    ensure!(validation.success(),"Settings เดิมไม่ถูกต้อง ยังไม่ได้นำเข้า กรุณายกเลิกตัวเลือกนำเข้าหากต้องการเริ่มใหม่ ต้นฉบับไม่ถูกเปลี่ยน");
                    cancelled(&cancel)?;
                    // Validation occurs before any AppState/Gateway exists. Do not overwrite Portable data.
                    use std::io::Write;
                    let mut target=fs::OpenOptions::new().write(true).create_new(true).open(layout.data().join("settings.json"))?;
                    target.write_all(&bytes)?; target.sync_all()?;
                }
                cancelled(&cancel)?; ensure_no_other_app(None)?;
                report(Progress::Status("กำลังเปิด WANGAI — รอ Ready Room และ worker…".into(),95,false));
                apply_and_launch(&layout,&nonce,&manifest.version,&report)
            })();
            if transaction::journal(&layout)?.is_none() { let _=layout.cleanup_transaction(&nonce); }
            result
        }
        Task::Apply(nonce) => {
            let layout=PortableLayout::open(&root)?;
            let folder=layout.transaction(&nonce)?;
            let request:UpdateRequest=read_json(&folder.join("request.json"))?;
            ensure!(request.format==1 && request.nonce==nonce,"Invalid update request");
            validate_version(&request.version)?;
            let expected=layout.version(&layout.active()?.current)?.join("gamelingo.exe");
            report(Progress::Status("รอโปรแกรมเดิมปิดอย่างปลอดภัย…".into(),15,false));
            platform::wait_parent(request.parent_pid,&expected,|| atomic_json(&folder.join("helper-ready.json"),&serde_json::json!({"nonce":nonce,"pid":std::process::id()})))?;
            let shutdown:serde_json::Value=read_json(&folder.join("shutdown-ready.json"))?;
            ensure!(shutdown["nonce"]==nonce && shutdown["pid"]==request.parent_pid,"App shutdown did not complete successfully; update was not applied");
            let _lock=layout.lock()?;
            ensure_no_other_app(None)?;
            package::verify_archive(&folder.join("payload.zip"),&request.signature,PUBLIC_KEY)?;
            let manifest=package::verify_installed(&folder.join("staged"),PUBLIC_KEY,true)?;
            ensure!(manifest.version==request.version,"Staged update version mismatch");
            report(Progress::Status("กำลังเปลี่ยนชุดโปรแกรม…".into(),60,false));
            apply_and_launch(&layout,&nonce,&request.version,&report)
        }
        Task::Recover => {
            let layout=PortableLayout::open(&root)?; let _lock=layout.lock()?;
            ensure_no_other_app(None)?;
            report(Progress::Status("กำลังกู้คืนการอัปเดตที่หยุดกลางทาง…".into(),30,false));
            let restored=transaction::rollback(&layout,PUBLIC_KEY)?.context("ชุดโปรแกรมแรกเปิดไม่สำเร็จ กรุณารัน Portable.exe ใหม่ ข้อมูล Data ยังอยู่")?;
            let (nonce,_) = layout.new_transaction()?;
            launch_ready(&layout,&nonce,&restored).context("กู้คืนไฟล์แล้ว แต่เปิดโปรแกรมไม่ได้ กรุณาตรวจไฟล์หรือเตรียม Portable ในโฟลเดอร์ใหม่ ข้อมูล Data ไม่ถูกลบ")?;
            crate::ui::error("คืนโปรแกรมรุ่นก่อนหน้าแล้ว ข้อมูลใน Data ไม่ถูกย้อนทับ กรุณาลองอัปเดตอีกครั้งภายหลัง");
            Ok(())
        }
    }
}
fn apply_and_launch(layout:&PortableLayout,nonce:&str,version:&str,report:&Reporter) -> Result<()> {
    let result=(|| {
        transaction::begin(layout,nonce,PUBLIC_KEY)?;
        report(Progress::Status("กำลังเปิดรุ่นใหม่ — รอ Ready Room และ worker (สูงสุด 90 วินาที)…".into(),85,false));
        launch_ready(layout,nonce,version)?;
        transaction::commit(layout,PUBLIC_KEY)
    })();
    if result.is_err() && transaction::journal(layout)?.is_some() {
        report(Progress::Status("รุ่นใหม่เปิดไม่สำเร็จ กำลังคืนรุ่นก่อนหน้า…".into(),70,false));
        let old=transaction::rollback(layout,PUBLIC_KEY)?;
        if let Some(old)=old {
            let (recovery_nonce,_)=layout.new_transaction()?;
            launch_ready(layout,&recovery_nonce,&old).context("คืนไฟล์แล้ว แต่โปรแกรมยังเปิดไม่ได้ หยุดการลองอัตโนมัติ ข้อมูล Data ไม่ถูกลบ")?;
        }
    }
    result
}
fn launch_ready(layout:&PortableLayout,nonce:&str,version:&str) -> Result<()> {
    let child=platform::SupervisedChild::spawn(&layout.version(version)?.join("gamelingo.exe"),nonce)?;
    let start=Instant::now(); let ready_file=layout.transaction(nonce)?.join("ready.json");
    while start.elapsed()<Duration::from_secs(90) {
        if child.exited() { child.stop()?; anyhow::bail!("WANGAI ปิดก่อนเริ่มทำงานสำเร็จ"); }
        if let Ok(ready)=read_json::<StartupReady>(&ready_file) {
            if ready.nonce==nonce && ready.version==version && ready.pid==child.pid && ready.ui_ready && ready.worker_ready { child.release()?; return Ok(()); }
        }
        std::thread::sleep(Duration::from_millis(150));
    }
    child.stop()?;
    anyhow::bail!("WANGAI ไม่พร้อมภายใน 90 วินาที — หยุดเฉพาะ process ที่ตัวเปิดนี้สร้าง ไม่เปลี่ยน Data")
}
