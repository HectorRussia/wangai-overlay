use std::{
    collections::{BTreeMap, HashSet},
    path::Path,
};

use sysinfo::{Pid, ProcessesToUpdate, System};

use crate::{
    app_metadata,
    models::{CaptureSource, RunningApp, SavedProcess},
};

const MISTFALL_SHIPPING_EXECUTABLE: &str = "MistfallHunter-Win64-Shipping.exe";
const MISTFALL_ROOT_EXECUTABLE: &str = "MistfallHunter.exe";
const DISCORD_EXECUTABLES: [&str; 3] = ["Discord.exe", "DiscordPTB.exe", "DiscordCanary.exe"];
const BROWSER_EXECUTABLES: [&str; 4] = ["chrome.exe", "msedge.exe", "firefox.exe", "brave.exe"];

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

pub fn list_running_apps() -> Vec<RunningApp> {
    let nodes = process_nodes();
    group_running_apps(&nodes, &app_metadata::window_processes(), |path| {
        app_metadata::executable_metadata(path).names
    })
}

fn group_running_apps(
    nodes: &[ProcessNode],
    windows: &HashSet<u32>,
    metadata: impl Fn(&str) -> Vec<String>,
) -> Vec<RunningApp> {
    let mut groups: BTreeMap<String, Vec<&ProcessNode>> = BTreeMap::new();
    for node in nodes {
        let root = capture_root(node, nodes);
        let path = normalize_path(&root.source.executable_path);
        // With no readable path, do not merge unrelated executables on name alone.
        let key = if path.is_empty() {
            format!("pid:{}", root.source.pid)
        } else {
            path
        };
        groups.entry(key).or_default().push(node);
    }
    let mut apps = Vec::new();
    for (id, members) in groups {
        let mut roots = BTreeMap::new();
        let mut search_names = Vec::new();
        for member in &members {
            let root = capture_root(member, nodes);
            roots
                .entry(root.source.pid)
                .or_insert_with(|| root.source.clone());
            search_names.extend([
                member.source.name.clone(),
                member.source.display_name.clone(),
                member.source.executable_path.clone(),
            ]);
            search_names.extend(metadata(&member.source.executable_path));
        }
        let mut roots: Vec<CaptureSource> = roots.into_values().collect();
        let representative = &roots[0];
        let display_name = metadata(&representative.executable_path)
            .into_iter()
            .next()
            .unwrap_or_else(|| representative.display_name.clone());
        let executable_name = representative.name.clone();
        let executable_path = representative.executable_path.clone();
        for root in &mut roots {
            root.display_name = display_name.clone();
        }
        search_names.push(display_name.clone());
        search_names.sort();
        search_names.dedup();
        let mut member_pids: Vec<_> = members.iter().map(|n| n.source.pid).collect();
        member_pids.sort();
        apps.push(RunningApp {
            id,
            display_name,
            executable_name,
            executable_path,
            search_names,
            process_count: members.len(),
            member_pids,
            has_window: members.iter().any(|m| windows.contains(&m.source.pid)),
            roots,
        });
    }
    apps.sort_by(|a, b| {
        b.has_window
            .cmp(&a.has_window)
            .then_with(|| {
                a.display_name
                    .to_lowercase()
                    .cmp(&b.display_name.to_lowercase())
            })
            .then_with(|| a.id.cmp(&b.id))
    });
    apps
}

pub fn validate_selection(source: &CaptureSource) -> anyhow::Result<CaptureSource> {
    validate_selection_from_nodes(source, &process_nodes())
}

fn validate_selection_from_nodes(
    source: &CaptureSource,
    nodes: &[ProcessNode],
) -> anyhow::Result<CaptureSource> {
    let node = nodes
        .iter()
        .find(|node| {
            node.source.pid == source.pid
                && node.source.name.eq_ignore_ascii_case(&source.name)
                && normalize_path(&node.source.executable_path)
                    == normalize_path(&source.executable_path)
        })
        .ok_or_else(|| anyhow::anyhow!("แอปปิดหรือเปลี่ยน process แล้ว กรุณารีเฟรชและเลือกใหม่"))?;
    let mut root = capture_root(node, nodes).source.clone();
    root.display_name = app_metadata::executable_metadata(&root.executable_path)
        .names
        .into_iter()
        .next()
        .unwrap_or(root.display_name);
    Ok(root)
}

fn same_capture_family(child: &CaptureSource, parent: &CaptureSource) -> bool {
    let child_path = normalize_path(&child.executable_path);
    let parent_path = normalize_path(&parent.executable_path);
    if child.name.eq_ignore_ascii_case(&parent.name) {
        return child_path.is_empty() || parent_path.is_empty() || child_path == parent_path;
    }
    is_mistfall_source(child) && is_mistfall_source(parent)
}

fn capture_root<'a>(selected: &'a ProcessNode, nodes: &'a [ProcessNode]) -> &'a ProcessNode {
    let mut root = selected;
    let mut visited = HashSet::from([root.source.pid]);
    while let Some(parent_pid) = root.parent_pid {
        let Some(parent) = nodes.iter().find(|n| n.source.pid == parent_pid) else {
            break;
        };
        if !visited.insert(parent_pid) || !same_capture_family(&root.source, &parent.source) {
            break;
        }
        root = parent;
    }
    root
}

