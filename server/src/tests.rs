use super::*;
use axum::{body::Body, http::Request};
use http_body_util::BodyExt;
use tower::ServiceExt;

fn config(url: &str) -> Config {
    Config::load(|key| match key {
        "STT_BASE_URL" | "TRANSLATION_BASE_URL" => Some(url.into()),
        "STT_API_KEY" | "TRANSLATION_API_KEY" => Some("secret-not-for-clients".into()),
        "STT_INCOMING_MODEL" => Some("any-stt".into()),
        "STT_MICROPHONE_MODEL" => Some("mic-stt".into()),
        "TRANSLATION_MODEL" => Some("any-chat".into()),
        "DATABASE_PATH" => Some(":memory:".into()),
        _ => None,
    })
    .unwrap()
}

async fn mock(
    status: StatusCode,
    value: Value,
) -> (
    String,
    tokio::task::JoinHandle<()>,
    Arc<std::sync::atomic::AtomicUsize>,
) {
    let calls = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let count = calls.clone();
    let app = Router::new().fallback(move |headers: HeaderMap, body: axum::body::Bytes| {
        let value = value.clone();
        let count = count.clone();
        async move {
            count.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            assert_eq!(headers["authorization"], "Bearer secret-not-for-clients");
            assert!(!body.is_empty());
            (status, [("retry-after", "7")], Json(value))
        }
    });
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}/v1", listener.local_addr().unwrap());
    let task = tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    (url, task, calls)
}

fn request(path: &str, body: Value) -> Request<Body> {
    Request::post(path)
        .header("content-type", "application/json")
        .header("x-installation-id", Uuid::new_v4().to_string())
        .body(Body::from(body.to_string()))
        .unwrap()
}

#[test]
fn configuration_is_dynamic_and_errors_are_redacted() {
    let c = config("http://127.0.0.1:8888/custom/v1/");
    assert_eq!(
        c.stt_url,
        "http://127.0.0.1:8888/custom/v1/audio/transcriptions"
    );
    assert_eq!(c.translation_model, "any-chat");
    assert!(c.translation_options.is_empty());
    let err = Config::load(|key| {
        (key == "STT_BASE_URL").then(|| "https://user:secret@example.com".into())
    })
    .err()
    .unwrap();
    assert!(err.to_string().contains("STT_BASE_URL"));
    assert!(!err.to_string().contains("secret"));
    assert!(Config::load(|_| None).is_err());
}

fn wav(seconds: usize) -> Vec<u8> {
    let size = seconds * 32_000;
    let mut data = b"RIFF".to_vec();
    data.extend_from_slice(&((size + 36) as u32).to_le_bytes());
    data.extend_from_slice(b"WAVEfmt \x10\0\0\0\x01\0\x01\0");
    data.extend_from_slice(&16_000u32.to_le_bytes());
    data.extend_from_slice(&32_000u32.to_le_bytes());
    data.extend_from_slice(b"\x02\0\x10\0data");
    data.extend_from_slice(&(size as u32).to_le_bytes());
    data.resize(size + 44, 0);
    data
}

#[test]
fn audio_is_bounded_and_confidence_cannot_be_missing() {
    assert_eq!(validate_wav(&wav(30)).unwrap(), 30_000);
    assert!(validate_wav(&wav(31)).is_err());
    assert!(validate_wav(b"not a wave").is_err());
    let mut broken = wav(1);
    broken[28] = 1;
    assert!(validate_wav(&broken).is_err());
    assert!(!valid_transcription(&TranscriptionResponse {
        text: "go".into(),
        segments: vec![]
    }));
    assert!(serde_json::from_value::<TranscriptionResponse>(
        json!({"text":"go","segments":[{"start":0,"end":1}]})
    )
    .is_err());
    assert!(valid_transcription(&TranscriptionResponse {
        text: "".into(),
        segments: vec![]
    }));
}

