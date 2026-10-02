//! AI gateway composition. HTTP contracts remain exported from this crate root.
pub mod config;
pub mod metrics;
mod error;
mod gateway;
mod health;
mod http;
mod services;
mod upstream;
mod wav;

pub use error::Failure;
pub use gateway::Gateway;
pub use http::router;
pub use wav::validate_wav;
const UPLOAD_LIMIT: usize = 2 * 1024 * 1024;

#[cfg(test)]
mod tests;
