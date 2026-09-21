//! Application settings: XDG paths and `config.toml` load-or-default.
//!
//! Phase 0 keeps the surface minimal (ui appearance seed + data dir
//! override); it grows with the Settings work in Phase 1 (P1-T11).

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

/// Resolve an XDG base directory (`env_var`, falling back to `$HOME`-relative
/// `fallback`), matching the XDG Base Directory spec.
fn xdg_dir(env_var: &str, fallback: &str) -> PathBuf {
    if let Some(from_env) = std::env::var_os(env_var) {
        let p = PathBuf::from(from_env);
        if p.is_absolute() {
            return p;
        }
    }
    match std::env::var_os("HOME") {
        Some(home) => PathBuf::from(home).join(fallback),
        // Last resort for headless/broken environments; never crashes.
        None => PathBuf::from("/tmp"),
    }
}

/// UI appearance seed persisted in `config.toml` (full personalization
/// engine lands in P1-T01/P1-T11).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct UiSettings {
    /// Built-in theme key (`grey` | `black` | `blue` | `white`) or saved id.
    pub theme: String,
    /// Row density: `comfortable` | `compact`.
    pub density: String,
    /// Base font size: `s` | `m` | `l`.
    pub font_size: String,
}

impl Default for UiSettings {
    fn default() -> Self {
        Self {
            theme: "grey".to_string(),
            density: "comfortable".to_string(),
            font_size: "m".to_string(),
        }
    }
}

/// Application settings (mirrors `~/.config/pw-backtest/config.toml`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// Environment marker (`dev` until packaging lands).
    pub app_env: String,
    /// Optional data-directory override (default: XDG data home).
    pub data_dir: Option<PathBuf>,
    /// Appearance seed.
    pub ui: UiSettings,
    /// Set by [`Settings::load_or_default`]: was an existing file loaded?
    #[serde(skip)]
    pub config_loaded: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            app_env: "dev".to_string(),
            data_dir: None,
            ui: UiSettings::default(),
            config_loaded: false,
        }
    }
}

impl Settings {
    /// Absolute path of the config directory (`$XDG_CONFIG_HOME/pw-backtest`).
    pub fn config_dir() -> PathBuf {
        xdg_dir("XDG_CONFIG_HOME", ".config").join("pw-backtest")
    }

    /// Absolute path of `config.toml`.
    pub fn config_path() -> PathBuf {
        Self::config_dir().join("config.toml")
    }

    /// Default data directory (`$XDG_DATA_HOME/pw-backtest`), honoring the
    /// `data_dir` override.
    pub fn effective_data_dir(&self) -> PathBuf {
        self.data_dir
            .clone()
            .unwrap_or_else(|| xdg_dir("XDG_DATA_HOME", ".local/share").join("pw-backtest"))
    }

    /// Log directory (`$XDG_DATA_HOME/pw-backtest/logs`) — static default
    /// used by the logging pipeline.
    pub fn default_log_dir() -> PathBuf {
        xdg_dir("XDG_DATA_HOME", ".local/share")
            .join("pw-backtest")
            .join("logs")
    }

    /// Load `config.toml` if present and valid; otherwise return defaults.
    /// Never fails: a malformed file logs a warning (to stderr, before the
    /// tracing pipeline exists) and yields defaults.
    pub fn load_or_default() -> Self {
        let path = Self::config_path();
        match std::fs::read_to_string(&path) {
            Ok(raw) => match toml::from_str::<Settings>(&raw) {
                Ok(mut parsed) => {
                    parsed.config_loaded = true;
                    parsed
                }
                Err(err) => {
                    eprintln!("pw-app: malformed config {}: {err}", path.display());
                    Self::default()
                }
            },
            Err(_) => Self::default(),
        }
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests {
    use super::*;

    #[test]
    fn defaults_are_stable() {
        let s = Settings::default();
        assert_eq!(s.app_env, "dev");
        assert_eq!(s.ui.theme, "grey");
        assert!(!s.config_loaded);
        assert!(s.data_dir.is_none());
    }

    #[test]
    fn toml_roundtrip_preserves_fields() {
        let mut s = Settings::default();
        s.ui.theme = "black".to_string();
        s.config_loaded = true; // skipped in serde — must not round-trip
        let raw = toml::to_string(&s).unwrap();
        let back: Settings = toml::from_str(&raw).unwrap();
        assert_eq!(back.ui.theme, "black");
        assert!(!back.config_loaded, "config_loaded is runtime state, not file state");
    }
}
