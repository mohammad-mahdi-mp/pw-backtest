//! pw-core — shared domain types for the pw-backtest native platform.
//!
//! The types in [`types`] are a **frozen contract** (EXECUTION_PLAN.md §1.1):
//! every other crate, the IPC layer, and the golden fixtures depend on their
//! exact shape and serde representation. Change only via a `contract:` task.

pub mod types;
