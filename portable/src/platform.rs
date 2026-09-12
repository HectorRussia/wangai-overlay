use anyhow::{ensure, Result};
use std::path::Path;

#[cfg(windows)] pub struct HostLock(windows::Win32::Foundation::HANDLE);
#[cfg(windows)] impl HostLock {
    pub fn acquire()->Result<Self> {
        use windows::{core::w,Win32::{Foundation::{CloseHandle,WAIT_OBJECT_0,WAIT_ABANDONED},System::Threading::*}};
        unsafe {
            let handle=CreateMutexW(None,false,w!("Local\\WANGAI.Portable.Host.Operation.1"))?;
            let wait=WaitForSingleObject(handle,3000);
            if wait!=WAIT_OBJECT_0 && wait!=WAIT_ABANDONED {let _=CloseHandle(handle);anyhow::bail!("WANGAI อีกหน้าต่างกำลังเตรียม เปิด หรืออัปเดตโปรแกรม กรุณารอให้เสร็จก่อน");}
            Ok(Self(handle))
        }
    }
}
#[cfg(windows)] impl Drop for HostLock {fn drop(&mut self){unsafe{let _=windows::Win32::System::Threading::ReleaseMutex(self.0);let _=windows::Win32::Foundation::CloseHandle(self.0);}}}

#[cfg(windows)] pub fn wide(value: impl AsRef<std::ffi::OsStr>) -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;
    value.as_ref().encode_wide().chain(Some(0)).collect()
}
pub fn replace_file(from: &Path, to: &Path) -> Result<()> {
    #[cfg(windows)] unsafe {
        use windows::{core::PCWSTR, Win32::Storage::FileSystem::*};
        MoveFileExW(PCWSTR(wide(from).as_ptr()), PCWSTR(wide(to).as_ptr()), MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH)?;
    }
    #[cfg(not(windows))] std::fs::rename(from, to)?;
    Ok(())
}

/// ONNX/Python native dependencies still have MAX_PATH-sensitive DLL loading.
/// Use an existing NTFS alias for the same file, not a junction or alternate install.
pub fn dependency_executable(path: &Path) -> Result<std::path::PathBuf> {
    crate::no_links(path)?;
    #[cfg(windows)] unsafe {
        use windows::{core::PCWSTR, Win32::Storage::FileSystem::GetShortPathNameW};
        let canonical = path.canonicalize()?;
        let mut buffer = vec![0u16; 32768];
        let count = GetShortPathNameW(PCWSTR(wide(&canonical).as_ptr()), Some(&mut buffer));
        let candidate = if count > 0 && (count as usize) < buffer.len() {
            std::path::PathBuf::from(String::from_utf16(&buffer[..count as usize])?)
        } else { canonical.clone() };
        let text = candidate.to_string_lossy();
        let ordinary = text.strip_prefix("\\\\?\\").unwrap_or(&text);
        let candidate = std::path::PathBuf::from(ordinary);
        ensure!(candidate.canonicalize()? == canonical, "Worker alias does not identify the packaged executable");
        let probe = candidate.parent().unwrap().join("_internal/onnxruntime/capi/onnxruntime_pybind11_state.pyd");
        ensure!(wide(&probe).len() <= 260, "ตำแหน่งโฟลเดอร์ยาวเกินข้อจำกัดของ DLL เสียง กรุณาย้ายทั้งโฟลเดอร์ WANGAI ไปยังตำแหน่งที่สั้นกว่า เช่น C:\\WANGAI (ข้อมูล Data ไม่ถูกเปลี่ยน)");
        return Ok(candidate);
    }
    #[cfg(not(windows))] Ok(path.to_path_buf())
}

