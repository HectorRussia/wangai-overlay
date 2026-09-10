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
    let upgrade = std::env::args().any(|a| a == "--release-test-upgrade");
    let smoke = std::env::args().any(|a| a == "--release-test-smoke");
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
        for _ in 0..90 {
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
        let report = serde_json::json!({
            "version": version, "pid": std::process::id(), "workerReady": ready,
            "uiReady": ui_ready,
            "workerPid": state.worker.test_pid(), "settings": state.settings.snapshot(), "update": status,
        });
        let directory = app.path().app_config_dir().unwrap();
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
        app.exit(if ready && ui_ready { 0 } else { 1 });
    });
}
