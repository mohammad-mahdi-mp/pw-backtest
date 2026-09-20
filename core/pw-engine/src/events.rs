//! Engine events — frozen contract `EXECUTION_PLAN.md` §1.2.
//!
//! Variant and field names are the serde wire names; the Python reference
//! fixtures (`core/tests/fixtures/*.json`) are written in exactly this shape.
//! Numeric comparison tolerance is `1e-9` relative.

use serde::{Deserialize, Serialize};

use pw_core::types::{Direction, Fill, FillReason, Order, Timestamp};

/// Everything that happens inside a replay/backtest run, in causal order.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum EngineEvent {
    /// An order (queued, pending, or exit) executed at a price.
    OrderFilled(Fill),
    /// A new net position came into existence.
    PositionOpened {
        /// Symbol of the new position.
        symbol: String,
        /// Net direction.
        side: Direction,
        /// Position size (lots/units).
        size: f64,
        /// Average entry price (the fill price for a fresh position).
        entry_price: f64,
        /// Entry time (ms, UTC).
        entry_time: Timestamp,
        /// Attached stop-loss, if any.
        stop_loss: Option<f64>,
        /// Attached take-profit, if any.
        take_profit: Option<f64>,
        /// Commission charged for the opening fill.
        commission: f64,
    },
    /// A same-direction fill enlarged the existing position.
    PositionIncreased {
        /// Symbol of the position.
        symbol: String,
        /// New total size.
        size: f64,
        /// New weighted-average entry price.
        avg_price: f64,
        /// Size added by this fill.
        added: f64,
        /// Fill time (ms, UTC).
        time: Timestamp,
        /// Commission charged for the added fill.
        commission: f64,
    },
    /// An opposite-direction fill closed part of the position.
    PositionReduced {
        /// Symbol of the position.
        symbol: String,
        /// Direction of the (still open) position.
        side: Direction,
        /// Average entry price.
        entry_price: f64,
        /// Entry time (ms, UTC).
        entry_time: Timestamp,
        /// Exit price of the closed chunk.
        exit_price: f64,
        /// Exit time (ms, UTC).
        exit_time: Timestamp,
        /// Size closed by this fill.
        closed_size: f64,
        /// Size still open after this fill.
        remaining_size: f64,
        /// Net P&L of the closed chunk (gross − commissions).
        pnl: f64,
        /// Commissions charged for the chunk (exit + prorated entry).
        commission: f64,
        /// What caused the reduction.
        reason: FillReason,
    },
    /// An opposite-direction fill closed the entire position.
    PositionClosed {
        /// Symbol of the closed position.
        symbol: String,
        /// Direction the position had.
        side: Direction,
        /// Closed size.
        size: f64,
        /// Average entry price.
        entry_price: f64,
        /// Entry time (ms, UTC).
        entry_time: Timestamp,
        /// Exit price.
        exit_price: f64,
        /// Exit time (ms, UTC).
        exit_time: Timestamp,
        /// Net P&L (gross − commissions).
        pnl: f64,
        /// Commissions charged (exit + prorated entry).
        commission: f64,
        /// What caused the close.
        reason: FillReason,
    },
    /// A pending order was placed and is now working.
    PendingPlaced(Order),
    /// A working pending order was cancelled before filling.
    PendingCancelled {
        /// Id of the cancelled order.
        order_id: u64,
        /// Cancellation time (ms, UTC).
        time: Timestamp,
        /// Stable machine-readable cancellation reason.
        reason: String,
    },
    /// End-of-bar mark-to-market snapshot.
    MarkedToMarket {
        /// Symbol being marked.
        symbol: String,
        /// Bar time (ms, UTC).
        time: Timestamp,
        /// Mark price (the bar close).
        price: f64,
        /// Account equity at the mark.
        equity: f64,
    },
    /// The risk manager blocked an order before it could work.
    RiskBlocked {
        /// Id of the blocked order.
        order_id: u64,
        /// Stable rule key that fired.
        rule: String,
        /// Human-readable explanation.
        message: String,
    },
    /// A strategy emitted a signal (informational; no fill implied).
    Signal {
        /// Symbol the signal refers to.
        symbol: String,
        /// Signal time (ms, UTC).
        time: Timestamp,
        /// Signal kind (stable key, e.g. `"ma_cross_up"`).
        kind: String,
    },
}
