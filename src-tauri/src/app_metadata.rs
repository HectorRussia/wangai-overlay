use std::{
    collections::{HashMap, HashSet},
    sync::{Mutex, OnceLock},
    time::SystemTime,
};

#[derive(Clone, Default)]
pub struct AppMetadata {
    pub names: Vec<String>,
}

type MetadataCache = HashMap<String, (Option<SystemTime>, AppMetadata)>;
static CACHE: OnceLock<Mutex<MetadataCache>> = OnceLock::new();

pub fn executable_metadata(path: &str) -> AppMetadata {
    if path.is_empty() {
        return AppMetadata::default();
    }
    let modified = std::fs::metadata(path).and_then(|m| m.modified()).ok();
    let key = path.replace('/', "\\").to_lowercase();
    let cache = CACHE.get_or_init(Default::default);
    if let Some((stamp, value)) = cache.lock().unwrap().get(&key) {
        if *stamp == modified {
            return value.clone();
        }
    }
    let value = read_metadata(path);
    let mut cache = cache.lock().unwrap();
    if cache.len() >= 2048 {
        cache.clear();
    }
    cache.insert(key, (modified, value.clone()));
    value
}

#[cfg(windows)]
fn read_metadata(path: &str) -> AppMetadata {
    use windows::{
        core::PCWSTR,
        Win32::Storage::FileSystem::{
            GetFileVersionInfoSizeW, GetFileVersionInfoW, VerQueryValueW,
        },
    };
    let wide = |s: &str| s.encode_utf16().chain(Some(0)).collect::<Vec<_>>();
    let path = wide(path);
    unsafe {
        let size = GetFileVersionInfoSizeW(PCWSTR(path.as_ptr()), None);
        if size == 0 {
            return AppMetadata::default();
        }
        // u32 storage keeps the version resource aligned for Win32.
        let mut data = vec![0u32; (size as usize + 3) / 4];
        if GetFileVersionInfoW(PCWSTR(path.as_ptr()), None, size, data.as_mut_ptr().cast()).is_err()
        {
            return AppMetadata::default();
        }
        let mut ptr = std::ptr::null_mut();
        let mut len = 0;
        let query = wide("\\VarFileInfo\\Translation");
        let mut translations = vec![(0x0409u16, 0x04b0u16)];
        if VerQueryValueW(
            data.as_ptr().cast(),
            PCWSTR(query.as_ptr()),
            &mut ptr,
            &mut len,
        )
        .as_bool()
            && !ptr.is_null()
        {
            translations = std::slice::from_raw_parts(ptr.cast::<u16>(), len as usize / 2)
                .chunks_exact(2)
                .map(|v| (v[0], v[1]))
                .collect();
        }
        let mut names = Vec::new();
        for field in ["ProductName", "FileDescription"] {
            for (lang, codepage) in &translations {
                let query = wide(&format!(
                    "\\StringFileInfo\\{lang:04x}{codepage:04x}\\{field}"
                ));
                if VerQueryValueW(
                    data.as_ptr().cast(),
                    PCWSTR(query.as_ptr()),
                    &mut ptr,
                    &mut len,
                )
                .as_bool()
                    && !ptr.is_null()
                    && len > 0
                {
                    let text = String::from_utf16_lossy(std::slice::from_raw_parts(
                        ptr.cast::<u16>(),
                        len as usize,
                    ))
                    .trim_end_matches('\0')
                    .trim()
                    .to_string();
                    if !text.is_empty() && !names.contains(&text) {
                        names.push(text);
                    }
                }
            }
        }
        AppMetadata { names }
    }
}

#[cfg(not(windows))]
fn read_metadata(_: &str) -> AppMetadata {
    AppMetadata::default()
}

#[cfg(windows)]
pub fn window_processes() -> HashSet<u32> {
    use windows::{
        core::BOOL,
        Win32::{
            Foundation::{HWND, LPARAM},
            UI::WindowsAndMessaging::{
                EnumChildWindows, EnumWindows, GetWindowThreadProcessId, IsWindowVisible,
            },
        },
    };
    unsafe extern "system" fn child(hwnd: HWND, data: LPARAM) -> BOOL {
        let mut pid = 0;
        unsafe {
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            if pid != 0 {
                (&mut *(data.0 as *mut HashSet<u32>)).insert(pid);
            }
        }
        BOOL(1)
    }
    unsafe extern "system" fn window(hwnd: HWND, data: LPARAM) -> BOOL {
        unsafe {
            if IsWindowVisible(hwnd).as_bool() {
                let _ = child(hwnd, data);
                // Hosted desktop apps can own child windows in a different process.
                let _ = EnumChildWindows(Some(hwnd), Some(child), data);
            }
        }
        BOOL(1)
    }
    let mut pids = HashSet::new();
    unsafe {
        let _ = EnumWindows(Some(window), LPARAM(&mut pids as *mut _ as isize));
    }
    pids
}

#[cfg(not(windows))]
pub fn window_processes() -> HashSet<u32> {
    HashSet::new()
}