#[cfg(all(test,windows))]
mod dependency_tests {
    #[test]
    fn dependency_alias_preserves_file_identity_for_unicode_paths() {
        let temp=tempfile::tempdir().unwrap();
        let folder=temp.path().join("ทดสอบ worker path");
        std::fs::create_dir(&folder).unwrap();
        let original=folder.join("wangai-worker.exe");
        std::fs::write(&original,b"not executable; identity fixture only").unwrap();
        let selected=super::dependency_executable(&original).unwrap();
        assert_eq!(selected.canonicalize().unwrap(),original.canonicalize().unwrap());
        assert!(!selected.to_string_lossy().starts_with("\\\\?\\"));
        assert!(super::dependency_executable(&folder.join("missing.exe")).is_err());
    }
}
pub fn validate_destination(path: &Path) -> Result<()> {
    ensure!(path.is_absolute(), "กรุณาเลือกตำแหน่งโฟลเดอร์แบบเต็ม");
    #[cfg(windows)] unsafe {
        use windows::{core::PCWSTR, Win32::Storage::FileSystem::*};
        let text = path.to_string_lossy();
        ensure!(!text.starts_with("\\\\") || text.starts_with("\\\\?\\") && !text.starts_with("\\\\?\\UNC"), "Portable ไม่รองรับ network share");
        let mut existing = path;
        while !existing.exists() { existing = existing.parent().ok_or_else(|| anyhow::anyhow!("ไม่พบไดรฟ์ปลายทาง"))?; }
        let mut volume = [0u16; 1024];
        GetVolumePathNameW(PCWSTR(wide(existing).as_ptr()), &mut volume)?;
        ensure!(GetDriveTypeW(PCWSTR(volume.as_ptr())) != 4, "Portable ไม่รองรับ network drive");
        let mut format = [0u16; 64];
        GetVolumeInformationW(PCWSTR(volume.as_ptr()), None, None, None, None, Some(&mut format))?;
        let end = format.iter().position(|c| *c == 0).unwrap_or(format.len());
        ensure!(String::from_utf16_lossy(&format[..end]) == "NTFS", "กรุณาเลือกโฟลเดอร์บนไดรฟ์ NTFS");
    }
    Ok(())
}

#[cfg(windows)] pub fn runtime_acl(runtime: &Path) -> Result<()> {
    // Microsoft requires these read/execute ACLs for unpackaged Fixed WebView2 on Win10.
    // Applying them also on Win11 is harmless. Never grant write rights or touch a parent.
    use std::os::windows::process::CommandExt;
    crate::no_links_tree(runtime)?;
    let result = std::process::Command::new("icacls.exe").arg(runtime)
        .args(["/grant", "*S-1-15-2-2:(OI)(CI)(RX)", "*S-1-15-2-1:(OI)(CI)(RX)"])
        .creation_flags(0x0800_0000).output()?;
    ensure!(result.status.success(), "ตั้งสิทธิ์อ่าน WebView2 ไม่สำเร็จ กรุณาเลือกโฟลเดอร์ที่คุณเป็นเจ้าของ");
    Ok(())
}
#[cfg(not(windows))] pub fn runtime_acl(_: &Path) -> Result<()> { Ok(()) }

#[cfg(windows)] pub struct ChildJob(windows::Win32::Foundation::HANDLE);
#[cfg(windows)] impl ChildJob {
    pub fn attach(child: &std::process::Child) -> Result<Self> {
        use std::os::windows::io::AsRawHandle;
        use windows::{core::PCWSTR, Win32::{Foundation::{HANDLE, CloseHandle}, System::JobObjects::*}};
        unsafe {
            let job = CreateJobObjectW(None, PCWSTR::null())?;
            let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            let result = SetInformationJobObject(job, JobObjectExtendedLimitInformation, &limits as *const _ as _, std::mem::size_of_val(&limits) as u32)
                .and_then(|_| AssignProcessToJobObject(job, HANDLE(child.as_raw_handle())));
            if let Err(error) = result { let _ = CloseHandle(job); return Err(error.into()); }
            Ok(Self(job))
        }
    }
    pub fn release(&self) -> Result<()> {
        use windows::Win32::System::JobObjects::*;
        let limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
        unsafe { SetInformationJobObject(self.0, JobObjectExtendedLimitInformation, &limits as *const _ as _, std::mem::size_of_val(&limits) as u32)?; }
        Ok(())
    }
}
#[cfg(windows)] impl Drop for ChildJob { fn drop(&mut self) { unsafe { let _ = windows::Win32::Foundation::CloseHandle(self.0); } } }

