//! Parity harness — one generated `#[test]` per fixture in
//! `core/tests/fixtures/*.json` (index built by `build.rs`).
//!
//! Each test runs the fixture through the engine and compares the emitted
//! event JSON against `expected.events` (numeric tolerance `1e-9` relative).
//! While the broker is a stub, **every** test fails by design (P0-T02 gate:
//! exactly 50 expected failures; `scripts/check-engine-expected-failures.sh`).
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use pw_engine::broker::run_parity_fixture;

/// Run one fixture and panic with a structured diff on mismatch.
fn check_fixture(file: &str) {
    let manifest = env!("CARGO_MANIFEST_DIR");
    let path = std::path::Path::new(manifest)
        .join("..")
        .join("tests")
        .join("fixtures")
        .join(file);
    let raw = std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("fixture unreadable: {}: {e}", path.display()));
    let fixture: serde_json::Value = serde_json::from_str(&raw)
        .unwrap_or_else(|e| panic!("fixture unparsable: {file}: {e}"));

    let output = run_parity_fixture(&fixture);
    let actual =
        serde_json::to_value(&output.events).expect("engine events must serialize");

    let expected = &fixture["expected"]["events"];
    let mut diff = String::new();
    diff_at("", expected, &actual, &mut diff);
    if !diff.is_empty() {
        panic!("PARITY MISMATCH in {file}:\n{diff}");
    }
}

/// Recursive JSON comparison with `1e-9` relative numeric tolerance;
/// appends human-readable mismatches to `out`.
fn diff_at(path: &str, expected: &serde_json::Value, actual: &serde_json::Value, out: &mut String) {
    match (expected, actual) {
        (serde_json::Value::Number(e), serde_json::Value::Number(a)) => {
            let ev = e.as_f64().unwrap_or(f64::NAN);
            let av = a.as_f64().unwrap_or(f64::NAN);
            let tol = 1e-9 * ev.abs().max(av.abs()).max(1.0);
            if (ev - av).abs() > tol {
                out.push_str(&format!("  {path}: expected {ev}, got {av}\n"));
            }
        }
        (serde_json::Value::Array(e), serde_json::Value::Array(a)) => {
            if e.len() != a.len() {
                out.push_str(&format!(
                    "  {path}: event count expected {}, got {}\n",
                    e.len(),
                    a.len()
                ));
            }
            for (i, (x, y)) in e.iter().zip(a.iter()).enumerate() {
                diff_at(&format!("{path}[{i}]"), x, y, out);
            }
        }
        (serde_json::Value::Object(e), serde_json::Value::Object(a)) => {
            for (k, ev) in e {
                match a.get(k) {
                    Some(av) => diff_at(&format!("{path}.{k}"), ev, av, out),
                    None => out.push_str(&format!("  {path}.{k}: missing in actual\n")),
                }
            }
            for k in a.keys() {
                if !e.contains_key(k) {
                    out.push_str(&format!("  {path}.{k}: unexpected in actual\n"));
                }
            }
        }
        (e, a) => {
            if e != a {
                out.push_str(&format!("  {path}: expected {e}, got {a}\n"));
            }
        }
    }
}

include!(concat!(env!("OUT_DIR"), "/parity_tests.rs"));
