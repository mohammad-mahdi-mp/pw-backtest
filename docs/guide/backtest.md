# Strategy Backtesting

Backtesting runs a Pine `strategy()` over historical bars on the **same broker engine**
used by replay and paper trading — spread, slippage, commissions and margin all apply.

## Running a backtest

1. Write a strategy in the **Pine Editor** — declare it with `strategy()` and use
   `strategy.entry / close / exit`.
2. Press **Backtest** (or open the **Backtest** tab and press **Run Backtest**).

The strategy runs on the active pane's symbol & timeframe; capital and leverage are
configurable. Results are saved to the database — reopen them from the history (📜) menu.

## Execution model

- Signals are evaluated at **bar close**; orders queue and fill at the **next bar's open**
  with spread/slippage applied.
- Sizing: `default_qty_type = strategy.percent_of_equity` (notional % ÷ price) or
  `strategy.fixed`; a `qty=` keyword overrides per-call.
- **Pyramiding = 0**: same-direction entries are ignored while a position is open;
  opposite entries reverse it.
- `strategy.exit(stop=, limit=)` attaches/updates SL & TP every bar — trailing stops
  (e.g. `stop = close - 2*ta.atr(14)`) work naturally.
- `strategy.close / close_all` exit at the next open; `strategy.cancel_all` clears the
  queue and pending orders.

## Metrics dashboard

Net P&L, return %, max drawdown, Sharpe, Sortino, CAGR, win rate, profit factor,
expectancy, best/worst trade and consecutive W/L streaks — plus the **equity curve**,
**drawdown curve** and the full **trade list** with exit reasons (signal / stop / target).

## Monte Carlo

Press 🎲 after a backtest: the trade P&L sequence is bootstrap-resampled 2,000× to show
what different orderings of the same trades could have produced — median and 5–95th
percentile final equity, probability of ending below the starting capital, and median /
95th-percentile max drawdown, with a histogram of outcomes.

## API

```
POST /api/backtest/run   {"source": "...", "symbol": "BTC/USDT", "timeframe": "1h",
                          "cash": 100000, "leverage": 100}
GET  /api/backtest/runs
GET  /api/backtest/runs/{id}
```
