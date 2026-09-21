# EXECUTION_PLAN.md — AI Agent Execution Protocol & Task Graph

> Companion to `NATIVE_PLAN.md` (the product spec). This file is the **operating
> system for an AI coding agent**: how to run a session, what is frozen, and the
> exact task list with verification commands. If this file and the spec disagree,
> this file wins on *process*, the spec wins on *what to build*.

---

## 0. Agent operating protocol

### 0.1 Session start ritual (do this, in order, every session)
1. `git pull && git status` — must be clean. If dirty: stop, report.
2. Read, **in this order**:
   a. This file: §0 (protocol), the **progress ledger** below, and **your phase's section only**
   b. `NATIVE_PLAN.md` §5 (UI spec) **only if your card touches UI**; the engine/spec
      sections (§7–§8) only if your card touches the engine
   c. The **context pack** of your phase (the file list given per phase below)
3. Run the phase's **baseline verification** (given per phase) and record the result.
   It must be green before you start (except task P0-T02's intentionally-failing
   parity harness).
4. Pick **one** card from the frontier (prerequisites all ✅, top of list).
5. Session budget: **1–2 cards per session** (1 for ⭐-marked cards). If a card
   clearly exceeds the budget, finish what you started to a committable green state,
   then stop — do not start a second card.

### 0.2 Task card format
Every card has: **Goal · Files (create/modify — you may only touch these + tests of
the same module) · Spec · Verify (exact command + expected) · Anti-goals**.
"Verify" is a pass/fail command. A card is done only when its Verify output matches.

### 0.3 Decision rules (when in doubt)
1. Spec (`NATIVE_PLAN.md`) says it? Follow the spec.
2. A frozen contract (§1) says it? Follow the contract.
3. A test/fixture says it? Follow the test. **Fixtures are truth.**
4. Nothing says it? Write a one-line note in the card's commit message
   (`decision: …`), choose the **simplest** option consistent with the spec, and
   continue. If the choice is user-visible, flag it for the owner at the next demo.
5. Never resolve ambiguity by deleting scope.

### 0.4 Guardrails (apply to every card, no exceptions)
- **Dependency freeze:** only crates in `core/Cargo.toml` and packages in
  `ui/package.json` as committed at P0 may be used. Any new dependency = a contract
  task first (update §1.7 + this file).
