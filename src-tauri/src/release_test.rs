//! Compiled only into the explicitly isolated release-test product. No production IPC.
use crate::{state::AppState, updater};
use std::time::Duration;
use tauri::{AppHandle, Manager};

pub fn start(app: AppHandle) {
    let upgrade = std::env::args().any(|a| a == "--release-test-upgrade");
    let smoke = std::env::args().any(|a| a == "--release-test-smoke");
    if !upgrade && !smoke {
        return;
    }
    tauri::async_runtime::spawn(async move {
        for _ in 0..90 {
            if app.state::<AppState>().runtime.read().unwrap().worker_ready {
                break;
            }
            tokio::time::sleep(Duration::from_secs(1)).await;
        }
        let state = app.state::<AppState>();
        let ready = state.runtime.read().unwrap().worker_ready;
        // Wait for the startup check to release the shared operation lock.
        let window = app.get_webview_window("main").unwrap();
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
            "workerPid": state.worker.test_pid(), "settings": state.settings.snapshot(), "update": status,
        });
        let directory = app.path().app_config_dir().unwrap();
        std::fs::create_dir_all(&directory).unwrap();
        std::fs::write(
            directory.join(format!("test-report-{version}.json")),
            serde_json::to_vec_pretty(&report).unwrap(),
        )
        .unwrap();
        if ready && upgrade && status.can_install {
            let result = updater::download_and_install_update(window, app.clone()).await;
            // Successful Windows install exits before reaching here.
            std::fs::write(
                directory.join("test-install-error.json"),
                serde_json::to_vec(&result).unwrap(),
            )
            .unwrap();
        }
        app.exit(if ready { 0 } else { 1 });
    });
}
