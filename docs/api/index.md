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
POST /api/backtest/run     {"source","symbol","timeframe","cash","leverage"}
GET  /api/backtest/runs
GET  /api/backtest/runs/{id}
```

The run result contains `metrics`, `equity_curve`, `drawdown_curve`, `trades`
(with `reason`: signal | stop | target) and `open_position`.

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
