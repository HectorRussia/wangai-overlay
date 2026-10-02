use crate::Failure;
use wangai_ai_protocol::{ApiError, ErrorCode};
use std::time::{Duration, Instant};
use uuid::Uuid;

#[derive(Default)]
pub(crate) struct Health {
    pub(crate) error: Option<(ApiError, Instant)>,
    pub(crate) verified: bool,
}

impl Health {
    pub(crate) fn check(&self) -> Result<(), Failure> {
        if let Some((error, until)) = &self.error {
            if *until > Instant::now() {
                let mut error = error.clone();
                error.request_id = Uuid::new_v4().to_string();
                error.retry_after_ms =
                    Some(until.saturating_duration_since(Instant::now()).as_millis() as u64 + 1);
                return Err(Failure(error));
            }
        }
        Ok(())
    }


    pub(crate) fn record_result<T>(&mut self, result: &Result<T, Failure>) {
        match result {
            Ok(_) => {
                self.verified = true;
                // A success already in flight must not erase another request's 429 cooldown.
                if self
                    .error
                    .as_ref()
                    .is_some_and(|(_, until)| *until <= Instant::now())
                {
                    self.error = None;
                }
            }
            Err(error) => {
                let duration = error.0.retry_after_ms.unwrap_or(match error.0.code {
                    ErrorCode::ConfigurationError
                    | ErrorCode::UnsupportedModel
                    | ErrorCode::BillingBlocked => 60_000,
                    _ => 5_000,
                });
                let until = Instant::now() + Duration::from_millis(duration);
                if self
                    .error
                    .as_ref()
                    .is_none_or(|(_, existing)| *existing <= until)
                {
                    self.error = Some((error.0.clone(), until));
                }
            }
        }
    }
}