#[tokio::test]
async fn translation_has_no_public_model_or_prompt_override() {
    let (url, task, _) = mock(
        StatusCode::OK,
        json!({"choices":[{"message":{"content":"ไป"}}]}),
    )
    .await;
    let app = router(Gateway::new(config(&url)).unwrap());
    let body = json!({"text":"go", "from":"en", "to":"th"});
    assert_eq!(
        app.clone()
            .oneshot(request("/v1/translations", body.clone()))
            .await
            .unwrap()
            .status(),
        StatusCode::OK
    );
    for field in ["model", "key", "prompt", "base_url"] {
        let mut bad = body.clone();
        bad[field] = json!("attacker");
        assert_eq!(
            app.clone()
                .oneshot(request("/v1/translations", bad))
                .await
                .unwrap()
                .status(),
            StatusCode::BAD_REQUEST
        );
    }
    task.abort();
}

#[tokio::test]
async fn rate_limit_shares_cooldown_without_retries_or_secret_leak() {
    let (url, task, calls) = mock(
        StatusCode::TOO_MANY_REQUESTS,
        json!({"error":{"message":"secret-not-for-clients"}}),
    )
    .await;
    let state = Gateway::new(config(&url)).unwrap();
    let app = router(state.clone());
    for _ in 0..2 {
        let result = app
            .clone()
            .oneshot(request(
                "/v1/translations",
                json!({"text":"go","from":"en","to":"th"}),
            ))
            .await
            .unwrap();
        assert_eq!(result.status(), StatusCode::TOO_MANY_REQUESTS);
        let body = result.into_body().collect().await.unwrap().to_bytes();
        let error: ApiError = serde_json::from_slice(&body).unwrap();
        assert!(error.retry_after_ms.unwrap() >= 6000);
        assert!(!String::from_utf8_lossy(&body).contains("secret-not-for-clients"));
    }
    assert!(state.check(0).is_err());
    assert_eq!(calls.load(std::sync::atomic::Ordering::SeqCst), 1);
    task.abort();
}

#[tokio::test]
async fn classifies_upstream_failures() {
    for (status, body, code) in [
        (
            StatusCode::BAD_REQUEST,
            json!({"error":{"code":"blocked_api_access"}}),
            ErrorCode::BillingBlocked,
        ),
        (
            StatusCode::UNAUTHORIZED,
            json!({}),
            ErrorCode::ConfigurationError,
        ),
        (
            StatusCode::NOT_FOUND,
            json!({}),
            ErrorCode::UnsupportedModel,
        ),
        (StatusCode::BAD_GATEWAY, json!({}), ErrorCode::Unavailable),
    ] {
        let (url, task, _) = mock(status, body).await;
        let app = router(Gateway::new(config(&url)).unwrap());
        let response = app
            .oneshot(request(
                "/v1/translations",
                json!({"text":"go","from":"en","to":"th"}),
            ))
            .await
            .unwrap();
        let error: ApiError =
            serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        assert_eq!(error.code, code);
        task.abort();
    }
}

#[tokio::test]
async fn health_and_status_are_safe_and_capacity_is_bounded() {
    let state = Gateway::new(config("http://127.0.0.1:1")).unwrap();
    let app = router(state.clone());
    let status = app
        .clone()
        .oneshot(Request::get("/v1/status").body(Body::empty()).unwrap())
        .await
        .unwrap();
    let bytes = status.into_body().collect().await.unwrap().to_bytes();
    assert!(!String::from_utf8_lossy(&bytes).contains("secret"));
    assert_eq!(
        serde_json::from_slice::<ServiceStatus>(&bytes)
            .unwrap()
            .state,
        "connected"
    );
    let _slots = state.slots.acquire_many(32).await.unwrap();
    let result = app
        .oneshot(request(
            "/v1/translations",
            json!({"text":"go","from":"en","to":"th"}),
        ))
        .await
        .unwrap();
    assert_eq!(result.status(), StatusCode::SERVICE_UNAVAILABLE);
}

