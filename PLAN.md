# pw-backtest — Full Platform Plan

> Personal backtesting & replay trading platform, inspired by FXReply, built like TradingView.
> Target OS: Fedora 44 Workstation (self-hosted, single-user).
> Language: English UI. Markets: Forex + Crypto + Stocks.

---

## 1. Vision & Core Features

### 1.1 Must-Have (MVP)
1. **Interactive Replay Mode (FXReply-style)**
   - Step candle-by-candle, fast-forward, jump to any date/time
   - Virtual trading during replay (market / pending / stop / limit orders)
   - Position sizing, leverage, commission/slippage simulation
   - Trading journal: notes, screenshots, tags per trade
2. **TradingView-like charts**
   - Multiple timeframes (1s → 1M)
   - Candlesticks / bars / line / Heikin-Ashi / Renko / Kagi
   - Zoom / pan / crosshair / time-sync across panes
   - Drawing tools: trendline, horizontal/vertical ray, rectangle, fib, text, pitchfork, channels
3. **Pine Script engine**
   - Write indicators & strategies in Pine Script (target v5 compat subset)
   - Hot-reload scripts, overlay on main chart or separate pane
   - Backtest strategies with auto-trades + equity curve + P&L metrics
4. **Data ingestion**
   - **OANDA REST v20 API** (forex real-time + historical)
   - **Interactive Brokers (IBKR / TWS Gateway)** via `ib_insync` (stocks, futures, forex)
   - **CCXT** (crypto: Binance, Kucoin, OKX, Bybit …)
   - **Yahoo Finance** (`yfinance`) free EOD stocks/ETFs
   - **Dukascopy** tick-level forex (via `dukascopy-node` or Python downloader)
   - CSV import (MT4/MT5, TradingView export)
5. **Backtesting engine (non-Pine path too)**
   - Event-driven engine (tick/bar resolution)
   - Customizable commissions, spread, slippage models
   - Portfolio simulation (multi-symbol, multi-strategy)
   - Metrics: CAGR, Sharpe/Sortino, MaxDD, Win %, Profit Factor, MAE/MFE, Expectancy
6. **Paper / Live trading**
   - Paper trading mode (real-time feed, virtual account)
   - Live execution through OANDA / IBKR (later phase)

### 1.2 Nice-to-Have (v2)
- Strategy optimization (walk-forward, grid search)
- Monte Carlo analysis
- Screener (custom scans across many symbols)
- Alerts (desktop + email/Telegram)
- Community scripts store (local folder sharing)
- AI-assisted analysis (optional later)
- Multi-monitor layout saving
- Playback speed ×0.1 → ×1000

---

## 2. Tech Stack

```
┌──────────────────────────────────────────────────────────────────┐
│                        Frontend (Web UI)                        │
│  React 18 + TypeScript + Vite + TailwindCSS + shadcn/ui         │
│  TradingView Lightweight Charts v4  (free, core candlesticks)   │
│  Custom overlay canvas for drawing tools                        │
│  Monaco Editor for Pine Script (code editor w/ autocomplete)    │
│  Zustand for state  ·  TanStack Query for data fetching         │
│  Recharts / lightweight-charts analytics panes                  │
└────────────────────────────┬─────────────────────────────────────┘
                             │  WebSocket (realtime) + HTTP/REST
┌────────────────────────────▼─────────────────────────────────────┐
│                         Backend (Python)                        │
│  FastAPI  +  Uvicorn  +  asyncio                                │
│  ┌──────────────┬──────────────┬──────────────┬────────────────┐ │
│  │ Data Layer   │ Replay       │ Backtest     │ Pine Engine    │ │
│  │ ib_insync    │ Engine       │ Engine       │ (see §4)       │ │
│  │ oandapyV20   │              │ (event-      │                │ │
│  │ ccxt         │              │  driven)     │                │ │
│  │ yfinance     │              │              │                │ │
│  └──────┬───────┴──────┬───────┴──────┬───────┴────────┬───────┘ │
└─────────┼──────────────┼──────────────┼────────────────┼─────────┘
          │              │              │                │
┌─────────▼──────────────▼──────────────▼────────────────▼─────────┐
│                       Storage                                    │
│  SQLite (default, zero-config)  /  PostgreSQL (optional later)   │
│  SQLAlchemy 2.x ORM + Alembic migrations                         │
│  Timescale storage: Parquet files per symbol/timeframe            │
│   (fast bulk reads for backtesting)                              │
└──────────────────────────────────────────────────────────────────┘

Deployment on Fedora 44:
  - Podman pods OR systemd services (no Docker dependency)
  - Python 3.12 virtualenv + npm/pnpm for frontend
  - Localhost only (127.0.0.1:8000) by default
```

