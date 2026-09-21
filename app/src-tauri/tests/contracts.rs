//! IPC round-trip contract tests (EXECUTION_PLAN.md §1.3).
//!
//! Each fixture in `core/tests/contracts/*.json` pins the exact wire bytes
//! of a command's payload. The test deserializes the fixture into the real
//! Rust type and re-serializes it — the result must be **byte-identical**.
//! `ui/src/lib/ipc.ts` mirrors these shapes; any drift fails here first.
//! (Test crate: panic/unwrap are the intended failure mode — allowed below.)

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use pw_app_lib::commands::{HelloInfo, ScreenshotSaveArgs};

const CONTRACTS_DIR: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../../core/tests/contracts");

#[test]
fn app_hello_fixture_roundtrips_byte_identical() {
    let path = format!("{CONTRACTS_DIR}/app_hello.json");
    let raw = std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("fixture unreadable: {path}: {e}"));
    let raw = raw.trim_end_matches(['\n', '\r']);

    let info: HelloInfo = serde_json::from_str(raw)
        .unwrap_or_else(|e| panic!("fixture unparsable as HelloInfo: {e}"));
    let wire = serde_json::to_string(&info).expect("serialize");

    assert_eq!(wire, raw, "HelloInfo wire format drifted from the contract fixture");
}

#[test]
fn app_hello_fixture_field_names_are_camel_case() {
    let path = format!("{CONTRACTS_DIR}/app_hello.json");
    let raw = std::fs::read_to_string(&path).expect("fixture readable");
    let value: serde_json::Value = serde_json::from_str(&raw).expect("fixture is JSON");
    let obj = value.as_object().expect("fixture is an object");
    for key in ["message", "version", "configDir", "configLoaded"] {
        assert!(obj.contains_key(key), "missing contract key `{key}`");
    }
}

#[test]
fn screenshots_save_fixture_roundtrips_byte_identical() {
    let path = format!("{CONTRACTS_DIR}/screenshots_save.json");
    let raw = std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("fixture unreadable: {path}: {e}"));
    let raw = raw.trim_end_matches(['\n', '\r']);

    let args: ScreenshotSaveArgs = serde_json::from_str(raw)
        .unwrap_or_else(|e| panic!("fixture unparsable as ScreenshotSaveArgs: {e}"));
    let wire = serde_json::to_string(&args).expect("serialize");

    assert_eq!(wire, raw, "ScreenshotSaveArgs wire format drifted from the contract fixture");
}

#[test]
fn screenshots_save_fixture_field_names_are_camel_case() {
    let path = format!("{CONTRACTS_DIR}/screenshots_save.json");
    let raw = std::fs::read_to_string(&path).expect("fixture readable");
    let value: serde_json::Value = serde_json::from_str(&raw).expect("fixture is JSON");
    let obj = value.as_object().expect("fixture is an object");
    for key in ["name", "dataBase64"] {
        assert!(obj.contains_key(key), "missing contract key `{key}`");
    }
}
