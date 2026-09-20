# pw-backtest — Native Fedora Edition (Master Plan v2.1)

> **Goal:** a commercial-grade, **native Linux desktop application** (Fedora 43) for replay,
> backtesting and paper trading — installed as a system RPM, no browser involved.
> The look & feel targets **TradingView-class** charts, chrome and personalization.
>
> **v2.1 (2026-09-21):** owner rejected the existing web UI. §5 now defines a full UI
> rebuild on a TradingView-grade design system; phases restructured around it.
> All earlier decisions remain valid (D1–D6). This supersedes `PLAN.md` (web-era, historical)
> and v2.0 of this document.
>
> **Execution layer:** this document is the *product spec*. The AI-agent execution
> protocol — session ritual, frozen contracts, progress ledger, and the per-task graph
> with verification commands — lives in **`EXECUTION_PLAN.md`**. Agents: start there.

---

## 1. Decisions (owner survey + follow-up, 2026-09-21)

| # | Decision | Choice |
|---|----------|--------|
| D1 | Native engine | **Tauri v2 + Rust core** (Rust does all heavy compute) |
| D2 | Feature scope | **Strong core**: tick replay, deep analytics, risk manager, data quality, pro packaging. Order flow deferred |
| D3 | Markets | **All equal**: crypto (Binance), forex (OANDA/Dukascopy), stocks (IBKR/Yahoo) |
| D4 | Distribution | **System RPM** (`dnf install`) + **auto-update** |
| D5 | UI language | **English** (i18n infrastructure in place, one locale in v1) |
| D6 | Target OS | **Fedora 43** (compat with 42) |
| D7 | **UI** | **Complete rebuild.** The existing web UI is rejected by the owner and is discarded visually. New UI built on a **TradingView-grade design system** with deep **personalization** (two-level settings, named layouts, templates, saved color themes, custom candle colors, hotkey rebind). Existing code is reused only for domain logic (store shapes, API client patterns), never for appearance |

### "Commercial-grade" definition of done (v1)

Benchmarked against TradingView / NinjaTrader / Sierra Chart / Quantower:

1. One-click install (`dnf install pw-backtest-*.rpm`), app-menu icon, cold start < 1 s.
2. **TradingView-class workspace**: top toolbar, drawing toolbar, right widget bar,
   bottom dock, status bar; 60 fps charts; crosshair/zoom/pan/context menus feel native.
3. **Deep personalization**: global defaults + per-chart overrides, named layouts &
   templates, saved color themes, custom candle/canvas colors, watermark, font size &
   density, full hotkey rebind, backup/restore — all persisted, all live-preview.
4. **Tick-level** replay & backtest for all three markets (bar mode = fast mode).
5. Backtest: deterministic fill models (next-open / bar-close / tick), session-aware
   costs, portfolio (multi-symbol), walk-forward with OOS report, overfitting
   diagnostics, risk manager enforced at the broker.
6. Data quality dashboard (gaps vs calendar, dups, outliers, integrity).
7. Alerts (in-app + desktop + optional Telegram), sound notifications, journal with
   auto-screenshots, exports, reproducible runs (code+data+params hash).
8. 100% of hot paths in Rust; **no localhost HTTP**; optional Python bridge only for
   IBKR live / Python strategies (spawned on demand).
9. Auto-update from GitHub Releases (minisign-signed); crash-resilient state;
   structured logs; CI-enforced performance & parity gates.

---

## 2. Gap analysis — why the current build is not professional

