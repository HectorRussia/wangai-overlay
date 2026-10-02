use anyhow::{anyhow, Result};
use serde::de::DeserializeOwned;
use std::{
    sync::{
        atomic::{AtomicI64, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use wangai_ai_protocol::{ApiError, ServiceStatus, TranslationRequest, TranslationResponse};

#[derive(Clone)]
pub struct GatewayClient {
    client: reqwest::Client,
    base_url: String,
    installation_id: String,
    status: Arc<Mutex<ServiceStatus>>,
    fresh_after_ms: Arc<AtomicI64>,
}

pub fn validate_base_url(value: &str, development: bool) -> Result<String> {
    let url = reqwest::Url::parse(value).map_err(|_| anyhow!("WANGAI_API_BASE_URL ไม่ถูกต้อง"))?;
    let loopback = matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
    if !(url.scheme() == "https" || (development && loopback && url.scheme() == "http"))
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(anyhow!(
            "WANGAI_API_BASE_URL ต้องเป็น HTTPS (development ใช้ loopback HTTP ได้)"
        ));
    }
    Ok(url.as_str().trim_end_matches('/').into())
}

impl GatewayClient {
    pub fn new(installation_id: String) -> Result<Self> {
        let base = option_env!("WANGAI_API_BASE_URL").unwrap_or(if cfg!(debug_assertions) {
            "http://127.0.0.1:8080"
        } else {
            ""
        });
        Self::with_url(base, installation_id, cfg!(debug_assertions))
    }

    fn with_url(base: &str, installation_id: String, development: bool) -> Result<Self> {
        Ok(Self {
            client: reqwest::Client::builder()
                .timeout(Duration::from_secs(130))
                .redirect(reqwest::redirect::Policy::none())
                .build()?,
            base_url: validate_base_url(base, development)?,
            installation_id,
            status: Arc::new(Mutex::new(ServiceStatus {
                state: "connecting".into(),
                message: "กำลังเชื่อมต่อบริการ AI".into(),
                ..Default::default()
            })),
            fresh_after_ms: Arc::new(AtomicI64::new(0)),
        })
    }

    pub fn status(&self) -> ServiceStatus {
        self.status.lock().unwrap().clone()
    }
    pub fn can_submit(&self) -> bool {
        self.accepts_started_at(chrono::Utc::now().timestamp_millis())
            && !matches!(self.status().state.as_str(), "offline" | "connecting")
    }
    pub fn accepts_started_at(&self, started_at: i64) -> bool {
        started_at >= self.fresh_after_ms.load(Ordering::Acquire)
    }

    pub async fn refresh_status(&self) {
        let response = self
            .client
            .get(format!("{}/v1/status", self.base_url))
            .timeout(Duration::from_secs(3))
            .send()
            .await;
        let status = match response {
            Ok(response) if response.status().is_success() => {
                response.json::<ServiceStatus>().await.ok()
            }
            _ => None,
        };
        if let Some(status) = status {
            if matches!(self.status().state.as_str(), "offline" | "connecting") {
                // Never replay audio captured before the gateway connection recovered.
                self.fresh_after_ms
                    .fetch_max(chrono::Utc::now().timestamp_millis(), Ordering::AcqRel);
            }
            if let Some(delay) = status.retry_after_ms {
                self.fresh_after_ms.fetch_max(
                    chrono::Utc::now().timestamp_millis() + delay.min(86_400_000) as i64,
                    Ordering::AcqRel,
                );
            }
            // An older status poll must not erase a newer POST error/cooldown.
            if status.retry_after_ms.is_none()
                && !self.accepts_started_at(chrono::Utc::now().timestamp_millis())
            {
                return;
            }
            *self.status.lock().unwrap() = status;
        } else {
            let mut status = self.status.lock().unwrap();
            status.state = "offline".into();
            status.message = "เชื่อมต่อบริการ AI ไม่สำเร็จ".into();
        }
    }

    async fn response<T: DeserializeOwned>(&self, request: reqwest::RequestBuilder) -> Result<T> {
        if !self.can_submit() {
            return Err(anyhow!(self.status().message));
        }
        let result = request
            .header("x-installation-id", &self.installation_id)
            .send()
            .await;
        match result {
            Ok(response) if response.status().is_success() => response
                .json::<T>()
                .await
                .map_err(|_| anyhow!("รูปแบบคำตอบบริการ AI ไม่ถูกต้อง")),
            Ok(response) => {
                let error = response.json::<ApiError>().await.ok();
                let delay = error
                    .as_ref()
                    .and_then(|e| e.retry_after_ms)
                    .unwrap_or(5_000)
                    .min(86_400_000);
                let message = error
                    .map(|e| e.message)
                    .unwrap_or_else(|| "บริการ AI ไม่พร้อมใช้งาน".into());
                self.pause(delay, &message);
                Err(anyhow!(message))
            }
            Err(error) => {
                let message = if error.is_timeout() {
                    "บริการ AI ตอบกลับไม่ทันเวลา"
                } else {
                    "เชื่อมต่อบริการ AI ไม่สำเร็จ"
                };
                self.pause(5_000, message);
                Err(anyhow!(message))
            }
        }
    }

    fn pause(&self, delay: u64, message: &str) {
        self.fresh_after_ms.fetch_max(
            chrono::Utc::now().timestamp_millis() + delay as i64,
            Ordering::AcqRel,
        );
        let mut status = self.status.lock().unwrap();
        status.state = "degraded".into();
        status.message = message.into();
        status.retry_after_ms = Some(delay);
    }

    pub async fn transcribe<T: DeserializeOwned>(&self, wav: Vec<u8>, stream: &str) -> Result<T> {
        let part = reqwest::multipart::Part::bytes(wav)
            .file_name("speech.wav")
            .mime_str("audio/wav")?;
        self.response(
            self.client
                .post(format!("{}/v1/transcriptions", self.base_url))
                .multipart(
                    reqwest::multipart::Form::new()
                        .part("file", part)
                        .text("stream", stream.to_string()),
                ),
        )
        .await
    }

    pub async fn translate(&self, body: &TranslationRequest) -> Result<TranslationResponse> {
        self.response(
            self.client
                .post(format!("{}/v1/translations", self.base_url))
                .json(body),
        )
        .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn production_requires_https_and_no_embedded_secrets() {
        assert!(validate_base_url("http://127.0.0.1:8080", true).is_ok());
        assert!(validate_base_url("http://127.0.0.1:8080", false).is_err());
        assert!(validate_base_url("http://example.com", true).is_err());
        assert!(validate_base_url("https://user:secret@example.com", false).is_err());
        assert!(validate_base_url("https://example.com?key=secret", false).is_err());
    }
    #[test]
    fn cooldown_drops_previously_queued_audio_after_recovery() {
        let client =
            GatewayClient::with_url("http://127.0.0.1:8080", "installation".into(), true).unwrap();
        let before = chrono::Utc::now().timestamp_millis();
        client.pause(5_000, "พัก");
        assert!(!client.can_submit());
        assert!(!client.accepts_started_at(before));
        assert!(client.accepts_started_at(before + 6_000));
    }

    #[tokio::test]
    async fn sends_no_provider_credentials_or_models_and_refreshes_status() {
        use axum::{
            body::Bytes,
            http::HeaderMap,
            routing::{get, post},
            Json, Router,
        };
        let (send, mut receive) = tokio::sync::mpsc::channel(4);
        let app = Router::new()
            .route(
                "/v1/status",
                get(|| async {
                    Json(ServiceStatus {
                        state: "connected".into(),
                        message: "connected".into(),
                        incoming_model: "from-server".into(),
                        ..Default::default()
                    })
                }),
            )
            .route(
                "/v1/transcriptions",
                post(move |headers: HeaderMap, body: Bytes| {
                    let send = send.clone();
                    async move {
                        assert!(!headers.contains_key("authorization"));
                        assert!(headers.contains_key("x-installation-id"));
                        send.send(body.to_vec()).await.unwrap();
                        Json(serde_json::json!({"text":"go"}))
                    }
                }),
            );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let client = GatewayClient::with_url(
            &format!("http://{}", listener.local_addr().unwrap()),
            uuid::Uuid::new_v4().to_string(),
            true,
        )
        .unwrap();
        let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        client.refresh_status().await;
        assert_eq!(client.status().incoming_model, "from-server");
        for stream in ["incoming", "microphone"] {
            let _: serde_json::Value = client.transcribe(vec![1, 2, 3, 4], stream).await.unwrap();
            let body = receive.recv().await.unwrap();
            let body = String::from_utf8_lossy(&body);
            assert!(body.contains(stream));
            assert!(!body.contains("name=\"model\""));
            assert!(!body.contains("name=\"key\""));
        }
        server.abort();
        client.refresh_status().await;
        assert_eq!(client.status().state, "offline");
    }
}