#[cfg(windows)] pub fn wait_parent(pid: u32, expected_exe: &Path, opened: impl FnOnce() -> Result<()>) -> Result<()> {
    use windows::{core::PWSTR, Win32::{Foundation::{CloseHandle, WAIT_OBJECT_0}, System::Threading::*}};
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_SYNCHRONIZE, false, pid)?;
        let result = (|| {
            let mut path = [0u16; 32768]; let mut size = path.len() as u32;
            QueryFullProcessImageNameW(handle, PROCESS_NAME_WIN32, PWSTR(path.as_mut_ptr()), &mut size)?;
            let actual = std::path::PathBuf::from(String::from_utf16(&path[..size as usize])?);
            ensure!(actual.canonicalize()? == expected_exe.canonicalize()?, "Update parent does not match this Portable app");
            #[cfg(feature="host")]
            let descendants=related_handles(pid,expected_exe.parent().unwrap())?;
            opened()?;
            let started=std::time::Instant::now();
            ensure!(WaitForSingleObject(handle, 30_000) == WAIT_OBJECT_0, "โปรแกรมเดิมยังไม่ปิด จึงยังไม่เปลี่ยนไฟล์");
            #[cfg(feature="host")]
            for child in &descendants.0 {
                let remaining=30_000u32.saturating_sub(started.elapsed().as_millis() as u32);
                ensure!(WaitForSingleObject(*child,remaining)==WAIT_OBJECT_0,"worker หรือ WebView2 เดิมยังไม่ปิด จึงยังไม่เปลี่ยนไฟล์");
            }
            #[cfg(not(feature="host"))] let _=started;
            Ok(())
        })();
        let _ = CloseHandle(handle); result
    }
}

#[cfg(all(windows,feature="host"))]
struct ProcessHandles(Vec<windows::Win32::Foundation::HANDLE>);
#[cfg(all(windows,feature="host"))]
impl Drop for ProcessHandles { fn drop(&mut self) { for handle in &self.0 {unsafe{let _=windows::Win32::Foundation::CloseHandle(*handle);}} } }
#[cfg(all(windows,feature="host"))]
fn related_handles(parent:u32,version:&Path)->Result<ProcessHandles> {
    use windows::{core::PWSTR,Win32::System::Threading::*};
    let mut system=sysinfo::System::new();system.refresh_processes(sysinfo::ProcessesToUpdate::All,true);
    let mut ids=std::collections::HashSet::from([sysinfo::Pid::from_u32(parent)]);
    loop {
        let count=ids.len();
        for (id,process) in system.processes() {
            if id.as_u32()!=std::process::id() && process.parent().is_some_and(|p|ids.contains(&p)) {ids.insert(*id);}
        }
        if count==ids.len(){break;}
    }
    let version=version.canonicalize()?;let mut handles=ProcessHandles(Vec::new());
    for pid in ids {
        if pid.as_u32()==parent {continue;}
        // Opening Web Companion can create a user browser process. It is not
        // an owned dependency; only bundled worker/WebView descendants are waited.
        if !system.process(pid).and_then(|p|p.exe()).and_then(|p|p.canonicalize().ok()).is_some_and(|p|p.starts_with(&version)) {continue;}
        unsafe {
            let handle=match OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION|PROCESS_SYNCHRONIZE,false,pid.as_u32()) {
                Ok(handle)=>handle,
                Err(error) if error.code()==windows::core::HRESULT::from_win32(87)=>continue, // Already exited.
                Err(error)=>return Err(error.into()),
            };
            handles.0.push(handle);
            let mut path=[0u16;32768];let mut size=path.len() as u32;
            QueryFullProcessImageNameW(handle,PROCESS_NAME_WIN32,PWSTR(path.as_mut_ptr()),&mut size)?;
            let path=std::path::PathBuf::from(String::from_utf16(&path[..size as usize])?).canonicalize()?;
            ensure!(path.starts_with(&version),"Related process identity changed before update");
        }
    }
    Ok(handles)
}