### Why this stack?
- **FastAPI**: async native, great websockets, Python has the best quant/data ecosystem.
- **Lightweight Charts (TradingView OSS)**: same rendering core as TradingView, no license fee for personal use, fast, React bindings available.
- **Monaco editor**: VSCode's engine → syntax highlighting, autocompletion, errors for Pine.
- **SQLite + Parquet**: zero-install, perfect for personal use, no server needed. Parquet is columnar, fast for time-series scans.
- **React/TS/Vite**: modern, hot reload, huge ecosystem of charting/components.

---

## 3. Project Structure (monorepo)

```
pw-backtest/
├── backend/
│   ├── app/
│   │   ├── main.py                # FastAPI entrypoint
│   │   ├── api/                   # REST + WS routes
│   │   │   ├── data.py
│   │   │   ├── replay.py
│   │   │   ├── backtest.py
│   │   │   ├── pine.py
│   │   │   └── auth.py            # (simple token for local)
│   │   ├── core/
│   │   │   ├── config.py
│   │   │   └── events.py          # event bus
│   │   ├── data/
│   │   │   ├── providers/         # oanda, ibkr, ccxt, yfinance, dukascopy
│   │   │   ├── storage.py         # sqlite + parquet
│   │   │   └── downloader.py      # bulk/backfill jobs
│   │   ├── replay/
│   │   │   └── engine.py          # replay state machine + virtual broker
│   │   ├── backtest/
│   │   │   ├── engine.py          # event-driven engine
│   │   │   ├── broker.py
│   │   │   ├── metrics.py
│   │   │   └── optimizer.py
│   │   ├── pine/
│   │   │   ├── parser.py          # AST
│   │   │   ├── compiler.py        # AST → Python
│   │   │   ├── runtime.py         # execution (series/bars)
│   │   │   └── stdlib/            # ta.*, math.*, strategy.* built-ins
│   │   ├── models/                # SQLAlchemy models
│   │   │   ├── user.py
│   │   │   ├── symbol.py
│   │   │   ├── trade.py
│   │   │   ├── order.py
│   │   │   └── script.py
│   │   └── scripts/               # Pine scripts storage (on disk)
│   ├── tests/
│   ├── pyproject.toml
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── app/                   # App shell, router
│   │   ├── components/
│   │   │   ├── charts/            # LightweightCharts wrapper, drawing tools
│   │   │   ├── replay/            # playback controls, order ticket
│   │   │   ├── pine-editor/       # Monaco editor, script manager
│   │   │   ├── backtest/          # results, equity curve, trade list
│   │   │   ├── watchlist/
│   │   │   └── ui/                # shadcn components
│   │   ├── hooks/                 # useChart, useReplay, usePine, useFeed …
│   │   ├── stores/                # zustand
│   │   ├── lib/                   # api client, formatters
│   │   └── types/
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
├── data/
│   ├── db.sqlite3                 # local database (sqlite)
│   └── market/                    # parquet files, symbol/timeframe/
├── scripts/                       # dev helpers
│   ├── setup_fedora.sh            # install deps on Fedora 44
│   ├── run_dev.sh                 # start backend+frontend
│   └── seed_sample_data.py
├── docs/
│   ├── architecture.md
│   ├── pine_compat.md             # which Pine v5 features we support
│   └── datasources.md
├── PLAN.md                        # this file
└── README.md
```

---

