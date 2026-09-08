//! Desktop-only facade. No installer URL, signature or path crosses the IPC boundary.
use serde::Serialize;
use std::{
    sync::Mutex,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};
use tauri_plugin_updater::{Update, UpdaterExt};

#[cfg(not(feature = "release-test"))]
const ENDPOINT: &str =
    "https://github.com/HectorRussia/wangai-overlay/releases/latest/download/latest.json";
#[cfg(feature = "release-test")]
const ENDPOINT: &str = env!("WANGAI_TEST_UPDATE_ENDPOINT");
const PUBLIC_KEY: &str = match option_env!("WANGAI_UPDATER_PUBLIC_KEY") {
    Some(v) => v,
    None => "",
};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    pub revision: u64,
    pub phase: &'static str,
    pub current_version: String,
    pub new_version: Option<String>,
    pub notes: Option<String>,
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
    pub message: String,
    pub can_install: bool,
}
pub struct UpdateManager {
    status: Mutex<UpdateStatus>,
    candidate: Mutex<Option<Update>>,
    operation: tokio::sync::Mutex<()>,
}
impl Default for UpdateManager {
    fn default() -> Self {
        Self {
            status: Mutex::new(UpdateStatus {
                revision: 0,
                phase: if PUBLIC_KEY.is_empty() {
                    "disabled"
                } else {
                    "idle"
                },
                current_version: env!("CARGO_PKG_VERSION").into(),
                new_version: None,
                notes: None,
                downloaded_bytes: 0,
                total_bytes: None,
                can_install: false,
                message: if PUBLIC_KEY.is_empty() {
                    "รุ่นพัฒนา: ยังไม่ได้ตั้งค่าการอัปเดต"
                } else {
                    "ยังไม่ได้ตรวจอัปเดต"
                }
                .into(),
            }),
            candidate: Mutex::new(None),
            operation: tokio::sync::Mutex::new(()),
        }
    }
}
impl UpdateManager {
    pub fn new(version: String) -> Self {
        let manager = Self::default();
        manager.status.lock().unwrap().current_version = version;
        manager
    }
    fn snapshot(&self) -> UpdateStatus {
        self.status.lock().unwrap().clone()
    }
    fn publish(&self, app: &AppHandle, edit: impl FnOnce(&mut UpdateStatus)) -> UpdateStatus {
        let snapshot = {
            let mut status = self.status.lock().unwrap();
            edit(&mut status);
            status.revision += 1;
            status.clone()
        };
        let _ = app.emit_to("main", "update-status", &snapshot);
        snapshot
    }
    fn fail(&self, app: &AppHandle, message: &str, retry: bool) -> UpdateStatus {
        self.publish(app, |s| {
            s.phase = "error";
            s.message = message.into();
            s.can_install = retry;
        })
    }
}

fn settings_only(label: &str) -> Result<(), String> {
    if label == "main" {
        Ok(())
    } else {
        Err("อัปเดตได้จากหน้าตั้งค่า Desktop เท่านั้น".into())
    }
}

fn allowed_asset(url: &reqwest::Url, version: &str) -> bool {
    #[cfg(feature = "release-test")]
    if url.scheme() == "http"
        && url.host_str() == Some("127.0.0.1")
        && url.port() == reqwest::Url::parse(ENDPOINT).ok().and_then(|u| u.port())
    {
        return url.path().starts_with(&format!("/v{version}/")) && url.path().ends_with(".exe");
    }
    url.scheme() == "https"
        && url.host_str() == Some("github.com")
        && url.username().is_empty()
        && url.password().is_none()
        && url.port().is_none()
        && url.query().is_none()
        && url.fragment().is_none()
        && url.path().starts_with(&format!(
            "/HectorRussia/wangai-overlay/releases/download/v{version}/"
        ))
        && url.path().ends_with(".exe")
}

