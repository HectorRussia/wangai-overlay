mod app_metadata;
mod audio;
mod cloud_stt;
mod commands;
mod gateway;
mod hotkeys;
mod lifecycle;
mod models;
mod pipeline;
mod portable_runtime;
mod processes;
#[cfg(feature = "release-test")]
mod release_test;
mod settings;
mod startup;
mod state;
mod translator;
mod updater;
mod web_companion;
mod worker;

use tauri::{Manager, RunEvent};

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Validation is an internal, read-only host operation, before any GUI/state/server.
    if let Some(path) = std::env::args_os().skip(1).collect::<Vec<_>>().windows(2)
        .find(|pair| pair[0] == "--validate-portable-settings").map(|pair| pair[1].clone())
    {
        let valid = std::fs::read(path).ok().is_some_and(|bytes| settings::validate_portable_import(&bytes).is_ok());
        std::process::exit(if valid { 0 } else { 1 });
    }
    let portable = portable_runtime::PortableRuntime::discover().expect("เปิดผ่าน WANGAI.exe ในโฟลเดอร์ Portable");
    portable.configure_webview();
    let app = tauri::Builder::default()
        .manage(portable)
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(hotkeys::handle_shortcut)
                .build(),
        )
        .setup(|app| {
            #[cfg(feature = "release-test")]
            release_test::delay_startup(app.handle());
            let settings_path = app.state::<portable_runtime::PortableRuntime>().settings_path(app.handle())?;
            let state = AppState::new(settings_path)?;
            let settings = state.settings.snapshot();
            app.manage(state);
            app.manage(updater::UpdateManager::new(
                app.package_info().version.to_string(),
            ));
            let update_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                updater::check(update_handle).await;
            });

            let web = web_companion::WebCompanionManager::start(app.handle().clone())?;
            app.manage(web);

            #[cfg(feature = "release-test")]
            release_test::checkpoint(app.handle(), "before-windows");

            // Configured webviews must not invoke commands before state exists.
            startup::create_windows(app.handle())?;
            #[cfg(feature = "release-test")]
            release_test::checkpoint(app.handle(), "windows-created");
            portable_runtime::start_readiness_monitor(app.handle().clone());
            commands::restore_overlay_bounds(app.handle(), &settings)
                .map_err(anyhow::Error::msg)?;
            hotkeys::register_hotkeys(app.handle(), &settings.hotkeys)?;

            #[cfg(feature = "release-test")]
            release_test::checkpoint(app.handle(), "hotkeys-registered");

            let state = app.state::<AppState>();
            if let Err(error) = state.worker.start(app.handle().clone(), &settings) {
                state.update_runtime(|runtime| {
                    runtime.worker_ready = false;
                    runtime.last_error = Some(error.to_string());
                    runtime.status_message = "ยังเปิด speech worker ไม่ได้".into();
                });
                worker::emit_status(app.handle(), "error", &error.to_string(), None);
            }
            #[cfg(feature = "release-test")]
            release_test::checkpoint(app.handle(), "worker-start-attempted");
            pipeline::start_auto_attach_monitor(app.handle().clone());
            #[cfg(feature = "release-test")]
            release_test::start(app.handle().clone());
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    let state = handle.state::<AppState>();
                    state.gateway.refresh_status().await;
                    let runtime = state.update_runtime(|_| {});
                    let _ = tauri::Emitter::emit(&handle, "runtime-state", runtime);
                    tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let state = window.state::<AppState>();
                    let running = {
                        let runtime = state.runtime.read().expect("runtime lock poisoned");
                        runtime.listening || runtime.microphone_active
                    };
                    if running {
                        if commands::show_listening_overlay(window.app_handle()).is_ok() {
                            let _ = window.hide();
                        }
                    } else {
                        window.app_handle().exit(0);
                    }
                } else if window.label() == "overlay" {
                    window.app_handle().exit(0);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            portable_runtime::portable_frontend_ready,
            updater::get_update_status,
            updater::check_for_updates,
            updater::download_and_install_update,
            commands::get_snapshot,
            commands::list_capture_sources,
            commands::list_running_apps,
            commands::list_output_devices,
            commands::get_web_companion_info,
            commands::open_web_companion,
            commands::open_settings_window,
            commands::quit_app,
            commands::select_listening_source,
            commands::update_capture_mode,
            commands::update_output_device,
            commands::update_rescue_scan,
            commands::toggle_listening,
            commands::set_listening,
            commands::probe_recent_audio,
            commands::update_hotkeys,
            commands::update_overlay_settings,
            commands::update_vad_settings,
            commands::update_glossary,
            commands::set_overlay_edit_mode,
            commands::set_overlay_presentation,
            commands::save_overlay_bounds,
            commands::start_overlay_drag,
            commands::copy_latest_reply,
            commands::restart_worker,
            commands::inject_demo_transcript,
        ])
        .build(tauri::generate_context!())
        .expect("error while building GameLingo");

    app.run(|app, event| {
        if matches!(event, RunEvent::ExitRequested { .. } | RunEvent::Exit) {
            // Setup can fail before every manager is registered.
            if let Some(web) = app.try_state::<web_companion::WebCompanionManager>() {
                web.shutdown();
            }
            if app.try_state::<AppState>().is_some() {
                let _ = lifecycle::shutdown(app);
            }
        }
    });
}
