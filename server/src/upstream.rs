use crate::{Gateway, Failure, error::fail};
use axum::http::{HeaderMap, StatusCode};
use serde_json::Value;
use std::time::SystemTime;
use wangai_ai_protocol::ErrorCode;
const RESPONSE_LIMIT: usize = 2 * 1024 * 1024;

impl Gateway {
    pub(crate) async fn upstream(
        &self,
        stage: usize,
        request: reqwest::RequestBuilder,
    ) -> Result<Value, Failure> {
        self.check(stage)?;
        let result = async {
            let mut response = request.send().await.map_err(network_error)?;
            let status = response.status();
            let retry_ms = retry_after(response.headers());
            let mut body = Vec::new();
            while let Some(chunk) = response.chunk().await.map_err(network_error)? {
                if body.len() + chunk.len() > RESPONSE_LIMIT {
                    return Err(fail(ErrorCode::UnsupportedModel));
                }
                body.extend_from_slice(&chunk);
            }
            let value: Value = serde_json::from_slice(&body).unwrap_or(Value::Null);
            if status.is_success() {
                if value.is_null() {
                    return Err(fail(ErrorCode::UnsupportedModel));
                }
                return Ok(value);
            }
            // Only inspect known error codes. Raw provider messages never leave this function.
            let code = value
                .pointer("/error/code")
                .and_then(Value::as_str)
                .unwrap_or("");
            let kind = if [
                "blocked_api_access",
                "insufficient_quota",
                "billing_hard_limit_reached",
                "credit_balance_exhausted",
            ]
            .contains(&code)
                || status == StatusCode::PAYMENT_REQUIRED
            {
                ErrorCode::BillingBlocked
            } else if status == StatusCode::TOO_MANY_REQUESTS {
                ErrorCode::RateLimited
            } else if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN {
                ErrorCode::ConfigurationError
            } else if status == StatusCode::BAD_REQUEST
                || status == StatusCode::NOT_FOUND
                || status == StatusCode::UNPROCESSABLE_ENTITY
            {
                ErrorCode::UnsupportedModel
            } else {
                ErrorCode::Unavailable
            };
            let mut error = fail(kind);
            if error.0.code == ErrorCode::RateLimited {
                error.0.retry_after_ms = Some(retry_ms);
            }
            Err(error)
        }
        .await;
        self.health[stage].lock().unwrap().record_result(&result);
        result
    }

}

fn network_error(error: reqwest::Error) -> Failure {
    fail(if error.is_timeout() {
        ErrorCode::Timeout
    } else {
        ErrorCode::Unavailable
    })
}

fn retry_after(headers: &HeaderMap) -> u64 {
    let value = headers.get("retry-after").and_then(|v| v.to_str().ok());
    value
        .and_then(|v| {
            v.parse::<u64>()
                .ok()
                .map(|seconds| seconds.saturating_mul(1000))
                .or_else(|| {
                    httpdate::parse_http_date(v).ok().map(|date| {
                        date.duration_since(SystemTime::now())
                            .unwrap_or_default()
                            .as_millis()
                            .min(u64::MAX as u128) as u64
                    })
                })
        })
        .unwrap_or(5_000)
        .clamp(1, 86_400_000)
}

