# pw-backtest — Native Fedora Edition (Master Plan v2)

> **Goal:** a commercial-grade, **native Linux desktop application** (Fedora 43) for replay,
> backtesting and paper trading — installed as a system RPM, no browser involved.
>
> **Status of this document:** approved decisions from the owner survey (2026-09-21).
> This is the executable spec for the rewrite; it supersedes `PLAN.md` (the web-era plan,
> kept as historical reference).

---

## 1. Decisions (owner survey, 2026-09-21)

| # | Decision | Choice |
|---|----------|--------|
| D1 | Native engine | **Tauri v2 + Rust core** (Rust does all heavy compute; existing React UI is kept and evolved) |
| D2 | Feature scope | **Strong core**: tick replay, deep analytics (portfolio / walk-forward / overfitting), risk manager, data quality, professional packaging. *Order flow (DOM/footprint/volume profile) is deferred to a later release.* |
| D3 | Markets | **All equal**: crypto (Binance), forex (OANDA/Dukascopy), stocks (IBKR/Yahoo) |
| D4 | Distribution | **System RPM** (`dnf install`) + **auto-update** |
| D5 | UI language | **English** (i18n infrastructure in place, single locale for v1) |
| D6 | Target OS | **Fedora 43** (released ~Oct 2026); build must stay compatible with 42 |

### What "commercial-grade" means here (definition of done, v1)

Benchmarked against NinjaTrader / Sierra Chart / TradeStation / Quantower:

1. One click install (`dnf install pw-backtest-*.rpm`), icon in the app menu, cold start < 1 s.
2. **Tick-level** replay and backtesting for all three markets (bar mode kept as fast mode).
3. Chart responsiveness at 60 fps with ≥ 100k visible bars; pan/zoom/crosshair with no perceivable lag.
4. Backtest engine: deterministic fill models (bar-next-open / bar-close / tick), session-aware
   spread & slippage, portfolio (multi-symbol) runs, walk-forward with OOS report,
   overfitting diagnostics, risk manager rules enforced at order time.
5. Data quality dashboard: gaps, duplicates, outliers, session/calendar violations.
6. Alerts (in-app + desktop notifications), journal, export (CSV/JSON), reproducible runs
   (hash of code+data+params attached to every saved run).
7. 100% of hot paths in Rust; **no localhost HTTP anywhere**; single process (optional Python
   bridge only for IBKR live trading / Python strategies, spawned on demand).
8. Auto-updating from GitHub Releases (minisign-signed), crash-resilient (all state persisted,
   resumable), observability (structured logs, benchmark CI gates).

---

## 2. Gap analysis — why the current build is not professional

