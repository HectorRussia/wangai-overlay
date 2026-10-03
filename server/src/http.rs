use crate::{error::fail, services, Failure, Gateway, UPLOAD_LIMIT};
use axum::{
    extract::{
        multipart::MultipartRejection, rejection::JsonRejection, DefaultBodyLimit, Multipart, State,
    },
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use serde_json::json;
use std::{sync::Arc, time::Instant};
use uuid::Uuid;
use wangai_ai_protocol::{
    ErrorCode, ServiceStatus, TranscriptionResponse, TranslationRequest, TranslationResponse,
};

pub fn router(state: Arc<Gateway>) -> Router {
    Router::new()
        .route("/healthz", get(|| async { Json(json!({"status":"ok"})) }))
        .route("/v1/status", get(status))
        .route(
            "/v1/transcriptions",
            post(transcribe).layer(DefaultBodyLimit::max(UPLOAD_LIMIT + 64 * 1024)),
        )
        .route(
            "/v1/translations",
            post(translate).layer(DefaultBodyLimit::max(64 * 1024)),
        )
        .with_state(state)
}

async fn status(State(state): State<Arc<Gateway>>) -> Json<ServiceStatus> {
    let error = state.check(0).err().or_else(|| state.check(1).err());
    let verified = state.health.iter().all(|h| h.lock().unwrap().verified);
    Json(ServiceStatus {
        state: if error.is_some() {
            "degraded"
        } else if verified {
            "ready"
        } else {
            "connected"
        }
        .into(),
        message: error
            .as_ref()
            .map(|e| e.0.message.clone())
            .unwrap_or_else(|| {
                if verified {
                    "บริการ AI พร้อมใช้งาน"
                } else {
                    "เชื่อมต่อบริการ AI แล้ว — รอตรวจสอบโมเดลเมื่อใช้งาน"
                }
                .into()
            }),
        incoming_model: state.config.incoming_model.clone(),
        microphone_model: state.config.microphone_model.clone(),
        translation_model: state.config.translation_model.clone(),
        retry_after_ms: error.and_then(|e| e.0.retry_after_ms),
    })
}

fn installation(headers: &HeaderMap) -> Result<String, Failure> {
    let id = headers
        .get("x-installation-id")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| Uuid::parse_str(v).ok())
        .ok_or_else(|| fail(ErrorCode::InvalidRequest))?;
    Ok(id.to_string())
}

async fn transcribe(
    State(state): State<Arc<Gateway>>,
    headers: HeaderMap,
    body: Result<Multipart, MultipartRejection>,
) -> Result<Json<TranscriptionResponse>, Failure> {
    let id = installation(&headers)?;
    let start = Instant::now();
    let mut body = body.map_err(|_| fail(ErrorCode::InvalidRequest))?;
    let mut audio = None;
    let mut stream = None;
    while let Some(field) = body.next_field().await.map_err(multipart_error)? {
        match field.name() {
            Some("file") if audio.is_none() => {
                let value = field.bytes().await.map_err(multipart_error)?;
                if value.len() > UPLOAD_LIMIT {
                    return Err(fail(ErrorCode::PayloadTooLarge));
                }
                audio = Some(value.to_vec());
            }
            Some("stream") if stream.is_none() => {
                stream = Some(field.text().await.map_err(multipart_error)?);
            }
            _ => return Err(fail(ErrorCode::InvalidRequest)),
        }
    }
    let audio = audio.ok_or_else(|| fail(ErrorCode::InvalidRequest))?;
    services::transcribe(&state, id, start, audio, stream)
        .await
        .map(Json)
}

async fn translate(
    State(state): State<Arc<Gateway>>,
    headers: HeaderMap,
    body: Result<Json<TranslationRequest>, JsonRejection>,
) -> Result<Json<TranslationResponse>, Failure> {
    let id = installation(&headers)?;
    let start = Instant::now();
    let Json(body) = body.map_err(|e| {
        fail(if e.status() == StatusCode::PAYLOAD_TOO_LARGE {
            ErrorCode::PayloadTooLarge
        } else {
            ErrorCode::InvalidRequest
        })
    })?;
    services::translate(&state, id, start, body).await.map(Json)
}

fn multipart_error(error: axum::extract::multipart::MultipartError) -> Failure {
    fail(if error.status() == StatusCode::PAYLOAD_TOO_LARGE {
        ErrorCode::PayloadTooLarge
    } else {
        ErrorCode::InvalidRequest
    })
}
