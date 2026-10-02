// Installed Windows builds must not own a Console window. Keep dev output intact.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    gamelingo_lib::run();
}
