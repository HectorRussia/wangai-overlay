use crate::{
    gateway::GatewayClient,
    models::{TranslationResult, TranslationStatus},
    settings::SettingsManager,
};
use async_trait::async_trait;

#[async_trait]
pub trait Translator: Send + Sync {
    async fn translate(
        &self,
        settings: &SettingsManager,
        segment_id: &str,
        text: &str,
        from: &str,
        to: &str,
    ) -> TranslationResult;
}

#[derive(Clone)]
pub struct GatewayTranslator(pub GatewayClient);

#[async_trait]
impl Translator for GatewayTranslator {
    async fn translate(
        &self,
        settings: &SettingsManager,
        segment_id: &str,
        text: &str,
        from: &str,
        to: &str,
    ) -> TranslationResult {
        let request = wangai_ai_protocol::TranslationRequest {
            text: text.into(),
            from: from.into(),
            to: to.into(),
            glossary: settings
                .snapshot()
                .glossary
                .into_iter()
                .map(|term| wangai_ai_protocol::GlossaryTerm {
                    source: term.source,
                    target: term.target,
                })
                .collect(),
        };
        let result = self.0.translate(&request).await;
        let (translated_text, status, message) = match result {
            Ok(value) => (Some(value.text), TranslationStatus::Success, None),
            Err(error) => (None, TranslationStatus::Error, Some(error.to_string())),
        };
        TranslationResult {
            segment_id: segment_id.into(),
            from: from.into(),
            to: to.into(),
            source_text: text.into(),
            translated_text,
            status,
            message,
        }
    }
}