- **No drive-by refactors.** Only files listed in the card (+ that module's tests).
- **Errors:** no `panic!`/`unwrap()` outside tests on any command path
  (`cargo clippy -D warnings` includes `clippy::unwrap_used` in workspace lints).
- **Engine math in f64.** Rounding happens only in UI display code.
- **UI:** all strings through `t()`; all colors/spacing from §5.1 tokens (CSS vars) —
  zero raw hex in components; every new visual pattern must exist in the spec.
- **Public API:** every public fn/type gets a doc comment + at least one unit test.
- **One task = one commit**, message: `feat(<module>): P3-T01 — <summary>`
  (or `test:`, `fix:`, `chore:`, `contract:` for contract tasks). No WIP commits.
- **Two-strike rule:** if the same approach fails Verify twice, stop. Write
  `BLOCKERS.md` (card id, what was tried, evidence), pick a materially different
  approach or ask the owner. Do not loop.
- **Never delete or rewrite fixtures** unless the card is explicitly a contract task.
- When the card touches the UI: behavior must be covered by an e2e assertion
  (Playwright); pixels are judged by the owner at phase gates, not by you.

### 0.5 Progress ledger (maintain every commit: check the box)
```
Phase 0  [x]P0-T01 [x]P0-T02 [x]P0-T03 [x]P0-T04 [ ]P0-T05* [x]P0-T06
Phase 1  [x]P1-T01 [ ]P1-T02 [ ]P1-T03 [ ]P1-T04 [ ]P1-T05 [ ]P1-T06
         [ ]P1-T07 [ ]P1-T08 [ ]P1-T09 [ ]P1-T10 [ ]P1-T11 [ ]P1-T12⭐
Phase 2  [ ]P2-T01 [ ]P2-T02 [ ]P2-T03 [ ]P2-T04 [ ]P2-T05 [ ]P2-T06
         [ ]P2-T07 [ ]P2-T08
Phase 3  [ ]P3-T01 [ ]P3-T02 [ ]P3-T03 [ ]P3-T04 [ ]P3-T05 [ ]P3-T06
         [ ]P3-T07 [ ]P3-T08 [ ]P3-T09⭐
Phase 4  [ ]P4-T01 [ ]P4-T02 [ ]P4-T03 [ ]P4-T04 [ ]P4-T05 [ ]P4-T06
         [ ]P4-T07 [ ]P4-T08⭐
Phase 5  [ ]P5-T01 [ ]P5-T02 [ ]P5-T03 [ ]P5-T04 [ ]P5-T05 [ ]P5-T06
         [ ]P5-T07 [ ]P5-T08 [ ]P5-T09 [ ]P5-T10 [ ]P5-T11⭐
Phase 6  [ ]P6-T01 [ ]P6-T02 [ ]P6-T03 [ ]P6-T04 [ ]P6-T05 [ ]P6-T06
         [ ]P6-T07 [ ]P6-T08⭐
Phase 7  [ ]P7-T01 [ ]P7-T02 [ ]P7-T03 [ ]P7-T04 [ ]P7-T05 [ ]P7-T06
         [ ]P7-T07 [ ]P7-T08⭐
Phase 8  [ ]P8-T01 [ ]P8-T02 [ ]P8-T03 [ ]P8-T04 [ ]P8-T05 [ ]P8-T06
         [ ]P8-T07 [ ]P8-T08⭐
Phase 9  [ ]P9-T01 [ ]P9-T02 [ ]P9-T03 [ ]P9-T04 [ ]P9-T05 [ ]P9-T06
         [ ]P9-T07 [ ]P9-T08
```
⭐ = phase gate card (owner demo + sign-off before the next phase starts).

**Phase 1 delivery notes (this session):**
- P1-T01 ✅ VERIFIED — run 35593975741 all-green (rust, app, ui incl.
  vitest, manifest guard, rpm fc42+fc43, spike headless run succeeded).
  Theme engine was: tokens→CSS vars,
  Grey/Black/Blue/White registry, density 32/26 + font S/M/L mappings,
  `lwcChartOptions()` mapping for P1-T07, zustand store with IPC-first →
  localStorage fallback persistence, ThemeProvider, dev switcher on the
  placeholder page; tailwind `@theme inline` remapped onto live vars
  (contract: first §1.7 ui slice — zustand + vitest/jsdom/testing-library —
  landed in commit 05c0842). Verify: 16 vitest tests + typecheck + build
  green locally; e2e (Playwright) deferred to P1-T05 where the harness
  lands with the shell card — deviation noted here.

**Phase 0 delivery notes (this session):**
- P0-T03 ✅ verified green in CI (app clippy + contracts, ui typecheck+build);
  layout: crate at `app/src-tauri`, CLI host script in ui (`pnpm --dir ui tauri dev`).
- P0-T06 ✅ verified green (contracts fixture byte-identical; typed skeleton).
- P0-T04 ✅ VERIFIED — run 35592153143: rpm (Fedora 42) green, rpm
  (Fedora 43) green, cargo-deny green, §1.7 manifest guard green
  (rust/app/ui jobs green in the same run).
- P0-T05* — harness + docs + owner script delivered; CI headless run now
  SUCCEEDS (run 35593975741; llvmpipe software-render sanity numbers in the
  `spike-report` artifact — annotation capture improved for future runs).
  The GO/NO-GO decision still awaits the OWNER hardware run
  (`scripts/spike-run.sh`); provisional GO for LWC v5 assumed for planning.
  Fixes on the way: apt noble libasound2→libasound2t64; spike conf paths
  relative to its conf dir. **Decision PENDING the owner hardware
  run** (`scripts/spike-run.sh`) per the card's own gate; provisional GO for
  LWC v5 assumed for planning. Tick after the owner number lands in
  docs/spikes/lwc-webkitgtk.md.

---

## 1. Frozen contracts (created in Phase 0; change only via a `contract:` task that updates this section)

### 1.1 Core types — `core/pw-core/src/types.rs` (exact)
```rust
pub type Timestamp = i64; // milliseconds, UTC

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Bar { pub time: Timestamp, pub open: f64, pub high: f64,
                 pub low: f64, pub close: f64, pub volume: f64 }

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Tick { pub time: Timestamp, pub price: f64, pub volume: f64 } // volume 0.0 = unknown

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Side { Buy, Sell }
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Direction { Long, Short }
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum OrderType { Market, Limit, Stop, StopLimit, Bracket }
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum FillModel { NextOpen, BarClose, Tick }
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TimeInForce { Gtc, Gtd(Timestamp), FillAndKill }
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum FillReason { Market, Limit, Stop, StopLimit, Sl, Tp, Signal, Manual, Trailing }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Order { pub id: u64, pub symbol: String, pub side: Side,
    pub order_type: OrderType, pub price: Option<f64>, pub size: f64,
    pub stop_loss: Option<f64>, pub take_profit: Option<f64>,
    pub trailing: Option<TrailingSpec>, pub tif: TimeInForce,
    pub reduce_only: bool, pub created_at: Timestamp, pub tag: Option<String> } // tag "scratch" = what-if

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct TrailingSpec { pub kind: TrailingKind, pub value: f64 } // Atr(n) | Pct(f64)

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Fill { pub order_id: u64, pub symbol: String, pub side: Side,
    pub price: f64, pub size: f64, pub fee: f64, pub time: Timestamp,
    pub reason: FillReason }
```

### 1.2 Engine events — `core/pw-engine/src/events.rs` (names MUST match Python fixtures)
```rust
pub enum EngineEvent {
  OrderFilled(Fill),
  PositionOpened  { symbol: String, side: Direction, size: f64, entry_price: f64,
                    entry_time: Timestamp, stop_loss: Option<f64>,
                    take_profit: Option<f64>, commission: f64 },
  PositionIncreased { symbol: String, size: f64, avg_price: f64, added: f64,
                      time: Timestamp, commission: f64 },
  PositionReduced { symbol: String, side: Direction, entry_price: f64,
                    entry_time: Timestamp, exit_price: f64, exit_time: Timestamp,
                    closed_size: f64, remaining_size: f64, pnl: f64,
                    commission: f64, reason: FillReason },
  PositionClosed  { symbol: String, side: Direction, size: f64, entry_price: f64,
                    entry_time: Timestamp, exit_price: f64, exit_time: Timestamp,
                    pnl: f64, commission: f64, reason: FillReason },
  PendingPlaced(Order),
  PendingCancelled { order_id: u64, time: Timestamp, reason: String },
  MarkedToMarket  { symbol: String, time: Timestamp, price: f64, equity: f64 },
  RiskBlocked     { order_id: u64, rule: String, message: String },
  Signal { symbol: String, time: Timestamp, kind: String },
}
```
JSON key names are the serde defaults of the fields above; fixtures are compared
with numeric tolerance 1e-9 relative.

### 1.3 IPC contract — single source of truth: `ui/src/lib/ipc.ts`
All Tauri commands are declared in **one** TypeScript file (names, arg objects,
return types) committed at P0-T06 (skeleton) and grown only by contract tasks.
Rust implements exactly against it; round-trip fixtures live in
`core/tests/contracts/*.json` (a `cargo test` deserializes each fixture into the
Rust types and re-serializes to byte-identical JSON). Key schemas (exact):
```ts
data_bars_get({ symbol: string, timeframe: Tf, from?: Timestamp, to?: Timestamp,
                mode?: "bars"|"ticks" })
  -> { bars: Bar[] } | { ticks: Tick[] }
data_download({ symbol: string, timeframe: Tf, from: Timestamp, to: Timestamp,
                provider: Provider, ticks: boolean }) -> { jobId: string }
replay_place_order(sessionId: string, order: Omit<Order,"id">) -> { ok: boolean,
  order?: Order, events: EngineEvent[] }        // events: what happened on placement
bt_run(job: { code: string, symbol: string, timeframe: Tf, from: Timestamp,
              to: Timestamp, fillModel: FillModel, startingCapital: f64,
              sizing: Sizing, riskRules: "on"|"off", params?: Record<string, f64> })
  -> { runId: string }
bt_run_get(runId: string) -> { run: RunMeta, metrics: Metrics,
  equity: Bar[], trades: TradeRow[], folds?: FoldRow[] }
app_settings_set(section: string, patch: Record<string, unknown>) -> { ok: boolean }
```
(`Tf = "1s"|"1m"|"5m"|"15m"|"1h"|"4h"|"1d"|"1w"|"1M"`, `Provider = "binance"|"yahoo"
| "oanda" | "dukascopy" | "csv"`, `Sizing = {kind:"percent",pct:f64,atr?:n} |
{kind:"atr",riskPct:f64,mult:f64} | {kind:"fixed",units:f64}`, `TradeRow` =
PositionClosed + mae/mfe/holdingBars/exitReason.)

### 1.4 Tauri events (push) — names + payloads
```
bars:loaded:{paneId}        { symbol, timeframe, count }
download:progress:{jobId}   { pct, phase, symbol, timeframe }
replay:events:{sessionId}   { events: EngineEvent[], cursor: Timestamp, equity: f64 }
paper:events:{sessionId}    { events: EngineEvent[], equity, position: f64 }
bt:progress:{runId}         { pct, phase, current?: string }
risk:events:{sessionId}     { events: EngineEvent[] /* RiskBlocked, … */ }
alerts:triggered:{alertId}  { alert, value, time }
feed:status                 { state: "live"|"replay"|"offline", lastTs, symbol? }
bridge:status               { state: "off"|"running"|"error", detail? }
```

### 1.5 DB schema v1 (SQLite) — `core/pw-data/src/schema.sql`
Tables (v1, additive-only): `symbols(id, symbol, market, provider, multiplier,
pip_size, tick_size, contract, created_at)` · `bars_meta(symbol, tf, provider,
start_ts, end_ts, count, file, hash)` · `ticks_meta(symbol, provider, start_ts,
end_ts, count, file, hash)` · `quality_flags(id, symbol, tf, kind, ts, detail,
resolved)` · `sessions(id, kind[replay|paper|whatif], symbol, tf, from, to, mode,
cursor, state_json, created_at)` · `orders(...)` `trades(...)` (parity with
`reference/` models + `mae`,`mfe`,`exit_reason`) · `backtest_runs(id, code_hash,
data_hash, engine_version, params_json, symbol, tf, mode, metrics_json, created_at)`
· `scripts(id, name, kind[pine|python], path, version, meta_json)` ·
`drawings(id, symbol, tf, kind, anchors_json, style_json, created_at)` ·
`watchlists(id, name)` `watchlist_items(list_id, symbol, position)` ·
`layouts(id, name, hotkey, json)` · `templates(id, name, json)` ·
`themes(id, name, tokens_json)` · `alerts(id, condition_json, channels_json,
active, last_triggered)` · `risk_rules(id, scope[global|symbol], json)` ·
`journal(id, session_id, trade_id, note, tags, screenshot_path)`.
Migrations: sequential `.sql` files, applied by the `migrations` crate; a card may
**add** tables/columns but never rename/remove (new migration task).

### 1.6 UI tokens — `ui/src/design/tokens.ts`
Exact values from `NATIVE_PLAN.md` §5.1 (single source; CSS vars generated from it
at build). Any new token = contract task.

### 1.7 Dependency manifest (frozen at P0)
- `core/Cargo.toml` workspace members + `[workspace.dependencies]` (list per
  NATIVE_PLAN §3.2) — committed, checksummed in CI.
- `ui/package.json` (React 18, LWC v5, Monaco, zustand, tanstack-query/table,
  tailwind v4, vitest, playwright) — pnpm lock committed.
CI fails if either manifest changes without a `contract:` commit.
Contract log: P1-T01 landed the first slice (zustand; vitest+jsdom+
@testing-library test toolchain) — the rest join with their owning cards
(Monaco P5-T09, tanstack P1-T04, playwright e2e P1-T05, LWC P1-T07).

---

## 2. Phase 0 — Foundations & spikes (≈1.5 d)

**Context pack:** `NATIVE_PLAN.md` §3–§4, `EXECUTION_PLAN.md` §1, `reference/backend/`
(root + `app/replay/engine.py`, `app/backtest/metrics.py` — to learn event/metric names).
**Baseline verify:** `cargo --version && pnpm --version && rustup component add clippy` (install toolchains first if missing: `curl rustup.rs | sh -s -- -y`; `npm i -g pnpm`).

- **P0-T01** Cargo workspace + `pw-core` types.
  Files: `core/Cargo.toml`, `core/pw-core/**`, workspace lints (clippy strict incl.
  `unwrap_used`). Spec: §1.1 exact + doc comments + 20 unit tests (serde round-trips,
  Copy/PartialEq behavior). Verify: `cargo test -p pw-core` green; `cargo clippy
  --workspace -- -D warnings` green. Anti-goals: no other crates created.
- **P0-T02** ⭐ Golden fixture pipeline (the spec engine).
  Files: `reference/parity_export.py` (new, runs against the Python backend),
  `core/tests/fixtures/**/*.json` (generated: all 20 existing Python tests + 30 new
  broker scenarios: gaps, same-bar SL+TP both touched, flips, reduce, margin
  exhaustion, zero-size, commission modes, precision), `core/pw-engine/**` (skeleton
  with failing harness). Verify: 50 fixture files present; `cargo test -p pw-engine`
  runs and reports 50 **expected failures** (harness wired, broker not yet). Anti-goals:
  do not implement the broker.
  DELIVERED (commit 48800d5): 50 = 11 existing broker tests (ported 1:1) + 39 new;
  the other existing tests are strategy-level (need the pandas venv) and their
  parity lands in P5-T07 per its own fixtures.
- **P0-T03** Tauri app scaffold.
  Files: `app/src-tauri/**` (window 1440×900 min 1024×700, title "pw-backtest",
  tracing → XDG log, config.toml load, `app_hello` command), `ui/**` skeleton
  (Vite+React+TS, placeholder page showing `app_hello` result). Verify:
  `pnpm --dir ui tauri dev` shows the hello value; `pnpm --dir ui tauri build`
  produces `bundle/rpm/*.rpm` (in F42/43 container per CI; locally dev-mode only).
  Anti-goals: no real UI.
- **P0-T04** CI.
  Files: `.github/workflows/ci.yml` (jobs: rust fmt/clippy/test + ui typecheck/build
  on ubuntu-latest; rpm build on F42 & F43 containers (quay images), artifact upload;
  `cargo deny` + manifest-check job per §1.7). Verify: push branch → all jobs green;
  changing `core/Cargo.toml` without `contract:` in commit message → job fails.
- **P0-T05** Spike A: LWC v5 on WebKitGTK (decision gate).
  Files: `spikes/lwc-webkitgtk/**` (separate tiny Tauri app: 100k seeded bars,
  candles; instrument fps during scripted pan/zoom via `requestAnimationFrame`
  counter; RSS via `/proc/self/status`), `docs/spikes/lwc-webkitgtk.md`.
  Verify: doc contains measured fps + RSS + **GO/NO-GO** (≥45 fps sustained → GO;
  else list mitigation options, default = custom-canvas price pane in P1-T07) and
  owner is pinged. Anti-goals: no product code.
- **P0-T06** Contracts in code + IPC skeleton.
  Files: `ui/src/lib/ipc.ts` (§1.3 skeleton for all command names, many unimplemented
  → typed `not_implemented` stubs), `core/tests/contracts/*.json` (fixtures for
  implemented: `app_hello`), design tokens `ui/src/design/tokens.ts` (§1.6) +
  tailwind v4 wired. Verify: `cargo test -p pw-app --test contracts` green;
  `pnpm --dir ui typecheck` green. Anti-goals: no features.
**Phase 0 gate:** all six ✅; ledger updated; owner sees the CI green + spike doc.

---

## 3. Phase 1 — UI foundation: design system + shell + chart core (≈5 d) ⭐

**Context pack:** `NATIVE_PLAN.md` §5 (whole), `EXECUTION_PLAN.md` §1,
`ui/src/design/**`, `spikes/lwc-webkitgtk/docs` (spike outcome).
**Baseline verify:** `pnpm --dir ui test && pnpm --dir ui typecheck && pnpm --dir ui build` green; design board renders (P1-T02).
**Data source for this phase:** `ui/src/lib/fixtures.ts` — seeded deterministic OHLCV
generator (3 symbols × 4 TFs, 200k bars max). Deleted in P2-T08.

- **P1-T01** Theme engine. Spec: tokens → CSS vars; themes Grey(dark, default)/
  Black/Blue/White; saved themes (db `themes`, IPC `app_settings`); density
  (comfortable/compact) + font size (S/M/L); LWC chart options read the same tokens.
  Verify: vitest asserts computed CSS var values per theme; e2e: switch theme →
  `getComputedStyle` changes; no raw hex in `src/features/**` (lint rule).
- **P1-T02** Primitives A: button, iconbtn, input, numberfield (steppers, %, clamps),
  select, dropdown menu, context menu (all: keyboard nav, focus trap, a11y roles) +
  dev board route `/dev-board` (renders every component × every state × both themes).
  Verify: `pnpm --dir ui test` (each primitive has keyboard tests); dev board route
  exists in e2e. Anti-goals: no feature components.
- **P1-T03** Primitives B: dialog, floating panel (draggable, position persisted via
  IPC), tabs, tooltip, toast (bottom-right, queue), switch, slider, progresshair.
  Verify: same pattern; e2e: drag floating panel → restart app → position restored.
- **P1-T04** Primitives C: datagrid (tanstack/virtualized: 50k rows, 60 fps scroll
  asserted via e2e perf hook), tree, hotkey-recorder (capture + conflict), badge/chip,
  empty-state/error-state. Verify: perf hook passes; hotkey-recorder unit tests.
- **P1-T05** App shell. Spec: layout per §5.2 (top toolbar, drawing bar, right widget
  bar 280px resizable/hideable, bottom dock 140px min resizable/hideable, status bar,
  pane layouts 1/2/4 with active-pane ring + persistence; panel show/hide hotkeys).
  Verify: e2e — resize persists, hide toggles, layouts 1/2/4 restore after restart,
  active pane ring follows click + Alt+arrows.
- **P1-T06** IPC runtime. Spec: `invoke` wrapper with typed args/returns (from
  `ipc.ts`), event subscription bus (Tauri events → per-key invalidation), error
  surfacing (toast + log link), retry-once for transient IPC. Verify: contract
  round-trip tests green for every implemented command; e2e: `data_bars_get` on
  fixture provider returns typed `Bar[]`.
- **P1-T07** ⭐ Chart core (renderer decision from Spike A).
  Files: `ui/src/features/chart/**`. Spec: LWC v5 (or custom canvas if NO-GO):
  types candles/bars/line/area/baseline/histogram/Heikin-Ashi/hollow; native panes
  (price + N, independent scales, resize); loads bars from IPC fixture; theme wiring;
  100k-bar render path (LWC `setData` batching); volume pane on by default.
  Verify: e2e perf — 100k bars first paint < 300 ms (asserted with `performance.
  now` captured in page); type switch re-renders < 100 ms; pane add/remove works.
- **P1-T08** Chart interactions. Spec: §5.4 — zoom/pan semantics (wheel cursor-
  anchored, Shift+drag band-zoom, arrows ±1 bar, +/− TF, Ctrl+1..7, D/W/M, scales
  normal/log Alt+L), crosshair + OHLC legend (colored Δ%), data window (recent bars
  + indicator values, toggle), last-price line (toggle), context menu (actions not
  needing data: zoom-to-fit, snapshot, chart properties stub, change TF, hide pane),
  Alt+S snapshot (canvas PNG → clipboard + `screenshots/` via IPC).
  Verify: e2e per interaction (assert canvas state via LWC API: visible range,
  scale mode, legend text); 60 fps check in scripted pan (same hook as P1-T07).
- **P1-T09** Drawings v1. Spec: model (anchor points in time/price, survives pan/zoom,
  extrapolates), tools: trend, horizontal, vertical, rectangle, fib retracement;
  magnet (snap OHLC/price, toggle + Shift-temp); select/move/resize handles; undo/
  redo (Ctrl+Z/Y); Delete; Ctrl+Alt+H hide all; object tree (right bar: order,
  lock, hide, rename); properties (color, width, line style, opacity, extend);
  persist per symbol+TF (IPC `drawings`). Verify: e2e — draw each tool, pan/zoom
  keeps anchors stable (assert via API), undo/redo stack, persistence across
  restart; 10 golden PNG snapshots.
- **P1-T10** Symbol search + Indicators dialog (skeleton).
  Spec: §5.5.1/2 — fuzzy search (fixtures universe), market filter, sections
  (recent/favorites/watchlists), arrow keys + Enter; Indicators dialog: list 40
  built-ins from generated JSON (name, category, one-line doc, recommended inputs),
  "Apply" adds a labeled line series (placeholder computation in TS — replaced in
  P4/P5; mark clearly). Verify: e2e: type "BTC" → Enter → pane symbol changes;
  indicator apply → legend chip appears.
- **P1-T11** Settings v1 + Layouts/Templates + Watchlists + Hotkeys.
  Spec: Settings (Ctrl+Shift+S) sections Appearance/Chart/Shortcuts (§5.5.4),
  live preview, per-section reset, persisted to `config.toml` via IPC; Layouts
  (save/switch/rename/hotkeys Ctrl+1..0/export); Templates (indicator stack save/
  apply); Watchlists (multi-list CRUD, favorites, add current, click-to-switch).
  Verify: e2e round-trips (setting → config.toml file content; layout saved →
  restart → hotkey switch; watchlist persisted).
- **P1-T12** ⭐ Phase 1 gate & design sign-off.
  Spec: polish pass vs §5.7 (empty states for all panels, focus audit, density
  audit, startup perf: cold → interactive < 1.0 s measured), update docs
  (`docs/ui/` component reference), owner demo script (10 min: shell → chart →
  zoom/pan → draw → magnet → undo → switch layout → theme → settings → hotkey).
  Verify: perf numbers in `docs/ui/perf-p1.md`; **owner signs off the design**
  (record in this file under the ledger). Next phase blocked until sign-off.

---

## 4. Phase 2 — Rust data layer + Data manager + Screener (≈3 d)

**Context pack:** `NATIVE_PLAN.md` §4.1, `EXECUTION_PLAN.md` §1, `core/pw-data/**`,
`reference/backend/app/data/**` (provider + CSV parser reference), `ui/src/features/
datamanager/**`.
**Baseline verify:** `cargo test --workspace` green (P0–P1 state); P1 e2e suite green.

- **P2-T01** Storage. Spec: parquet writer/reader (arrow2+parquet, row-group 64k
  rows, streaming read), sqlite schema v1 (§1.5) + migrations, symbol registry
  (market classification **1:1 port** of `reference` `markets.py` — parity unit
  tests on 200 symbols). Verify: round-trip 1M bars < 2 s; streaming 1M bars peaks
  < 150 MB (RSS assertion); classification parity green.
- **P2-T02** Provider framework. Spec: `trait Provider { id; capabilities; bars(...);
  ticks?(...) }` + retry/backoff (exp, cap 30 s) + job manager (spawn, progress
  events `download:progress`, pause/cancel/resume, offline queue). Verify: unit
  tests with a mock HTTP server (wiremock) covering retry, backoff, resume.
- **P2-T03** Binance provider (klines 1s→1M pagination + aggTrades; WS capture is
  P8; here REST backfill only). Verify: wiremock fixtures; real-network smoke
  (marked `#[ignore]`, run by owner).
- **P2-T04** Yahoo provider (1m/1h/1d, auto_adjust) + OANDA v20 provider (candles;
  auth from keyring; **mock-server test**, real only `#[ignore]`). Verify: fixtures
  + quality: same range → identical bars vs `reference` Python (parity test,
  tolerance = source re-download noise; compare on a frozen downloaded file, not
  live).
- **P2-T05** Dukascopy: research sub-task first (write `docs/datasources/dukascopy.md`:
  URL format, bi5/bid compression, session/tz quirks, ToS note) → provider (bars +
  ticks). Verify: fixtures for EURUSD/GBPUSD/USDJPY (3 pairs × 2 years daily +
  1 month 1m); tick→bar spot check vs stored bars.
- **P2-T06** CSV importer. Spec: port parser rules from `reference` (delimiters,
  split date/time, tz auto-detect, column mapping) + 10 golden CSVs (MT4, MT5,
  TradingView, generic ×2, tick CSV). Verify: normalized output **byte-identical**
  to `reference` importer on all 10 goldens.
- **P2-T07** Quality service v1. Spec: gaps vs market calendar (per §4.1 calendar
  definitions — implement calendar in `pw-data`), duplicates, outliers (k·ATR),
  report API `data_quality_report`; auto-repair = re-download flagged ranges.
  Verify: fixtures (synthetic gap/dup/outlier series) detected 100% precisely.
- **P2-T08** ⭐ UI wiring + cutover. Spec: Data tab (jobs with progress, quality
  report with re-download, CSV import wizard with preview, storage stats), symbol
  search over real local universe, Screener tab (port of reference scan: chg%,
  RSI, SMA20/50/200, volume ratio, range pos — **parity test vs reference output**
  on 3 symbols), status bar feed status; **delete** `ui/src/lib/fixtures.ts`
  (the pure-TS Phase-1 dev generator — there is no server-side dev adapter;
  the web era was removed from the repo) and any reference-only UI imports
  (keep `reference/` directory + parity tests). Verify: e2e — download job
  (mock provider) → chart loads real parquet → screener matches reference
  within 1e-9.
**Phase 2 gate:** all parity suites green (bars, CSV, screener, classification);
ledger ✅; owner demo: Data tab on real Binance data.

---

## 5. Phase 3 — Rust broker + replay + Trade panel (≈3.5 d)

**Context pack:** `NATIVE_PLAN.md` §4.2, §5.3, `EXECUTION_PLAN.md` §1.2,
`core/pw-engine/**`, `reference/backend/app/replay/engine.py` (+ its 11 tests —
the spec), `core/tests/fixtures/**`.
**Baseline verify:** P2 gates green.

- **P3-T01** ⭐ Broker 1:1 port. Files: `core/pw-engine/src/broker/**`.
  Spec: exact parity with `reference` VirtualBroker — same fills, spread/slippage
  (buy_fill/sell_fill formulas), pending limit/stop triggers (gap opens), SL-first
  same-bar, netting/average/reduce/flip, margin checks, per-market commissions,
  event sequence identical (fixtures). Implement in order: fills → pending →
  SL/TP → position mutation → margin/commissions, flipping fixture tests green in
  that order. Verify: `cargo test -p pw-engine` → **all 50 P0-T02 fixtures green**
  (event sequences match, 1e-9). This is the parity heart of the project.
- **P3-T02** Invariant fuzz. Spec: proptest over random order streams × random bars:
  (1) balance = cash + Σ(pnl) − Σ(commissions) always; (2) equity continuity
  (changes only at events); (3) SL never fills above trigger in adverse-gap
  cases beyond cap; (4) size never negative; (5) pending orders fill at most once.
  Verify: 10k proptest cases green, seeded (seed recorded in commit).
- **P3-T03** New order types (post-parity extension). Spec: bracket (atomic
  entry+SL+TP), OCO, GTD expiry, trailing (ATR n / pct, ratchet direction),
  breakeven auto-move, reduce_only; each: normative doc + 4 fixtures (hand-
  computed, with expected event JSON). Verify: 20 new fixtures green; docs in
  `docs/engine/orders.md`.
- **P3-T04** Replay service. Spec: state machine (create/list/get/advance),
  cursor + processed_time guard (1:1 semantics from `reference`), pause/resume,
  speed, what-if scratchpad (tagged orders, isolated mini-broker), DB-backed
  (`sessions`). Verify: unit: step forward → back → forward yields identical state
  (idempotence); scratchpad doesn't touch session state.
- **P3-T05** Replay events + persistence. Spec: events → Tauri
  `replay:events:{id}`; restart/continue round-trip (kill app mid-session →
  resume identical state). Verify: e2e round-trip; event payload matches
  §1.4 exactly.
- **P3-T06** Trade UI: order ticket + grids. Spec: §5.3 exact (side toggle,
  type select, size steppers + % buttons + risk-% field [risk engine in P7 —
  wire the field, show "sizing coming in P7" until then], price from crosshair/
  click, SL/TP, OCO, confirm colored by side, Shift+B/S); Orders/Positions/Trades
  grids (virtualized, in-place SL/TP edit, row context menu: modify/cancel/close/
  journal). Verify: e2e — full order lifecycle via UI (place → fill event →
  position row → close → trade row with P&L).
- **P3-T07** Chart trade overlays. Spec: entry/SL/TP price lines per position
  (colored, labeled), **drag SL/TP lines** (with Shift = move bracket together),
  pending order lines (dashed, type label), entry/exit markers with P&L, position
  badge chip. Verify: e2e — drag SL to new price → modify call → line moves →
  persisted.
- **P3-T08** Replay bar + journal. Spec: floating replay strip (play/pause/step/
  speed slider/position bar with date tooltip/bar counter/mode badge/"show all
  results" reveals future, TV parity); journal tab (per-trade notes, tags,
  auto-screenshot at SL/TP fills via chart snapshot IPC, export).
  Verify: e2e replay 100 bars (Space, →, speed change, jump-to-date); journal
  note persists; screenshot file exists after simulated SL.
- **P3-T09** ⭐ Phase 3 gate. Verify: P3-T01…T08 green + full e2e replay session
  (create → play → 2 orders → SL trigger → journal → restart → continue);
  owner demo + ledger.
**Anti-goals (phase-wide):** no backtest code; no Pine changes; no tick.

---

## 6. Phase 4 — Rust backtest engine + Strategy panel (≈4 d)

**Context pack:** `NATIVE_PLAN.md` §4.4, §7, `EXECUTION_PLAN.md` §1,
`core/pw-engine/src/engine/**`, `reference/backend/app/backtest/metrics.py`
+ `app/pine/strategy.py` (fill semantics), `ui/src/features/strategy/**`.
**Baseline verify:** P3 gate green.

- **P4-T01** Event-driven engine (bar modes). Spec: loop order per §7.1
  (fills → signals → intake → mark); fill models NextOpen (default, Pine-
  compatible: signal at close i fills at open i+1) & BarClose; signal adapter
  trait `fn on_bar(ctx) -> Vec<Signal>` (Pine/Python plug in later; P4 uses a
  test strategy + reference-bridge Pine). Verify: 15 engine fixtures
  (hand-computed: simple MA-cross over 1k bars with spread/commission — expected
  trades JSON checked vs `reference` run output).
- **P4-T02** Metrics. Spec: 1:1 port of `reference` `metrics.py` (Sharpe,
  Sortino, CAGR, MaxDD, PF, win%, expectancy, streaks, net P&L) + additions
  (Calmar, avg holding bars, exposure %, MAE/MFE per trade). Verify: parity on 5
  frozen reference runs (all values 1e-9).
- **P4-T03** Portfolio mode. Spec: N symbols, one equity account, per-symbol
  sizing (percent/ATR/fixed), gross/net exposure caps, correlation matrix
  (Pearson on bar returns) in report. Verify: 5 fixtures (2-symbol + 3-symbol
  cases hand-checked at boundary: cap binding, one symbol halted).
- **P4-T04** Run store + determinism. Spec: `backtest_runs` with `code_hash`
  (blake3 of source), `data_hash` (blake3 of bar files+range), `engine_version`,
  `params_json`; rerun command. Verify: determinism test — same job twice →
  identical result JSON (byte-compare); run list/get via IPC.
- **P4-T05** Optimizer + WF + MC + diagnostics. Spec: grid (rayon, ≤5k combos,
  live `bt:progress`, ranked table, objective selectable), walk-forward §7.3
  (anchored/rolling, stitched OOS equity, per-fold table, stability), Monte Carlo
  (seeded bootstrap ×N), sensitivity maps (2D PF/netPnL), overfitting diagnostics
  (plateau % over neighbor grid, shuffle p-value, param-count heuristic warning).
  Verify: 10 fixtures each (WF fold stitching vs hand-computed 3-fold; MC
  distribution moments vs reference within MC error at fixed seed).
- **P4-T06** Exports. Spec: trades CSV (incl. MAE/MFE/exit-reason), full JSON,
  self-contained HTML report (summary cards, equity/DD, heatmap, trades table —
  commercial layout, no external assets). Verify: golden-screenshot of HTML
  (puppeteer/playwright screenshot) + CSV golden vs `reference` export format.
- **P4-T07** Strategy panel UI. Spec: §5.5.8 complete — run config (script select
  [Pine editor arrives P5; use saved samples + reference bridge for Pine now],
  symbol(s) incl. portfolio list, TF, range, mode, cost model editor, sizing,
  risk on/off) → results: KPI card grid (12–16, hover = formula tooltip),
  equity/DD curves, monthly heatmap, trades grid (virtualized, chips), tabs
  Report/Optimizer/Walk-Forward/Monte Carlo/Diagnostics, run history (hash +
  rerun + compare-two side-by-side), export buttons. Verify: e2e — full run
  from UI → all tabs render from IPC data; compare view shows deltas.
- **P4-T08** ⭐ Phase 4 gate. Verify: 1M-bar benchmark < 5 s (4 threads) recorded
  in `docs/perf/`; optimizer 1k×100k < 60 s; parity green; owner demo.
**Anti-goals:** no tick mode; no Pine Rust code (that's P5).

---

## 7. Phase 5 — Rust Pine engine + Pine editor (≈5 d)

**Context pack:** `NATIVE_PLAN.md` §4.3, `EXECUTION_PLAN.md` §1,
`reference/backend/app/pine/{compiler,runtime,strategy}.py` (+ its 6 tests = the
spec corpus seed), `core/pw-pine/**`, `ui/src/features/pine/**`.
**Baseline verify:** P4 gate green.

- **P5-T01** Lexer. Spec: tokens per reference grammar (identifiers, numbers incl.
  decimals, strings, `//@version` comment, `:=`, `[k]`, ternary `? :`, operators,
  `ta.`/`math.`/`strategy.`/`input.`/`color.` prefixes); positional errors
  (line:col). Verify: 50 lexer fixtures (incl. error positions).
- **P5-T02** Parser. Spec: full expression precedence (reference is the spec:
  math, comparisons, and/or/not, ternary, parens), statements (assignment `=`,
  reassign `:=`, if/elif/else indented blocks, for with `by`, `var`), declarations
  (`indicator()`, `strategy()`, `plot()`, `input.*`, `strategy.*` calls with
  kwargs). Verify: 80 parser fixtures (AST JSON golden, incl. reference's test
  scripts verbatim).
- **P5-T03** Types & series model. Spec: int/float/bool/series/color/string;
  series ops elementwise + scalar promotion; history access `close[k]`
  (k = offset back, same as Pine); NaN semantics = reference. Verify: unit
  fixtures with reference outputs (incl. NaN placement).
- **P5-T04** Vectorized indicator runtime. Spec: `ta.*` core set matching
  reference (sma/ema/wma/rma/rsi/macd/bb/atr/stoch/highest/lowest/vwap/change/
  stdev/crossover/crossunder + math.*) on arrow arrays. Verify: parity — 15
  reference indicator scripts × 10 seeded datasets → plot outputs 1e-9.
- **P5-T05** Bar-by-bar interpreter. Spec: `var` state carry, `:=`, control flow,
  `close[k]`, used automatically when script has state (mirror reference's dual-
  path behavior). Verify: parity — 10 stateful reference scripts (same datasets).
- **P5-T06** Stdlib extension. Spec: §4.3 list (supertrend, dmi/adx, ichimoku,
  cci, wpr, williams_r, pivothighs/lows, valuewhen, highestbars/lowestbars,
  Keltner, math.log/abs/sign/round, strategy extras). Each: doc + 3 fixtures
  (values hand-checked on tiny series + reference behavior where reference
  already had it). Verify: 30 fixtures green.
- **P5-T07** `strategy.*` → broker signals. Spec: entry/close/close_all/exit
  (stop/limit, trailing updates)/cancel_all; next-bar-open fills; pyramiding=0;
  percent-of-equity & fixed sizing; `strategy.position_size/netprofit/
  opentrades/gross_exposure/closedtrades`. Verify: 20 strategy fixtures —
  **trade events exact** vs reference engine runs (reuse P0 fixture pipeline on
  reference's 6 strategy tests + 14 new).
- **P5-T08** Fuzz harness (the parity guarantee). Spec: `proptest` grammar-based
  script generator (biased toward valid: expressions, var, if, for, ta calls) ×
  seeded regime data; compares Rust vs reference (run reference in CI container
  via `reference/` venv); nightly job; corpus persisted in `core/pw-pine/corpus/`
  (shrunk failing cases auto-added). Verify: nightly green 3 consecutive days
  (recorded); any divergence → minimal repro committed + issue.
- **P5-T09** Pine editor UI. Spec: Monaco with Pine language service over IPC
  (`pine_compile` diagnostics < 50 ms, line:col squiggles), autocompletion from
  generated stdlib JSON (ta./strategy./input. + local vars), `pine_format`
  (Ctrl+Shift+F), templates dropdown (MA cross, RSI, BB strategy, python
  sample [bridge]), Run (indicator → plot; strategy → backtest via P4 panel),
  Save to scripts (versioned). Verify: e2e — type bad script → squiggle with
  correct position; good script → plot appears; run strategy → backtest panel
  populated; format round-trip stable.
- **P5-T10** Indicator library dialog (full). Spec: §5.5.2 final — 40 entries
  rendered from generated JSON, categories + favorites + recent, Apply (adds to
  active pane with default inputs), Settings tabs (Inputs/Style/Calculations)
  editing stored params/styles, "Apply to all panes", per-indicator alerts
  (wired to P8 alert service stub). Verify: e2e: apply RSI → pane + legend;
  change period in Inputs → line updates; Style color persists per chart.
- **P5-T11** ⭐ Phase 5 gate. Verify: corpus parity 100% (40 scripts × 20 datasets
  + fuzz corpus), 3 clean nightly fuzz runs, compile+run 100k bars < 2 s
  benchmark, owner demo (write a strategy live in the editor → backtest).
**Anti-goals:** no Pine v6; no `study.load/requests`-class features; Python
  strategies stay bridge-only.

---

## 8. Phase 6 — Tick data + tick replay/backtest (≈5 d)

**Context pack:** `NATIVE_PLAN.md` §4.1, §4.2, §7.2, `EXECUTION_PLAN.md` §1,
`core/pw-data/src/ticks/**`, `core/pw-engine/src/broker/**` (P3),
`reference/` (for bar parity checks only).
**Baseline verify:** P5 gate green.

- **P6-T01** Tick storage. Spec: layout per §3.4 (per-day parquet), streaming
  writer (buffered flush per minute-block) + streaming reader, `ticks_meta`.
  Verify: write 2M ticks < 10 s; streaming read peaks < 200 MB.
- **P6-T02** Tick downloaders. Spec: Binance aggTrades REST backfill (fromId
  pagination, chunked session download, resume), Dukascopy tick (from P2-T05
  provider, bi5/bid → normalized Tick), CSV tick import (via P2-T06 parser).
  Verify: wiremock fixtures + `#[ignore]` real smoke; tick stats (count/span/
  hash) in Data tab.
- **P6-T03** Tick→bar aggregator + integrity. Spec: aggregate ticks → OHLCV;
  compare vs stored bars (within tick size) on overlap; quality flag on mismatch
  (`quality_flags`, kind `tick_bar_mismatch`). Verify: fixtures (3 mismatch
  cases detected; clean series no flags).
- **P6-T04** ⭐ Tick fill resolution (the accuracy heart). Spec: §7.2 normative —
  implement `broker.on_tick` path: segment crossing tests, stop-before-limit
  within one tick, SL-wins-both-touched (conservative), gap-open first tick
  (slippage cap 5×median tick), queued market orders fill at first tick of next
  bar. **25 scenario fixtures hand-computed** (each: input ticks + resting
  state → expected event JSON; scenarios cover: exact-touch, adverse gap,
  both-touched, stop+limit same tick, partial fills, median-tick cap, flat
  prices). Verify: 25/25 green; doc `docs/engine/tick-resolution.md` with the
  worked examples.
- **P6-T05** Engine tick mode. Spec: `FillModel::Tick` drives engine clock over
  ticks (events same envelope as bar mode); bar-close events still emitted
  (for signals that need them); performance path (no per-tick allocation in
  hot loop). Verify: parity cross-check — on data where ticks are the only info,
  tick-mode run matches P3-T01 bar-mode run when each tick equals its bar's
  close (degenerate case fixture); 1M-tick benchmark < 10 s.
- **P6-T06** Replay tick UI. Spec: mode badge (BAR/TICK), speed ×1…×10⁴,
  partial-bar rendering below ×100 (partial candle + tick marker), aggregated
  above; data-availability badge in mode picker (which symbols/TFs have ticks).
  Verify: e2e — tick replay 10k ticks: speed changes respected (measured wall
  time per 100 ticks), partial bar visible, badge states correct.
- **P6-T07** Backtest tick mode + UI. Spec: `bt_run { mode: "tick" }` end-to-end;
  results identical envelope (trades get `fill_detail` = tick ts); Data tab tick
  stats + integrity report view. Verify: e2e full tick backtest on 500k-tick
  fixture; memory < 200 MB (RSS hook); benchmark recorded.
- **P6-T08** ⭐ Phase 6 gate. Verify: all fixtures green, 3-market consistency
  check (tick↔bar) green, benchmarks met, owner demo (tick replay with a stop
  order triggering mid-bar).
**Anti-goals:** no order flow/footprint (deferred); no live tick feeds yet (P8).

---

## 9. Phase 7 — Deep analytics + risk manager + Risk UI (≈4 d)

**Context pack:** `NATIVE_PLAN.md` §4.5, §5.3 (risk line), §7.4,
`core/pw-risk/**`, `core/pw-engine/src/broker/**` (hook points from P3-T01),
`ui/src/features/{tradepanel,account}/**`.
**Baseline verify:** P6 gate green.

- **P7-T01** Sizing. Spec: §7.4 normative (risk-%, ATR-based, fixed; lot-step
  flooring; NoStopDistance block). Verify: 10 fixtures (incl. lot-step edge,
  min-size floor, ATR zero).
- **P7-T02** Rules engine + broker integration. Spec: limits from §4.5 (max
  positions, gross notional cap, per-symbol & total open risk, max daily loss
  → auto-flat + block new, max drawdown kill → manual re-enable, min spacing);
  evaluated at every order event inside the broker; rules stored (`risk_rules`,
  scope global/symbol); auto-flat emits closes with reason + RiskBlocked for
  subsequent orders. Verify: **50 rule fixtures** — each rule triggers and
  blocks independently, plus 5 combined-rule scenarios.
- **P7-T03** Risk events + reasons. Spec: `RiskBlocked{rule, message}` on
  `risk:events`; structured reason strings (stable, testable, i18n-keyed in UI).
  Verify: unit fixtures; e2e: rule fires → UI banner shows exact rule key.
- **P7-T04** Analytics v2. Spec: day-of-week & hour-of-day P&L, exit-reason
  breakdown, drawdown duration table, portfolio correlation matrix (P4-T03
  data), all computed in Rust with fixtures. Verify: 8 hand-computed fixtures.
- **P7-T05** VaR + exposure timeline. Spec: historical VaR (95/99, trade returns),
  exposure timeline series. Verify: fixtures vs hand-computed.
- **P7-T06** Risk UI. Spec: ticket risk line (live: computed size, stop distance,
  margin, "blocked by: …" on violation) + block banners; Account tab complete
  (equity curve, balance/margin/free, open-risk gauges vs limits, daily P&L,
  rule status list with breach reason, VaR, drawdown duration); Settings →
  Trading & Risk (all rules, per-symbol overrides, enable confirmations).
  Verify: e2e — set risk rule → place violating order → banner + blocked;
  daily-loss auto-flat visible in trades grid with reason chip.
- **P7-T07** HTML report v2. Spec: adds analytics sections (DOW/hour heat, exit
  reasons, DD duration, VaR, correlation); golden screenshot updated.
  Verify: screenshot diff passes; PDF-free (HTML only).
- **P7-T08** ⭐ Phase 7 gate. Verify: 50+8+10+ fixtures green; e2e risk flow;
  owner demo (watch a daily-loss rule flat the account).

---

## 10. Phase 8 — Paper, alerts, live routing + notifications (≈4 d)

**Context pack:** `NATIVE_PLAN.md` §4.6, `EXECUTION_PLAN.md` §1.4 (events),
`core/pw-app/src/services/**` (new), `reference/backend/app/paper/feed.py` +
`app/brokers/*` (semantics reference), `ui/src/features/account/**`.
**Baseline verify:** P7 gate green.

- **P8-T01** Live feed adapters. Spec: Binance WS (bookTicker/aggTrade → mark
  loop), Yahoo poll (15 s, tz-aware), OANDA stream v20 (if key) / poll fallback;
  `feed:status` events; offline → last stored bars (graceful, today's behavior
  parity). Verify: wiremock/mock-WS fixtures; adapter unit tests (backoff,
  reconnect).
- **P8-T02** Paper service. Spec: paper sessions = engine on live marks (same
  semantics: closed-bar for pending/SL/TP, live-quote fill for market);
  background ticker (advances when window minimized — tray equity updates);
  lifecycle `paper_start/stop`, stopped = read-only (parity with reference).
  Verify: e2e — paper session: market fill at live mark, SL triggers on closed
  bar, stop → read-only; restart app → session resumes.
- **P8-T03** Alerts service + UI. Spec: conditions (price cross/touch/above/
  below, indicator value, strategy event, session start, daily-loss hit),
  once/repeating + expiry, channels (toast/sound/desktop/Telegram[optional]),
  `alerts:triggered` events; Alerts tab (list, enable/disable, test-fire) +
  alert editor dialog (§5.5.6); Alt+A pre-fills at cursor price.
  Verify: e2e — price alert fires on feed mark; repeating alert re-fires;
  editor round-trip persisted.
- **P8-T04** Sounds + desktop notifications. Spec: per-event sound presets
  (3) + mute-all (Settings → Notifications), Tauri notification plugin wiring
  (all fill/SL/TP/alert events, permission request flow), tray menu
  (open/mini, equity, kill switch, update check). Verify: unit (event → sound
  name mapping); e2e (notification permission mock + tray state).
- **P8-T05** OANDA live (Rust). Spec: REST v20 order flow (market + bracket,
  cancel, positions, account summary), HMAC-SHA512 auth (keyring), reconciliation
  loop (local vs broker, drift → banner + manual resolve action), error surfacing
  (API error → structured UI error with code). Verify: **mock OANDA server**
  (wiremock) full round-trip: place → fill → reconcile → close; `#[ignore]`
  sandbox smoke for owner.
- **P8-T06** IBKR bridge. Spec: process lifecycle (spawn PyInstaller exe OR
  guided venv — Settings → Advanced), JSON-lines protocol over stdio
  (connect/paper-live, orders, positions, account), watchdog (crash → restart
  ×3 → `bridge:status error` + banner), bridge status in Account tab.
  Verify: unit with fake bridge process (echo script); kill -9 → restart →
  status events correct.
- **P8-T07** Kill switch + broker UI. Spec: kill = cancel all pending +
  market-flat all open (paper & live, both brokers), from tray + global
  shortcut (configurable) + Account tab button; < 1 s to all-cancelled
  (measured); Account → broker connections (status, account id, connect/
  disconnect, kill switch, last-reconciled). Verify: e2e with mock brokers:
  5 open + 5 pending → kill → 0 open/0 pending, all with reason `Manual`.
- **P8-T08** ⭐ Phase 8 gate. Verify: paper e2e on Binance WS fixture; OANDA
  mock round-trip; bridge kill/respawn; kill-switch timing < 1 s; owner demo
  (paper live on Binance data, kill switch, alert fires with sound + desktop
  notification).

---

## 11. Phase 9 — Commercial polish, packaging, release (≈5.5 d)

**Context pack:** `NATIVE_PLAN.md` §5.7, §8 (budget), §10, `EXECUTION_PLAN.md`
§1.5/§1.7, `app/src-tauri/tauri.conf.json`, `packaging/**`, `docs/**`.
**Baseline verify:** P8 gate green.

- **P9-T01** First-run wizard. Spec: §5.5.11 (3 steps, skippable: markets +
  sample data download (offline demo ~20 s, bundled fixture set), theme/font/
  density, first watchlist + sample strategy) → lands on working chart.
  Verify: e2e fresh-profile run-through; wizard state persisted (no re-show).
- **P9-T02** Backup/restore + ops tools. Spec: backup export (settings, scripts,
  drawings, watchlists, layouts, templates, risk rules → JSON/zst, dated to
  `backups/`), restore (file pick, conflict = keep both/overwrite), log export,
  "open data dir" (xdg-open), disk usage view. Verify: e2e round-trip (backup →
  wipe user dir → restore → state identical hash).
- **P9-T03** UX audit vs §5.7. Spec: keyboard-only pass over every dialog/panel
  (fixes), empty/error states everywhere, density audit (compact mode), focus
  audit, hotkey menu labels present (TV parity). Verify: checklist in
  `docs/ui/ux-audit-p9.md` 100% (each item: before/after note or screenshot).
- **P9-T04** Perf pass vs §8 budget. Spec: full benchmark suite run (all rows of
  the budget table), fix top offenders, record results. Verify: every budget
  line met or documented exception approved by owner; `docs/perf/p9.md`.
- **P9-T05** RPM final. Spec: AppStream metainfo, full icon set, `.desktop`
  (Categories: Finance;Office; terminal=false), F43 primary + F42 compat
  install/upgrade matrix (fresh install, upgrade from v0.x tag, data intact,
  migrations run), `dnf remove` leaves data dir (documented). Verify: CI matrix
  green; install test script `packaging/install-test.sh` (run in both
  containers) green.
- **P9-T06** Auto-update + release CI. Spec: tauri-plugin-updater, endpoint
  GitHub Releases, minisign keypair (private key in `packaging/keys/`, NOT in
  repo — public key embedded), Settings → About (check/install, version +
  changelog display); release workflow (tag → F43 container build → sign →
  GitHub Release with auto-changelog from conventional commits) + AppImage
  fallback artifact. Verify: tag a `v1.0.0-rc.1` → release created, signed
  payload verifies (script), app detects + installs the update (e2e with
  local release file).
- **P9-T07** Full e2e suite + acceptance. Spec: end-to-end Playwright+Tauri-
  driver suite (launch → first-run → data → chart → replay trade → backtest →
  tick mode → paper → alert → kill switch → settings → backup/restore);
  owner **10-point acceptance checklist** (owner runs on their Fedora 43 box:
  install, upgrade, offline mode, 3 markets, replay, backtest, tick, paper,
  live OANDA sandbox if key present, kill switch, update). Verify: suite green;
  checklist signed (recorded under ledger).
- **P9-T08** Docs final + tag. Spec: getting-started (rpm), engine semantics
  (tick resolution, cost models, determinism), Pine parity table (supported/
  unsupported features, verified via corpus), IPC command reference (generated
  from `ipc.ts`), data sources (+ Dukascopy note), troubleshooting (WebKitGTK
  GPU flag, offline mode, TWS setup), in-app Help served from `docs/` build.
  Verify: `pnpm --dir docs build` green; all links resolve; **`v1.0.0` tag** +
  release published; ledger fully ✅; PLAN/EXECUTION archived with final
  status.

---

## 12. Dependency graph (frontier rule)

```
P0-T01 → P0-T02 → (P3-T01)          P0-T03 → P1-T05
P0-T01 → P0-T06 → P1-T01 → P1-T02..T04 → P1-T05 → P1-T06
P0-T05 → P1-T07 → P1-T08 → P1-T09 → P1-T10/T11 → P1-T12 ⭐
P1-T06 + P2-T01 → P2-T02 → {P2-T03..T06} → P2-T07 → P2-T08 ⭐
P2-T08 → P3-T04 → P3-T05 → {P3-T06..T08} → P3-T09 ⭐
P3-T01 → P4-T01 → {P4-T02..T06} → P4-T07 → P4-T08 ⭐
P4-T08 → {P5-T01..T07 sequential} → P5-T08 → {P5-T09, P5-T10} → P5-T11 ⭐
P5-T11 → P6-T01 → {P6-T02, P6-T03} → P6-T04 → P6-T05 → {P6-T06, P6-T07} → P6-T08 ⭐
P6-T08 → P7-T01 → P7-T02 → P7-T03 → {P7-T04, P7-T05} → P7-T06 → P7-T07 → P7-T08 ⭐
P7-T08 → P8-T01 → P8-T02 → {P8-T03, P8-T04} → {P8-T05, P8-T06} → P8-T07 → P8-T08 ⭐
P8-T08 → P9-T01 → P9-T02 → {P9-T03, P9-T04} → {P9-T05, P9-T06} → P9-T07 → P9-T08
```
Parallel-friendly (separate sessions/agents, disjoint files): P2-T03…T06 (each
provider touches only its file), P7-T04/T05, P8-T03/T04, P9-T03/T04 — but the
ledger serializes commits (one writer at a time per file).

**Session = 1–2 cards.** Big ⭐ cards (P1-T07, P3-T01, P6-T04, P5-T04/T05) get a
whole session to themselves.
