# REST API

Base URL: `http://localhost:8000`

## Health

```
GET /api/health
```

## Data

```
GET  /api/data/symbols
POST /api/data/symbols            {"name","provider",...}
GET  /api/data/bars?symbol=BTC/USDT&timeframe=1h&limit=2000
POST /api/data/backfill           {"symbol","timeframe","provider":"ccxt|yahoo","exchange":"binance"}
```

## Replay sessions (also used by paper sessions)

```
POST /api/replay/sessions                     create session
GET  /api/replay/sessions                     list
GET  /api/replay/sessions/{id}                full snapshot (positions, orders, trades, stats)
POST /api/replay/sessions/{id}/advance        {"bars": 1} — move cursor & simulate bars
POST /api/replay/sessions/{id}/orders         {"side","type":"market|limit|stop","size","price","stop_loss","take_profit"}
POST /api/replay/sessions/{id}/orders/{oid}/cancel
POST /api/replay/sessions/{id}/close          close position at market
POST /api/replay/sessions/{id}/position       {"stop_loss","take_profit"} — update SL/TP
POST /api/replay/sessions/{id}/trades/{tid}/note
```

## Paper trading

```
POST /api/paper/start     {"symbol","timeframe","cash","leverage"}
POST /api/paper/stop      {"id"}
GET  /api/paper/sessions
```

Paper sessions auto-advance when polled via `GET /api/replay/sessions/{id}` and via a
background heartbeat every 20s.

## Backtesting

```
POST /api/backtest/run       {"source","symbol","timeframe","cash","leverage","inputs"}
POST /api/backtest/optimize  {"source","symbol","timeframe","cash","leverage","grid","metric","mode","train_bars","test_bars"}
GET  /api/backtest/runs
GET  /api/backtest/runs/{id}
```

The run result contains `metrics`, `equity_curve`, `drawdown_curve`, `trades`
(with `reason`: signal | stop | target) and `open_position`.

`inputs` (optional) overrides the script's declared `input.*` defaults for the run,
e.g. `{"fast": 5, "slow": 50}` — values are persisted with the run. Each closed trade
also carries `mae` / `mfe`: the maximum adverse / favourable excursion while the
position was open, as a percentage of the entry price (`mae ≤ 0`, `mfe ≥ 0`).

### Optimizer — `POST /api/backtest/optimize`

Sweeps a grid of input values. `grid` maps an input name to the list of values to
test, `metric` is the ranking metric (`net_pnl`, `return_pct`, `sharpe`, `sortino`,
`profit_factor`, `trades`, `cagr_pct`) and `mode` is:

- **`grid`** — every combination is backtested over the full history (≤ 200 runs).
  Response: `{rows: [{params, net_pnl, return_pct, …}]}` sorted best-first plus
  `best`, ready to feed back into `/run` as `inputs`.
- **`walkforward`** — the grid is re-optimized on each `train_bars` window (default
  500) and the best combination trades the following `test_bars` window (default
  150) out-of-sample. The response contains per-`folds` detail (chosen params,
  train metric, test P&L), a stitched out-of-sample `oos_equity_curve`,
  `oos_trades` and a `summary` — an honest estimate of live performance.

## Screener

```
GET /api/screener/scan?timeframe=1h&limit=100
```

Rows: `symbol, last, chg_pct, rsi, above_sma20/50/200, vol_ratio, range_pos`.

## Pine

```
POST /api/pine/compile     {"source"} — IR + diagnostics
POST /api/pine/run         {"source","bars"} — evaluated plot series
```
