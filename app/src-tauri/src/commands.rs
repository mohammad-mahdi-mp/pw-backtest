//! IPC commands exposed to the UI layer.
//!
//! Contract rules (EXECUTION_PLAN.md §1.3): command names, argument shapes,
//! and return types must match `ui/src/lib/ipc.ts` exactly — that file is
//! the single source of truth; this module implements it.
//!
//! Wire-format convention: **app-level payloads serialize camelCase**
//! (`rename_all = "camelCase"`) to match the TS contract; engine-domain
//! types (`pw-core`/`pw-engine`) stay snake_case because the golden
//! fixtures pin their serde shape.

use serde::{Deserialize, Serialize};

use crate::config::Settings;

/// Payload of the `app_hello` command — the bridge smoke test.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HelloInfo {
    /// Human-readable readiness message.
    pub message: String,
    /// pw-app crate version.
    pub version: String,
    /// Absolute path of the user config directory.
    pub config_dir: String,
    /// Whether an existing `config.toml` was successfully loaded.
    pub config_loaded: bool,
}

/// Report shell readiness: version, config location, and load status.
///
/// Every field is computed defensively so the UI can always render the
/// placeholder page; this command never fails.
#[tauri::command]
pub fn app_hello(settings: tauri::State<Settings>) -> HelloInfo {
    HelloInfo {
        message: "pw-backtest native shell ready".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        config_dir: Settings::config_dir().display().to_string(),
        config_loaded: settings.config_loaded,
    }
}