## 4. Pine Script Engine — Strategy

Pine Script is large; we target a **highly compatible Pine v5 subset** that covers 90% of indicators/strategies people actually use.

### Approach
**Compile Pine → Python AST → execute with a numpy/pandas/ta-lib runtime.**

Why not embed a JS engine? Because:
- Backtesting happens server-side in Python (fast vectorized operations with numpy/pandas).
- We can run the same code for replay and backtest.
- Gives us full access to ta-lib (150+ indicators) and custom Python.

### Phases
1. **Lexer + Parser** (ANTTLR v4 grammar or hand-written Pratt parser for simplicity)
   - Produce AST for: `var`, `if/else`, `for`, `//@version`, `indicator()`, `strategy()`, `plot()`, `ta.*`, `math.*`, `str.*`, `input.*`
2. **Type system** (simple / series / int / float / bool / color / string)
3. **Runtime**
   - Each Pine script runs bar-by-bar OR vectorized (fall back to bar-by-bar when `var`, `varip`, or mutable state is used)
   - Built-in libraries:
     - `ta.*`: sma, ema, rsi, macd, bollinger, atr, stoch, cci, wma, vwap, supertrend, … via `ta-lib` + custom
     - `strategy.*`: `strategy.entry/exit/close`, `strategy.position_size`, `strategy.netprofit`
     - `math.*`, `ta.valuewhen`, `ta.barstate.*`, `ta.crossover/under`, `ta.highest/lowest`
4. **Bridge to chart**: script returns series (lines/histograms/fills) → JSON → lightweight-charts.addSeries
5. **Backtest bridge**: `strategy.*` calls produce orders in our event-driven backtester.

### Fallback
For scripts we can't compile (advanced Pine), we'll provide **Python strategy API** (`class MyStrategy(Strategy): def on_bar(self, bar): ...`) that works everywhere — you can always drop to Python.

---

## 5. Backtesting Engine Design

Event-driven, bar/tick level.

```
Event types:
  Tick   (price update at micro-resolution)
  Bar    (new closed bar)
  Order  (submit, fill, cancel)
  Signal (from strategy)
  Timer  (scheduled)

Loop:
  for event in timeline:
      broker.process(event)      # fills SL/TP/limit orders
      strategy.on_event(event)   # user / Pine logic
      broker.execute_pending()
      recorder.record()          # P&L, equity, trades
```

Models (DB):
- `Symbol` (name, exchange, type, pip_value, tick_size, fees)
- `DataFeed` (source config: oanda account id, ibkr host:port, etc.)
- `BacktestRun` (script id, params, symbol, timeframe, range, metrics json)
- `Trade`, `Order`, `Position`
- `ReplaySession` (date cursor, virtual cash, open trades, speed)
- `PineScript` (name, source, version, compiled_cache)
- `JournalEntry` (trade notes + screenshots during replay)

---

## 6. Data Pipeline

| Source    | Method                          | Markets          | Granularity |
|-----------|---------------------------------|------------------|-------------|
| OANDA     | REST v20 + streaming            | Forex, CFDs      | tick → 1D   |
| IBKR      | TWS API via `ib_insync`         | Stocks, Futures, Options, Forex | tick → 1D |
| CCXT      | REST + WS                       | 100+ crypto ex.  | 1m → 1D (WS tick) |
| Yahoo     | yfinance                        | Stocks/ETFs EOD  | 1m (intraday) / 1D |
| Dukascopy | JForex data downloader          | Forex tick       | tick → 1D   |
| CSV       | user upload                     | any              | any         |

Data storage:
- **Parquet**, partitioned: `data/market/{provider}/{symbol}/{timeframe}/{year}.parquet`
- Each row: `timestamp, open, high, low, close, volume`
- Append-only. Index on timestamp.
- For replay: load window into memory as we go, lazy fetch next chunks.
- Symbol registry in SQLite with metadata (pip, contract size, trading hours).

---

## 7. UI Layout (sketch)