pub async fn check(app: AppHandle) -> UpdateStatus {
    let manager = app.state::<UpdateManager>();
    let Ok(_operation) = manager.operation.try_lock() else {
        return manager.snapshot();
    };
    if PUBLIC_KEY.is_empty() || app.state::<crate::state::AppState>().lifecycle.is_closing() {
        return manager.snapshot();
    }
    manager.publish(&app, |s| {
        s.phase = "checking";
        s.message = "กำลังตรวจเวอร์ชันจาก GitHub".into();
        s.can_install = false;
    });
    *manager.candidate.lock().unwrap() = None;
    let shutdown_handle = app.clone();
    let builder = app
        .updater_builder()
        .pubkey(PUBLIC_KEY)
        .timeout(Duration::from_secs(15))
        .on_before_exit(move || {
            // install() exits directly on Windows; RunEvent alone is insufficient.
            let _ = crate::lifecycle::shutdown(&shutdown_handle);
            shutdown_handle
                .state::<crate::web_companion::WebCompanionManager>()
                .shutdown();
        });
    let updater = match builder
        .endpoints(vec![ENDPOINT.parse().unwrap()])
        .and_then(|b| b.build())
    {
        Ok(updater) => updater,
        Err(_) => return manager.fail(&app, "ตั้งค่าระบบอัปเดตไม่ครบ กรุณาติดต่อผู้พัฒนา", false),
    };
    match updater.check().await {
        Ok(Some(mut update)) if allowed_asset(&update.download_url, &update.version) => {
            // A CPU worker installer is large; keep checks short, downloads bounded but longer.
            update.timeout = Some(Duration::from_secs(600));
            let version = update.version.clone();
            let notes = update
                .body
                .as_ref()
                .map(|s| s.chars().take(12_000).collect());
            *manager.candidate.lock().unwrap() = Some(update);
            manager.publish(&app, |s| {
                s.phase = "available";
                s.new_version = Some(version);
                s.notes = notes;
                s.downloaded_bytes = 0;
                s.total_bytes = None;
                s.can_install = true;
                s.message = "มีเวอร์ชันใหม่ ดาวน์โหลดเมื่อคุณกดยืนยันเท่านั้น".into();
            })
        }
        Ok(Some(_)) => manager.fail(&app, "ไฟล์อัปเดตไม่ได้อยู่ใน GitHub Release ที่อนุญาต", false),
        Ok(None) => manager.publish(&app, |s| {
            s.phase = "up_to_date";
            s.new_version = None;
            s.notes = None;
            s.message = "คุณใช้เวอร์ชันล่าสุดแล้ว".into();
        }),
        Err(tauri_plugin_updater::Error::ReleaseNotFound) => {
            // The plugin maps every HTTP failure to ReleaseNotFound. Only 404 means unpublished.
            let status = reqwest::Client::new()
                .get(ENDPOINT)
                .timeout(Duration::from_secs(10))
                .send()
                .await
                .map(|r| r.status());
            if status.ok() == Some(reqwest::StatusCode::NOT_FOUND) {
                manager.publish(&app, |s| {
                    s.phase = "unpublished";
                    s.new_version = None;
                    s.notes = None;
                    s.message = "ยังไม่มี Release ที่เผยแพร่ ใช้แอปต่อได้ตามปกติ".into();
                })
            } else {
                manager.fail(&app, "ติดต่อ GitHub ไม่สำเร็จ ลองตรวจอีกครั้งภายหลัง", false)
            }
        }
        Err(_) => manager.fail(
            &app,
            "ตรวจอัปเดตไม่สำเร็จ: เครือข่ายหรือข้อมูล Release ไม่พร้อม ใช้แอปต่อได้",
            false,
        ),
    }
}

