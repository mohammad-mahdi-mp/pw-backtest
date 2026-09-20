//! pw-engine — the event-driven broker, replay and backtest engine.
//!
//! Parity law: the Python reference (`reference/backend`, exported by
//! `reference/parity_export.py`) is the golden spec. Every broker behavior
//! change must go through the fixture pipeline, never by editing fixture
//! JSON by hand.

pub mod broker;
pub mod events;