```
┌─────────────────────────────────────────────────────────────────┐
│  ⚙ pw-backtest     Symbols ▾   Timeframe ▾   [Replay|Backtest|Live]  Account │
├──────────┬───────────────────────────────────────────┬──────────┤
│ Watchlist│                                           │ Positions│
│ EUR/USD  │            CANDLESTICK CHART              │ Orders   │
│ GBP/JPY  │      (multi-pane, indicators, drawings)   │ Journal  │
│ BTC/USDT │                                           │ Trades   │
│ AAPL     │                                           │          │
│ SPX500   ├───────────────────────────────────────────┤          │
│          │ Indicator sub-pane (RSI)                  │          │
├──────────┼───────────────────────────────────────────┼──────────┤
│ Scripts  │  ◀ ▶ ⏸ ⏩ ⏭  2024-03-15 09:30 UTC  ×1      │  Metrics │
│ (Pine)   │  Buy  Sell  Pending  SL/TP   Journal +📷  │ Equity   │
└──────────┴───────────────────────────────────────────┴──────────┘
```

Screens:
1. **Chart/Replay** (default)
2. **Strategy Editor** (Monaco Pine editor + backtest runner + results)
3. **Backtest Results** (deep analysis: equity, drawdown, per-trade stats, heatmap)
4. **Data Manager** (download backfills, connect brokers, import CSV)
5. **Settings** (themes, keyboard shortcuts, broker accounts)

Keyboard shortcuts (TradingView-like):
- Space = play/pause replay
- Ctrl+Z/Y undo/redo drawing
- +/- change TF, arrows pan, wheel zoom, F11 fullscreen
- B buy, S sell, X close position, T new trendline

---

## 8. Development Phases

### Phase 0 — Setup (0.5 day)
- [x] Monorepo scaffolding (backend FastAPI, frontend Vite/React/TS/Tailwind/shadcn)
- [x] Fedora 44 setup script (`scripts/setup_fedora.sh`)
- [x] SQLite + SQLAlchemy (async) — models auto-create on startup
- [x] Dev server scripts (`scripts/run_dev.sh`)

### Phase 1 — Data Layer (1–2 days)
- [x] SQLite models + Parquet storage (`app/data/storage.py`)
- [x] CCXT provider (Binance + any exchange) — OHLCV download w/ pagination
- [x] Yahoo provider (stocks)
- [x] OANDA provider (needs API key in `backend/.env`)
- [x] IBKR provider via `ib_insync` (needs local TWS/Gateway)
- [ ] CSV import
- [ ] Backfill job UI: date range picker (basic "Load Data" button works)
- [ ] Streaming WS (real-time)

### Phase 2 — Chart (2–3 days)
- [x] LightweightCharts React wrapper
- [x] Symbol switch + timeframe switch
- [x] Crosshair OHLC tooltip, pan, zoom
- [x] Indicator overlay (lines on main chart)
- [x] Sub-panes (RSI etc.) with synced time scale
- [x] Theme: TradingView dark default
- [x] Load historical bars from backend via HTTP (vite proxy)
- [x] Drawing tools (trendline, horizontal line, ray, rectangle, fib retracement) —
      delivered in Phase 7 polish (see drawings row below), DrawLayer + DrawingToolbar

### Phase 3 — Replay / Manual Trading (3–4 days)
- [x] Replay session API (create/list/get/advance) + DB model
- [x] UI: playback controls, order ticket, positions panel
- [x] Market order placement w/ SL/TP recorded
- [x] **Bar-by-bar broker simulation** — VirtualBroker engine: instant market fills
      (spread+slippage), pending limit/stop triggers (incl. gap opens), SL/TP auto-triggers
      (SL-first conservative, gap-aware), netting position model (add / reduce / flip),
      weighted-average entries, margin checks, per-market commissions
      (forex $/lot, crypto %, stocks none) — 11 unit tests
- [x] Chart shows only bars up to replay cursor (hiding the future)
- [x] Play mode with speed ×0.5–×50 + Space/←/→/X hotkeys
- [x] Visualize orders & positions on chart (entry/SL/TP price lines, pending order lines,
      entry arrows + exit markers with P&L, live position badge in replay bar)
