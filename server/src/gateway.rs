use crate::{config::Config, health::Health, metrics, Failure};
use serde_json::Value;
use std::{
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tokio::sync::{mpsc, Semaphore};

pub struct Gateway {
    pub(crate) config: Config,
    pub(crate) client: reqwest::Client,
    pub(crate) slots: Semaphore,
    // Equal credential + origin shares cooldown, even across STT and translation.
    pub(crate) health: [Arc<Mutex<Health>>; 2],
    metrics: mpsc::Sender<MetricMessage>,
}

enum MetricMessage {
    Event(metrics::Metric),
    Flush(tokio::sync::oneshot::Sender<()>),
}

impl Gateway {
    pub fn new(config: Config) -> anyhow::Result<Arc<Self>> {
        let db = metrics::open(&config.database)?;
        let (metrics_tx, mut receiver) = mpsc::channel::<MetricMessage>(1024);
        std::thread::spawn(move || {
            while let Some(message) = receiver.blocking_recv() {
                match message {
                    MetricMessage::Event(event) => {
                        if metrics::record(&db, event).is_err() {
                            eprintln!("Usage persistence failed");
                        }
                    }
                    MetricMessage::Flush(done) => {
                        let _ = done.send(());
                    }
                }
            }
        });
        let first = Arc::new(Mutex::new(Health::default()));
        let shared = config.stt_key == config.translation_key
            && reqwest::Url::parse(&config.stt_url)?.origin()
                == reqwest::Url::parse(&config.translation_url)?.origin();
        let second = if shared {
            first.clone()
        } else {
            Arc::new(Mutex::new(Health::default()))
        };
        Ok(Arc::new(Self {
            client: reqwest::Client::builder()
                .timeout(Duration::from_secs(config.timeout_secs))
                .redirect(reqwest::redirect::Policy::none())
                .build()?,
            slots: Semaphore::new(config.max_concurrent),
            health: [first, second],
            config,
            metrics: metrics_tx,
        }))
    }

    pub async fn flush_metrics(&self) {
        let (send, receive) = tokio::sync::oneshot::channel();
        if self.metrics.send(MetricMessage::Flush(send)).await.is_ok() {
            let _ = receive.await;
        }
    }

    pub(crate) fn record(
        &self,
        installation: String,
        stage: usize,
        model: &str,
        duration: u64,
        start: Instant,
        result: &Result<Value, Failure>,
    ) {
        let (outcome, usage) = match result {
            Ok(value) => (
                "success".into(),
                value.get("usage").cloned().unwrap_or(Value::Null),
            ),
            Err(error) => (
                serde_json::to_value(&error.0.code)
                    .unwrap()
                    .as_str()
                    .unwrap()
                    .to_string(),
                Value::Null,
            ),
        };
        let event = metrics::Metric {
            installation,
            operation: if stage == 0 { "stt" } else { "translation" },
            model: model.into(),
            outcome,
            audio_ms: duration,
            latency_ms: start.elapsed().as_millis() as u64,
            prompt_tokens: usage["prompt_tokens"].as_u64().unwrap_or(0),
            completion_tokens: usage["completion_tokens"].as_u64().unwrap_or(0),
        };
        if self.metrics.try_send(MetricMessage::Event(event)).is_err() {
            eprintln!("Usage queue full or closed");
        }
    }
}

impl Gateway {
    pub(crate) fn check(&self, stage: usize) -> Result<(), Failure> {
        self.health[stage].lock().unwrap().check()
    }
}
