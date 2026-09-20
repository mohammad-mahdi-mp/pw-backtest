# Getting Started

pw-backtest is a single-user, local-first platform: a FastAPI backend, a React frontend,
parquet market data and a SQLite database. Everything runs on your machine.

## Install (Fedora / Linux)

```bash
# system deps
sudo dnf install -y python3.12 python3-pip nodejs npm pnpm sqlite

# backend
cd backend
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp -n .env.example .env

# frontend
cd ../frontend
pnpm install

# demo data (BTC, ETH, EUR/USD — 1500 hourly bars)
cd ../backend
python ../scripts/seed_sample_data.py
```

Or run `./scripts/setup_fedora.sh` once and start everything with `./scripts/run_dev.sh`.

## Run

```bash
# terminal 1 — backend on :8000
cd backend && source .venv/bin/activate
uvicorn app.main:app --reload --port 8000

# terminal 2 — frontend on :5173
cd frontend && pnpm dev
```

Open `http://localhost:5173` in your browser.

## First steps

1. **Load Data** (top bar) downloads history from Binance (crypto, e.g. `BTC/USDT`) or
   Yahoo (stocks like `AAPL`, FX like `EUR/USD` — no keys required).
2. Press **Replay** to hide the future and trade candle-by-candle, or **Paper** to trade
   against live prices.
3. Write an indicator or a `strategy()` in the **Pine Editor**, press **Run** / **Backtest**.
4. Explore the **Screener** (local scan of every stored symbol) and the 🎲 **Monte Carlo**
   view in the Backtest tab.

## Where your data lives

| Path | Contents |
| --- | --- |
| `data/market/<provider>/<SYMBOL>/<tf>/data.parquet` | OHLCV bars |
| `data/app.db` | sessions, orders, trades, backtest runs |
| browser localStorage | drawings, layout, shortcuts, watchlist state |
