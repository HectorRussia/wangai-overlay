//! Register command state before starting either WebView's JavaScript.
use crate::{state::AppState, updater::UpdateManager, web_companion::WebCompanionManager};
use anyhow::{ensure, Result};
use tauri::{AppHandle, Manager, Runtime, WebviewWindowBuilder};

fn require_state<R: Runtime>(app: &AppHandle<R>) -> Result<()> {
    ensure!(
        app.try_state::<AppState>().is_some(),
        "AppState must be registered before windows"
    );
    ensure!(
        app.try_state::<UpdateManager>().is_some(),
        "Updater state must be registered before windows"
    );
    ensure!(
        app.try_state::<WebCompanionManager>().is_some(),
        "Web Companion state must be registered before windows"
    );
    Ok(())
}

pub fn create_windows(app: &AppHandle) -> Result<()> {
    require_state(app)?;
    for config in &app.config().app.windows {
        ensure!(
            !config.create,
            "Windows must not be auto-created before setup"
        );
        WebviewWindowBuilder::from_config(app, config)?.build()?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn neither_settings_nor_overlay_can_auto_create_before_state() {
        let config: tauri::Config =
            serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        assert_eq!(config.app.windows.len(), 2);
        for label in ["main", "overlay"] {
            let window = config
                .app
                .windows
                .iter()
                .find(|window| window.label == label)
                .unwrap();
            assert!(!window.create, "{label} must wait for managed state");
        }
    }

    #[test]
    fn rejects_window_creation_without_command_state() {
        let app = tauri::test::mock_builder()
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        assert!(require_state(app.handle())
            .unwrap_err()
            .to_string()
            .contains("AppState"));
    }

    #[test]
    fn rejects_partial_startup_state() {
        let directory = tempfile::tempdir().unwrap();
        let app = tauri::test::mock_builder()
            .manage(AppState::new(directory.path().join("settings.json")).unwrap())
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        assert!(require_state(app.handle())
            .unwrap_err()
            .to_string()
            .contains("Updater"));
        app.manage(UpdateManager::default());
        assert!(require_state(app.handle())
            .unwrap_err()
            .to_string()
            .contains("Web Companion"));
    }
}
