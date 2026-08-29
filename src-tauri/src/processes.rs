use std::path::Path;

use sysinfo::{Pid, ProcessesToUpdate, System};

use crate::models::{CaptureSource, SavedProcess};

const MISTFALL_EXECUTABLE: &str = "MistfallHunter-Win64-Shipping.exe";

pub fn list_capture_sources() -> Vec<CaptureSource> {
    let current_pid = std::process::id();
    let mut system = System::new_all();
    system.refresh_processes(ProcessesToUpdate::All, true);

    let mut sources = system
        .processes()
        .iter()
        .filter_map(|(pid, process)| {
            let pid = pid.as_u32();
            if pid == current_pid || pid <= 4 {
                return None;
            }
            let name = process.name().to_string_lossy().to_string();
            if name.trim().is_empty() {
                return None;
            }
            let executable_path = process
                .exe()
                .map(|path| path.to_string_lossy().to_string())
                .unwrap_or_default();
            let is_mistfall = name.eq_ignore_ascii_case(MISTFALL_EXECUTABLE)
                || executable_path
                    .to_ascii_lowercase()
                    .ends_with(&MISTFALL_EXECUTABLE.to_ascii_lowercase());
            let display_name = friendly_name(&name);
            Some(CaptureSource {
                pid,
                name,
                executable_path,
                display_name,
                is_mistfall,
            })
        })
        .collect::<Vec<_>>();

    sources.sort_by(|a, b| {
        b.is_mistfall
            .cmp(&a.is_mistfall)
            .then_with(|| {
                b.executable_path
                    .is_empty()
                    .cmp(&a.executable_path.is_empty())
            })
            .then_with(|| {
                a.display_name
                    .to_ascii_lowercase()
                    .cmp(&b.display_name.to_ascii_lowercase())
            })
            .then_with(|| a.pid.cmp(&b.pid))
    });
    sources
}

pub fn resolve_saved_process(saved: &SavedProcess) -> Option<CaptureSource> {
    let expected_path = normalize_path(&saved.executable_path);
    let expected_name = saved.executable_name.to_ascii_lowercase();
    list_capture_sources().into_iter().find(|source| {
        (!expected_path.is_empty() && normalize_path(&source.executable_path) == expected_path)
            || source.name.eq_ignore_ascii_case(&expected_name)
    })
}

pub fn process_is_alive(pid: u32) -> bool {
    let system = System::new_all();
    system.process(Pid::from_u32(pid)).is_some()
}

fn normalize_path(value: &str) -> String {
    value.replace('/', "\\").to_ascii_lowercase()
}

fn friendly_name(executable: &str) -> String {
    let stem = Path::new(executable)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or(executable);
    if stem.eq_ignore_ascii_case("MistfallHunter-Win64-Shipping") {
        "Mistfall Hunter".into()
    } else {
        stem.replace(['_', '-'], " ")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn makes_mistfall_name_friendly() {
        assert_eq!(friendly_name(MISTFALL_EXECUTABLE), "Mistfall Hunter");
    }

    #[test]
    fn normalizes_windows_paths_case_insensitively() {
        assert_eq!(normalize_path("E:/Games/Test.EXE"), "e:\\games\\test.exe");
    }
}
