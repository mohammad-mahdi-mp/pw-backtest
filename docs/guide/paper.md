# Paper Trading

Paper trading runs the same broker engine as replay, but against **live prices** — no API
keys, no exchange account.

## How it works

1. Press **Paper** in the top bar (active pane's symbol & timeframe).
2. The backend refreshes candles from **Binance** (crypto) or **Yahoo Finance**
   (stocks & FX) and stores them in your local parquet — the same files the chart reads.
3. Every UI poll (throttled to ~4s) plus a 20-second background heartbeat feed newly
   **closed** candles into the session: pending limit/stop orders fill, SL/TP triggers fire,
   even with the browser tab closed.
4. **Market** orders fill at the live quote (the in-progress candle); equity marks live.

The floating **PAPER** pill shows equity, position and unrealized P&L. Desktop
notifications fire for fills and stop-outs while the tab is in the background (permission
is requested the first time you start a session).

## Semantics worth knowing

- Only **closed** candles trigger pending orders and SL/TP — no premature intra-bar exits.
- The in-progress candle is used for display and market fills only.
- One live session at a time: starting Replay stops Paper (and vice versa). Switching the
  active symbol stops the paper session.
- Stopped sessions are read-only — their trades and stats stay in the database.
- **Offline?** Paper degrades gracefully: the session keeps running on the last stored
  bars until connectivity returns.

## API

```
POST /api/paper/start    {"symbol": "BTC/USDT", "timeframe": "1h", "cash": 100000}
POST /api/paper/stop     {"id": 3}
GET  /api/paper/sessions
```

Orders, cancels, closes and SL/TP updates use the regular replay session endpoints.
