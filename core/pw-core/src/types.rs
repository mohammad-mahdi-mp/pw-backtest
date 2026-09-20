//! Core domain types — frozen contract `EXECUTION_PLAN.md` §1.1.
//!
//! JSON representation rules (contract §1.2): field names are the serde
//! defaults of these structs; enums serialize with serde's default external
//! tagging (`"Buy"`, `{"Gtd": 1700000000000}`). Fixtures are compared against
//! this exact shape with numeric tolerance `1e-9` relative.

use serde::{Deserialize, Serialize};

/// UTC timestamp in **milliseconds** since the Unix epoch.
pub type Timestamp = i64;

/// One OHLCV bar of a symbol at a specific timeframe.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Bar {
    /// Bar open time (ms, UTC) — the chart x coordinate.
    pub time: Timestamp,
    /// Open price.
    pub open: f64,
    /// High price.
    pub high: f64,
    /// Low price.
    pub low: f64,
    /// Close price.
    pub close: f64,
    /// Traded volume (`0.0` when the source does not provide it).
    pub volume: f64,
}

/// One trade print. `volume == 0.0` means the source did not report size.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Tick {
    /// Trade time (ms, UTC).
    pub time: Timestamp,
    /// Trade price.
    pub price: f64,
    /// Trade volume (`0.0` = unknown).
    pub volume: f64,
}

/// Direction of an order as placed by the user.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Side {
    /// Buy / go long.
    Buy,
    /// Sell / go short.
    Sell,
}

/// Net position direction after fills are applied.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Direction {
    /// Net long position.
    Long,
    /// Net short position.
    Short,
}

/// Executable order type.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum OrderType {
    /// Fill immediately at the next available price.
    Market,
    /// Resting order that fills at `price` or better.
    Limit,
    /// Triggers when the market trades through `price`, fills with slippage.
    Stop,
    /// Stop trigger that activates an attached limit order.
    StopLimit,
    /// Atomic entry with attached stop-loss and take-profit exits.
    Bracket,
}

/// How the engine clock resolves fills over bars or ticks.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum FillModel {
    /// Signal on bar `i` fills at the open of bar `i+1` (Pine-compatible).
    NextOpen,
    /// Fills resolve at the close of the signal bar.
    BarClose,
    /// Fills resolve intrabar on the tick stream (Phase 6).
    Tick,
}

/// Order lifetime constraint.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TimeInForce {
    /// Good till cancelled.
    Gtc,
    /// Good till `Timestamp` (ms, UTC), then auto-cancelled.
    Gtd(Timestamp),
    /// Fill and kill: immediate-or-cancel.
    FillAndKill,
}

/// Why a fill or position exit happened. Values are the stable wire names
/// shared with the Python reference (`order` resolves to the concrete order
/// kind that caused the fill).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum FillReason {
    /// Market order fill.
    Market,
    /// Limit order fill.
    Limit,
    /// Stop order fill.
    Stop,
    /// Stop-limit order fill (limit leg).
    StopLimit,
    /// Stop-loss exit.
    Sl,
    /// Take-profit exit.
    Tp,
    /// Strategy signal exit.
    Signal,
    /// Manual user action (ticket, chart line drag, kill switch).
    Manual,
    /// Trailing-stop ratchet exit.
    Trailing,
}

/// Trailing-stop specification attached to an order/position.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct TrailingSpec {
    /// What `value` measures.
    pub kind: TrailingKind,
    /// ATR periods (kind [`TrailingKind::Atr`]) or fraction of price
    /// (kind [`TrailingKind::Pct`]).
    pub value: f64,
}

/// Unit of a [`TrailingSpec::value`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TrailingKind {
    /// `value` = ATR lookback in bars.
    Atr,
    /// `value` = fraction of price (e.g. `0.01` = 1%).
    Pct,
}

/// A working or historical order (frozen contract §1.1).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Order {
    /// Monotonic engine-assigned id.
    pub id: u64,
    /// Symbol this order targets.
    pub symbol: String,
    /// Buy or sell.
    pub side: Side,
    /// Execution semantics.
    pub order_type: OrderType,
    /// Limit/stop trigger price (`None` for market).
    pub price: Option<f64>,
    /// Requested size in lots/units (positive).
    pub size: f64,
    /// Attached stop-loss exit price.
    pub stop_loss: Option<f64>,
    /// Attached take-profit exit price.
    pub take_profit: Option<f64>,
    /// Attached trailing-stop specification.
    pub trailing: Option<TrailingSpec>,
    /// Lifetime constraint.
    pub tif: TimeInForce,
    /// When true the order may only reduce an existing position.
    pub reduce_only: bool,
    /// Order creation time (ms, UTC).
    pub created_at: Timestamp,
    /// Free-form label; `"scratch"` marks what-if (replay scratchpad) orders.
    pub tag: Option<String>,
}

/// An executed fill reported by the broker.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Fill {
    /// Id of the order this fill belongs to.
    pub order_id: u64,
    /// Symbol filled.
    pub symbol: String,
    /// Buy or sell.
    pub side: Side,
    /// Executed price (after spread/slippage).
    pub price: f64,
    /// Executed size (positive).
    pub size: f64,
    /// Commission charged for this fill.
    pub fee: f64,
    /// Execution time (ms, UTC).
    pub time: Timestamp,
    /// What caused the fill.
    pub reason: FillReason,
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests;
