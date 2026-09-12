//! Compiled only into the explicitly isolated release-test product. No production IPC.
use crate::{state::AppState, updater};
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::Duration,
};
use tauri::{AppHandle, Listener, Manager};

pub fn checkpoint(app: &AppHandle, stage: &str) {
    let portable = app.state::<crate::portable_runtime::PortableRuntime>();
    let Some(layout) = &portable.layout else { return; };
    let path = layout.data().join("test-startup.json");
    let value = serde_json::json!({"stage":stage,"pid":std::process::id(),"version":app.package_info().version.to_string()});
    let _ = wangai_portable::atomic_json(&path, &value);
}

pub fn delay_startup(app: &AppHandle) {
    if std::env::args().any(|arg| arg == "--release-test-upgrade" || arg == "--release-test-smoke")
    {
        // Deterministically widen the original race. Neither UI may exist yet.
        assert!(
            app.webview_windows().is_empty(),
            "Webviews started before managed state"
        );
        std::thread::sleep(Duration::from_secs(3));
    }
}

// Probe the installed WebView DOM, not a backend readiness flag. Test feature only.
const READY_ROOM_PROBE: &str = r#"
(() => {
  const room = document.querySelector('.ready-room-panel');
  if (room && room.querySelector('#ready-room-title') &&
      room.getBoundingClientRect().width > 0 && getComputedStyle(room).visibility !== 'hidden') {
    window.__TAURI_INTERNALS__.invoke('plugin:event|emit', {
      event: 'release-test-ui-ready', payload: null
    }).catch(() => {});
  }
})();
"#;

pub fn start(app: AppHandle) {
    let action=portable_action(&app);
    let upgrade = action.as_deref()==Some("upgrade") || std::env::args().any(|a| a == "--release-test-upgrade");
    let smoke = action.as_deref()==Some("smoke") || std::env::args().any(|a| a == "--release-test-smoke");
    if !upgrade && !smoke {
        return;
    }
    tauri::async_runtime::spawn(async move {
        let window = app.get_webview_window("main").unwrap();
        let ui_ready = Arc::new(AtomicBool::new(false));
        let observed = ui_ready.clone();
        let listener = app.listen_any("release-test-ui-ready", move |_| {
            observed.store(true, Ordering::SeqCst);
        });
        for _ in 0..60 {
            let _ = window.eval(READY_ROOM_PROBE);
            if app.state::<AppState>().runtime.read().unwrap().worker_ready
                && ui_ready.load(Ordering::SeqCst)
            {
                break;
            }
            tokio::time::sleep(Duration::from_secs(1)).await;
        }
        app.unlisten(listener);
        let ui_ready = ui_ready.load(Ordering::SeqCst);
        let state = app.state::<AppState>();
        let ready = state.runtime.read().unwrap().worker_ready;
        // Wait for the startup check to release the shared operation lock.
        let mut status = updater::check(app.clone()).await;
        for _ in 0..20 {
            if status.phase != "checking" {
                break;
            }
            tokio::time::sleep(Duration::from_secs(1)).await;
            status = updater::get_update_status(window.clone(), app.clone()).unwrap();
        }
        let version = app.package_info().version.to_string();
        let mut processes=sysinfo::System::new();processes.refresh_processes(sysinfo::ProcessesToUpdate::All,true);
        let mut descendants=std::collections::HashSet::from([sysinfo::Pid::from_u32(std::process::id())]);
        loop {
            let before=descendants.len();
            for (pid,process) in processes.processes() {if process.parent().is_some_and(|p|descendants.contains(&p)){descendants.insert(*pid);}}
            if descendants.len()==before {break;}
        }
        let child_paths:Vec<_>=descendants.iter().filter_map(|id|processes.process(*id).and_then(|p|p.exe()).map(|p|p.to_string_lossy().into_owned())).collect();
        let report = serde_json::json!({
            "version": version, "pid": std::process::id(), "workerReady": ready,
            "uiReady": ui_ready,
            "workerPid": state.worker.test_pid(), "settings": state.settings.snapshot(), "update": status,
            "runtimeFolder":std::env::var("WEBVIEW2_BROWSER_EXECUTABLE_FOLDER").ok(),
            "profileFolder":std::env::var("WEBVIEW2_USER_DATA_FOLDER").ok(),"childPaths":child_paths,
            "runtime":state.runtime.read().unwrap().clone(),
        });
        let directory = app.state::<crate::portable_runtime::PortableRuntime>().layout.as_ref().map(|p|p.data()).unwrap_or_else(||app.path().app_config_dir().unwrap());
        std::fs::create_dir_all(&directory).unwrap();
        std::fs::write(
            directory.join(format!("test-report-{version}.json")),
            serde_json::to_vec_pretty(&report).unwrap(),
        )
        .unwrap();
        if ready && ui_ready && upgrade && status.can_install {
            let result = updater::download_and_install_update(window, app.clone()).await;
            // Successful Windows install exits before reaching here.
            std::fs::write(
                directory.join("test-install-error.json"),
                serde_json::to_vec(&result).unwrap(),
            )
            .unwrap();
        }
        tokio::time::sleep(Duration::from_secs(2)).await;
        app.exit(if ready && ui_ready { 0 } else { 1 });
    });
}

pub fn portable_action(app:&AppHandle)->Option<String> {
    let portable=app.state::<crate::portable_runtime::PortableRuntime>();
    let path=portable.layout.as_ref()?.data().join("test-control.json");
    let control:serde_json::Value=wangai_portable::read_json(&path).ok()?;
    control[app.package_info().version.to_string()].as_str().map(str::to_owned)
}
