//! Virtual broker parity surface.
//!
//! **Stub (P0-T02):** returns empty output so the parity harness reports the
//! expected 50 failures. P3-T01 replaces this with the 1:1 port of the
//! Python `VirtualBroker` (`reference/backend/app/replay/engine.py`) — same
//! fill formulas, same trigger order, same event sequence.

use serde_json::Value;

use crate::events::EngineEvent;

/// Result of running one parity fixture through the engine.
pub struct FixtureOutput {
    /// Engine events in emission order (compared against the fixture's
    /// `expected.events` with `1e-9` relative tolerance).
    pub events: Vec<EngineEvent>,
}

/// Execute one fixture document (JSON written by `reference/parity_export.py`).
///
/// Stub behavior: parses nothing, emits nothing — every fixture therefore
/// fails parity, which is exactly the P0-T02 acceptance state.
pub fn run_parity_fixture(_fixture: &Value) -> FixtureOutput {
    FixtureOutput { events: Vec::new() }
}