- [x] Journal: per-trade notes (persisted)
- [x] Trade statistics (win rate, avg win/loss, profit factor, equity) + Account tab
- [x] Session snapshot across requests (state fully DB-backed, processed_time guard
      prevents double-processing when stepping back & forth)

### Phase 4 — Pine Script Engine (BIG — 5–8 days, incremental)
- [x] MVP compiler: `//@version`, `indicator()`, `plot()`, `input.*`, assignments, `ta.*` calls, colors
- [x] Runtime on pandas/numpy: sma, ema, wma, rma, rsi, macd, bb, atr, stoch, highest, lowest
- [x] Inline plots `plot(ta.sma(close, 20))` + multi-output (macd/bb → 3 lines each)
- [x] Monaco editor w/ Pine syntax highlighting + compile diagnostics
- [x] **Full expression parser**: arithmetic, comparisons, and/or/not, ternary, parenthesized
      expressions, `ta.crossover/crossunder`, `math.*`, `ta.vwap/change/stdev`
- [x] **`strategy.*` builtins wired to the VirtualBroker**: `strategy.entry/close/close_all/
      exit(stop=, limit=)/cancel_all`, if-blocks with indented bodies, next-bar-open fills,
      pyramiding=0, percent-of-equity & fixed sizing, `initial_capital` /
      `default_qty_type` / `default_qty_value` params
- [x] Indicator UI: built-in library dialog + removable legend chips
- [ ] `if/else`, `for`, `var` control flow in indicator context (strategy bodies done)
- [ ] Python strategy API for edge cases

### Phase 5 — Automated Backtest (2–3 days)
- [x] Backtest runner UI (Backtest bottom-panel: script from Pine Editor or sample template,
      symbol/TF from chart, capital + leverage inputs → run)
- [x] Equity curve, drawdown charts (lightweight-charts area series)
- [x] Trade list with entry/exit, exit reason (signal/stop/target), P&L
- [x] Metrics dashboard (Sharpe, Sortino, CAGR, MaxDD, Profit Factor, Expectancy, win rate,
      streaks — `app/backtest/metrics.py`)
- [x] Save backtest runs to DB (`backtest_runs`), history dropdown, reload past runs
- [x] Strategy execution engine (`app/pine/strategy.py`): vectorized signal precompute +
      bar-by-bar VirtualBroker loop; next-bar-open fills; percent-of-equity/fixed sizing;
      pyramiding=0; strategy.exit stop/limit (trailing updates each bar)
- [x] Monthly returns heatmap, MAE/MFE per trade (heatmap modal from equity curve; per-trade
      `mae`/`mfe` excursions vs entry price in `strategy.py` + trades table columns)
- [x] Walk-forward / simple optimization (grid params) — `POST /api/backtest/optimize`
      (grid sweep ≤200 combos, ranked & sortable; walk-forward folds with stitched OOS equity),
      OptimizeDialog with per-input from/step/to range builder, click-to-apply params
- [x] Export results to CSV/JSON (trades CSV incl. MAE/MFE columns; full result JSON)

### Phase 6 — Paper Trading & Live (2 days later)
- [x] Paper account with live prices — sessions auto-refresh data from Binance (crypto) /
      Yahoo (stocks & FX) every poll (throttled) and a background heartbeat keeps them
      advancing with the UI closed; offline falls back gracefully to stored bars
      (`app/paper/feed.py`, `app/api/paper.py`, `advance_paper_session` in replay API)
- [x] Paper sessions reuse the whole replay trading stack: market/limit/stop orders, SL/TP
      auto-triggers, netting/flip, commissions — market fills execute at the live price
      (last quote incl. the in-progress candle), pending orders & SL/TP evaluate on closed bars only
- [x] UI: **Paper** button (top bar) + live PAPER pill (equity, position, unrealized P&L),
      chart follows the live edge (auto-scroll), toasts for server-side fills/stop-outs
