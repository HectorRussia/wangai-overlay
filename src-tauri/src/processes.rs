use std::path::Path;

use sysinfo::{Pid, ProcessesToUpdate, System};

use crate::models::{CaptureSource, SavedProcess};

const MISTFALL_SHIPPING_EXECUTABLE: &str = "MistfallHunter-Win64-Shipping.exe";
const MISTFALL_ROOT_EXECUTABLE: &str = "MistfallHunter.exe";
const DISCORD_EXECUTABLES: [&str; 3] = ["Discord.exe", "DiscordPTB.exe", "DiscordCanary.exe"];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CaptureRole {
    Game,
    VoiceChat,
}

#[derive(Debug, Clone)]
struct ProcessNode {
    source: CaptureSource,
    parent_pid: Option<u32>,
}

#[derive(Debug, Clone)]
pub struct ResolvedCaptureProcess {
    pub selected: CaptureSource,
    pub capture_root: CaptureSource,
}

pub fn list_capture_sources() -> Vec<CaptureSource> {
    let mut sources = process_nodes()
        .into_iter()
        .map(|node| node.source)
        .collect::<Vec<_>>();
    sort_sources(&mut sources);
    sources
}

pub fn resolve_saved_process(saved: &SavedProcess) -> Option<ResolvedCaptureProcess> {
    resolve_from_nodes(saved, &process_nodes(), CaptureRole::Game)
}

pub fn resolve_saved_voice_chat_process(saved: &SavedProcess) -> Option<ResolvedCaptureProcess> {
    resolve_from_nodes(saved, &process_nodes(), CaptureRole::VoiceChat)
}

pub fn auto_detect_voice_chat_process() -> Option<ResolvedCaptureProcess> {
    auto_detect_voice_chat_from_nodes(&process_nodes())
}

pub fn process_is_alive(pid: u32) -> bool {
    let system = System::new_all();
    system.process(Pid::from_u32(pid)).is_some()
}

fn process_nodes() -> Vec<ProcessNode> {
    let current_pid = std::process::id();
    let mut system = System::new_all();
    system.refresh_processes(ProcessesToUpdate::All, true);
    system
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
            Some(ProcessNode {
                source: capture_source(pid, name, executable_path),
                parent_pid: process.parent().map(|value| value.as_u32()),
            })
        })
        .collect()
}

fn capture_source(pid: u32, name: String, executable_path: String) -> CaptureSource {
    let is_mistfall = is_mistfall_family(&name)
        || Path::new(&executable_path)
            .file_name()
            .and_then(|value| value.to_str())
            .is_some_and(is_mistfall_family);
    CaptureSource {
        pid,
        display_name: friendly_name(&name),
        name,
        executable_path,
        is_mistfall,
    }
}

fn resolve_from_nodes(
    saved: &SavedProcess,
    nodes: &[ProcessNode],
    role: CaptureRole,
) -> Option<ResolvedCaptureProcess> {
    let selected = saved
        .last_pid
        .and_then(|pid| {
            nodes
                .iter()
                .find(|node| node.source.pid == pid && source_matches_saved(&node.source, saved))
        })
        .or_else(|| {
            let mut matches = nodes
                .iter()
                .filter(|node| source_matches_saved(&node.source, saved))
                .collect::<Vec<_>>();
            matches.sort_by_key(|node| node.source.pid);
            matches.into_iter().next()
        })?;

    let mut root = selected;
    let should_climb = |source: &CaptureSource| match role {
        CaptureRole::Game => is_mistfall_source(source),
        CaptureRole::VoiceChat => is_discord_source(source),
    };
    if should_climb(&selected.source) {
        while let Some(parent_pid) = root.parent_pid {
            let Some(parent) = nodes.iter().find(|node| node.source.pid == parent_pid) else {
                break;
            };
            if !should_climb(&parent.source) {
                break;
            }
            root = parent;
        }
    }

    Some(ResolvedCaptureProcess {
        selected: selected.source.clone(),
        capture_root: root.source.clone(),
    })
}

fn auto_detect_voice_chat_from_nodes(nodes: &[ProcessNode]) -> Option<ResolvedCaptureProcess> {
    let mut matches = nodes
        .iter()
        .filter(|node| is_discord_source(&node.source))
        .collect::<Vec<_>>();
    matches.sort_by_key(|node| (discord_priority(&node.source.name), node.source.pid));
    let selected = matches.first()?;
    let saved = SavedProcess::from(&selected.source);
    resolve_from_nodes(&saved, nodes, CaptureRole::VoiceChat)
}

fn source_matches_saved(source: &CaptureSource, saved: &SavedProcess) -> bool {
    let expected_path = normalize_path(&saved.executable_path);
    let source_path = normalize_path(&source.executable_path);
    (!expected_path.is_empty() && !source_path.is_empty() && source_path == expected_path)
        || source.name.eq_ignore_ascii_case(&saved.executable_name)
}

fn sort_sources(sources: &mut [CaptureSource]) {
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
}

fn is_mistfall_source(source: &CaptureSource) -> bool {
    source.is_mistfall || is_mistfall_family(&source.name)
}

fn is_discord_source(source: &CaptureSource) -> bool {
    is_discord_family(&source.name)
        || Path::new(&source.executable_path)
            .file_name()
            .and_then(|value| value.to_str())
            .is_some_and(is_discord_family)
}