/// Launch suspended so every descendant belongs to our job before any app code runs.
#[cfg(windows)] pub struct SupervisedChild {
    process: windows::Win32::Foundation::HANDLE,
    job: ChildJob,
    pub pid: u32,
}
#[cfg(windows)] impl SupervisedChild {
    pub fn spawn(exe: &Path, nonce: &str) -> Result<Self> {
        use windows::{core::{PCWSTR,PWSTR}, Win32::{Foundation::CloseHandle, System::{Threading::*, JobObjects::*}}};
        crate::validate_nonce(nonce)?;
        let mut command = wide(format!("\"{}\" --portable-startup {}", exe.display(), nonce));
        unsafe {
            let mut startup = STARTUPINFOW { cb: std::mem::size_of::<STARTUPINFOW>() as u32, ..Default::default() };
            let mut process = PROCESS_INFORMATION::default();
            CreateProcessW(PCWSTR(wide(exe).as_ptr()), Some(PWSTR(command.as_mut_ptr())), None, None, false,
                CREATE_SUSPENDED | CREATE_UNICODE_ENVIRONMENT, None, PCWSTR(wide(exe.parent().unwrap()).as_ptr()), &mut startup, &mut process)?;
            let result = (|| {
                let job = ChildJob(CreateJobObjectW(None, PCWSTR::null())?);
                let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
                limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
                SetInformationJobObject(job.0, JobObjectExtendedLimitInformation, &limits as *const _ as _, std::mem::size_of_val(&limits) as u32)?;
                AssignProcessToJobObject(job.0, process.hProcess)?;
                ensure!(ResumeThread(process.hThread) != u32::MAX, "Cannot resume new Portable process");
                Ok(Self {process:process.hProcess,job,pid:process.dwProcessId})
            })();
            let _ = CloseHandle(process.hThread);
            if result.is_err() { let _ = TerminateProcess(process.hProcess,1); let _ = CloseHandle(process.hProcess); }
            result
        }
    }
    pub fn exited(&self) -> bool { unsafe { windows::Win32::System::Threading::WaitForSingleObject(self.process,0) == windows::Win32::Foundation::WAIT_OBJECT_0 } }
    pub fn release(&self) -> Result<()> { self.job.release() }
    pub fn stop(&self) -> Result<()> {
        use windows::Win32::{System::{JobObjects::*,Threading::*},Foundation::WAIT_OBJECT_0};
        unsafe {
            TerminateJobObject(self.job.0,1)?;
            ensure!(WaitForSingleObject(self.process,10_000)==WAIT_OBJECT_0,"Owned startup process did not exit");
        }
        // DLL handles held by descendants must be gone before the transaction swaps files.
        for _ in 0..100 {
            unsafe {
                let mut info=JOBOBJECT_BASIC_ACCOUNTING_INFORMATION::default();
                QueryInformationJobObject(Some(self.job.0),JobObjectBasicAccountingInformation,&mut info as *mut _ as _,std::mem::size_of_val(&info) as u32,None)?;
                if info.ActiveProcesses==0 {return Ok(());}
            }
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
        anyhow::bail!("Owned startup descendants are still running")
    }
}
#[cfg(windows)] impl Drop for SupervisedChild {
    fn drop(&mut self) { unsafe { let _ = windows::Win32::Foundation::CloseHandle(self.process); } }
}
