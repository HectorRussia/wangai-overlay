use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use uuid::Uuid;
use wangai_ai_protocol::{ApiError, ErrorCode};

#[derive(Debug)]
pub struct Failure(pub ApiError);

pub(crate) fn fail(code: ErrorCode) -> Failure {
    let message = match code {
        ErrorCode::InvalidRequest => "คำขอไม่ถูกต้อง",
        ErrorCode::PayloadTooLarge => "ข้อมูลใหญ่เกินขนาดที่บริการรองรับ",
        ErrorCode::RateLimited => "บริการ AI กำลังพักชั่วคราว กรุณารอสักครู่",
        ErrorCode::CapacityExceeded => "บริการ AI มีงานเต็ม กรุณาลองใหม่ภายหลัง",
        ErrorCode::BillingBlocked => "ผู้ให้บริการ AI ระงับการใช้งานด้านเครดิตหรือการชำระเงิน",
        ErrorCode::ConfigurationError => "การตั้งค่าบริการ AI มีปัญหา กรุณาแจ้งผู้ดูแล",
        ErrorCode::UnsupportedModel => "โมเดลหรือรูปแบบคำตอบไม่รองรับ กรุณาแจ้งผู้ดูแล",
        ErrorCode::Timeout => "บริการ AI ตอบกลับไม่ทันเวลา",
        ErrorCode::Unavailable => "เชื่อมต่อบริการ AI ไม่สำเร็จ",
    };
    let retry_after_ms = match code {
        ErrorCode::InvalidRequest | ErrorCode::PayloadTooLarge => None,
        ErrorCode::ConfigurationError | ErrorCode::UnsupportedModel | ErrorCode::BillingBlocked => {
            Some(60_000)
        }
        ErrorCode::CapacityExceeded => Some(1_000),
        _ => Some(5_000),
    };
    Failure(ApiError {
        code,
        message: message.into(),
        retry_after_ms,
        request_id: Uuid::new_v4().to_string(),
    })
}

impl IntoResponse for Failure {
    fn into_response(self) -> Response {
        let status = match self.0.code {
            ErrorCode::InvalidRequest => StatusCode::BAD_REQUEST,
            ErrorCode::PayloadTooLarge => StatusCode::PAYLOAD_TOO_LARGE,
            ErrorCode::RateLimited => StatusCode::TOO_MANY_REQUESTS,
            ErrorCode::Timeout => StatusCode::GATEWAY_TIMEOUT,
            ErrorCode::UnsupportedModel => StatusCode::BAD_GATEWAY,
            _ => StatusCode::SERVICE_UNAVAILABLE,
        };
        let retry = self.0.retry_after_ms;
        let mut response = (status, Json(self.0)).into_response();
        if let Some(ms) = retry {
            response.headers_mut().insert(
                "retry-after",
                ms.div_ceil(1000).to_string().parse().unwrap(),
            );
        }
        response
    }
}
