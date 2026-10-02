//! Exercises the real adapters only in the disposable release-test product.
//! Idle commands never select or record an application or microphone.
use crate::{
    commands,
    models::GlossaryTerm,
    state::AppState,
    web_companion::{commands::dispatch_web_command, WebCommand},
};
use anyhow::{ensure, Result};
use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Manager};

fn json<T: Serialize>(result: Result<T, String>) -> Result<Value, String> {
    result.map(|value| serde_json::to_value(value).expect("command response serialization"))
}

async fn same(app: &AppHandle, native: Result<Value, String>, web: WebCommand) -> Result<()> {
    let remote = dispatch_web_command(app, web).await;
    ensure!(native == remote, "Desktop/Web command results differ");
    Ok(())
}

pub(super) async fn verify(app: &AppHandle) -> Result<()> {
    let state = app.state::<AppState>();
    ensure!(
        !state.runtime.read().unwrap().listening,
        "Parity check requires an idle fixture"
    );
    let original = state.settings.snapshot();
    let result = async {
        let mut overlay = original.overlay.clone();
        overlay.opacity = 0.73;
        same(
            app,
            json(commands::update_overlay_settings(
                app.clone(),
                app.state(),
                overlay.clone(),
            )),
            WebCommand::UpdateOverlaySettings { overlay },
        )
        .await?;
        let glossary = vec![GlossaryTerm {
            source: "parity fixture".into(),
            target: "ทดสอบคำสั่ง".into(),
        }];
        same(
            app,
            json(commands::update_glossary(
                app.clone(),
                app.state(),
                glossary.clone(),
            )),
            WebCommand::UpdateGlossary { glossary },
        )
        .await?;
        same(
            app,
            json(commands::update_microphone_device(
                app.clone(),
                app.state(),
                None,
            )),
            WebCommand::UpdateMicrophoneDevice { device_id: None },
        )
        .await?;
        state.update_runtime(|runtime| runtime.microphone_active = true);
        let rejected = same(
            app,
            json(commands::update_microphone_device(
                app.clone(),
                app.state(),
                None,
            )),
            WebCommand::UpdateMicrophoneDevice { device_id: None },
        )
        .await;
        state.update_runtime(|runtime| runtime.microphone_active = false);
        rejected?;
        same(
            app,
            json(commands::update_rescue_scan(app.clone(), app.state(), true)),
            WebCommand::UpdateRescueScan { enabled: true },
        )
        .await?;
        same(
            app,
            json(commands::set_listening(app.clone(), false).await),
            WebCommand::SetListening { enabled: false },
        )
        .await?;
        same(
            app,
            json(commands::clear_listening_source(app.clone()).await),
            WebCommand::ClearListeningSource,
        )
        .await?;
        // Both paths restart the real packaged worker. Wait for each new process
        // to become ready before checking the next path, rather than a stale flag.
        for web in [false, true] {
            let previous = state.worker.test_pid();
            let response = if web {
                dispatch_web_command(app, WebCommand::RestartWorker).await
            } else {
                json(commands::restart_worker(app.clone(), app.state()))
            };
            ensure!(response == Ok(Value::Null), "Worker restart command failed");
            ensure!(
                state.worker.test_pid().is_some() && state.worker.test_pid() != previous,
                "Worker process was not replaced"
            );
            let mut ready = false;
            for _ in 0..100 {
                if state.runtime.read().unwrap().worker_ready {
                    ready = true;
                    break;
                }
                tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            }
            ensure!(ready, "Restarted worker did not become ready");
        }
        Ok(())
    }
    .await;
    // Restore even when a comparison fails so upgrade/rollback can still verify
    // exact settings and installation ID preservation independently.
    state.settings.update(|settings| {
        *settings = original;
        Ok(())
    })?;
    result
}