pub fn resolve_saved_process(saved: &SavedProcess) -> Option<ResolvedCaptureProcess> {
    let mut resolved = resolve_from_nodes(saved, &process_nodes())?;
    // Preserve the discovered product name across reattachment and runtime badges.
    if !saved.display_name.is_empty() {
        resolved.selected.display_name = saved.display_name.clone();
        resolved.capture_root.display_name = saved.display_name.clone();
    }
    Some(resolved)
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

    let root = capture_root(selected, nodes);

    Some(ResolvedCaptureProcess {
        selected: selected.source.clone(),
        capture_root: root.source.clone(),
    })
}

fn source_matches_saved(source: &CaptureSource, saved: &SavedProcess) -> bool {
    let expected_path = normalize_path(&saved.executable_path);
    let source_path = normalize_path(&source.executable_path);
    if !expected_path.is_empty() && !source_path.is_empty() {
        source_path == expected_path
    } else {
        source.name.eq_ignore_ascii_case(&saved.executable_name)
    }
}

fn sort_sources(sources: &mut [CaptureSource]) {
    sources.sort_by(|a, b| {
        source_priority(a)
            .cmp(&source_priority(b))
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

fn source_priority(source: &CaptureSource) -> u8 {
    if is_mistfall_source(source) {
        0
    } else if is_discord_source(source) {
        1
    } else if is_browser_source(source) {
        2
    } else {
        3
    }
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

fn is_browser_source(source: &CaptureSource) -> bool {
    is_browser_family(&source.name)
        || Path::new(&source.executable_path)
            .file_name()
            .and_then(|value| value.to_str())
            .is_some_and(is_browser_family)
}

fn is_browser_family(executable: &str) -> bool {
    BROWSER_EXECUTABLES
        .iter()
        .any(|candidate| executable.eq_ignore_ascii_case(candidate))
}

fn is_discord_family(executable: &str) -> bool {
    DISCORD_EXECUTABLES
        .iter()
        .any(|candidate| executable.eq_ignore_ascii_case(candidate))
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
    } else if executable.eq_ignore_ascii_case("chrome.exe") {
        "Google Chrome".into()
    } else if executable.eq_ignore_ascii_case("msedge.exe") {
        "Microsoft Edge".into()
    } else if executable.eq_ignore_ascii_case("firefox.exe") {
        "Mozilla Firefox".into()
    } else if executable.eq_ignore_ascii_case("brave.exe") {
        "Brave".into()
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
        let resolved = resolve_from_nodes(&saved(Some(30)), &nodes).expect("resolve");
        assert_eq!(resolved.selected.pid, 30);
        assert_eq!(resolved.capture_root.pid, 10);
    }

    #[test]
    fn stale_saved_pid_uses_a_matching_executable() {
        let nodes = vec![node(40, None, MISTFALL_SHIPPING_EXECUTABLE)];
        let resolved = resolve_from_nodes(&saved(Some(999)), &nodes).expect("resolve");
        assert_eq!(resolved.selected.pid, 40);
        assert_eq!(resolved.capture_root.pid, 40);
    }

    #[test]
    fn reused_pid_must_still_match_the_saved_process() {
        let nodes = vec![
            node(30, None, "notepad.exe"),
            node(40, None, MISTFALL_SHIPPING_EXECUTABLE),
        ];
        let resolved = resolve_from_nodes(&saved(Some(30)), &nodes).expect("resolve");
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
        let resolved = resolve_from_nodes(&saved, &nodes).expect("resolve");
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
        let resolved = resolve_from_nodes(&saved, &nodes).expect("resolve");
        assert_eq!(resolved.selected.pid, 20);
        assert_eq!(resolved.capture_root.pid, 10);
    }

    #[test]
    fn browser_media_climbs_same_family_and_stops_before_updater() {
        let nodes = vec![
            node(10, Some(5), "chrome.exe"),
            node(20, Some(10), "chrome.exe"),
            node(5, None, "GoogleUpdate.exe"),
        ];
        let saved = SavedProcess {
            executable_path: "C:\\Games\\chrome.exe".into(),
            executable_name: "chrome.exe".into(),
            display_name: "Google Chrome".into(),
            last_pid: Some(20),
        };
        let resolved = resolve_from_nodes(&saved, &nodes).expect("browser");
        assert_eq!(resolved.selected.pid, 20);
        assert_eq!(resolved.capture_root.pid, 10);
    }

    #[test]
    fn browser_allowlist_is_explicit() {
        for name in BROWSER_EXECUTABLES {
            assert!(is_browser_family(name));
        }
        assert!(!is_browser_family("Update.exe"));
        assert!(!is_browser_family("explorer.exe"));
    }

    #[test]
    fn groups_child_processes_and_preserves_independent_instances() {
        let nodes = vec![
            node(10, Some(1), "Discord.exe"),
            node(11, Some(10), "Discord.exe"),
            node(12, Some(11), "Discord.exe"),
            node(20, None, "Discord.exe"),
        ];
        let apps = group_running_apps(&nodes, &HashSet::from([11]), |_| vec![]);
        assert_eq!(apps.len(), 1);
        assert_eq!(apps[0].process_count, 4);
        assert!(apps[0].has_window);
        assert_eq!(
            apps[0].roots.iter().map(|r| r.pid).collect::<Vec<_>>(),
            vec![10, 20]
        );
    }

    #[test]
    fn metadata_names_are_searchable_without_a_known_app_allowlist() {
        let nodes = vec![node(10, None, "opaque.exe")];
        let apps = group_running_apps(&nodes, &HashSet::new(), |_| {
            vec!["Example Player".into(), "Example Media Client".into()]
        });
        assert_eq!(apps[0].display_name, "Example Player");
        for name in [
            "opaque.exe",
            "Example Media Client",
            "C:\\Games\\opaque.exe",
        ] {
            assert!(apps[0].search_names.contains(&name.to_string()));
        }
    }

    #[test]
    fn different_installations_and_discord_variants_remain_separate() {
        let first = node(10, None, "Discord.exe");
        let mut other = node(20, Some(10), "Discord.exe");
        other.source.executable_path = "D:\\Apps\\Discord.exe".into();
        let nodes = vec![
            first,
            other,
            node(30, Some(10), "DiscordPTB.exe"),
            node(40, Some(30), "DiscordCanary.exe"),
        ];
        let apps = group_running_apps(&nodes, &HashSet::new(), |_| vec!["Discord".into()]);
        assert_eq!(apps.len(), 4);
        assert!(apps.iter().all(|a| a.process_count == 1));
        let saved = SavedProcess::from(&nodes[0].source);
        assert!(!source_matches_saved(&nodes[1].source, &saved));
    }

    #[test]
    fn browser_parent_must_be_the_same_browser() {
        let nodes = vec![
            node(10, None, "msedge.exe"),
            node(20, Some(10), "chrome.exe"),
            node(21, Some(20), "chrome.exe"),
        ];
        assert_eq!(capture_root(&nodes[2], &nodes).source.pid, 20);
        assert_eq!(
            group_running_apps(&nodes, &HashSet::new(), |_| vec![]).len(),
            2
        );
    }

    #[test]
    fn groups_mistfall_shipping_with_its_root_but_not_steam() {
        let nodes = vec![
            node(5, None, "steam.exe"),
            node(10, Some(5), MISTFALL_ROOT_EXECUTABLE),
            node(20, Some(10), MISTFALL_SHIPPING_EXECUTABLE),
        ];
        let apps = group_running_apps(&nodes, &HashSet::new(), |_| vec![]);
        let game = apps
            .iter()
            .find(|app| app.display_name == "Mistfall Hunter")
            .unwrap();
        assert_eq!(game.process_count, 2);
        assert_eq!(game.roots[0].pid, 10);
    }

    #[test]
    fn inaccessible_executables_are_not_omitted_or_merged_by_display_name() {
        let mut nodes = vec![node(10, None, "opaque.exe"), node(20, None, "opaque.exe")];
        for node in &mut nodes {
            node.source.executable_path.clear();
        }
        let apps = group_running_apps(&nodes, &HashSet::new(), |_| vec![]);
        assert_eq!(apps.len(), 2);
        assert!(apps.iter().all(|app| !app.display_name.is_empty()));
    }

    #[test]
    fn selection_rejects_closed_or_reused_pid_including_same_name_elsewhere() {
        let original = node(10, None, "app.exe");
        assert!(validate_selection_from_nodes(&original.source, &[]).is_err());
        let mut reused = original.clone();
        reused.source.executable_path = "D:\\Other\\app.exe".into();
        assert!(validate_selection_from_nodes(&original.source, &[reused]).is_err());
    }

    #[test]
    fn generic_multi_process_app_uses_own_root_not_launcher() {
        let nodes = vec![
            node(5, None, "launcher.exe"),
            node(10, Some(5), "opaque.exe"),
            node(11, Some(10), "opaque.exe"),
        ];
        assert_eq!(capture_root(&nodes[2], &nodes).source.pid, 10);
    }

    #[test]
    #[ignore = "Read-only check against applications running on this desktop"]
    fn live_running_apps_discovery() {
        let nodes = process_nodes();
        let apps = list_running_apps();
        assert!(!apps.is_empty());
        assert!(apps
            .iter()
            .all(|a| !a.roots.is_empty() && !a.display_name.is_empty()));
        assert_eq!(
            apps.iter().map(|a| &a.id).collect::<HashSet<_>>().len(),
            apps.len()
        );
        println!(
            "Detected {} raw processes and {} application groups",
            nodes.len(),
            apps.len()
        );
        for app in apps.iter().filter(|a| {
            ["discord.exe", "chrome.exe", "code.exe", "chatgpt.exe"]
                .contains(&a.executable_name.to_lowercase().as_str())
        }) {
            println!(
                "{}: {} processes, {} roots, window={}",
                app.display_name,
                app.process_count,
                app.roots.len(),
                app.has_window
            );
        }
    }
}
