//! pw-app — the Tauri v2 native shell for pw-backtest.
//!
//! The crate is lib+bin (Tauri v2 template shape): `main.rs` is a thin
//! launcher over [`run`]; everything else lives in the library so the
//! integration tests (`tests/contracts.rs`) can exercise the real types.
//!
//! Phase 0 scope (EXECUTION_PLAN.md P0-T03): window bootstrap (1440×900,
//! min 1024×700), tracing to an XDG log file, `config.toml` load-or-default,
//! and the `app_hello` IPC command proving the bridge end to end.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

pub mod commands;
pub mod config;
pub mod logging;

/// Build and run the Tauri application. Called once from `main.rs`.
///
/// # Errors
///
/// Returns the Tauri runtime error when the event loop fails to start; the
/// caller (main) logs it and exits non-zero.
pub fn run() -> Result<(), tauri::Error> {
    let settings = config::Settings::load_or_default();
    let log_path = logging::init();
    tracing::info!(
        version = env!("CARGO_PKG_VERSION"),
        log = %log_path.display(),
        "pw-app starting"
    );

    tauri::Builder::default()
        .manage(settings)
        .invoke_handler(tauri::generate_handler![commands::app_hello])
        .run(tauri::generate_context!())
}