| Area | Current state (PR #1) | Problem | v2.1 resolution |
|------|-----------------------|---------|-----------------|
| **UI** | Basic Radix+Tailwind web look | **Owner-rejected.** Spinner culture, web dialogs, no design system, no TradingView-grade chrome/interactions/personalization | **Full rebuild** on the §5 design system: real chrome, 60 fps chart interactions, two-level settings, layouts/templates, sounds, context menus, command palette |
| Architecture | Two dev servers (uvicorn+vite) + browser | Not an app; HTTP/WS hops; 2+ processes | Single Tauri binary; Rust core in-process; IPC commands + event push |
| `backtest/engine.py` | **Placeholder** | The advertised event-driven engine doesn't exist | Real event-driven Rust engine (`pw-engine`), bar **and** tick |
| Granularity | Bars only | Fill accuracy assumed, not measured | Tick storage + tick fill resolution (§8.2) |
| Pine | Monolithic Python compiler | No parity guarantee, no cross-validation | Rust port with **fuzz cross-validation** vs Python reference |
| Testing | 20 unit tests | Far below commercial bar | Golden ports + parity fuzz + e2e + benchmark gates + coverage floors |
| Analytics | Single-symbol, grid + basic WF | No portfolio/OOS/overfitting tools | Portfolio engine, anchored/rolling WF, sensitivity maps, shuffle p-values |
| Risk | Size only | Commercial platforms gate orders by rules | Risk manager inside the broker (§6.6) |
| Data quality | None | Silent missing/corrupt data | Quality service + report + auto-repair |
| State/observability | Auto-create tables, no logs | Fragile upgrades | rusqlite migrations; tracing; run hashing |
| Packaging | `run_dev.sh` | Not installable | Fedora 43 RPM, AppStream, XDG, keyring, auto-update, release CI |

---

## 3. Target architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                     pw-backtest (Tauri v2 binary)                      │
│                                                                        │
│  ┌────────────────────────── pw-app (Rust) ─────────────────────────┐  │
│  │ Tauri commands (IPC) ── services ── Tauri events (push)          │  │
│  │ tray · notifications · global shortcuts · updater · keyring      │  │
│  │ audio (sound events) · screenshots · clipboard                   │  │
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
│  ui/  (React 18 + TS — FULL REBUILD on the §5 design system)           │
│    lightweight-charts v5 (native panes) · Monaco · zustand ·           │
│    tanstack-query · @tanstack/react-table (virtualized grids)          │
│    lib/tauri.ts — IPC adapter (invoke + event listeners)              │
└────────────────────────────────────────────────────────────────────────┘
        │ (optional, spawned on demand)
┌───────▼─────────────────────────────────────────────────────────────────┐
│ bridge/ (Python): IBKR TWS live (ib_insync) · Python strategy API       │
│ OANDA live trading: native Rust (REST + HMAC-SHA512)                    │
└──────────────────────────────────────────────────────────────────────────┘
```

**No HTTP.** UI calls `invoke(...)`; fills/ticks/progress arrive as Tauri events.
The Python bridge is the only subprocess and only runs if configured.

### 3.1 Repository layout

```
pw-backtest/
├── core/                      # Rust workspace
│   ├── pw-core/               # types (Bar, Tick, Order, Fill, Position, Event), market configs
│   ├── pw-data/               # storage (parquet+sqlite), providers, tick↔bar, quality
│   ├── pw-engine/             # broker (bar+tick), backtest, metrics, optimizer
│   ├── pw-pine/               # Pine v5 subset: lexer/parser/AST/interpreter/stdlib
│   └── pw-risk/               # sizing, account rules, risk reports
├── app/                       # Tauri v2 application (pw-app)
│   ├── src-tauri/             # commands/, services/, tray, updater, audio, config
│   └── build/                 # icons, .desktop, AppStream metainfo
├── ui/                        # React app — FULL REBUILD (design system first)
│   ├── src/design/            # tokens.ts, themes (dark/light/custom), typography, motion
│   ├── src/components/        # primitive lib (button, dialog, menu, grid, tree…)
│   ├── src/features/          # chart/, toptoolbar/, drawingbar/, sidebar/, dock/,
│   │                          # tradepanel/, strategy/, datamanager/, settings/, alerts/
│   └── src/lib/               # tauri IPC adapter, stores, formatters
├── bridge/                    # Python: ibkr_bridge.py, python_strategy_runner.py
├── reference/                 # legacy FastAPI backend (from backend/) — GOLDEN REFERENCE
├── packaging/                 # release CI, minisign, fedora build scripts
├── docs/                      # VitePress (also served as in-app Help)
├── scripts/
└── NATIVE_PLAN.md
```

**`reference/` = the spec.** The 20 existing Python tests + Python broker/Pine runtime
define expected behavior; Rust modules are accepted only when provably equivalent (§10).
`reference/` is never shipped in the RPM.

### 3.2 Rust dependencies (workspace-pinned)

`tokio` · `reqwest` (rustls) · `tokio-tungstenite` · `arrow2` + `parquet` ·
`rusqlite` (bundled) + `migrations` · `rayon` · `chrono` + `jiff` · `serde`/`toml` ·
`ring` (HMAC-SHA512, blake3 for run hashes) · `keyring` (Secret Service) ·
`tracing` + `tracing-subscriber` · `thiserror`/`anyhow` · `proptest`, `criterion`, `insta`
· **tauri 2.x** + plugins: `tray-icon`, `global-shortcut`, `notification`, `updater`,
`dialog`, `autostart`, `process` (bridge), `fs` (screenshot export), `clipboard-manager`.

Python bridge (unchanged): `ib-insync`, `pandas`, `numpy` — PyInstaller exe **or**
guided system venv (user choice in Settings → Advanced).

### 3.3 Tauri command surface (v1, stable names)

```
data:    data_symbols_list · data_bars_get(sym,tf,from,to) · data_download(job)
         data_csv_import(file,opts) · data_quality_report(sym,tf) · data_stats(sym,tf)
         data_sessions(sym) · data_download_progress(evt)
replay:  replay_create · replay_advance · replay_place_order · replay_modify_order
         replay_cancel_order · replay_whatif_* · replay_events(evt)
backtest: bt_run · bt_optimize · bt_walkforward · bt_mc · bt_portfolio · bt_runs_list
         bt_run_get · bt_export(id,fmt) · bt_progress(evt)
pine:    pine_compile · pine_run · pine_templates · pine_library_list · pine_format
risk:    risk_size_calc · risk_rules_get/set · risk_report · risk_events(evt)
paper:   paper_start · paper_stop · paper_sessions · paper_events(evt)
broker:  broker_accounts_list · broker_connect · broker_submit_order · broker_cancel
         broker_positions · kill_switch(all)
alerts:  alerts_list · alert_create · alert_update · alert_delete · alerts_events(evt)
app:     app_settings_get/set · app_layouts_* · app_templates_* · app_update_check
         app_update_install · app_screenshot(chart) · app_backup_export/import
         app_data_dir · app_export_log · app_sound(name)
```

Live updates (fills, ticks, progress, alerts, risk events) are **Tauri events** —
never polled. TanStack Query caches command results; events invalidate by key.

### 3.4 On-disk layout (XDG)

```
~/.local/share/pw-backtest/
├── db.sqlite                     # symbols, sessions, orders, trades, runs, scripts,
│                                 #   drawings, layouts, templates, alerts, watchlists
├── market/bars/{provider}/{SYM}/{tf}/{YYYY}.parquet
├── market/ticks/{provider}/{SYM}/{YYYY}/{MM}/[{DD}].parquet
├── scripts/{pine,python}/  screenshots/  exports/  journals/
├── backups/                      # dated JSON/zst of user data (settings, scripts, drawings)
~/.config/pw-backtest/config.toml # preferences: theme, TFs, costs, risk rules, sounds…
~/.cache/pw-backtest/logs/pw-backtest.log   # tracing, 10 MB × 5 rotated
keyring (Secret Service):  oanda.api_key, oanda.account_id, ibkr.password, telegram.bot_token
```

DB: today's models + `ticks_meta`, `quality_flags`, `risk_rules`, `alerts`,
`watchlists`, `layouts`, `templates`, `sounds`; `runs` gains
`code_hash / data_hash / engine_version / params_json`.

---

## 4. Feature set (v1 "strong core") — non-UI summary

### 4.1 Data (all markets, bar + tick)

| Market | Bars | Ticks | Live quotes (paper) | Live trading |
|--------|------|-------|---------------------|--------------|
| Crypto | Binance klines 1s→1M (+ top ~10 exchanges via direct REST) | Binance `aggTrades` (REST backfill + WS) | Binance WS | — (roadmap: testnet) |
| Forex | OANDA v20 / Dukascopy bars | **Dukascopy** (free, majors, 1995→now) | OANDA stream / Yahoo 1m | **OANDA** (native Rust) |
| Stocks | Yahoo (1m/1h/1d), IBKR (if TWS) | Yahoo trades / IBKR | Yahoo / IBKR | **IBKR** (bridge) |
| Any | CSV import (MT4/5, TradingView, generic; ported parser rules) | CSV tick import | — | — |

- **Quality service** per (symbol, tf): gaps vs market calendar, duplicates, outliers
  (|Δc| > k·ATR or tick-size violations), tick↔bar integrity; one-click report +
  auto-repair (re-download ranges).
- **Market calendar**: FX 24/5 (rollover 21:00 UTC), crypto 24/7, stocks (holidays +
  RTH default, configurable). Drives replay skip, gap detection, session spreads.
- **Session-aware costs**: FX spread per session (Asia/NY/rollover-wide), crypto taker
  bps, stock spread in ticks; slippage = fixed ticks + optional impact bps.

### 4.2 Replay (bar + tick)
- Bar replay: step/play ×0.5–×1000, jump-to-date, TV-like bar counter, "show all results".
- **Tick replay**: ×1…×10⁴; deterministic tick resolution (§8.2); partial-bar rendering
  at low speed, aggregated above ×1000.
- **What-if scratchpad**: scratch orders with their own mini P&L (Sierra-style).
- Journal: notes, tags, **auto-screenshot at SL/TP fills**, export.

### 4.3 Strategies
- **Pine v5 subset in Rust**: full parity with Python reference + extended library
  (`ta.supertrend, dmi/adx, ichimoku, cci, wpr, williams_r, pivothighs/lows, valuewhen,
  highestbars/lowestbars`, Keltner bands, `math.log/abs/sign/round`,
  `strategy.opentrades/gross_exposure/closedtrades`).
- **Python strategy API** via bridge (same `on_bar(ctx)` contract as today).
- Scripts manager: folder-backed, versioned, params with defaults/**ranges**
  (ranges feed the optimizer directly).

### 4.4 Backtesting (`pw-engine`)
- Event loop `Tick|BarOpen|BarClose|OrderEvent|Signal|Timer`; fill models
  `next_open` (default, Pine-compatible) / `bar_close` / `tick`.
- Orders: market, limit, stop, stop-limit, **bracket (atomic entry+SL+TP)**, OCO, GTD,
  reduce-only, trailing (ATR chandelier / %), breakeven auto-move.
- Position model: netting (parity default) **and** hedge mode per run.
- **Portfolio mode**: N symbols, one equity account, per-symbol sizing, exposure caps,
  correlation matrix in report.
- Metrics: net P&L, CAGR, Sharpe, Sortino, Calmar, MaxDD (value + duration), PF, win%,
  expectancy, MAE/MFE, streaks, holding time, exposure %; **plus** OOS/IS, monthly/
  weekly heatmaps, day-of-week & hour P&L, exit-reason breakdown, sensitivity maps,
  Monte Carlo (seeded bootstrap).
- Optimizer: grid (rayon, ≤5k combos, live progress) + **walk-forward** (§8.3) +
  **overfitting diagnostics** (plateau %, shuffle p-value, param-count heuristic).
- **Reproducibility**: `code_hash+data_hash+engine_version+params` per run; rerun is
  byte-identical. Export: CSV, JSON, **self-contained HTML report**.

### 4.5 Risk manager (`pw-risk`) — enforced inside the broker
- Sizing: fixed % of equity risk (default) / ATR-based / fixed units (§8.4).
- Limits: max concurrent positions, gross notional cap, per-symbol & total open risk,
  **max daily loss** (auto-flat + block), **max drawdown kill** (manual re-enable),
  min trade spacing; structured "blocked by: …" reasons → UI banner.
- Report: historical VaR (trade returns), exposure timeline.

### 4.6 Paper trading, alerts, live routing
- Paper = Rust engine on live feeds (Binance WS / OANDA stream / Yahoo / IBKR);
  closed-bar semantics for pending & SL/TP, live-quote fills for market; background
  ticker keeps running minimized (tray shows live equity).
- **Alerts**: price cross/touch, indicator conditions, strategy events, session start,
  daily-loss hit; once/repeating; channels: in-app toast + **sound**, desktop
  notification, optional Telegram (token in keyring).
- **Live**: OANDA native Rust (REST v20 + HMAC-SHA512, reconciliation loop); IBKR via
  bridge (watchdog, crash-restart). **Kill switch** (tray + global shortcut):
  cancel-all + flat, < 1 s.
- Consistency mode: backtest → paper → live run the *same* Rust broker on quote feeds,
  so behavior is identical by construction.

---

## 5. UI/UX — TradingView-grade design system (the rebuild)

> Research base: TradingView charting-library docs (toolbars, shortcuts, settings model),
> current TV product surface (2025–2026), community-documented theme tokens.
> Everything below is spec, not aspiration: implement exactly, verify via acceptance list.

### 5.1 Design language & tokens

**Type scale** — Inter (400/500/600) with system fallback; base **13 px**; prices use
`font-variant-numeric: tabular-nums`; sizes: 11 (status/meta) / 12 (dense grid) / 13
(default) / 14 (dialog titles) / 16 (empty-state headers). Font size setting: S=12 /
M=13 / L=14 base.

**Color tokens (default "Grey" theme = TV dark default)**

| Token | Dark (default) | Light | Usage |
|-------|----------------|-------|-------|
| `bg` (chrome) | `#131722` | `#ffffff` | toolbars, panels, dialogs |
| `bg-elev` | `#1e222d` | `#f0f3fa` | hover surfaces, dock, menus |
| `bg-chart` | gradient `#131722 → #10141d` | gradient `#ffffff → #f5f7fb` | chart canvas (solid/gradient/hex user-settable) |
| `border` | `#2a2e39` | `#e0e3eb` | 1 px separators |
| `text` | `#d1d4dc` | `#131722` | primary text |
| `text-2` | `#b2b5be` | `#50535e` | secondary |
| `text-3` | `#787b86` | `#787b86` | muted/meta |
| `accent` | `#2962ff` | `#2962ff` | primary buttons, links, active states |
| `up` / `down` | `#089981` / `#f23645` | same | candles, P&L, volume |
| `up-15` / `down-15` | 15% alpha variants | same | volume bars, heat cells |
| `grid` | `#1e222d` | `#f0f3fa` | chart gridlines |
| `crosshair` | `#758696` | `#758696` | crosshair lines/tags |

Every color is a CSS variable **and** a TS constant; charts read the same tokens via
LWC options. **Saved color themes**: user can persist any token set (incl. candle body/
wick/border, canvas solid/gradient/hex) as a named theme (TV's "Color theme → Save").
Built-ins: Grey (dark default), Black (OLED), Blue, White.

**Shape & motion** — radius 4 px (inputs 4, dialogs 8); elevation via 1 px borders
(shadows only for menus/dialogs); transitions 120–160 ms `ease-out` (no springs);
hover = `bg-elev`; focus-visible ring 1 px `accent`; icon set: Lucide 16 px, 1.5 stroke
(matches TV weight).

**Density** — two modes: Comfortable (32 px rows) / Compact (26 px) — user setting,
applies to grids, watchlist, dock tabs.

### 5.2 Workspace layout (map)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ TOP TOOLBAR  [SymbolSearch ▾][Type ▾][1m 5m 15m 1h 4h D W M ▾]  [ƒx
│ Indicators][⏱ Alerts][↺ Replay][📷][🖌 Templates][▦ Layouts][⚙ Settings] │
├────┬─────────────────────────────────────────────────────────┬───────────┤
│    │                                                     │  RIGHT      │
│ DR │  CHART PANE(S)  (LWC v5: price + N indicator panes)   │  WIDGET   │
│ AW │  crosshair · OHLC legend · watermark · session shade  │  BAR      │
│ IN │  [Data window: recent OHLCV + indicator values]       │  [Watch-  │
│ G B│                                                     │   lists]   │
│    │                                                     │  [Screener]│
│    ├─────────────────────────────────────────────────────┤  [Alerts]  │
│    │ REPLAY / STRATEGY BAR (contextual)                   │  [Object  │
│    ├─────────────────────────────────────────────────────┤   tree]    │
│    │ BOTTOM DOCK TABS:  [Trade] [Strategy] [Screener]     │           │
│    │  [Journal] [Data] [Account]                          │           │
├────┴─────────────────────────────────────────────────────┴──────────────┤
│ STATUS BAR  ● Binance · 12:44:03 UTC (bar 8,341)     D ▾  ⏰ UTC ▾  ◐  │
└──────────────────────────────────────────────────────────────────────────┘
```

- **Top toolbar** (36 px): symbol search button (shows `SYM · TF · type`), chart-type
  dropdown (candles/bars/line/area/baseline/histogram/Heikin-Ashi/hollow/renko),
  TF group + favorites dropdown, Indicators (ƒx), Alerts, Replay, Snapshot,
  Templates, Layouts, Settings.
- **Drawing bar** (36 px, left; floating toggle like TV): cursor, trend, horizontal,
  vertical, rectangle, fib retracement, pitchfork, channel, text, measure, brush,
  zoom, magnet toggle, eraser, **object tree** (layers list: reorder, lock, hide,
  group, per-drawing properties: color/width/line-style/dash/opacity/extend).
- **Right widget bar** (280 px, resizable, hideable): tabs — **Watchlists** (multiple
  named lists, favorites ⭐, flags, add/remove, click-to-switch, live last price for
  list members), **Screener** (sortable local scan, click-to-switch), **Alerts**,
  **Objects** (drawing tree).
- **Bottom dock** (min 140 px, resizable, hideable): tabs — **Trade** (order ticket +
  Orders + Positions + Trades, §5.3), **Strategy** (Pine editor + Backtest panel),
  **Screener** (full table), **Journal**, **Data** (manager + quality), **Account**
  (equity, P&L, risk status).
- **Status bar** (24 px): left = feed status (dot: live/replay/offline), clock + bar
  index; right = active TF chip, timezone selector, theme toggle, help (?), app
  version. All clickable (TV parity).
- **Chart pane area**: 1 / 2 / 4 layouts (today's layouts kept); active pane gets
  the TV blue ring; panes persist; double-click pane header = focus; Alt+←/→ cycle.
- **Floating elements**: chart properties & some dialogs are **draggable floating
  panels** (position persisted, like TV's chart settings); toasts bottom-right;
  replay bar is a floating strip at the top of the chart.

### 5.3 Order ticket & trading panel (TV-style)

```
┌─ Trade ────────────────────────────────────────────────────────┐
│ [ BUY ] [ SELL ]   Type: [Market|Limit|Stop|Bracket ▾]         │
│ Size: [−][ 0.10 ][+]  (1% 5% 10% 25% 50% 100%)  or Risk: [0.5]%│
│ Price: [33,123.45]  (← crosshair / click-to-set)               │
│ Stop loss: [____]   Take profit: [____]   [☑ OCO bracket]      │
│ Risk check: ● sized 0.10 @ 0.5% · stop 32,900 · margin ok      │
│                [  Confirm Buy  ]   (colored by side)           │
├────────────────────────────────────────────────────────────────┤
│ [ Orders | Positions | Trades | Account ]                      │
│  virtualized grid: side, type, price, size, status, P&L,       │
│  SL/TP (editable in-place), actions (modify/cancel/close)      │
└────────────────────────────────────────────────────────────────┘
```

- Ticket: side toggle (green/red), order type, size steppers + % of equity +
  **risk-% sizing** (from risk manager, shows computed size & stop distance),
  price pre-filled from crosshair/click, SL/TP fields, OCO checkbox, live risk
  check line (shows "blocked by: MaxDailyLoss" when a rule fires), confirm button
  colored by side. Keyboard: Shift+B / Shift+S opens buy/sell ticket (TV parity).
- **SL/TP drag on chart**: position lines are draggable; Shift+drag moves bracket
  (TV parity); new SL/TP can be drawn by dragging from a position line.
- Orders/Positions/Trades: one virtualized grid with in-place edits, row context
  menu (modify, cancel, close, journal, screenshot), exit-reason chips.

### 5.4 Chart interactions (behavioral spec)

- Zoom: wheel = cursor-anchored zoom; Shift+drag = rubber-band time zoom;
  arrows = ±1 bar; Up/Down = zoom in/out; `+`/`−` = next/prev TF; Ctrl+1…7 =
  1m/5m/15m/1h/4h/D/W; D/W/M = direct jump (TV defaults, all rebindable).
- Pan: drag; middle-drag pan; drag on time scale = time pan; drag on price scale =
  price pan (log/normal).
- Crosshair: lines + axis tags + **OHLC legend** at top-left (`SYM TF · O H L C Δ%`
  with values colored by direction, + indicator values), optional data window
  (recent bars table, bottom-left, toggle).
- Right-click **context menu** on chart: Add to watchlist · Compare (overlay) ·
  Add indicator here · Draw {tool} from here · Change timeframe · Hide {pane} ·
  Zoom to fit · Snapshot (Alt+S, PNG to clipboard + save) · Set price alert at
  cursor (Alt+A / Ctrl+click a line) · Chart properties (Ctrl+,).
- Drawing rules: magnet mode (snap to OHLC/price, toggle + Shift-temp), 45°
  constrain (Shift while drawing), horizontal/vertical lock (Ctrl), undo/redo
  (Ctrl+Z/Y, per drawing layer), select/move/resize handles, Delete removes,
  Ctrl+Alt+H hides all, drawings persist per symbol+TF (today's rule kept),
  export drawing set (PNG/SVG), per-drawing properties panel.
- Scales: normal/log (Alt+L) / percent (Alt+P); price scale movable left/right;
  last-price line with value tag (toggle); bid/ask lines for replay/paper (toggle).
- Session shading: per-market calendar shading of non-trading hours (toggle +
  intensity), weekend gaps compressed (toggle).
- Watermark: text (default `SYM TF`), position, opacity, font — user-settable.
- Indicator panes: LWC v5 native panes (price + N panes, independent scales,
  draggable resize between panes, each pane: add/remove indicators, own legend).
- Multi-chart: layouts persist; time-sync group toggle (panes share crosshair/time).
- **Zero-spinner rule**: symbol/TF switch renders instantly from cache; cold loads
  show a subtle progress bar (2 px, top of pane) + last-cached data; no blocking
  spinners anywhere. Preload: on symbol hover in watchlist/search, start fetching.

### 5.5 Dialogs & panels (list)

1. **Symbol search** (Ctrl+K / Ctrl+E): fuzzy search over local + known universe,
   market filter (all/crypto/FX/stocks), sections (recent, favorites, watchlists),
   mini last-price + Δ%, arrow-key navigation, Enter to switch (TV quick-switcher feel).
2. **Indicators** (`/` or ƒx): search + categories (trending / oscillators / volume /
   built-ins) + Favorites + Recently used; each item: Apply (adds to active pane),
   **Settings** (3 tabs: Inputs — params with defaults/ranges; Style — line
   colors/widths/plots on/off; Calculations — series length etc.); "Apply to all
   panes"; saved as script (opens Pine editor); indicator library = 40+ entries
   (full `ta.*` library, rendered from generated JSON, with one-line docs +
   recommended inputs).
3. **Chart Properties** (⚙ or Ctrl+,) — **draggable floating panel**, tabs:
   - *Symbol*: contract size, multiplier, margin, pip size — per-symbol overrides
     (defaults from market class)
   - *Appearance*: candle up/down/border/wick colors, hollow toggle, volume color,
     grid on/off + color, watermark (text/position/opacity), legend display
   - *Scales*: normal/log/percent default, price scale position, precision,
     last-price line, session shading, weekend compression
   - *Timezone*: selector (UTC / local / custom offset)
   - *Trading*: default spread, slippage, commission (per-market defaults, per-symbol
     override) — these feed the broker
4. **Global Settings** (Ctrl+Shift+S) — searchable, grouped:
   - *Appearance*: theme (Grey/Black/Blue/White/custom), font size S/M/L, density,
     sound on/off
   - *Chart*: default TF per market, default chart type, visible bars, time-sync
   - *Data*: default provider per market, auto-refresh interval, default backfill
     range, offline mode
   - *Trading & Risk*: risk rules (all limits from §4.5), sizing defaults, order
     confirmations on/off
   - *Notifications*: per-event toggles (fill, SL/TP, alert, session, daily loss),
     sound preset (click/beep/chime), desktop notifications, Telegram (optional)
   - *Shortcuts*: full rebind editor (record-and-save, conflict detection, search,
     reset per-group/total) — defaults = TV hotkey table (§5.6)
   - *Advanced*: data dir (open in file manager), backup/restore (JSON/zst:
     settings, scripts, drawings, watchlists, layouts), log export, about/update,
     Python bridge (IBKR) enable/config, bridge status
   - Every section: "Reset to defaults"; changes live-preview; Ctrl+, scoped to chart.
5. **Layouts & Templates** (TV two-model):
   - **Layouts** (▦): save current *entire* state (panes, symbols, TFs, chart type,
     indicators, dock tab, sidebar tab, theme) as a named layout; instant switching
     from dropdown; per-layout hotkey (Ctrl+1..0); rename/duplicate/delete; set
     default; import/export (JSON).
   - **Templates** (🖌): save indicator stack + drawing set as a template applicable
     to any chart; set default template; per-chart right-click "Save as template".
6. **Alert editor** (Alt+A / ⏱): condition builder (price cross/touch/above/below;
   indicator condition; strategy event), once/repeating + expiry, channels
   (toast/sound/desktop/Telegram), list with enable/disable, test-fire.
7. **Replay bar** (floating over chart): play/pause (Space), step ←/→, speed
   ×0.5…×1000 slider, position bar with date tooltip, "Show all results" (reveals
   hidden future, TV parity), bar counter, replay P&L chip, mode badge (BAR / TICK).
8. **Backtest panel** (Strategy tab): run config (script, symbols, TF, range,
   mode bar/tick, cost model, sizing, risk rules on/off, engine params) →
   **Results**: metrics card grid (12–16 KPIs, colored, hover-tooltips with
   formulas), equity + DD curves (LWC), monthly heatmap, trades grid (virtualized,
   exit-reason chips, MAE/MFE, per-trade screenshot link), tabs: *Report* /
   *Optimizer* (grid: param ranges from script defaults → ranked results; 2D
   sensitivity heatmap) / *Walk-Forward* (fold table + stitched OOS equity) /
   *Monte Carlo* (distribution + percentiles) / *Diagnostics* (plateau %, shuffle
   p-value, OOS/IS) · history of runs (hash + rerun + compare two runs side-by-side)
   · export CSV/JSON/HTML.
9. **Data manager** (Data tab): symbol universe (add/remove, market filter),
   download jobs (range, TF, ticks toggle, progress %, pause/cancel, resume),
   **quality report** (gaps table with re-download buttons, duplicates, outlier
   flags), CSV import (auto-detect, preview, mapping), storage stats (per symbol:
   bars, ticks, size, last ts).
10. **Account panel** (Account tab): equity curve (paper/session), balance/margin/
    free, open risk vs limits (gauge bars), daily P&L, risk-rule status (active/
    breached with reason), VaR, broker connections (OANDA/IBKR: status, account id,
    **kill switch** button), paper session lifecycle.
11. **First-run** (3 steps, skippable): 1) choose markets + download sample data
    (offline demo, ~20 s) 2) pick theme + font size + density 3) create first
    watchlist + load sample strategy. Then straight to a working chart.

### 5.6 Default hotkeys (TV parity; all rebindable)

| Action | Default | Action | Default |
|--------|---------|--------|---------|
| Symbol search | `Ctrl+K` (alias `Ctrl+E`, `Shift Shift`) | Log scale | `Alt+L` |
| Indicators | `/` or `ƒx` | Percent scale | `Alt+P` |
| Trend / Horiz / Vert | `Alt+T` / `Alt+H` / `Alt+V` | Snapshot | `Alt+S` |
| Fib / Rect / Channel | `Alt+F` / `Alt+R` / `Alt+P`* | Chart properties | `Ctrl+,` |
| Buy / Sell ticket | `Shift+B` / `Shift+S` | Alert at cursor | `Alt+A` |
| Close position | `X` | Settings | `Ctrl+Shift+S` |
| Play/pause replay | `Space` | Save layout | `Ctrl+S` |
| Replay step ←/→ | `←` / `→` (chart nav = same keys when not in replay) | Switch layout | `Ctrl+1..0` |
| Replay fast fwd/rew | `Ctrl+→` / `Ctrl+←` | Pane focus next/prev | `Alt+←/→` |
| TF next/prev | `+` / `−` | Watchlist next/prev | `↓` / `↑` (focus) |
| TF quick 1m/5m/15m/1h/4h/D/W | `Ctrl+1..7` | Add to watchlist | `Alt+W` |
| D / W / M | direct TF | Hide drawings | `Ctrl+Alt+H` |
| Undo / Redo drawings | `Ctrl+Z` / `Ctrl+Y` | Hide dock / sidebar | `Ctrl+Shift+H` / `Ctrl+Shift+R` |

\* `Alt+P` collision resolved by context (rebindable; channel = `Ctrl+Alt+P`).

### 5.7 UX quality bar (non-negotiable)

- **Instant**: symbol switch < 150 ms (cached), TF switch < 100 ms, dialog open
  ≤ 1 frame (16 ms); cold load = 2 px progress bar + cached fallback.
- **Keyboard-first**: every visible action has a shortcut; shortcuts dialog shows
  the key next to actions in menus (TV parity).
- **Optimistic**: order placement, settings, drawings apply instantly; failures
  roll back with a toast explaining why (risk rules show the exact rule).
- **Empty/error states**: every panel has a designed empty state (icon + one line +
  primary action) and error state (what broke + retry + log link).
- **Sounds**: optional, per-event, three presets (TV "tick" style); mute-all toggle.
- **Screenshots**: Alt+S → clipboard + `screenshots/`; journal auto-capture on
  SL/TP fills (chart PNG with watermark).
- **No marketing chrome**: no tour/upsell in v1 (local product); "?" = help docs.

### 5.8 Rebuild strategy (how, not what)

- **New design system, same framework**: React 18 + TS + Vite kept; Tailwind v4 with
  a token layer (CSS vars from §5.1) — Tailwind used for layout, **visual identity
  only from tokens** (no ad-hoc colors ever).
- Primitive component library first (button, iconbtn, input, numberfield, select,
  menu, context-menu, dialog, floating-panel, tabs, tooltip, toast, switch, slider,
  datagrid (tanstack), tree, hotkey-recorder, progresshair) — each with a11y +
  keyboard + dark/light + density variants; **stories via a local dev page**.
- Chart component: LWC **v5** (native panes, markers plugin, watermark plugin);
  custom: OHLC legend, data window, session shading overlay, replay clipping,
  drawing v2 (rewritten on LWC v5 primitives + time/price anchor model, undo stack).
- State: zustand (domain stores) + tanstack-query (IPC results); event bus for
  Tauri events → store invalidation. **All** persistence via IPC commands.
- i18n-ready: every string through `t()` (single English locale in v1).
- The old `frontend/` is deleted at the end of Phase 1 (its store shapes & API
  patterns are ported first; nothing visual is reused).

---

## 6. Development phases

> Effort = working days (agent sessions). Strict order; each phase ends green on:
> tests (unit + parity) · clippy/ruff/eslint · benchmarks recorded · docs · **owner
> demo**. Phase 1 additionally requires **owner design sign-off** (D7) before Phase 2.

### Phase 0 — Foundations & spikes (1.5 d)
- Cargo workspace (`core/*`), `app/` Tauri v2 scaffold (window + hello command),
  CI (fmt, clippy -D warnings, test, ui build, coverage; Fedora 42/43 container rpm
  build from Phase 1), `cargo deny`.
- **Golden fixture pipeline**: Python reference exports event-sequence JSON for all 20
  existing tests + 30 new broker scenarios → consumed by Rust tests from day one.
- **Spike A (decision gate):** LWC v5 render benchmark inside Tauri webview on
  Fedora 42/43 (WebKitGTK): 100k bars, pan/zoom fps, memory. If < 45 fps →
  mitigation plan (canvas layering, reduced overdraw; fallback: custom canvas price
  pane) recorded in `docs/spikes/` before Phase 1 commits to the renderer.
- **Design system spec in code**: `ui/src/design/` tokens + themes + type scale
  (from §5.1) + 20 primitive components with a dev "design board" page (renders
  every component in every state) — this is the look the owner signs off.
- Migrations framework, db schema v1, config.toml schema, tracing pipeline, XDG dirs.

### Phase 1 — UI foundation: design system + full shell + chart core (5 d) ⭐
- All primitives from §5.8 with a11y/keyboard/variants; theme engine (dark default,
  light, custom canvas, saved color themes); density & font-size modes.
- **App shell**: top toolbar, drawing bar, right widget bar, bottom dock, status bar,
  layout switcher (1/2/4), floating-panel system (draggable, persisted), context
  menu system, toasts, command palette (Ctrl+K) — all chrome, empty-data.
- **Chart core (LWC v5)**: candles/bars/line/area/baseline/histogram/Heikin-Ashi/
  hollow; panes; crosshair + OHLC legend + data window; zoom/pan semantics (§5.4);
  session shading; watermark; scales (normal/log/percent); last-price line;
  context menu (all §5.4 actions that don't need data); Alt+S snapshot;
  drawing v2 core (trend/horiz/vert/rect/fib + magnet + select + properties +
  object tree + undo/redo + persistence).
- **Settings v1** (Appearance/Chart sections) + **Layouts & Templates** (save/
  switch/hotkeys) + **Watchlists** (multi-list, favorites) on fixture data.
- Dev mode still served by `reference/` FastAPI via the http adapter (deleted when
  Rust data lands in Phase 2); a **fixture provider** (generated seed data, no
  network) drives the shell for dev & e2e.
- **Gate:** design board + shell + chart on fixtures; **owner design sign-off**
  (look, feel, density, keyboard flow); Spike A outcome integrated; 60 fps check.

### Phase 2 — Rust data layer + Data manager + Screener (3 d)
- `pw-data`: parquet storage (streaming row-group reader), sqlite + migrations,
  symbol registry (market classification 1:1 from `markets.py`), providers
  (Binance klines+aggTrades, Yahoo, OANDA v20, Dukascopy — **research sub-task:
  pin feed quirks → `docs/datasources/dukascopy.md`**), CSV importer (ported parser
  rules, 10 golden CSVs), download manager (jobs, progress events, resume, backoff),
  quality service v1 (gaps vs calendar, dups, outliers) + report.
- UI: Data tab (jobs, quality report with re-download), Symbol search over real
  local universe, Screener tab, status bar feed status; **http adapter removed**.
- **Gate:** parity — same (sym,tf,range) → same bars vs Python reference; CSV
  goldens byte-identical after normalization; quality fixtures.

### Phase 3 — Rust broker + replay + Trade panel (3.5 d)
- `pw-engine` broker: **1:1 port of VirtualBroker** (event parity + proptest
  invariants), risk hooks (enforcement lands Phase 7), bracket/OCO/GTD/trailing
  order types added (new semantics, spec'd + fixture'd now).
- Replay service (state machine, processed_time guard ported, what-if scratchpad),
  event streams → Tauri events.
- UI: **Trade tab complete** (order ticket §5.3 with risk-check line, Orders/
  Positions/Trades grid, SL/TP drag on chart, X close, journal tab with notes +
  auto-screenshot), Replay bar (§5.7 item), chart replay clipping + mode badge.
- **Gate:** all broker golden + 30 fixtures pass with **identical event sequences**
  vs Python; session round-trip (create→step→order→restart→continue); ticket
  keyboard flow.

### Phase 4 — Rust backtest engine + Strategy panel (4 d)
- Event-driven engine (bar modes next_open/bar_close), portfolio mode, sizing
  (fixed/percent/ATR), metrics (port 1:1 + new), run store with hashes,
  determinism tests, optimizer grid (rayon + live progress), walk-forward (§8.3),
  Monte Carlo, sensitivity maps, overfitting diagnostics, HTML/CSV/JSON export.
- Strategies run via Pine-bridge (reference process) until Phase 5 lands (decision
  at phase start if Rust Pine is ahead).
- UI: Strategy tab — Pine editor placeholder w/ samples, Backtest panel (§5.5.8)
  complete incl. run history + compare + diagnostics.
- **Gate:** metrics parity vs Python (5 fixed runs, 1e-9); 1M-bar benchmark;
  determinism green; optimizer 1k×100k benchmark.

### Phase 5 — Rust Pine engine + Pine editor (5 d)
- Port: lexer/parser (expressions, if/elif/else, for, var, `:=`, `close[k]`), types,
  vectorized + bar interpreter, `input.*`, `strategy.*`, extended `ta.*`/`math.*`
  (§4.3); Monaco Pine service → Rust diagnostics (< 50 ms) + autocompletion from
  generated stdlib JSON + `pine_format`; indicator library dialog (40+, §5.5.2);
  Python strategy API via bridge (Settings toggle, same UI flow).
- **Parity methodology:** corpus 40 scripts × 20 seeded datasets → Python fixtures;
  match 1e-9 (series) / exact (trades); `proptest` grammar-based script fuzz,
  nightly, corpus grows; divergence → minimal repro committed.
- **Gate:** 100% corpus parity; 3 clean nightly fuzz runs; compile+run 100k bars < 2 s.

### Phase 6 — Tick data + tick replay/backtest (5 d)
- Tick storage + streaming reader; downloaders (Binance aggTrades, Dukascopy, CSV
  ticks); tick→bar aggregator + integrity check (quality flag on mismatch).
- **Tick fill resolution** implemented per §8.2 + 25 hand-computed scenario
  fixtures; replay tick mode (×1…×10⁴, partial bars); backtest `mode: tick`;
  UI: mode picker with data-availability badge, tick stats in Data tab.
- **Gate:** 25 tick fixtures pass; 1M ticks < 10 s; 500k ticks < 200 MB (streaming);
  tick↔bar consistency green on 3 markets.

### Phase 7 — Deep analytics + risk manager + Risk UI (4 d)
- `pw-risk` full (§4.5) wired into broker (every order event; risk event stream);
  daily-loss auto-flat, drawdown kill, VaR, exposure timeline.
- Analytics v2: day-of-week/hour P&L, exit-reason breakdown, correlation matrix,
  drawdown duration table, report HTML (commercial layout).
- UI: Ticket risk line + block banners; Account tab (equity, margin, risk gauges,
  rule status, VaR); Backtest → Report/Diagnostics tabs; Settings → Trading & Risk.
- **Gate:** 50 risk-rule fixtures (each rule triggers/blocks independently);
  analytics spot-checks vs hand-computed fixtures; report golden screenshots.

### Phase 8 — Paper, alerts, live routing + notifications (4 d)
- Paper engine in Rust (feed adapters; closed-bar semantics; background ticker;
  tray equity). Alerts service (conditions, once/repeating, channels incl. Telegram
  optional). **Sounds** (per-event, presets, mute-all). OANDA live in Rust
  (REST v20 + HMAC-SHA512 + reconciliation). IBKR bridge (PyInstaller or guided
  venv, watchdog, crash-restart). Kill switch (tray + global shortcut, < 1 s).
- UI: Paper mode in top bar + tray, Alerts tab + alert editor (§5.5.6), Account
  broker connections, toasts/notifications wiring, Settings → Notifications.
- **Gate:** paper e2e (start→live fill→SL→stop→reconcile) on Binance WS; OANDA
  sandbox round-trip (or mock server in CI); bridge kill/respawn; kill-switch timing.

### Phase 9 — Commercial polish, packaging, release (5.5 d)
- UX pass vs §5.7 bar (every action reachable by keyboard, empty/error states,
  density audit, perf pass vs §9 budget); first-run wizard; snapshot export;
  backup/restore; help (VitePress in-app).
- **Packaging (Fedora 43):** `tauri build` → `pw-backtest-<ver>-fc43.x86_64.rpm`
  (deps `webkit2gtk4.1`, gtk3); AppStream metainfo; icons; `.desktop`
  (Categories: Finance;Office); install/upgrade test matrix F43+F42 (data dir
  intact, migrations run); auto-update (tauri-plugin-updater, GitHub Releases,
  **minisign**, Settings → About UI); release CI (tag → F43 container build →
  sign → GitHub Release + auto-changelog); AppImage fallback artifact.
- Optional (last item): `pw-backtest serve` subcommand (headless engine + local
  REST for a VPS paper box) — nice-to-have, not in v1 gate.
- Docs: getting-started (rpm), engine semantics (tick resolution, cost models),
  Pine parity table, command reference, data sources, troubleshooting
  (WebKitGTK GPU, offline mode).
- **Gate:** full e2e (Playwright + Tauri driver): launch → load → replay trade →
  backtest → paper → settings round-trip; §9 budget met; **owner 10-point
  acceptance checklist signed**.

**Total ≈ 41 working days** (range 38–44). Phases 4/5 may overlap (Pine port can
start while engine work finishes) — both depend only on 0–2.

---

## 7. Key engineering specs

### 7.1 Determinism
- Explicit seeds for all randomness (MC, fuzz) in job params.
- Fixed per-tick order: (1) resting fills & SL/TP, (2) signals, (3) new-order intake,
  (4) mark-to-market. f64 in engine; UI rounds only for display.
- Parity vs Python reference: series 1e-9 relative; event sequences exact.

### 7.2 Tick resolution (normative)
```
for tick in ticks:                            # ascending ts
    path = [prev_mark, tick_price]            # single segment
    # resting stops first (adverse), then limits (favorable); within one tick,
    # stop evaluated before limit (conservative)
    # position SL: if segment crosses SL → fill at adverse extreme; if the same
    # segment also crosses TP → SL wins (documented, conservative)
    # market orders queued at bar close fill at first tick of next bar
    # gap: first tick with ts gap > 2×median interval → fill at tick price,
    # slippage capped at 5×median_tick
    mark = tick_price
```
Documented with 25 scenario fixtures (`docs/engine/tick-resolution.md`).

### 7.3 Walk-forward (normative)
```
anchored:  IS_i = [T0..Ti], OOS_i = [Ti..Ti+1]
rolling:   IS_i = [Ti-n..Ti], OOS_i = [Ti..Ti+1]
optimize on IS_i (objective = user-chosen, default Sharpe) → top-1 params
apply on OOS_i; stitch OOS trades/equity
stability = 1 - stdev(OOS Sharpe)/max(1, mean(OOS Sharpe))
report per fold: params, IS Sharpe, OOS Sharpe, OOS netPnL, OOS DD
```

### 7.4 Risk sizing (normative)
```
risk_amount = equity * risk_pct
stop_dist   = |entry - stop|           # from ticket or ATR*mult
units       = floor(risk_amount / (stop_dist * multiplier) / lot_step) * lot_step
units       = min(units, margin_cap, exposure_cap, symbol_cap)
if stop_dist == 0 → block (NoStopDistance)
```

---

## 8. Performance budget (CI-enforced, recorded per tag)

| Metric | Target |
|--------|--------|
| Cold start → first interactive frame | < 1.0 s (SSD, F43) |
| 100k bars initial render | < 300 ms |
| Pan/zoom 100k bars (WebKitGTK) | ≥ 60 fps sustained (Spike A gate) |
| Symbol switch (cached) / TF switch | < 150 ms / < 100 ms |
| Dialog open | ≤ 16 ms (1 frame) |
| Bar backtest, 1M bars, 1 symbol, 4 threads | < 5 s |
| Tick backtest, 1M ticks | < 10 s |
| Grid optimizer, 1k combos × 100k bars | < 60 s |
| Monte Carlo 2000 × 5k trades | < 1 s |
| Idle RSS (1 pane) | < 350 MB; + < 100 MB per extra pane |
| 500k ticks streamed (tick backtest) | < 200 MB |
| RPM (x86_64, excl. system webkit) | < 25 MB |
| IPC round-trip p50 (local) | < 5 ms |

criterion + headless UI benchmark in CI; regression > 10% fails the job
(escape = `#[ignore]` + review note).

---

## 9. Testing & quality

1. **Golden ports (day 1):** 20 Python tests → Rust; +30 broker edge scenarios
   (gaps, same-bar SL+TP, flips, margin exhaustion, precision) as JSON event
   fixtures generated from the Python reference.
2. **Parity fuzz:** proptest; grammar-based Pine script generator; seeded regime-
   switching data; nightly CI + persisted corpus; divergence → issue + repro.
3. **Unit:** coverage floors — core 85 %, data 70 %, engine 85 %, pine 80 %;
   workspace tests < 10 min.
4. **Integration:** cross-crate (download→store→backtest) with recorded HTTP
   fixtures (wiremock) — zero network in CI.
5. **E2E:** Playwright + Tauri driver: launch, chart-from-fixture, replay 100 bars,
   order + fill, backtest run + metrics assert, paper session, settings round-trip,
   kill switch, update-check mock.
6. **UI acceptance:** component-level (a11y: keyboard-only pass over every dialog;
   contrast AA; focus traps) + the §5.7 quality bar as a manual checklist per phase.
7. **Benchmarks** (§8) + conventional-commit auto-changelog per tag.

---

## 10. Packaging, security, release

**Packaging (Fedora 43):** RPM via tauri-bundler (native rpm build, no rpmbuild
needed); deps `webkit2gtk4.1` + gtk3; files: binary `/usr/bin/pw-backtest`, assets
`/usr/share/pw-backtest/`, `.desktop` + hicolor icons + AppStream metainfo;
install `dnf install ./pw-backtest-*.rpm`; upgrade path tested (migrations, data
intact); auto-update: minisign-signed, endpoint GitHub Releases, UI in
Settings → About; **AppImage** as universal fallback artifact (embeds WebKitGTK,
~90 MB — documented trade-off).

**Security:** nothing bound to network in app mode (in-process IPC; `serve`
subcommand binds 127.0.0.1 + token, Phase 9 optional). Secrets in keyring (Secret
Service), never in config.toml; log redaction layer. Auto-update rejects
unsigned. No telemetry (crash reports opt-in, off by default). Supply chain:
`cargo deny` + committed lockfiles (Cargo, pnpm).

**Rollout:** `v0.1.0-nat.1` (end P1: installable shell + chart, design sign-off) →
`v0.2.0-nat` (P4: replay+backtest parity) → `v0.5.0-nat` (P7: analytics+risk) →
**`v1.0.0`** (P9: the product, Fedora 43).

---

## 11. Risks & mitigations

| Risk | L | I | Mitigation |
|------|---|---|------------|
| WebKitGTK canvas perf < 60 fps | Med | High | **Spike A in Phase 0** before any deep UI work; LWC v5 tuning; fallback custom canvas price pane (UI code unaffected); last resort QWebEngine shell (logged decision) |
| UI rebuild scope slip (biggest chunk) | Med | High | Design sign-off gate at end of P1; components reused across panels; TV-parity list in §5 is the contract — no net-new visual features without owner request |
| Pine parity gaps late | Med | High | P5 parity-first (fixtures + nightly fuzz); P4 never blocked (reference bridge) |
| Dukascopy quirks/ToS | Med | Med (FX ticks) | P2 research sub-task; graceful degrade to OANDA/Yahoo bars |
| IBKR protocol churn | Low | Low | Bridge isolated; pinned version; paper/live usable without it |
| Tauri rpm/updater rough edges F43 | Low | Med | Real F43 container in CI from P1; AppImage fallback |
| Owner UX preferences diverge during build | Med | Med | P1 sign-off + short demos at every phase gate; §5.7 quality bar fixed |

**Explicitly deferred (v2+):** order flow (DOM, footprint, volume profile,
POC/VAH/VAL), live crypto execution (Binance testnet), multi-window, Farsi/RTL,
mobile, options, Dukascopy metals (license).

---

## 12. Immediate next steps

1. Owner approves v2.1 (this file) → commit to `arena/01a0c0dc-pw-backtest`.
2. **Build proceeds per `EXECUTION_PLAN.md`** — agents follow the session ritual,
   pick cards from the progress ledger (frontier rule, §12 of that file), verify
   each card with its exact command, and commit one task per commit.
3. **Phase 0:** workspace + CI + golden fixture pipeline + **Spike A (LWC v5 on
   WebKitGTK)** + contracts in code (types, IPC skeleton, tokens).
4. **Phase 1** → first installable native shell + TradingView-grade chart on fixture
   data → **owner design sign-off** (the moment the new look is approved before
   feature work scales).
5. Per phase: cards green → gate card ⭐ (owner demo + sign-off) → next phase.