| Area | Current state (PR #1) | Problem | v2 resolution |
|------|-----------------------|---------|---------------|
| Architecture | Two dev servers (uvicorn + vite) + browser | Not an app; 2+ processes, HTTP/WS hops, port management | Single Tauri binary; Rust core in-process; UI talks via Tauri IPC commands & events |
| `backtest/engine.py` | **Placeholder** (`run()` returns stub) | The advertised "event-driven engine" does not exist | Real event-driven engine in Rust (`pw-engine`), bar **and** tick modes |
| Data granularity | Bars only | Fill accuracy for SL/TP/slippage is assumed, not measured | Tick storage (parquet), tick downloader per market, tick fill resolution |
| Pine engine | Single monolithic compiler (532 LOC) + runtime (628 LOC), Python-side | Works, but no parity guarantee, no type checking, no cross-validation | Rust port (`pw-pine`) with **fuzz cross-validation** against the Python reference |
| Testing | 20 unit tests | Far below commercial bar | Golden ports + property/fuzz parity + e2e (Playwright/Tauri driver) + benchmark gates + coverage floors |
| Backtest analytics | Single-symbol, grid + basic WF | No portfolio, no OOS report, no overfitting metrics | Portfolio engine, anchored/rolling WF, sensitivity maps, shuffle p-values, trade diagnostics |
| Risk | None (size only) | Commercial platforms gate orders by risk rules | Risk manager: risk-% sizing, ATR sizing, max daily loss, drawdown kill, exposure limits — enforced in the broker |
| Data quality | None | Silent corruption/missing data | Quality service: gaps vs calendar, dedup, outlier flags, integrity report per symbol/TF |
| State/observability | DB auto-create, no migrations, no structured logs | Fragile upgrades, undiagnosable incidents | rusqlite + migration framework; `tracing` structured logs; run hash (code+data+params) |
| Packaging | `run_dev.sh` only | Not installable | RPM (Fedora 43), AppStream metadata, XDG layout, keyring secrets, auto-update, CI release pipeline |
| UI | Functional web UI | Web app feel: spinner culture, polling, no native chrome | Native chrome (menu, tray, global shortcuts, notifications), virtualized data grids, command palette, LWC v5 upgrade, perf budget |

---

## 3. Target architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                     pw-backtest (Tauri v2 binary)                      │
│                                                                        │
│  ┌────────────────────────── pw-app (Rust) ─────────────────────────┐  │
│  │ Tauri commands (IPC) ── services ── Tauri events (push)          │  │
│  │ tray · notifications · global shortcuts · updater · keyring      │  │
│  └──────┬──────────────┬──────────────┬──────────────┬──────────────┘  │
│         │              │              │              │                  │
│  ┌──────▼─────┐ ┌──────▼─────┐ ┌──────▼─────┐ ┌──────▼──────┐          │
│  │  pw-data   │ │ pw-engine  │ │  pw-pine   │ │  pw-risk    │          │
│  │ storage    │ │ broker     │ │ lexer/     │ │ sizing,     │          │
│  │ parquet+db │ │ bar+tick   │ │ parser/    │ │ rules,      │          │
│  │ providers  │ │ metrics    │ │ AST/exec   │ │ limits      │          │
│  │ quality    │ │ optimizer  │ │ stdlib     │ │             │          │
│  └────────────┘ └────────────┘ └────────────┘ └─────────────┘          │
│                                                                        │
│  ui/  (React 18 + TS, evolved from frontend/)                          │
│    lightweight-charts v5 (panes) · Monaco · zustand · tanstack-query   │
│    api.ts  →  tauri-ipc adapter (invoke + event listeners)            │
└────────────────────────────────────────────────────────────────────────┘
        │ (optional, spawned on demand, same repo)
┌───────▼─────────────────────────────────────────────────────────────────┐
│ bridge/ (Python, only when configured):                                 │
│   • IBKR TWS live trading (ib_insync) — no mature Rust TWS client       │
│   • Python strategy API (parity escape hatch for non-Pine strategies)   │
│ OANDA live trading is implemented natively in Rust (REST + HMAC-SHA512) │
└──────────────────────────────────────────────────────────────────────────┘
```

**No HTTP.** The UI calls `invoke("data_bars_get", {...})`; results and live updates flow
back as Tauri events (`fill:replay:3`, `tick:BTCUSDT`, `progress:download:12`).
The optional Python bridge is the *only* subprocess, and only if the user configures an
IBKR account or runs a Python strategy.

### 3.1 Repository layout (monorepo, evolved)

```
pw-backtest/
├── core/                      # Rust workspace (cargo)
│   ├── Cargo.toml
│   ├── pw-core/               # types (Bar, Tick, Order, Fill, Position, Event), market configs, utils
│   ├── pw-data/               # storage (parquet + sqlite), providers, tick↔bar, quality service
│   ├── pw-engine/             # broker simulation (bar+tick), backtest engine, metrics, optimizer, risk
│   ├── pw-pine/               # Pine v5-subset: lexer, parser, AST, vectorized+bar interpreter, stdlib
│   └── pw-risk/               # position sizing, account-level rules, risk reports
├── app/                       # Tauri v2 application (pw-app)
│   ├── src-tauri/             # main.rs, commands/, services/, tray, updater, config
│   └── build/                 # icons, .desktop, AppStream metainfo
├── ui/                        # React app (migrated from frontend/, then evolved)
│   └── src/                   # same component tree; lib/api.ts → tauri adapter
├── bridge/                    # Python: ibkr_bridge.py, python_strategy_runner.py, requirements.txt
├── reference/                 # legacy FastAPI backend (from backend/) — GOLDEN REFERENCE for parity tests
├── packaging/                 # CI release workflow, minisign keys, fedora build scripts
├── docs/                      # VitePress (kept; also served as in-app Help)
├── scripts/
└── NATIVE_PLAN.md             # this file
```

**Rationale for keeping `reference/`:** the 20 existing Python tests + the Python
VirtualBroker/Pine runtime are the *specification*. Every Rust module is accepted only
when it is provably equivalent (see §8). The reference is excluded from the RPM.

### 3.2 Rust dependencies (pin in workspace)

| Concern | Crate |
|---------|-------|
| Async runtime | `tokio` (rt-multi-thread, macros) |
| HTTP / WS | `reqwest` (rustls), `tokio-tungstenite` |
| Columnar storage | `arrow2` + `parquet` (row-group sized for streaming backtest) |
| Relational store | `rusqlite` (bundled) + `migrations` crate |
| Parallelism | `rayon` (bar fan-out, optimizer grid, Monte Carlo) |
| Time | `chrono` + `jiff` (calendar math) |
| Serialization | `serde`, `serde_json`, `toml` |
| Crypto (OANDA HMAC-SHA512, run hashing) | `ring` (or `hmac`+`sha2`), `blake3` |
| Secrets | `keyring` crate (Fedora Secret Service / KWallet backend) |
| Logging | `tracing` + `tracing-subscriber` (rolling file + stderr) |
| Errors | `thiserror`, `anyhow` |
| Tests | `proptest`, `criterion`, `insta` (snapshots) |
| Tauri | `tauri` 2.x + plugins: `tray-icon`, `global-shortcut`, `notification`, `updater`, `dialog`, `autostart`, `process` (bridge spawn) |

**Python bridge deps (unchanged from today):** `ib-insync`, `pandas`, `numpy` — packaged
as a PyInstaller single-file executable, or run from a system venv the installer offers
to create (user choice in Settings).

### 3.3 Tauri command surface (v1, names stable)

```
data:    data_symbols_list · data_bars_get(symbol,tf,from,to) · data_download(job)
         data_download_progress(evt) · data_csv_import(file,opts) · data_quality_report(sym,tf)
         data_sessions_filter(sym) · data_stats(sym,tf)
replay:  replay_create(mode, sym, tf, from, to) · replay_advance(steps|to, speed)
         replay_place_order(ticket) · replay_modify_order · replay_cancel_order
         replay_events(evt stream: fills, sl/tp, equity) · replay_whatif_* (scratchpad)
backtest:bt_run(job{code|script_id, sym, tf, range, mode, costs, risk_rules})
         bt_progress(evt) · bt_runs_list · bt_run_get(id) · bt_optimize(job) ·
         bt_walkforward(job) · bt_mc(job) · bt_portfolio(job) · bt_export(id, fmt)
pine:    pine_compile(source) · pine_run(script_id, sym, tf) · pine_templates()
         pine_library_list() · pine_format(source)
risk:    risk_size_calc(quote) · risk_rules_get/set · risk_report(session|run_id)
paper:   paper_start(sym,tf) · paper_stop(id) · paper_sessions() · paper_events(evt)
broker:  broker_accounts_list · broker_connect(id) · broker_submit_order(ticket, route)
         broker_cancel(id) · broker_positions() · kill_switch(all)
app:     app_settings_get/set · app_update_check · app_update_install
         app_data_dir() · app_export_log()
```

Live updates (fills, ticks, progress) are **Tauri events**, never polled. The UI keeps
TanStack Query only for command results; events invalidate queries by key.

### 3.4 On-disk layout (XDG)

```
~/.local/share/pw-backtest/
├── db.sqlite                     # symbols, sessions, orders, trades, runs, scripts, drawings
├── market/
│   ├── bars/{provider}/{SYMBOL}/{tf}/{YYYY}.parquet
│   └── ticks/{provider}/{SYMBOL}/{YYYY}/{MM}/[{DD}].parquet
├── scripts/{pine,python}/
├── screenshots/  exports/  journals/
~/.config/pw-backtest/config.toml     # preferences (theme, TF, defaults, risk rules)
~/.cache/pw-backtest/logs/pw-backtest.log   # tracing, 10 MB × 5 rotated
secrets (keyring): oanda.api_key, oanda.account_id, ibkr.password, telegram.bot_token
```

DB schema: same models as today (symbol, session, order, trade, backtest_run, script)
plus: `ticks_meta` (provider, ts range, count, hash), `quality_flags`, `risk_rules`,
`runs.meta` gains `code_hash`, `data_hash`, `engine_version`, `params_json`.

---

## 4. Feature set (v1 "strong core")

### 4.1 Charts & workspace
- lightweight-charts **v5** (migration from v4): native multi-pane per chart (price + N
  indicator panes with independent scales), markers plugin, watermark plugin.
- Candlestick / bar / line / area / baseline / Heikin-Ashi (heikin computed in UI) /
  renko (in Rust, on demand).
- Drawings kept and extended: trend, ray, horizontal, vertical, rectangle, fib retracement,
  **pitchfork, channel (parallel), text, polygon, measure (Δ price / Δ time / Δ %)**.
  Undo/redo (Ctrl+Z/Y), layers, export drawing set.
- Multi-pane workspace layouts (1/2/4) kept; panes persist; time-sync toggle per group.
- Command palette (Ctrl+K): symbols, TFs, actions, scripts.
- Virtualized data grids (trades, orders, runs, screener) — 50k rows @ 60 fps.
- Themes: dark (default) / light; high-DPI & scale-factor aware.

### 4.2 Data (all markets, bar + tick)

| Market | Bars | Ticks | Live quotes (paper) | Live trading |
|--------|------|-------|---------------------|--------------|
| Crypto | Binance klines (1s→1M), CCXT-REST-exchange list (top ~10, direct REST — no ccxt dependency) | Binance `aggTrades` (REST backfill + WS live) | Binance WS | — (roadmap: binance testnet) |
| Forex | OANDA candles v20 (if key) / Dukascopy bars | **Dukascopy** (free, all major FX, 1995→now) | OANDA stream v20 (if key) / Yahoo 1m poll | **OANDA** (native Rust) |
| Stocks/ETF | Yahoo (1m/1h/1d), IBKR (if TWS) | Yahoo trades (limited) / IBKR (if TWS) | Yahoo poll / IBKR tick | **IBKR** (Python bridge) |
| Any | CSV import (MT4/5, TradingView, generic; same parser rules as today, rewritten in Rust) | CSV tick import | — | — |

- **Quality service** per (symbol, tf): gap detection against market calendar/sessions,
  duplicate timestamps, outlier flags (|Δc| > k·ATR or beyond tick-size rules), empty
  volume anomalies, tick↔bar consistency (aggregated tick OHLC vs stored bar within tick size).
  One-click report + auto-repair jobs (re-download ranges).
- **Market calendar**: FX 24/5 with daily rollover 21:00–00:00 UTC; crypto 24/7 (exchange
  maintenance windows from status API optional); stocks: exchange calendar (holidays +
  RTH 09:30–16:00 ET default, configurable). Drives: replay speed (skip closed hours,
  optional), gap detection, session-aware spreads.
- **Session-aware cost model**: spreads per session (FX: Asia/NY/Wide-rollover), crypto
  taker fee bps, stock spread in ticks; slippage model: fixed ticks + impact bps (optional).

### 4.3 Replay (bar + tick)
- Bar replay: as today (step, play ×0.5–×1000, jump-to-date, hotkeys), now at Rust speed.
- **Tick replay**: play ticks at scaled speed (×1…×10⁴); orders & SL/TP resolve on the
  tick sequence with deterministic resolution order (see §6.2); chart renders tick-driven
  partial bars at low speed and aggregated bars above ×1000.
- **What-if scratchpad**: temporary orders that don't touch the real session (Sierra-style
  "trade on scratch"), with its own mini P&L.
- Journal: per-trade notes, **auto-screenshot at SL/TP fills** (chart PNG), tags, export.

### 4.4 Strategies
- **Pine v5 subset in Rust** (`pw-pine`): full parity target with the Python reference
  (see §8 parity plan) + extensions: `ta.supertrend`, `ta.dmi/adx`, `ta.ichimoku`
  (cloud), `ta.bb(standard+Keltner)`, `ta.cci`, `ta.wpr`, `ta.williams_r`, `ta.pivothighs/
  lows`, `ta.valuewhen`, `ta.highestbars/lowestbars`, `math.log/abs/sign/round`,
  `strategy.opentrades`, `strategy.gross_exposure`, `strategy.closedtrades`.
- **Python strategy API** (bridge): same `on_bar(ctx)` contract as today; runs in the
  bridge process; results stream back; only offered in Settings if bridge is enabled.
- Scripts manager: folder-backed, versioned, with metadata (market, description, params
  with defaults/ranges — the ranges feed the optimizer directly).

### 4.5 Backtesting engine (`pw-engine`)
- Event loop: `Tick | BarOpen | BarClose | OrderEvent | Signal | Timer`; single
  deterministic clock; **fill models**: `next_open` (default, Pine-compatible),
  `bar_close`, `tick`.
- Orders: market, limit, stop, stop-limit, **bracket (entry+SL+TP atomic)**, OCO, GTD,
  reduce-only, trailing stops (ATR chandelier / fixed %), breakeven auto-move.
- Position model: netting (default, parity with today) **and** hedge mode (separate long/
  short legs) selectable per run.
- **Portfolio mode**: N symbols, one equity account, per-symbol sizing (fixed % of equity
  or ATR-risk), optional gross/net exposure caps, correlation matrix in report.
- **Metrics** (kept): net P&L, CAGR, Sharpe, Sortino, Calmar, MaxDD (value & duration),
  PF, win rate, expectancy, avg MAE/MFE, streaks, avg holding time, exposure %.
  **Added**: OOS/IS comparison, profit per trade distribution stats, monthly/weekly
  heatmap, day-of-week & hour-of-day P&L, exit-reason breakdown, parameter sensitivity
  map, Monte Carlo (kept, bootstrap ×N with fixed seed).
- **Optimizer**: grid (rayon-parallel, incremental progress), **walk-forward**:
  anchored or rolling train/test, stitched OOS equity curve, per-fold IS/OOS tables,
  OOS/IS ratio + stability score; **overfitting diagnostics**: plateau analysis
  (fraction of neighbor-params still profitable), shuffle p-value (trade order
  permutation vs achieved PF), max-params heuristic warning.
- **Reproducibility**: every run stores `code_hash + data_hash + engine_version + params`;
  "rerun" is byte-identical. Export: CSV (trades/equity), JSON (full result), HTML
  report (self-contained, commercial look).

### 4.6 Risk manager (`pw-risk`)
Enforced **inside the broker** (not just UI):
- Position sizing: fixed % of equity risk (default) / ATR-based / fixed units.
- Limits: max concurrent positions, max gross notional (% equity × leverage),
  max risk per symbol, max open risk total, **max daily loss** (auto-flat + block new
  entries), **max drawdown kill** (block until manually re-enabled), min trade spacing.
- Pre-trade checks return structured reasons (UI shows "blocked by: MaxDailyLoss").
- Risk report per session/run: VaR (historical, on trade returns), exposure timeline.

### 4.7 Paper trading & live routing
- Paper = Rust engine on live quotes (same event model as replay; the "feed" is just a
  provider). Quotes: Binance WS (crypto), OANDA stream or Yahoo poll (FX), Yahoo/IBKR
  (stocks). Closed-bar semantics for pending/SL/TP, live-quote fills for market — as today,
  in Rust, with a background ticker that keeps running when the window is minimized
  (system tray with live equity display).
- **Alerts**: in-app toasts + desktop notifications (Tauri notification plugin) for fills,
  SL/TP, cross/price-alerts (user price lines), session start, daily loss hit; optional
  Telegram bot (token in keyring).
- **Live**: OANDA (Rust native, REST v20, HMAC-SHA512) and IBKR (bridge). Order state
  machine with reconciliation loop (local vs broker every N s + on reconnect),
  **kill switch** (cancel all + flat, from tray, global shortcut, or hotkey), connection
  watchdog with degraded-mode banner.
- Paper→live "consistency mode" (roadmap flag): run the *same* Rust broker with a
  live-quote feed for both, so backtest→paper→live behavior is identical by construction.

### 4.8 App chrome (native feel)
- System tray: open/mini, live equity & open P&L, "paper running" indicator, kill switch.
- Global shortcuts (optional, per binding): play/pause, kill switch.
- Native menus (File: new workspace / import CSV / export; View: layouts, panels, theme;
  Help: docs (embedded VitePress), about, check for updates).
- Single-window with native title bar (frameless option), window state restore,
  multi-monitor DPI.
- First-run: no-account welcome, "download sample data" (offline demo like today's seed),
  sample strategy loaded.

---

## 5. Development phases

> Effort in **working days (agent sessions)**. Every phase ends with: tests green,
> benchmark recorded, docs updated, and a tagged build if packaging-affecting.
> **Definition of done (every phase):** unit+parity tests green · clippy/ruff/eslint
> clean · benchmark deltas reviewed · user-visible demo of the phase.

### Phase 0 — Foundations (1 d)
- Cargo workspace (`core/*`), `app/` Tauri v2 scaffold (empty window + "hello" command),
  `ui/` = current frontend moved, `lib/api.ts` split into `http` (legacy) and `ipc`
  (tauri) adapters behind one interface — **dev mode keeps working against FastAPI
  (reference/) until phases complete**, prod mode is IPC-only.
- CI (GitHub Actions): fmt + clippy(-D warnings) + cargo test + ui build; Fedora 42/43
  container build job (rpm artifact) from Phase 1 onward; coverage job.
- Golden test harness: Python reference broker/Pine export **event-sequence JSON
  fixtures** (generated once from the 20 existing tests + 30 new scenarios) → consumed by
  Rust tests from day one.
- **Spike (must-close before Phase 2):** lightweight-charts v5 render benchmark inside the
  Tauri webview on Fedora 42 (WebKitGTK): 100k bars pan/zoom fps. If < 45 fps sustained →
  decision gate: (a) LWC v5 tuning (canvas layering, `data-tauri-drag-region` off),
  (b) fallback renderer evaluation (custom canvas or WebGL) — recorded in `docs/spikes/`.
- Migrations framework + db schema v1 (from today's models), config.toml schema,
  tracing pipeline, XDG dirs.

### Phase 1 — Native shell + data layer in Rust (3 d)
- `pw-data`:
  - parquet storage (arrow2/parquet), row-group streaming reader (never load whole file).
  - sqlite store (rusqlite) + migrations; symbol registry with market classification
    (port `markets.py` logic 1:1).
  - Providers (reqwest/tungstenite): Binance klines + aggTrades, Yahoo (1m/1h/1d +
    auto_adjust), OANDA candles v20 (key from keyring), Dukascopy (bi5/bid → ticks,
    compression + calendar mapping — **research sub-task: pin feed quirks, write
    `docs/datasources/dukascopy.md`**), CSV importer (port parser rules: delimiters,
    split date/time, tz handling; 10 golden CSVs).
  - Download manager: jobs, progress events, resume, rate-limit/backoff, offline queue.
  - Quality service v1: gaps (calendar), dups, outliers; report command + UI dialog.
- `app`: data commands wired; Data Manager dialog (evolved from today's) works over IPC.
- UI: charts load from IPC (no HTTP) for the data path; everything else still HTTP-dev.
- **Gate:** parity suite for storage/providers: same (symbol,tf,range) queries → same
  bars (within source tolerance) as Python reference; CSV golden files byte-identical
  normalized output; quality report fixtures.

### Phase 2 — Rust broker + replay (3 d)
- `pw-engine` broker: **1:1 port of VirtualBroker** (events, fills, netting/flip, margin,
  commissions, SL-first same-bar rule, gap opens) — golden fixtures + proptest invariants
  (invariant set: balance = cash + Σ closed pnl − commissions; equity continuity; SL
  never closed above its trigger price with adverse gap, etc.).
- Risk hooks: broker accepts `RiskRules` (stub enforcement, full rules in Phase 6).
- Replay service: session state machine in Rust (DB-backed cursor, processed_time guard
  ported), order ticket, pending orders, event stream → Tauri events.
- UI: replay fully over IPC; playback ×0.5–×1000; what-if scratchpad (v1: marker-only).
- **Gate:** all 11 broker golden tests + 30 fixture scenarios pass with **identical event
  sequences** vs Python; replay session round-trip (create→step→order→restart→continue).

### Phase 3 — Rust backtest engine + analytics v1 (4 d)
- Real event-driven engine (replaces placeholder): bar mode `next_open`/`bar_close`,
  portfolio mode (N symbols), position sizing (fixed/percent/ATR-stub), metrics module
  (port `metrics.py` 1:1 + Calmar, holding time, exposure).
- Pine → broker bridge: compile (via `pw-pine` *stub* that calls Python reference over
  bridge until Phase 4, or ported subset if ready — decision at phase start based on
  Phase 4 progress; fallback: signals via reference process), next-bar-open fills.
- Optimizer: grid (rayon, ≤5k combos), progress events; walk-forward (anchored/rolling,
  OOS stitching, per-fold table).
- Run store: hash metadata, rerun determinism test (same job → same result JSON).
- UI: Backtest panel v2 (mode selector, cost model editor, portfolio symbol list,
  OOS report tab, HTML/CSV/JSON export).
- **Gate:** metrics parity vs Python on 5 fixed runs (1e-9 tolerance); 1M-bar benchmark
  recorded; determinism test green; optimizer 1k×100k-bar benchmark.

### Phase 4 — Rust Pine engine (5 d)
- Port: lexer, parser (full expression grammar + `if/elif/else`, `for`, `var`, `:=`,
  history `[k]`), types (int/float/bool/series/color/str), vectorized + bar-by-bar
  interpreter, `input.*`, `strategy.*` (entry/close/exit(stop,limit, trail)/cancel_all,
  position_size, netprofit), extended `ta.*`/`math.*` from §4.4.
- **Parity methodology (the heart of the phase):**
  1. Corpus: 40 reference scripts (library + today's tests + edge cases) × 20 generated
     datasets (geometric BM + regime shifts + gaps, seeded) → Python reference outputs
     (plots, signals, trades) → JSON fixtures.
  2. Rust must match within 1e-9 (series) and exact (trade events).
  3. `proptest` fuzz: random scripts (grammar-based generator, biased valid) × random
     data; nightly run with corpus growth; any divergence → minimal repro committed.
- Monaco: Pine language service → Rust-backed diagnostics (compile over IPC, < 50 ms),
  autocompletion from generated stdlib JSON, `pine_format`.
- Python strategy API documented as bridge-only; Settings toggle; same UI flow.
- **Gate:** 100% of corpus parity green; nightly fuzz clean for 3 consecutive runs;
  compile+run 100k bars < 2 s; all strategy.* semantics golden tests.

### Phase 5 — Tick data + tick replay/backtest (5 d)
- Tick storage layout + writer (parquet, time-ordered, per-day files), tick reader
  (streaming). Downloader: Binance aggTrades backfill (paginate by fromId, session
  chunked), Dukascopy (per-candle bi5/bid), CSV tick import. Tick→bar aggregator (verify
  vs stored bars, quality flag on mismatch).
- **Tick fill resolution (deterministic spec, implemented + unit-tested):**
  within a tick: price path = last→tick in one segment; SL & limit/stop evaluated on that
  segment; if both SL and TP of the same position are crossed by one tick → **SL wins**
  (conservative); gap open (first tick after data gap) → fill at open with adverse slippage
  capped. Document in `docs/engine/tick-resolution.md` + 25 scenario fixtures (each
  scenario = hand-computed expected events).
- Replay tick mode (speed ×1…×10⁴, partial-bar rendering at low speed); backtest `mode:
  tick` (same engine, tick clock); benchmark: 1M ticks < 10 s.
- UI: mode picker (bar/tick with data-availability badge), tick stats in data manager
  (count, span, hash).
- **Gate:** 25 tick fixtures pass; tick↔bar consistency check green on 3 markets;
  benchmark met; 500k-tick memory < 200 MB (streaming, not in-memory).

### Phase 6 — Deep analytics + risk manager (4 d)
- `pw-risk` full: sizing (risk-%, ATR), limits from §4.6, pre-trade block reasons,
  daily-loss auto-flat, drawdown kill; broker integration (rules evaluated at every
  order event; risk event stream for UI banner).
- Analytics v2: day-of-week/hour P&L, exit-reason breakdown, parameter sensitivity map
  (heatmap of PF/netPnL over 2D param grid), plateau & shuffle-pvalue overfitting
  diagnostics, VaR (historical), portfolio correlation matrix, drawdown duration table.
- Report: self-contained HTML (commercial layout: summary cards, equity/DD, heatmaps,
  trades table) + CSV/JSON.
- UI: Risk tab (rules editor with live "why blocked" log), Analytics tabs, Report export.
- **Gate:** risk rule fixtures (50: each rule triggering/blocking independently);
  analytics parity spot-checks vs hand-computed fixtures; report golden screenshots.

### Phase 7 — Paper, alerts, live routing (4 d)
- Paper engine in Rust (live feed adapters: Binance WS, OANDA stream/Yahoo poll,
  IBKR-via-bridge), background ticker (tray), notifications (fills/SL-TP/daily-loss),
  price alerts, Telegram (optional).
- OANDA live in Rust: REST v20 order flow (market+bracket), positions, account,
  reconciliation loop, HMAC-SHA512 auth, keyring secrets.
- IBKR bridge: PyInstaller exe (or guided venv), TWS connect (paper/live), order sync,
  watchdog; bridge lifecycle (spawn/kill, crash restart with backoff).
- Kill switch (tray + global shortcut): cancel-all + market-flat (live & paper).
- **Gate:** paper lifecycle e2e (start→live fill→SL→stop→reconcile) on Binance WS;
  OANDA sandbox order round-trip (CI, with key if available / mock server otherwise);
  bridge kill/respawn test; kill-switch < 1 s to "all cancelled" state.

### Phase 8 — Commercial polish, packaging, release (5 d)
- UX pass: command palette, virtualized grids everywhere, themes, first-run, keyboard
  audit (every action reachable), empty/error states, perf pass vs budget (§7).
- **Packaging (Fedora 43):**
  - `tauri build` → `pw-backtest-<ver>-fc43.x86_64.rpm` (deps: `webkit2gtk4.1`, gtk3);
    AppStream metainfo, icon set, `.desktop` (Categories: Finance;Office).
  - Install test matrix: F43 (primary), F42 (compat); `dnf install`, App Menu, launch,
    XDG layout, upgrade path (old data dir intact, migrations run).
  - Auto-update: tauri-plugin-updater + GitHub Releases, **minisign** signing (key in
    `packaging/`), `Update available` UI (Settings → About), delta not required.
  - Release CI: tag → build rpm (Fedora 43 container) → sign → GitHub Release + changelog
    (conventional commits) → optional: Flatpak manifest (side quest, not in v1 gate).
  - Optional: `pw-backtest serve` subcommand (headless engine + REST, for a VPS paper
    box) — same Rust core, thin FastAPI-compatible surface; **nice-to-have, last in phase**.
- Docs: getting-started (rpm path), engine semantics (tick resolution, cost models),
  Pine reference (parity table), API→commands reference, data sources, troubleshooting
  (WebKitGTK GPU note, offline mode).
- **Gate:** full e2e Playwright/Tauri-driver suite (install-free: app launch, load data,
  replay trade, backtest run, paper session, settings round-trip); performance budget
  met; 10-user-acceptance checklist (owner signs off).

**Total: ~34 working days** (range 30–38). Order is strict: each phase's gate must close
before the next starts; Phase 4 (Pine) may start its port in parallel with Phase 3
since both only depend on Phase 0–1.

---

## 6. Key engineering specs

### 6.1 Determinism rules
- All random draws (Monte Carlo, fuzz) use explicit seeds in job params.
- Event processing order fixed: per clock-tick → (1) fills of resting orders/SL/TP,
  (2) signal evaluation, (3) new-order intake, (4) mark-to-market.
- Floating point: f64 everywhere in engine; UI rounds for display only.
- Parity tolerance vs Python reference: series 1e-9 relative, event sequences exact.

### 6.2 Tick resolution (normative)
```
for tick in ticks:                       # ascending ts
    path = [prev_close_or_open, tick]    # single segment
    # 1) resting stops first (adverse), then limits (favorable) — within same tick,
    #    stop evaluated before limit (conservative)
    # 2) position SL: if segment crosses SL → fill at max(SL, path_start) adverse side;
    #    if segment also crosses TP → SL wins (documented, conservative)
    # 3) new market orders queued at bar close fill at first tick of next bar
    # 4) gap: first tick with ts gap > 2×median interval → fill at tick price with
    #    slippage capped at 5×median_tick
    mark = tick
```

### 6.3 Walk-forward (normative)
```
folds = anchored: [ [T1..T2],[T2..T3], ... ]  |  rolling: [ [T1..T2],[T2..T3].. ]
IS:   train params on fold[i-1] (full optimizer, keep top-1 by objective)
OOS:  apply top-1 params on fold[i] (out-of-sample window)
stitch OOS trades/equity → OOS equity curve
stability = 1 - stdev(fold OOS Sharpe)/max(1, mean(fold OOS Sharpe))
report: per-fold table (params, IS Sharpe, OOS Sharpe, OOS netPnL, DD)
```

### 6.4 Risk sizing (normative)
```
risk_amount = equity * risk_pct
stop_dist   = |entry - stop|  (from ticket or ATR*mult)
units       = floor(risk_amount / (stop_dist * multiplier) / lot_step) * lot_step
units       = min(units, margin_cap, exposure_cap, symbol_cap)
if stop_dist == 0 → block (reason: NoStopDistance)
```

---

## 7. Performance budget (CI-enforced, recorded per tag)

| Metric | Target |
|--------|--------|
| Cold start → first interactive frame | < 1.0 s (SSD, F43) |
| 100k bars initial render | < 300 ms |
| Pan/zoom 100k bars (WebKitGTK) | ≥ 60 fps sustained (Phase 0 spike; else documented mitigation) |
| Bar backtest, 1M bars, single symbol, 4 threads | < 5 s |
| Tick backtest, 1M ticks | < 10 s |
| Grid optimizer, 1k combos × 100k bars | < 60 s (rayon) |
| Monte Carlo 2000 × 5k trades | < 1 s |
| Idle RSS (app, 1 pane, no session) | < 350 MB |
| Memory growth per extra pane | < 100 MB |
| RPM size (x86_64, excl. system webkit) | < 25 MB |
| IPC round-trip (p50, local) | < 5 ms |

Benchmarks run in CI (criterion + a headless UI benchmark via Tauri driver); regressions
> 10% fail the job (with `#[ignore]`-escape + review note).

---

## 8. Testing & quality strategy

1. **Golden ports (from day 1):** all 20 Python tests → Rust tests with identical
   fixtures; 30 new broker scenarios (edge cases: gaps, same-bar SL+TP, flips, margin
   exhaustion, zero-size, precision) generated as JSON event-sequence fixtures from the
   Python reference.
2. **Parity fuzz (Pine & broker):** `proptest`; grammar-based random script generator;
   seeded random data (regime-switching BM, gaps, flat, spikes); nightly CI + corpus
   persistence. Any divergence → issue + minimal repro test.
3. **Unit:** property + example per module (target coverage: core 85%, data 70%,
   engine 85%, pine 80%); `cargo test --workspace` in CI < 10 min.
4. **Integration:** cross-crate jobs (download→store→backtest) with recorded HTTP
   fixtures (wiremock) — no network in CI.
5. **E2E:** Playwright + `@tauri-apps/api` in dev, `tauri-driver` smoke in CI
   (launch, chart load from fixture, replay 100 bars, place order, run backtest,
   assert metrics panel).
6. **Benchmark gates** (§7) + **changelog**: conventional commits auto-changelog per tag.
7. **Manual acceptance checklist** per release (owner): install/upgrade on F43, offline
   mode, all three markets data+backtest, paper live, kill switch, update flow.

---

## 9. Security (single-user, local)

- Bind nothing to the network in app mode (IPC in-process). `serve` subcommand (Phase 8,
  optional) binds 127.0.0.1 with a token.
- Secrets (OANDA key, IBKR password, Telegram token) in **keyring** (Secret Service),
  never in config.toml; redacted in logs (`tracing` redaction layer).
- Auto-update binaries **minisign-signed**; updater rejects unsigned/mismatched.
- DB & market data are user-owned files; no telemetry (opt-in crash reports: off by
  default, explicit consent in Settings).
- Supply chain: `cargo deny` (license/advisory) in CI; lockfiles committed (Cargo, pnpm).

---

## 10. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| WebKitGTK canvas perf on Fedora < budget | Medium | High (core UX) | Phase 0 spike **before** broker work; LWC v5 tuning; fallback: custom canvas renderer for the price pane only (spec in `docs/spikes/`); last resort: QWebEngine shell — decision logged, UI code unchanged either way |
| Pine parity gaps surface late | Medium | High | Phase 4 is parity-first (fixtures + nightly fuzz); Phase 3 runs strategies via reference bridge so engine work is never blocked |
| Dukascopy feed quirks/licensing | Medium | Medium (FX ticks) | Research sub-task in Phase 1; FX ticks degrade gracefully to OANDA/Yahoo bars; ToS check documented in `docs/datasources/` |
| IBKR protocol churn (bridge) | Low | Low | Bridge isolated; paper/live still fully usable without it; bridge version pinned |
| Tauri rpm/updater rough edges on F43 | Low | Medium | Build on real F43 container in CI from Phase 1; AppImage as universal fallback artifact |
| Scope creep (order flow, live crypto, mobile) | Medium | Medium | Explicitly **out of v1** (§1 D2); separate `ROADMAP-2.md` for order flow (DOM/footprint/volume profile), live crypto (Binance testnet), multi-window, i18n-Farsi, iOS/Android |
| Estimating on single-machine effort | Medium | Medium | Phase gates + benchmarks are the contract, not dates; any gate slip replans within the phase |

**Explicitly deferred (v2+):** order flow (DOM, footprint, volume profile, POC/VAH/VAL),
live crypto execution, multi-window workspaces, Farsi/RTL, mobile, Dukascopy tick for
metals (license check), options.

---

## 11. Release & rollout

1. `v0.1.0-nat.1` (end of Phase 1): installable rpm, data+charts over IPC — internal.
2. `v0.2.0-nat` (Phase 3): replay+backtest parity builds — owner dogfooding.
3. `v0.5.0-nat` (Phase 6): analytics+risk complete — "pre-release".
4. **`v1.0.0`** (Phase 8): Fedora 43 RPM + auto-update — the product.

---

## 12. Immediate next steps (start of build)

1. Approve this plan (this file) → commit to `arena/01a0c0dc-pw-backtest`.
2. **Phase 0 kickoff:** workspace scaffold, CI, golden fixture generation from the
   Python reference, and the **LWC v5-on-WebKitGTK perf spike** (the one decision gate
   that could change the rendering layer — everything else is additive).
3. Per-phase: implement → gate tests → commit on this branch → tag build → brief owner
   demo. PRs per phase (or one umbrella PR, owner's call) into `main`.