#[test]
fn glossary_and_metrics_preserve_no_conversation() {
    let body = TranslationRequest {
        text: "Go LEFT".into(),
        from: "en".into(),
        to: "th".into(),
        glossary: vec![wangai_ai_protocol::GlossaryTerm {
            source: "left".into(),
            target: "ซ้าย".into(),
        }],
    };
    let (text, replacements) = protect_glossary(&body);
    assert_eq!(text, "Go ZXQGLOSS0QXZ");
    assert_eq!(replacements[0].1, "ซ้าย");
    let db = metrics::open(":memory:").unwrap();
    for _ in 0..2 {
        metrics::record(
            &db,
            metrics::Metric {
                installation: "random".into(),
                operation: "stt",
                model: "model".into(),
                outcome: "success".into(),
                audio_ms: 1000,
                latency_ms: 1,
                prompt_tokens: 0,
                completion_tokens: 0,
            },
        )
        .unwrap();
    }
    assert_eq!(
        db.query_row("SELECT requests FROM daily_usage", [], |row| row
            .get::<_, u64>(0))
            .unwrap(),
        2
    );
    let schema: String = db
        .query_row(
            "SELECT sql FROM sqlite_master WHERE name='daily_usage'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert!(!schema.contains("transcript"));
    assert!(!schema.contains("api_key"));
}

async fn listen(app: Router) -> (String, tokio::task::JoinHandle<()>) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = format!("http://{}", listener.local_addr().unwrap());
    let task = tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    (address, task)
}

#[tokio::test]
async fn stt_forwards_original_pcm_and_chooses_models_on_server() {
    let (send, mut receive) = tokio::sync::mpsc::channel(4);
    let upstream = Router::new().fallback(move |body: axum::body::Bytes| {
        let send=send.clone(); async move {
            send.send(body.to_vec()).await.unwrap();
            Json(json!({"text":"go","segments":[{"start":0,"end":0.4,"avg_logprob":-0.2,"no_speech_prob":0.01,"compression_ratio":1.0}]}))
        }
    });
    let (base, provider_task) = listen(upstream).await;
    let mut cfg = config(&base);
    cfg.incoming_model = "dynamic-incoming".into();
    cfg.microphone_model = "dynamic-mic".into();
    let state = Gateway::new(cfg).unwrap();
    let (gateway, gateway_task) = listen(router(state.clone())).await;
    let mut audio = wav(1);
    audio[100] = 31;
    audio[101] = 7;
    for (stream, model, lang) in [
        ("incoming", "dynamic-incoming", "en"),
        ("microphone", "dynamic-mic", "th"),
    ] {
        let form = reqwest::multipart::Form::new().text("stream", stream).part(
            "file",
            reqwest::multipart::Part::bytes(audio.clone()).file_name("speech.wav"),
        );
        let response = reqwest::Client::new()
            .post(format!("{gateway}/v1/transcriptions"))
            .header("x-installation-id", Uuid::new_v4().to_string())
            .multipart(form)
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let forwarded = receive.recv().await.unwrap();
        assert!(forwarded.windows(audio.len()).any(|part| part == audio));
        let text = String::from_utf8_lossy(&forwarded);
        assert!(text.contains(model));
        assert!(text.contains(&format!("\r\n\r\n{lang}\r\n")));
        assert!(!text.contains("name=\"prompt\""));
    }
    state.flush_metrics().await;
    gateway_task.abort();
    provider_task.abort();
}

#[tokio::test]
async fn rejects_missing_confidence_oversize_and_multipart_overrides() {
    let (base, provider_task, calls) = mock(
        StatusCode::OK,
        json!({"text":"hallucination","segments":[]}),
    )
    .await;
    let (gateway, gateway_task) = listen(router(Gateway::new(config(&base)).unwrap())).await;
    let client = reqwest::Client::new();
    let response = client
        .post(format!("{gateway}/v1/transcriptions"))
        .header("x-installation-id", Uuid::new_v4().to_string())
        .multipart(
            reqwest::multipart::Form::new()
                .text("stream", "incoming")
                .part(
                    "file",
                    reqwest::multipart::Part::bytes(wav(1)).file_name("speech.wav"),
                ),
        )
        .send()
        .await
        .unwrap();
    let error: ApiError = response.json().await.unwrap();
    assert_eq!(error.code, ErrorCode::UnsupportedModel);
    for (extra, expected) in [
        (true, StatusCode::BAD_REQUEST),
        (false, StatusCode::PAYLOAD_TOO_LARGE),
    ] {
        let mut form = reqwest::multipart::Form::new().text("stream", "incoming");
        if extra {
            form = form.text("model", "attacker");
        }
        form = form.part(
            "file",
            reqwest::multipart::Part::bytes(if extra {
                wav(1)
            } else {
                vec![0; UPLOAD_LIMIT + 1]
            })
            .file_name("speech.wav"),
        );
        let response = client
            .post(format!("{gateway}/v1/transcriptions"))
            .header("x-installation-id", Uuid::new_v4().to_string())
            .multipart(form)
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), expected);
        assert!(response.json::<ApiError>().await.is_ok());
    }
    assert_eq!(calls.load(std::sync::atomic::Ordering::SeqCst), 1);
    gateway_task.abort();
    provider_task.abort();
}

