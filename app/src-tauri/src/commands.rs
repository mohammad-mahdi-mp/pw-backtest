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

use std::fs;
use std::path::{Path, PathBuf};

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

// ---------------------------------------------------------------------------
// screenshots_save (P1-T08, contract §1.3) — Alt+S chart snapshot
// ---------------------------------------------------------------------------

/// Arguments of the `screenshots_save` command (camelCase on the wire).
///
/// Mirrors `ScreenshotSaveArgs` in `ui/src/lib/ipc.ts`; `Serialize` is
/// derived so the contract fixture can round-trip byte-identical.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotSaveArgs {
    /// Suggested file stem (e.g. `"BTCUSDT 1d"`); sanitized by
    /// [`sanitize_stem`] and suffixed with a millisecond timestamp.
    pub name: Option<String>,
    /// PNG payload, base64-encoded (standard alphabet, padding optional).
    pub data_base64: String,
}

/// Result of the `screenshots_save` command (camelCase on the wire).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotSaved {
    /// Absolute path of the written PNG.
    pub path: String,
}

/// PNG magic prefix (`\x89PNG`) — the payload must be a PNG, not an
/// arbitrary blob the client can name anything.
const PNG_MAGIC: [u8; 4] = [0x89, b'P', b'N', b'G'];

/// Decode standard base64 (alphabet `A–Z a–z 0–9 + /`, padding optional,
/// ASCII whitespace skipped). Returns `Err` on any non-alphabet byte.
///
/// Trailing partial groups are accepted leniently; the PNG-magic check in
/// [`save_screenshot`] is the real gate for this command.
pub fn decode_base64(input: &str) -> Result<Vec<u8>, String> {
    // Value 255 = "not in alphabet"; real values are stored as index + 1 so
    // alphabet position 0 ('A') is not confused with the sentinel.
    let mut table = [255u8; 128];
    for (i, &b) in b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".iter().enumerate() {
        table[b as usize] = (i + 1) as u8;
    }

    let mut out = Vec::with_capacity(input.len() / 4 * 3 + 3);
    let mut buffer: u32 = 0;
    let mut bits: u32 = 0;
    for &c in input.as_bytes() {
        if c == b'=' {
            break; // padding — the rest must be padding/whitespace
        }
        if matches!(c, b'\n' | b'\r' | b' ' | b'\t') {
            continue;
        }
        let v = if (c as usize) < 128 { table[c as usize] } else { 255 };
        if v == 255 {
            return Err(format!("invalid base64 byte: {c:#x}"));
        }
        buffer = (buffer << 6) | (v - 1) as u32;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push(((buffer >> bits) & 0xff) as u8);
        }
    }
    Ok(out)
}

/// Reduce a client-supplied name to a safe file stem: only
/// `[A-Za-z0-9._-]` survive, everything else (spaces, separators, `..`)
/// becomes `-`; empty results fall back to `chart`.
pub fn sanitize_stem(name: Option<&str>) -> String {
    let cleaned: String = name
        .unwrap_or_default()
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-') {
                c
            } else {
                '-'
            }
        })
        .collect();
    let trimmed = cleaned.trim_matches('-').to_string();
    if trimmed.is_empty() {
        "chart".to_string()
    } else {
        trimmed
    }
}

/// Epoch milliseconds for the unique filename suffix (no time dependency
/// needed — the process clock is fine for collision-avoidance granularity).
fn epoch_millis() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

/// Writes the snapshot under `dir` (created if missing) and returns the
/// written path. Pure I/O logic, separated from the command for testability.
pub fn save_screenshot(dir: &Path, args: &ScreenshotSaveArgs) -> Result<PathBuf, String> {
    let bytes = decode_base64(&args.data_base64)?;
    if bytes.is_empty() {
        return Err("empty png payload".to_string());
    }
    if !bytes.starts_with(&PNG_MAGIC) {
        return Err("payload is not a PNG".to_string());
    }
    fs::create_dir_all(dir)
        .map_err(|e| format!("create {}: {e}", dir.display()))?;
    let stem = sanitize_stem(args.name.as_deref());
    let path = dir.join(format!("{stem}-{}.png", epoch_millis()));
    fs::write(&path, &bytes).map_err(|e| format!("write {}: {e}", path.display()))?;
    Ok(path)
}