- [x] `POST /api/paper/start|stop`, `GET /api/paper/sessions`; stopped sessions refuse orders
- [x] Desktop notifications — browser Notification API on paper fills/stop-outs while the
      tab is hidden (permission requested on first Paper start)
- [ ] Real-time WebSocket feed per symbol (polling for now — 1.5s UI / 20s background)
- [ ] OANDA live execution (orders routed) — needs API key
- [ ] IBKR live execution — needs TWS gateway

### Phase 7 — Polish (ongoing)
- [x] **Chart drawings**: trend line, ray, horizontal line, rectangle, Fibonacci retracement —
      canvas overlay synced to the chart's time/price scale (works while panning/zooming,
      extrapolates beyond data edges), magnet mode (snap to OHLC), select (click) /
      delete (Del) / clear all, hide toggle, persisted per symbol+timeframe in localStorage
      (`DrawLayer.tsx`, `stores/draw.ts`, left toolbar wired for real)
- [x] **Screener**: scans all symbols with local data — last, 24h change %, RSI(14),
      price vs SMA20/50/200, volume ×avg20, 200-bar range position; sortable table,
      click a row to switch chart (`GET /api/screener/scan`, `ScreenerDialog.tsx`)
- [x] **Monte Carlo**: bootstrap-resample the backtest's trade P&L ×2000 — median/percentile
      final equity, P(end < initial), median & p95 max DD, final-equity histogram
      (`MonteCarlo.tsx`, dice button in Backtest panel)
- [x] **Layout saving (minimal)**: symbol, timeframe, chart type, volume toggle, active
      indicators, bottom tab/panel persist across reloads (zustand persist; live session
      state is never persisted)
- [x] **Multi-chart workspaces**: 1 / 2 side-by-side / 2 stacked / 4 chart layouts — each
      pane has its own symbol, timeframe, chart type & indicators; the active pane (blue
      ring) is what the top bar, symbol search, screener and Pine editor target; panes are
      focusable by click or Alt+←/→; whole layout persisted (`stores/layout.ts`,
      `ChartPane.tsx` extracted from App)
- [x] **Keyboard shortcut editor**: rebindable bindings (replay play/step, close position,
      pane focus, panel toggles) with record-and-save UI + reset to defaults
      (`stores/shortcuts.ts`, `ShortcutsDialog.tsx`)
- [x] **Documentation site (VitePress)**: `docs/` — getting started, charts & drawings,
      replay, paper, backtesting, Pine reference and REST API reference
      (`pnpm docs:dev` / `docs:build`)

---

## 9. Fedora 44 Installation Outline

```bash
# System deps
sudo dnf install -y python3.12 python3-pip python3-virtualenv \
    nodejs npm pnpm \
    ta-lib ta-lib-devel \
    gcc gcc-c++ cmake \
    rust cargo \
    sqlite3 \
    podman podman-compose  # optional

# Backend
cd backend
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000

# Frontend (in another terminal)
cd frontend
pnpm install
pnpm dev --port 5173

# Optional: IBKR TWS Gateway for stocks/futures
#   download from ibkr.com, run on 127.0.0.1:7497
```

A single `./scripts/setup_fedora.sh` + `./scripts/run_dev.sh` will automate the above.

---

## 10. Open Questions / Decisions to Confirm

- **Do you want Docker/Podman deployment** or prefer native systemd/venv on Fedora? (My suggestion: native venv for dev, optional Podman later.)
- **Pine compatibility target**: start with ~30 most-used indicators/built-ins and grow, vs. try full v5 from day one? (My suggestion: start small, grow.)
- **Tick backtest or bar backtest default?** Tick is accurate for FX but data-heavy; bar is fast. (Suggestion: bar default with optional tick for focused strategies.)
- **Do you need multiple user accounts or single-user forever?** (Suggestion: single-user, no auth complexity; simple token for localhost.)
- **Theme**: TradingView dark as default? (Yes.)
- **Screenshots in journal**: store as PNG in `data/screenshots/`? (Yes.)

---

## 11. First Step

Approve or tweak this plan → I build the scaffolding (Phase 0) and Phase 1 immediately, so you have a running skeleton this session.
