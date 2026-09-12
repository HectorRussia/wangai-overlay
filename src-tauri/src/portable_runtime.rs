use anyhow::{ensure, Result};
use std::{path::PathBuf, sync::atomic::{AtomicBool, Ordering}, time::Duration};
use tauri::{AppHandle, Manager, WebviewWindow};
use wangai_portable::{PortableLayout, transaction::StartupReady};

pub struct PortableRuntime {
    pub layout: Option<PortableLayout>,
    nonce: Option<String>,
    ui_ready: AtomicBool,
}
impl PortableRuntime {
    pub fn discover() -> Result<Self> {
        if cfg!(debug_assertions) { return Ok(Self { layout:None, nonce:None, ui_ready:AtomicBool::new(false) }); }
        let exe = std::env::current_exe()?.canonicalize()?;
        let layout = PortableLayout::from_core(&exe)?;
        let active = layout.active()?;
        ensure!(exe.parent() == Some(layout.version(&active.current)?.as_path()), "Executable is not the active Portable version");
        let args: Vec<String> = std::env::args().collect();
        let nonce = args.windows(2).find(|p| p[0] == "--portable-startup").map(|p| p[1].clone());
        if let Some(nonce) = &nonce { wangai_portable::validate_nonce(nonce)?; }
        Ok(Self {layout:Some(layout), nonce, ui_ready:AtomicBool::new(false)})
    }
    pub fn configure_webview(&self) {
        if let Some(layout) = &self.layout {
            let runtime = std::env::current_exe().unwrap().parent().unwrap().join("webview2");
            std::env::set_var("WEBVIEW2_BROWSER_EXECUTABLE_FOLDER", runtime);
            std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", layout.data().join("WebView2"));
            // Runtime/profile selection cannot be overridden by inherited dev settings.
            std::env::remove_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS");
        }
    }
    pub fn settings_path(&self, app: &AppHandle) -> Result<PathBuf> {
        match &self.layout {
            Some(layout) => {
                let path = layout.data().join("settings.json"); wangai_portable::no_links(&path)?;
                if path.exists() { crate::settings::validate_portable_import(&std::fs::read(&path)?)?; }
                Ok(path)
            }
            None => Ok(app.path().app_config_dir()?.join("settings.json")),
        }
    }
}
#[tauri::command]
pub fn portable_frontend_ready(window: WebviewWindow, app: AppHandle) -> Result<(), String> {
    if window.label() != "main" { return Err("Desktop settings only".into()); }
    app.state::<PortableRuntime>().ui_ready.store(true,Ordering::Release);
    Ok(())
}
pub fn start_readiness_monitor(app: AppHandle) {
    if app.state::<PortableRuntime>().nonce.is_none() { return; }
    tauri::async_runtime::spawn(async move {
        #[cfg(feature="release-test")]
        if crate::release_test::portable_action(&app).as_deref()==Some("fail-ready") { return; }
        for _ in 0..360 {
            let portable = app.state::<PortableRuntime>();
            let state = app.state::<crate::state::AppState>();
            if state.lifecycle.is_closing() { return; }
            if portable.ui_ready.load(Ordering::Acquire) && state.runtime.read().unwrap().worker_ready {
                let result = wangai_portable::transaction::acknowledge(portable.layout.as_ref().unwrap(), &StartupReady {
                    nonce:portable.nonce.clone().unwrap(), version:app.package_info().version.to_string(), pid:std::process::id(), worker_ready:true, ui_ready:true,
                });
                if let Err(error) = result { eprintln!("Portable readiness: {error}"); }
                return;
            }
            tokio::time::sleep(Duration::from_millis(250)).await;
        }
    });
}
