# Strategy Backtesting

Backtesting runs a Pine `strategy()` over historical bars on the **same broker engine**
used by replay and paper trading — spread, slippage, commissions and margin all apply.

## Running a backtest

1. Write a strategy in the **Pine Editor** — declare it with `strategy()` and use
   `strategy.entry / close / exit`.
2. Press **Backtest** (or open the **Backtest** tab and press **Run Backtest**).

The strategy runs on the active pane's symbol & timeframe; capital and leverage are
configurable. Results are saved to the database — reopen them from the history (📜) menu.

Declare tunable parameters with `input.int()` / `input.float()` — they can be overridden
per run and are the knobs the optimizer sweeps:

```pine
fast = input.int(10, "Fast")
slow = input.int(30, "Slow")
```

## Python strategies

Scripts defining `class Strategy` with `on_bar(self, ctx)` run on the same
broker engine in plain Python — see the [Pine reference](/guide/pine#python-strategies)
for the API. The editor's Templates menu has a ready sample.

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

Each closed trade also shows its **MAE** (max adverse excursion — how far the price
moved against the entry while the position was open) and **MFE** (max favourable
excursion), both as a percentage of the entry price. A stop that fires near the MFE
means you gave back almost the whole move; an MFE well above the final P&L hints at
an exit that leaves money on the table.

## Monthly heatmap & export

Press **Monthly** to view returns per calendar month — green/red intensity per month
plus per-year totals. **CSV** exports the trade list (including MAE/MFE columns) and
**JSON** the full result (metrics, curves, trades) for further analysis.

## Optimizer (⚙)

Press the ⚙ button next to *Run Backtest* to open the **Strategy Optimizer**. It
compiles the script, detects its declared inputs, and builds a sweep grid:

- **Grid Sweep** — every combination of input values is backtested over the full
  history (≤ 200 runs); results are ranked by your chosen metric, sortable by any
  column, and clicking a row applies those inputs and re-runs the backtest.
- **Walk-Forward** — each fold re-fits the best combination on a *train* window
  (default 500 bars) and trades it **out-of-sample** on the following *test* window
  (default 150 bars). The stitched OOS equity curve, trade list and summary show
  whether the edge survives re-fitting — the honest estimate of live performance,
  where grid results are the optimistic one.

## Monte Carlo

Press 🎲 after a backtest: the trade P&L sequence is bootstrap-resampled 2,000× to show
what different orderings of the same trades could have produced — median and 5–95th
percentile final equity, probability of ending below the starting capital, and median /
95th-percentile max drawdown, with a histogram of outcomes.

## API

```
POST /api/backtest/run       {"source": "...", "symbol": "BTC/USDT", "timeframe": "1h",
                              "cash": 100000, "leverage": 100, "inputs": {"fast": 5}}
POST /api/backtest/optimize  {"source": "...", "symbol": "BTC/USDT", "timeframe": "1h",
                              "grid": {"fast": [5, 10], "slow": [20, 30]},
                              "metric": "net_pnl", "mode": "grid" | "walkforward",
                              "train_bars": 500, "test_bars": 150}
GET  /api/backtest/runs
GET  /api/backtest/runs/{id}
```

See the [API reference](/api/) for the full optimize response shape.
