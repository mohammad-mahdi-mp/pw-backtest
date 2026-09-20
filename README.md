# pw-backtest

Personal replay & backtesting platform for Fedora 44 Workstation — an FXReply-style replay tool with TradingView-like charts and Pine Script support.

| Market      | Data sources                                 |
|-------------|----------------------------------------------|
| Forex       | OANDA, Interactive Brokers (TWS), Dukascopy  |
| Crypto      | Binance + 100+ exchanges via CCXT            |
| Stocks/ETF  | Yahoo Finance, Interactive Brokers           |

> See [`PLAN.md`](./PLAN.md) for the full roadmap and architecture.

## Status

| Phase | Component                       | Status         |
|-------|---------------------------------|----------------|
| 0     | Scaffolding (FastAPI + React)   | ✅ Done        |
| 1     | Data layer (CCXT/Yahoo/OANDA/IBKR, parquet storage) | ✅ Working (CCXT/Yahoo live; OANDA/IBKR need keys/TWS) |
| 2     | Charts (Lightweight Charts v4)  | ✅ Candlesticks + indicator overlays + synced sub-panes |
| 3     | Replay / manual trading engine  | ✅ **Done** — full VirtualBroker: market/limit/stop fills, SL/TP auto-triggers, netting/flip, commissions, margin, P&L & equity |
| 4     | Pine Script engine              | ✅ MVP: sma/ema/wma/rma/rsi/macd/bb/atr/stoch/highest/lowest, inputs, colors, inline plots |
| 5     | Automated backtest              | ⏳ Placeholder |
| 6     | Paper / live trading            | ⏳ Planned     |
| 7     | Polish (drawings, screener, …)  | ⏳ Planned     |

## Quick start (Fedora 44)

```bash
# 1. Install system deps + venv + frontend deps
./scripts/setup_fedora.sh

# 2. Run backend (http://127.0.0.1:8000) + frontend (http://127.0.0.1:5173)
./scripts/run_dev.sh
```

Then open http://127.0.0.1:5173.

## Dev quick start (any Linux, no root)

```bash
# Backend
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000

# Frontend (new terminal)
cd frontend
npm install -g pnpm   # if not installed
pnpm install
pnpm dev
```

## Current features you can try now

1. **Symbol / timeframe switcher** — type `BTC/USDT`, `ETH/USDT`, `EUR/USD`, `AAPL`, …
2. **Load Data** button — downloads historical candles from Binance (crypto) or Yahoo (stocks) into `data/market/.../*.parquet`. Offline? Run `python scripts/seed_sample_data.py` for demo data (BTC, ETH, EUR/USD).
3. **Interactive candlestick chart** — pan/zoom/crosshair with OHLC tooltip (TradingView Lightweight Charts).
4. **Pine editor at the bottom** — write an indicator and hit **Run** to plot overlays / sub-panes. Supported: `ta.sma/ema/wma/rma/rsi/macd/bb/atr/stoch/highest/lowest`, `input.*`, `color.*`, inline `plot(ta.sma(close, 20))`.
5. **Bar Replay (FXReply-style)** — press **Replay**: the future is hidden; step/play candle-by-candle
   (Space = play/pause, ←/→ = step, X = close position). Place market/limit/stop orders with
   SL/TP from the Trade tab — fills, stop-outs and take-profits are simulated bar-by-bar with
   spread, slippage and commissions. Entry/SL/TP lines, trade markers and P&L appear on the chart.
6. **Account tab** — equity, balance, win rate, profit factor and per-trade journal notes.

## Project layout

```
backend/        FastAPI app (API, data providers, Pine compiler/runtime, backtest engine)
frontend/       React + Vite + Tailwind + Lightweight Charts + Monaco (Pine editor)
data/           SQLite DB + parquet market data + screenshots
scripts/        setup_fedora.sh, run_dev.sh
docs/           (architecture notes)
PLAN.md         full roadmap & architecture
```

## Adding broker credentials

Edit `backend/.env` and add:

```
OANDA_API_KEY=...
OANDA_ACCOUNT_ID=...
OANDA_ENV=practice   # or 'live'

IBKR_HOST=127.0.0.1
IBKR_PORT=7497       # TWS paper port is usually 7497, live 7496
IBKR_CLIENT_ID=1
```

For IBKR you need to run TWS or IB Gateway locally with API access enabled and "Allow connections from localhost only" checked.