fn is_discord_family(executable: &str) -> bool {
    DISCORD_EXECUTABLES
        .iter()
        .any(|candidate| executable.eq_ignore_ascii_case(candidate))
}

fn discord_priority(executable: &str) -> u8 {
    DISCORD_EXECUTABLES
        .iter()
        .position(|candidate| executable.eq_ignore_ascii_case(candidate))
        .unwrap_or(DISCORD_EXECUTABLES.len()) as u8
}

fn is_mistfall_family(executable: &str) -> bool {
    executable.eq_ignore_ascii_case(MISTFALL_ROOT_EXECUTABLE)
        || executable.eq_ignore_ascii_case(MISTFALL_SHIPPING_EXECUTABLE)
}

fn normalize_path(value: &str) -> String {
    value.replace('/', "\\").to_ascii_lowercase()
}

fn friendly_name(executable: &str) -> String {
    let stem = Path::new(executable)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or(executable);
    if is_mistfall_family(executable) {
        "Mistfall Hunter".into()
    } else {
        stem.replace(['_', '-'], " ")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn node(pid: u32, parent_pid: Option<u32>, name: &str) -> ProcessNode {
        ProcessNode {
            source: capture_source(pid, name.into(), format!("C:\\Games\\{name}")),
            parent_pid,
        }
    }

    fn saved(pid: Option<u32>) -> SavedProcess {
        SavedProcess {
            executable_path: format!("C:\\Games\\{MISTFALL_SHIPPING_EXECUTABLE}"),
            executable_name: MISTFALL_SHIPPING_EXECUTABLE.into(),
            display_name: "Mistfall Hunter".into(),
            last_pid: pid,
        }
    }

    #[test]
    fn prefers_saved_pid_and_climbs_only_the_mistfall_family() {
        let nodes = vec![
            node(10, Some(5), MISTFALL_ROOT_EXECUTABLE),
            node(20, Some(10), MISTFALL_SHIPPING_EXECUTABLE),
            node(30, Some(20), MISTFALL_SHIPPING_EXECUTABLE),
            node(5, None, "steam.exe"),
        ];
        let resolved =
            resolve_from_nodes(&saved(Some(30)), &nodes, CaptureRole::Game).expect("resolve");
        assert_eq!(resolved.selected.pid, 30);
        assert_eq!(resolved.capture_root.pid, 10);
    }

    #[test]
    fn stale_saved_pid_uses_a_matching_executable() {
        let nodes = vec![node(40, None, MISTFALL_SHIPPING_EXECUTABLE)];
        let resolved =
            resolve_from_nodes(&saved(Some(999)), &nodes, CaptureRole::Game).expect("resolve");
        assert_eq!(resolved.selected.pid, 40);
        assert_eq!(resolved.capture_root.pid, 40);
    }

    #[test]
    fn reused_pid_must_still_match_the_saved_process() {
        let nodes = vec![
            node(30, None, "notepad.exe"),
            node(40, None, MISTFALL_SHIPPING_EXECUTABLE),
        ];
        let resolved =
            resolve_from_nodes(&saved(Some(30)), &nodes, CaptureRole::Game).expect("resolve");
        assert_eq!(resolved.selected.pid, 40);
    }

    #[test]
    fn generic_process_does_not_climb_into_its_launcher() {
        let nodes = vec![node(70, Some(60), "Game.exe"), node(60, None, "steam.exe")];
        let saved = SavedProcess {
            executable_path: "C:\\Games\\Game.exe".into(),
            executable_name: "Game.exe".into(),
            display_name: "Game".into(),
            last_pid: Some(70),
        };
        let resolved = resolve_from_nodes(&saved, &nodes, CaptureRole::Game).expect("resolve");
        assert_eq!(resolved.capture_root.pid, 70);
    }

    #[test]
    fn makes_mistfall_name_friendly() {
        assert_eq!(
            friendly_name(MISTFALL_SHIPPING_EXECUTABLE),
            "Mistfall Hunter"
        );
        assert_eq!(friendly_name(MISTFALL_ROOT_EXECUTABLE), "Mistfall Hunter");
    }

    #[test]
    fn normalizes_windows_paths_case_insensitively() {
        assert_eq!(normalize_path("E:/Games/Test.EXE"), "e:\\games\\test.exe");
    }

    #[test]
    fn voice_chat_climbs_discord_tree_but_stops_before_updater() {
        let nodes = vec![
            node(10, Some(5), "Discord.exe"),
            node(20, Some(10), "Discord.exe"),
            node(5, None, "Update.exe"),
        ];
        let saved = SavedProcess {
            executable_path: "C:\\Games\\Discord.exe".into(),
            executable_name: "Discord.exe".into(),
            display_name: "Discord".into(),
            last_pid: Some(20),
        };
        let resolved = resolve_from_nodes(&saved, &nodes, CaptureRole::VoiceChat).expect("resolve");
        assert_eq!(resolved.selected.pid, 20);
        assert_eq!(resolved.capture_root.pid, 10);
    }

    #[test]
    fn auto_detect_prefers_stable_discord_over_ptb_and_canary() {
        let nodes = vec![
            node(30, None, "DiscordCanary.exe"),
            node(20, None, "DiscordPTB.exe"),
            node(10, None, "Discord.exe"),
        ];
        let resolved = auto_detect_voice_chat_from_nodes(&nodes).expect("discord");
        assert_eq!(resolved.selected.pid, 10);
    }
}
