//! P0-T05 spike shell: hosts the LWC v5 benchmark page and exposes three
//! commands — config (autorun flags from env), stats (host-process RSS),
//! finish (persist the report JSON and optionally exit).
//!
//! Throwaway measurement harness: not product code, but still unwrap-free.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};

/// Benchmark run configuration, fed by env vars so CI and `spike-run.sh`
/// can drive it without UI interaction.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpikeConfig {
    /// Run the scripted benchmark immediately after load.
    pub autorun: bool,
    /// Active measurement duration in seconds.
    pub duration_s: u32,
}

/// Host-process memory snapshot (`VmRSS` from `/proc/self/status`).
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpikeStats {
    /// Resident set size in KiB (0 when unavailable).
    pub rss_kb: u64,
}

fn read_rss_kb() -> u64 {
    let Ok(status) = std::fs::read_to_string("/proc/self/status") else {
        return 0;
    };
    for line in status.lines() {
        if let Some(rest) = line.strip_prefix("VmRSS:") {
            let digits: String = rest.chars().filter(|c| c.is_ascii_digit()).collect();
            return digits.parse::<u64>().unwrap_or(0);
        }
    }
    0
}

/// Report where the webview should save its JSON report and whether the app
/// exits when done (CI mode).
#[tauri::command]
fn spike_config() -> SpikeConfig {
    let autorun = std::env::var("SPIKE_AUTORUN").is_ok_and(|v| v == "1");
    let duration_s = std::env::var("SPIKE_DURATION")
        .ok()
        .and_then(|v| v.parse::<u32>().ok())
        .filter(|d| *d >= 5 && *d <= 300)
        .unwrap_or(20);
    SpikeConfig { autorun, duration_s }
}

/// Current host-process RSS (sampled by the webview once per second).
#[tauri::command]
fn spike_stats() -> SpikeStats {
    SpikeStats { rss_kb: read_rss_kb() }
}

/// Persist the benchmark report; exits the app when `exitAfter` is set
/// (CI mode). Returns whether the report was written.
#[tauri::command]
fn spike_finish(report: String, exit_after: bool, app: tauri::AppHandle) -> bool {
    let path = std::env::var("SPIKE_REPORT_PATH")
        .unwrap_or_else(|_| "spike-report.json".to_string());
    let written = std::fs::write(&path, report).is_ok();
    eprintln!("spike: report written={written} path={path}");
    if exit_after {
        app.exit(0);
    }
    written
}

fn main() {
    let app = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![spike_config, spike_stats, spike_finish])
        .run(tauri::generate_context!());
    if let Err(err) = app {
        eprintln!("spike-lwc: fatal: {err}");
        std::process::exit(1);
    }
}