/// Persist a chart PNG snapshot to `<data_dir>/screenshots/` (Alt+S, §5.4).
///
/// The UI sends the LWC `takeScreenshot` output as base64; this command
/// validates the PNG magic, sanitizes the suggested name, and writes the
/// file. Failures come back as a structured string error the UI toasts.
#[tauri::command]
pub fn screenshots_save(
    settings: tauri::State<Settings>,
    data: ScreenshotSaveArgs,
) -> Result<ScreenshotSaved, String> {
    let dir = settings.effective_data_dir().join("screenshots");
    let path = save_screenshot(&dir, &data)?;
    Ok(ScreenshotSaved {
        path: path.display().to_string(),
    })
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests {
    use super::*;

    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("pw-app-screenshots-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// A minimal valid-looking PNG: magic + a few payload bytes.
    fn fake_png() -> Vec<u8> {
        let mut v = PNG_MAGIC.to_vec();
        v.extend_from_slice(&[0, 1, 2, 3, 4, 5]);
        v
    }

    fn b64(bytes: &[u8]) -> String {
        // Encoder for the tests (standard alphabet, with padding).
        const A: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let mut out = String::new();
        for chunk in bytes.chunks(3) {
            let b0 = chunk[0] as u32;
            let b1 = *chunk.get(1).unwrap_or(&0) as u32;
            let b2 = *chunk.get(2).unwrap_or(&0) as u32;
            let n = (b0 << 16) | (b1 << 8) | b2;
            out.push(A[(n >> 18) as usize & 63] as char);
            out.push(A[(n >> 12) as usize & 63] as char);
            out.push(if chunk.len() > 1 { A[(n >> 6) as usize & 63] as char } else { '=' });
            out.push(if chunk.len() > 2 { A[n as usize & 63] as char } else { '=' });
        }
        out
    }

    #[test]
    fn decode_base64_roundtrips_known_vectors() {
        assert_eq!(decode_base64("aGVsbG8=").unwrap(), b"hello".to_vec());
        assert_eq!(decode_base64("aGVsbG8gd29ybGQ=").unwrap(), b"hello world".to_vec());
        assert_eq!(decode_base64("AQ==").unwrap(), vec![1]);
        assert_eq!(decode_base64("").unwrap(), Vec::<u8>::new());
        // whitespace is tolerated
        assert_eq!(decode_base64("aGVs\nbG8=").unwrap(), b"hello".to_vec());
        // encoder/decoder round-trip over random-ish bytes
        let bytes: Vec<u8> = (0..255u16).map(|i| (i * 7 + 3) as u8).collect();
        assert_eq!(decode_base64(&b64(&bytes)).unwrap(), bytes);
    }

    #[test]
    fn decode_base64_rejects_invalid_input() {
        assert!(decode_base64("aGVsbG8!").is_err());
        assert!(decode_base64("aGVsbG8~").is_err());
    }

    #[test]
    fn sanitize_stem_strips_path_dangerous_chars() {
        assert_eq!(sanitize_stem(Some("BTCUSDT 1d")), "BTCUSDT-1d");
        assert_eq!(sanitize_stem(Some("../../etc/passwd")), "etc-passwd");
        assert_eq!(sanitize_stem(Some("a/b\\c:d")), "a-b-c-d");
        assert_eq!(sanitize_stem(Some("")), "chart");
        assert_eq!(sanitize_stem(Some("   ")), "chart");
        assert_eq!(sanitize_stem(None), "chart");
        assert_eq!(sanitize_stem(Some("keep.dots_and-dashes123")), "keep.dots_and-dashes123");
    }

    #[test]
    fn save_screenshot_writes_png_under_dir() {
        let dir = temp_dir("write");
        let args = ScreenshotSaveArgs {
            name: Some("BTCUSDT 1d".to_string()),
            data_base64: b64(&fake_png()),
        };
        let path = save_screenshot(&dir, &args).unwrap();
        assert!(path.starts_with(&dir));
        assert!(path.file_name().unwrap().to_string_lossy().starts_with("BTCUSDT-1d-"));
        assert!(path.to_string_lossy().ends_with(".png"));
        let written = fs::read(&path).unwrap();
        assert_eq!(written, fake_png());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn save_screenshot_rejects_non_png_and_empty() {
        let dir = temp_dir("reject");
        let not_png = ScreenshotSaveArgs {
            name: Some("x".to_string()),
            data_base64: b64(b"plain text, not a png"),
        };
        assert!(save_screenshot(&dir, &not_png).is_err());
        let empty = ScreenshotSaveArgs {
            name: Some("x".to_string()),
            data_base64: String::new(),
        };
        assert!(save_screenshot(&dir, &empty).is_err());
        assert!(save_screenshot(&dir, &ScreenshotSaveArgs { name: None, data_base64: "!!!".into() }).is_err());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn screenshot_saved_wire_shape_is_camel_case() {
        let v: serde_json::Value = serde_json::to_value(ScreenshotSaved {
            path: "/tmp/x.png".to_string(),
        })
        .unwrap();
        assert_eq!(v, serde_json::json!({ "path": "/tmp/x.png" }));
        let v: serde_json::Value = serde_json::to_value(ScreenshotSaveArgs {
            name: Some("BTCUSDT 1d".to_string()),
            data_base64: "AAAA".to_string(),
        })
        .unwrap();
        assert_eq!(v, serde_json::json!({ "name": "BTCUSDT 1d", "dataBase64": "AAAA" }));
    }
}
