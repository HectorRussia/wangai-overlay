#![cfg_attr(windows, windows_subsystem = "windows")]
mod host;
mod ui;
fn main() {
    if let Err(error) = host::entry() {
        #[cfg(feature="release-test")]
        if std::env::args().any(|a|a=="--test-prepare") { eprintln!("{error:#}"); std::process::exit(1); }
        ui::error(&format!("{error:#}"));
        std::process::exit(1);
    }
}
