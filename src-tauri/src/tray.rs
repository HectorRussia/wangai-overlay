use anyhow::{Context, Result};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};

fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.eval("window.location.hash = '#/settings/overview'");
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn create_tray(app: &AppHandle) -> Result<()> {
    let show = MenuItem::with_id(app, "show", "เปิด WANGAI", true, None::<&str>)?;
    let stop = MenuItem::with_id(app, "stop", "หยุดใช้งาน", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "ออกจากโปรแกรม", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &stop, &quit])?;
    let icon = app.default_window_icon().cloned().context("ไม่พบไอคอน WANGAI สำหรับ system tray")?;
    TrayIconBuilder::new()
        .icon(icon)
        .tooltip("WANGAI")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main(app),
            "stop" => {
                let handle = app.clone();
                tauri::async_runtime::spawn_blocking(move || {
                    if let Err(error) = crate::application::listening::set_listening_sync(&handle, false) {
                        eprintln!("หยุด WANGAI จาก tray ไม่สำเร็จ: {error}");
                    }
                });
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}
