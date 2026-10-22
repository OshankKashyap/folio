// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "linux")]
    if notion_alternative_lib::disable_gpu_compositing(
        notion_alternative_lib::startup_gpu_acceleration(),
        true,
    ) {
        // SAFETY: main has not spawned any threads or initialized GTK/WebKit yet.
        unsafe { std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1") };
    }
    notion_alternative_lib::run()
}