#[tauri::command]
pub fn get_update_status(window: WebviewWindow, app: AppHandle) -> Result<UpdateStatus, String> {
    settings_only(window.label())?;
    Ok(app.state::<UpdateManager>().snapshot())
}
#[tauri::command]
pub async fn check_for_updates(
    window: WebviewWindow,
    app: AppHandle,
) -> Result<UpdateStatus, String> {
    settings_only(window.label())?;
    Ok(check(app).await)
}
#[tauri::command]
pub async fn download_and_install_update(
    window: WebviewWindow,
    app: AppHandle,
) -> Result<UpdateStatus, String> {
    settings_only(window.label())?;
    let manager = app.state::<UpdateManager>();
    let _operation = manager
        .operation
        .try_lock()
        .map_err(|_| "กำลังดำเนินการอัปเดตอยู่")?;
    if app.state::<crate::state::AppState>().lifecycle.is_closing() {
        return Err("กำลังปิดระบบ กรุณารอ".into());
    }
    let update = manager
        .candidate
        .lock()
        .unwrap()
        .clone()
        .ok_or("ตรวจหาเวอร์ชันใหม่ก่อน")?;
    manager.publish(&app, |s| {
        s.phase = "downloading";
        s.downloaded_bytes = 0;
        s.total_bytes = None;
        s.can_install = false;
        s.message = "กำลังดาวน์โหลด ยังฟังต่อได้ เมื่อตรวจลายเซ็นผ่านแอปจะปิดเพื่อติดตั้ง".into();
    });
    let mut downloaded = 0;
    let mut last_event = Instant::now();
    let bytes = update
        .download(
            |length, total| {
                downloaded += length as u64;
                if last_event.elapsed() > Duration::from_millis(200) {
                    manager.publish(&app, |s| {
                        s.downloaded_bytes = downloaded;
                        s.total_bytes = total;
                    });
                    last_event = Instant::now();
                }
            },
            || {},
        )
        .await;
    let bytes = match bytes {
        Ok(bytes) => bytes,
        Err(_) => {
            return Ok(manager.fail(
                &app,
                "ดาวน์โหลดหรือตรวจลายเซ็นไม่สำเร็จ ยังไม่ได้ติดตั้ง แอปเดิมยังใช้งานได้",
                true,
            ))
        }
    };
    manager.publish(&app, |s| {
        s.phase = "installing";
        s.downloaded_bytes = bytes.len() as u64;
        s.total_bytes = Some(bytes.len() as u64);
        s.message = "ตรวจลายเซ็นแล้ว กำลังบันทึกการตั้งค่าและหยุดระบบเสียงเพื่อติดตั้ง".into();
    });
    let handle = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        crate::lifecycle::shutdown(&handle)?;
        update
            .install(bytes)
            .map_err(|_| "เปิดตัวติดตั้งไม่สำเร็จ กรุณาปิดและเปิด WANGAI ใหม่".to_string())
    })
    .await
    .map_err(|_| "งานติดตั้งหยุดทำงาน")?;
    if let Err(message) = result {
        return Ok(manager.fail(&app, &message, false));
    }
    Ok(manager.snapshot())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn development_config_initializes_updater_without_release_credentials() {
        // Use the checked-in config, not the signed-release fixture below: dev
        // must start before an owner has generated or configured signing keys.
        let config: tauri::Config =
            serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        assert_eq!(config.plugins.0["updater"]["pubkey"], "");
        let mut context = tauri::test::mock_context(tauri::test::noop_assets());
        context.config_mut().plugins = config.plugins;
        let app = tauri::test::mock_builder()
            .plugin(tauri_plugin_updater::Builder::new().build())
            .build(context)
            .expect("Updater must initialize with the checked-in development config");
        assert!(matches!(
            app.updater_builder().build(),
            Err(tauri_plugin_updater::Error::EmptyEndpoints)
        ));
    }

    #[test]
    fn only_settings_window_can_update() {
        assert!(settings_only("main").is_ok());
        for label in ["overlay", "web", ""] {
            assert!(settings_only(label).is_err());
        }
    }
    #[test]
    fn update_assets_are_pinned_to_repository_and_version() {
        let valid =
            "https://github.com/HectorRussia/wangai-overlay/releases/download/v0.2.1/WANGAI.exe";
        assert!(allowed_asset(&valid.parse().unwrap(), "0.2.1"));
        for invalid in [
            valid.replace("https:", "http:"),
            valid.replace("HectorRussia", "attacker"),
            valid.replace("v0.2.1", "v0.1.0"),
            format!("{valid}?token=x"),
            valid.replace(".exe", ".zip"),
        ] {
            assert!(!allowed_asset(&invalid.parse().unwrap(), "0.2.1"));
        }
    }

    // Exercises Tauri's real parser + download/signature verifier, never install().
    // Signing keys are generated in a temporary directory and never printed.
    #[tokio::test]
    async fn real_plugin_rejects_bad_manifests_downgrades_and_corrupt_downloads() {
        use axum::{http::StatusCode, response::IntoResponse, routing::get, Router};
        use std::sync::{
            atomic::{AtomicUsize, Ordering},
            Arc,
        };
        let temp = tempfile::tempdir().unwrap();
        let key = temp.path().join("test.key");
        let payload = temp.path().join("test.exe");
        std::fs::write(&payload, b"signature fixture, not an executable").unwrap();
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap();
        let cli = root.join("node_modules/@tauri-apps/cli/tauri.js");
        for args in [
            vec![
                "signer",
                "generate",
                "--ci",
                "-p",
                "test-only",
                "-w",
                key.to_str().unwrap(),
            ],
            vec![
                "signer",
                "sign",
                "-p",
                "test-only",
                "-f",
                key.to_str().unwrap(),
                payload.to_str().unwrap(),
            ],
        ] {
            let result = std::process::Command::new("node")
                .arg(&cli)
                .args(args)
                .output()
                .unwrap();
            assert!(result.status.success(), "Temporary test signing failed");
        }
        let public_key = std::fs::read_to_string(key.with_extension("key.pub")).unwrap();
        let signature = std::fs::read_to_string(payload.with_extension("exe.sig")).unwrap();
        let mode = Arc::new(AtomicUsize::new(0));
        let request_count = Arc::new(AtomicUsize::new(0));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let origin = format!("http://{}", listener.local_addr().unwrap());
        let state = mode.clone();
        let url = origin.clone();
        let count = request_count.clone();
        let asset_mode = mode.clone();
        let router = Router::new().route("/latest.json", get(move || {
            let mode = state.load(Ordering::SeqCst); let signature = signature.clone(); let url = url.clone();
            async move {
                if mode == 1 { return StatusCode::NOT_FOUND.into_response(); }
                if mode == 2 { return "not JSON".into_response(); }
                if mode == 3 { tokio::time::sleep(Duration::from_millis(500)).await; }
                if mode == 8 { return StatusCode::NO_CONTENT.into_response(); }
                let version = if mode == 4 { "0.0.1" } else if mode == 5 { "0.1.0" } else { "0.2.1" };
                axum::Json(serde_json::json!({ "version": version, "notes": "test", "platforms": {
                    "windows-x86_64": { "url": format!("{url}/test.exe"), "signature": if mode == 7 { "bad-signature" } else { signature.trim() } }
                }})).into_response()
            }
        })).route("/test.exe", get(move || {
            count.fetch_add(1, Ordering::SeqCst);
            let corrupt = asset_mode.load(Ordering::SeqCst) == 6;
            async move { if corrupt { b"truncated".as_slice() } else { b"signature fixture, not an executable".as_slice() } }
        }));
        let server = tokio::spawn(async move {
            axum::serve(listener, router).await.unwrap();
        });
        let mut context = tauri::test::mock_context(tauri::test::noop_assets());
        context.config_mut().plugins.0.insert("updater".into(), serde_json::json!({ "pubkey": public_key.trim(), "dangerousInsecureTransportProtocol": true }));
        let app = tauri::test::mock_builder()
            .plugin(tauri_plugin_updater::Builder::new().build())
            .build(context)
            .unwrap();
        let updater = app
            .updater_builder()
            .endpoints(vec![format!("{origin}/latest.json").parse().unwrap()])
            .unwrap()
            .timeout(Duration::from_millis(200))
            .build()
            .unwrap();
        let update = updater.check().await.unwrap().unwrap();
        assert_eq!(
            request_count.load(Ordering::SeqCst),
            0,
            "Check must never download"
        );
        assert_eq!(
            update.download(|_, _| {}, || {}).await.unwrap(),
            b"signature fixture, not an executable"
        );
        for m in [1, 2, 3] {
            mode.store(m, Ordering::SeqCst);
            assert!(updater.check().await.is_err());
        }
        for m in [4, 5, 8] {
            mode.store(m, Ordering::SeqCst);
            assert!(updater.check().await.unwrap().is_none());
        }
        for m in [6, 7] {
            mode.store(m, Ordering::SeqCst);
            let update = updater.check().await.unwrap().unwrap();
            assert!(update.download(|_, _| {}, || {}).await.is_err());
        }
        server.abort();
    }
}
