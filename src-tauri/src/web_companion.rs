use std::{
    net::{IpAddr, SocketAddr},
    path::PathBuf,
    sync::{Arc, Mutex, RwLock},
    time::Duration,
};

use anyhow::{Context, Result};
use axum::{
    body::Body,
    extract::{DefaultBodyLimit, State, WebSocketUpgrade},
    http::{header, HeaderMap, Request, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{any, get, post},
    Json, Router,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use futures_util::{SinkExt, StreamExt};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;
use tokio::sync::oneshot;
use tower_http::services::{ServeDir, ServeFile};

use crate::{
    audio, commands,
    models::{
        CaptureMode, CaptureSource, GlossaryTerm, HotkeySettings, OverlaySettings, VadSettings,
    },
    processes,
    state::AppState,
};

const SESSION_COOKIE: &str = "WANGAI_SESSION";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebCompanionInfo {
    pub origin: String,
    pub running: bool,
}

#[derive(Clone)]
struct WebContext {
    app: AppHandle,
    server_origin: String,
    public_origin: String,
    launch_token: Arc<Mutex<String>>,
    session_token: Arc<RwLock<String>>,
}

pub struct WebCompanionManager {
    info: WebCompanionInfo,
    context: WebContext,
    shutdown: Mutex<Option<oneshot::Sender<()>>>,
}

impl WebCompanionManager {
    pub fn start(app: AppHandle) -> Result<Self> {
        let bind_address = companion_bind_address(cfg!(debug_assertions));
        let listener =
            tauri::async_runtime::block_on(bind_companion_listener(cfg!(debug_assertions)))
                .with_context(|| format!("เปิด Local Web Companion ที่ {bind_address} ไม่สำเร็จ"))?;
        let actual_address = listener.local_addr()?;
        let server_origin = format!("http://{actual_address}");
        let public_origin = if cfg!(debug_assertions) {
            "http://127.0.0.1:1420".to_string()
        } else {
            server_origin.clone()
        };
        let context = WebContext {
            app: app.clone(),
            server_origin,
            public_origin: public_origin.clone(),
            launch_token: Arc::new(Mutex::new(random_token())),
            session_token: Arc::new(RwLock::new(random_token())),
        };
        let router = router(&app, context.clone())?;
        let (shutdown_tx, shutdown_rx) = oneshot::channel();
        tauri::async_runtime::spawn(async move {
            let server = axum::serve(listener, router).with_graceful_shutdown(async move {
                let _ = shutdown_rx.await;
            });
            if let Err(error) = server.await {
                eprintln!("Local Web Companion stopped: {error}");
            }
        });
        Ok(Self {
            info: WebCompanionInfo {
                origin: public_origin,
                running: true,
            },
            context,
            shutdown: Mutex::new(Some(shutdown_tx)),
        })
    }

    pub fn info(&self) -> WebCompanionInfo {
        self.info.clone()
    }

    pub fn open(&self) -> Result<()> {
        let token = random_token();
        *self
            .context
            .launch_token
            .lock()
            .expect("web launch token lock poisoned") = token.clone();
        let url = format!("{}/#wangai-token={token}", self.info.origin);
        self.context
            .app
            .opener()
            .open_url(url, None::<&str>)
            .context("เปิด Web Companion ใน browser ไม่สำเร็จ")?;
        Ok(())
    }

    pub fn shutdown(&self) {
        if let Some(sender) = self
            .shutdown
            .lock()
            .expect("web shutdown lock poisoned")
            .take()
        {
            let _ = sender.send(());
        }
    }
}

fn companion_bind_address(debug: bool) -> SocketAddr {
    if debug {
        SocketAddr::from(([127, 0, 0, 1], 1431))
    } else {
        SocketAddr::from(([127, 0, 0, 1], 0))
    }
}

async fn bind_companion_listener(debug: bool) -> std::io::Result<tokio::net::TcpListener> {
    tokio::net::TcpListener::bind(companion_bind_address(debug)).await
}

fn router(app: &AppHandle, context: WebContext) -> Result<Router> {
    let api = Router::new()
        .route("/api/v1/session", post(exchange_session))
        .route("/api/v1/snapshot", get(snapshot))
        .route("/api/v1/processes", get(processes_list))
        .route("/api/v1/apps", get(apps_list))
        .route("/api/v1/output-devices", get(output_devices))
        .route("/api/v1/command", post(command))
        .route("/api/v1/events", get(events))
        .route("/api/{*path}", any(api_not_found));

    let web_root = web_root(app)?;
    let index = web_root.join("index.html");
    let static_files = ServeDir::new(web_root).not_found_service(ServeFile::new(index));
    Ok(api
        .fallback_service(static_files)
        .layer(DefaultBodyLimit::max(64 * 1024))
        .layer(middleware::from_fn_with_state(
            context.clone(),
            validate_loopback_request,
        ))
        .with_state(context))
}

fn web_root(app: &AppHandle) -> Result<PathBuf> {
    if cfg!(debug_assertions) {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .expect("src-tauri has parent")
            .join("dist");
        return Ok(root);
    }
    Ok(app.path().resource_dir()?.join("web"))
}

async fn validate_loopback_request(
    State(context): State<WebContext>,
    request: Request<Body>,
    next: Next,
) -> Response {
    let host_ok = request
        .headers()
        .get(header::HOST)
        .and_then(|value| value.to_str().ok())
        .and_then(parse_host_ip)
        .is_some_and(|ip| ip.is_loopback());
    let origin_ok = request
        .headers()
        .get(header::ORIGIN)
        .and_then(|value| value.to_str().ok())
        .is_none_or(|origin| origin == context.server_origin || origin == context.public_origin);
    if !host_ok || !origin_ok {
        return (StatusCode::FORBIDDEN, "loopback requests only").into_response();
    }
    next.run(request).await
}

fn parse_host_ip(host: &str) -> Option<IpAddr> {
    if let Ok(address) = host.parse::<SocketAddr>() {
        return Some(address.ip());
    }
    let host = host.trim_matches(['[', ']']);
    if host.eq_ignore_ascii_case("localhost") || host.starts_with("localhost:") {
        return Some(IpAddr::from([127, 0, 0, 1]));
    }
    host.parse().ok()
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SessionExchange {
    token: String,
}

async fn exchange_session(
    State(context): State<WebContext>,
    Json(request): Json<SessionExchange>,
) -> Response {
    let mut launch_token = context
        .launch_token
        .lock()
        .expect("web launch token lock poisoned");
    if !constant_time_eq(launch_token.as_bytes(), request.token.as_bytes()) {
        return (StatusCode::UNAUTHORIZED, "invalid bootstrap token").into_response();
    }
    *launch_token = random_token();
    let session = context
        .session_token
        .read()
        .expect("web session token lock poisoned")
        .clone();
    let mut response = Json(json!({ "ok": true })).into_response();
    response.headers_mut().insert(
        header::SET_COOKIE,
        format!("{SESSION_COOKIE}={session}; HttpOnly; SameSite=Strict; Path=/")
            .parse()
            .expect("valid session cookie"),
    );
    response
}

async fn snapshot(State(context): State<WebContext>, headers: HeaderMap) -> Response {
    if let Err(response) = require_session(&context, &headers) {
        return response;
    }
    Json(context.app.state::<AppState>().snapshot()).into_response()
}

async fn processes_list(State(context): State<WebContext>, headers: HeaderMap) -> Response {
    if let Err(response) = require_session(&context, &headers) {
        return response;
    }
    Json(processes::list_capture_sources()).into_response()
}

async fn apps_list(State(context): State<WebContext>, headers: HeaderMap) -> Response {
    if let Err(response) = require_session(&context, &headers) {
        return response;
    }
    match commands::list_running_apps().await {
        Ok(apps) => Json(apps).into_response(),
        Err(_) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": "อ่านรายการแอปจาก Windows ไม่สำเร็จ"})),
        )
            .into_response(),
    }
}

async fn output_devices(State(context): State<WebContext>, headers: HeaderMap) -> Response {
    if let Err(response) = require_session(&context, &headers) {
        return response;
    }
    match audio::list_output_devices() {
        Ok(devices) => Json(devices).into_response(),
        Err(error) => api_error(StatusCode::INTERNAL_SERVER_ERROR, error.to_string()),
    }
}

async fn command(
    State(context): State<WebContext>,
    headers: HeaderMap,
    Json(request): Json<WebCommand>,
) -> Response {
    if let Err(response) = require_session(&context, &headers) {
        return response;
    }
    match commands::dispatch_web_command(&context.app, request).await {
        Ok(value) => Json(value).into_response(),
        Err(error) => api_error(StatusCode::BAD_REQUEST, error),
    }
}

async fn events(
    State(context): State<WebContext>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> Response {
    if let Err(response) = require_session(&context, &headers) {
        return response;
    }
    ws.on_upgrade(move |socket| async move {
        let (mut sender, _) = socket.split();
        let mut previous = String::new();
        loop {
            let snapshot = context.app.state::<AppState>().snapshot();
            let Ok(serialized) = serde_json::to_string(&snapshot) else {
                break;
            };
            if serialized != previous {
                if sender
                    .send(axum::extract::ws::Message::Text(serialized.clone().into()))
                    .await
                    .is_err()
                {
                    break;
                }
                previous = serialized;
            }
            tokio::time::sleep(Duration::from_millis(200)).await;
        }
    })
}

async fn api_not_found() -> Response {
    api_error(StatusCode::NOT_FOUND, "unknown API route")
}

fn require_session(context: &WebContext, headers: &HeaderMap) -> std::result::Result<(), Response> {
    let expected = context
        .session_token
        .read()
        .expect("web session token lock poisoned");
    let actual = headers
        .get(header::COOKIE)
        .and_then(|value| value.to_str().ok())
        .and_then(|cookies| {
            cookies.split(';').find_map(|cookie| {
                let (name, value) = cookie.trim().split_once('=')?;
                (name == SESSION_COOKIE).then_some(value)
            })
        });
    if actual.is_some_and(|actual| constant_time_eq(expected.as_bytes(), actual.as_bytes())) {
        Ok(())
    } else {
        Err(api_error(
            StatusCode::UNAUTHORIZED,
            "desktop session required",
        ))
    }
}

fn api_error(status: StatusCode, message: impl Into<String>) -> Response {
    (status, Json(json!({ "error": message.into() }))).into_response()
}

fn random_token() -> String {
    let mut bytes = [0_u8; 32];
    rand::rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }
    left.iter()
        .zip(right)
        .fold(0_u8, |different, (left, right)| different | (left ^ right))
        == 0
}

#[derive(Debug, Deserialize)]
#[serde(
    deny_unknown_fields,
    tag = "command",
    content = "args",
    rename_all = "snake_case"
)]
pub enum WebCommand {
    ToggleListening,
    SetListening { enabled: bool },
    SelectListeningSource { source: CaptureSource },
    UpdateOutputDevice { device_id: Option<String> },
    UpdateRescueScan { enabled: bool },
    ProbeRecentAudio,
    UpdateHotkeys { hotkeys: HotkeySettings },
    UpdateOverlaySettings { overlay: OverlaySettings },
    UpdateVadSettings { vad: VadSettings },
    UpdateCaptureMode { mode: CaptureMode },
    UpdateGlossary { glossary: Vec<GlossaryTerm> },
    SetOverlayEditMode { enabled: bool },
    CopyLatestReply,
    RestartWorker,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn host_parser_only_recognizes_loopback_values() {
        assert!(parse_host_ip("127.0.0.1:1431").unwrap().is_loopback());
        assert!(parse_host_ip("localhost:1431").unwrap().is_loopback());
        assert!(!parse_host_ip("192.168.1.5:1431").unwrap().is_loopback());
    }

    #[test]
    fn command_allowlist_cannot_deserialize_credential_commands() {
        for command in [
            "update_groq_models",
            "test_groq_configuration",
            "start_overlay_drag",
        ] {
            assert!(
                serde_json::from_value::<WebCommand>(json!({"command":command,"args":{}})).is_err()
            );
        }
        assert!(serde_json::from_value::<WebCommand>(json!({
            "command": "configure_groq",
            "args": { "key": "secret" }
        }))
        .is_err());
        assert!(serde_json::from_value::<WebCommand>(json!({
            "command": "clear_groq_credentials"
        }))
        .is_err());
    }

    #[tokio::test]
    async fn production_listener_uses_a_dynamic_loopback_port_and_releases_it() {
        let listener = bind_companion_listener(false).await.expect("bind");
        let address = listener.local_addr().expect("address");
        assert!(address.ip().is_loopback());
        assert_ne!(address.port(), 0);
        drop(listener);

        let rebound = tokio::net::TcpListener::bind(address)
            .await
            .expect("released port can be rebound");
        drop(rebound);
    }
}