#[tokio::test]
async fn configurable_timeout_does_not_retry() {
    let count = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let c = count.clone();
    let app = Router::new().fallback(move || {
        let c = c.clone();
        async move {
            c.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            tokio::time::sleep(Duration::from_secs(2)).await;
            Json(json!({}))
        }
    });
    let (base, task) = listen(app).await;
    let mut cfg = config(&base);
    cfg.timeout_secs = 1;
    let app = router(Gateway::new(cfg).unwrap());
    let response = app
        .oneshot(request(
            "/v1/translations",
            json!({"text":"go","from":"en","to":"th"}),
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::GATEWAY_TIMEOUT);
    assert_eq!(count.load(std::sync::atomic::Ordering::SeqCst), 1);
    task.abort();
}

#[tokio::test]
async fn restart_can_change_provider_key_and_model_without_changing_contract() {
    for revision in ["first", "second"] {
        let (send, mut receive) = tokio::sync::mpsc::channel(1);
        let upstream =
            Router::new().fallback(move |headers: HeaderMap, Json(body): Json<Value>| {
                let send = send.clone();
                async move {
                    send.send((headers["authorization"].to_str().unwrap().to_string(), body))
                        .await
                        .unwrap();
                    Json(json!({"choices":[{"message":{"content":"ไป"}}]}))
                }
            });
        let (base, task) = listen(upstream).await;
        let mut cfg = config(&base);
        cfg.translation_key = format!("key-{revision}");
        cfg.translation_model = format!("model-{revision}");
        let response = router(Gateway::new(cfg).unwrap())
            .oneshot(request(
                "/v1/translations",
                json!({"text":"go","from":"en","to":"th"}),
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let (auth, body) = receive.recv().await.unwrap();
        assert_eq!(auth, format!("Bearer key-{revision}"));
        assert_eq!(body["model"], format!("model-{revision}"));
        assert!(body.get("reasoning_effort").is_none());
        assert!(body.get("include_reasoning").is_none());
        task.abort();
    }
}

#[tokio::test]
async fn concurrent_success_does_not_clear_rate_limit() {
    let started = Arc::new(tokio::sync::Notify::new());
    let release = Arc::new(tokio::sync::Notify::new());
    let start = started.clone();
    let gate = release.clone();
    let upstream = Router::new()
        .route(
            "/success",
            post(move || {
                let start = start.clone();
                let gate = gate.clone();
                async move {
                    start.notify_one();
                    gate.notified().await;
                    Json(json!({"ok":true}))
                }
            }),
        )
        .route(
            "/limited",
            post(|| async { (StatusCode::TOO_MANY_REQUESTS, Json(json!({}))) }),
        );
    let (base, task) = listen(upstream).await;
    let state = Gateway::new(config(&base)).unwrap();
    let pending = state.clone();
    let url = format!("{base}/success");
    let success = tokio::spawn(async move { pending.upstream(0, pending.client.post(url)).await });
    started.notified().await;
    let result = state
        .upstream(1, state.client.post(format!("{base}/limited")))
        .await;
    assert_eq!(result.unwrap_err().0.code, ErrorCode::RateLimited);
    release.notify_one();
    assert!(success.await.unwrap().is_ok());
    assert!(state.check(0).is_err());
    assert!(state.check(1).is_err());
    task.abort();
}
