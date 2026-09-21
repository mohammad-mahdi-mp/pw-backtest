/**
 * IPC contract — **single source of truth** (frozen, EXECUTION_PLAN.md §1.3/§1.4).
 *
 * Every Tauri command and event is declared here: names, argument objects,
 * and return types. The Rust side (`app/src-tauri/src/commands.rs` and the
 * future per-feature modules) implements exactly against this file; the
 * round-trip fixtures in `core/tests/contracts/*.json` pin the wire bytes on
 * the Rust side. Growth only via `contract:` tasks that update
 * EXECUTION_PLAN.md §1.3/§1.4 and this file together.
 *
 * Wire-format conventions:
 * - Command payload fields are **camelCase** (mirrors `serde(rename_all =
 *   "camelCase")` on the app-level Rust structs).
 * - Engine-domain types (`Bar`, `Tick`, `Order`, `Fill`, `EngineEvent`, …)
 *   stay **snake_case** — their serde shape is pinned by the golden fixtures
 *   and must not be re-mapped.
 * - Unimplemented commands reject with [`PwIpcError`] code
 *   `"not_implemented"` so the UI can render explicit stub states.
 */

// ---------------------------------------------------------------------------
// Engine-domain mirrors (snake_case, pinned by golden fixtures)
// ---------------------------------------------------------------------------

/** UTC timestamp in milliseconds. */
export type Timestamp = number;

export interface Bar {
  time: Timestamp;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Tick {
  time: Timestamp;
  price: number;
  /** 0 = unknown. */
  volume: number;
}

export type Side = "Buy" | "Sell";
export type Direction = "Long" | "Short";
export type OrderType = "Market" | "Limit" | "Stop" | "StopLimit" | "Bracket";
export type FillModel = "NextOpen" | "BarClose" | "Tick";
export type FillReason =
  | "Market"
  | "Limit"
  | "Stop"
  | "StopLimit"
  | "Sl"
  | "Tp"
  | "Signal"
  | "Manual"
  | "Trailing";

export type TrailingKind = "Atr" | "Pct";

export interface TrailingSpec {
  kind: TrailingKind;
  /** ATR periods (Atr) or fraction of price (Pct). */
  value: number;
}

/** External-tagged `TimeInForce`: `"Gtc"`, `"FillAndKill"`, or `{"Gtd": ts}`. */
export type TimeInForce = "Gtc" | "FillAndKill" | { Gtd: Timestamp };

export interface Order {
  id: number;
  symbol: string;
  side: Side;
  orderType: OrderType;
  price: number | null;
  size: number;
  stopLoss: number | null;
  takeProfit: number | null;
  trailing: TrailingSpec | null;
  tif: TimeInForce;
  reduceOnly: boolean;
  createdAt: Timestamp;
  /** `"scratch"` marks what-if (replay scratchpad) orders. */
  tag: string | null;
}

export interface Fill {
  orderId: number;
  symbol: string;
  side: Side;
  price: number;
  size: number;
  fee: number;
  time: Timestamp;
  reason: FillReason;
}

/** Engine events — mirror of `pw_engine::events::EngineEvent` (§1.2). */
export type EngineEvent =
  | { OrderFilled: Fill }
  | {
      PositionOpened: {
        symbol: string;
        side: Direction;
        size: number;
        entryPrice: number;
        entryTime: Timestamp;
        stopLoss: number | null;
        takeProfit: number | null;
        commission: number;
      };
    }
  | {
      PositionIncreased: {
        symbol: string;
        size: number;
        avgPrice: number;
        added: number;
        time: Timestamp;
        commission: number;
      };
    }
  | {
      PositionReduced: {
        symbol: string;
        side: Direction;
        entryPrice: number;
        entryTime: Timestamp;
        exitPrice: number;
        exitTime: Timestamp;
        closedSize: number;
        remainingSize: number;
        pnl: number;
        commission: number;
        reason: FillReason;
      };
    }
  | {
      PositionClosed: {
        symbol: string;
        side: Direction;
        size: number;
        entryPrice: number;
        entryTime: Timestamp;
        exitPrice: number;
        exitTime: Timestamp;
        pnl: number;
        commission: number;
        reason: FillReason;
      };
    }
  | { PendingPlaced: Order }
  | { PendingCancelled: { orderId: number; time: Timestamp; reason: string } }
  | { MarkedToMarket: { symbol: string; time: Timestamp; price: number; equity: number } }
  | { RiskBlocked: { orderId: number; rule: string; message: string } }
  | { Signal: { symbol: string; time: Timestamp; kind: string } };

// ---------------------------------------------------------------------------
// Shared value types (§1.3)
// ---------------------------------------------------------------------------

export type Tf = "1s" | "1m" | "5m" | "15m" | "1h" | "4h" | "1d" | "1w" | "1M";

export type Provider = "binance" | "yahoo" | "oanda" | "dukascopy" | "csv";

export type Sizing =
  | { kind: "percent"; pct: number; atr?: number }
  | { kind: "atr"; riskPct: number; mult: number }
  | { kind: "fixed"; units: number };

/** Closed-trade row = PositionClosed + excursion/holding extras (§1.3). */
export interface TradeRow {
  symbol: string;
  side: Direction;
  size: number;
  entryPrice: number;
  entryTime: Timestamp;
  exitPrice: number;
  exitTime: Timestamp;
  pnl: number;
  commission: number;
  reason: FillReason;
  mae: number;
  mfe: number;
  holdingBars: number;
  exitReason: string;
}

/**
 * Metrics mirror — names match the reference `metrics.py` / Rust port
 * (P4-T02). Grows only via contract tasks.
 */
export interface Metrics {
  netPnl: number;
  returnPct: number;
  cagrPct: number;
  sharpe: number;
  sortino: number;
  maxDrawdownPct: number;
  profitFactor: number;
  trades: number;
  winRate: number;
  expectancy: number;
}

export interface RunMeta {
  runId: string;
  codeHash: string;
  dataHash: string;
  engineVersion: string;
  params: Record<string, number>;
  symbol: string;
  timeframe: Tf;
  mode: "bars" | "tick";
  createdAt: Timestamp;
}

export interface FoldRow {
  fold: number;
  trainStart: Timestamp;
  trainEnd: Timestamp;
  testStart: Timestamp;
  testEnd: Timestamp;
  params: Record<string, number>;
  metrics: Metrics;
}

// ---------------------------------------------------------------------------
// Commands (§1.3) — declared here, implemented in Rust, typed for the UI
// ---------------------------------------------------------------------------

/** Payload of the `app_hello` command (implemented in P0-T03). */
export interface HelloInfo {
  message: string;
  version: string;
  configDir: string;
  configLoaded: boolean;
}

export interface DataBarsGetQuery {
  symbol: string;
  timeframe: Tf;
  from?: Timestamp;
  to?: Timestamp;
  mode?: "bars" | "ticks";
}

export type DataBarsGetResult = { bars: Bar[] } | { ticks: Tick[] };

export interface DataDownloadArgs {
  symbol: string;
  timeframe: Tf;
  from: Timestamp;
  to: Timestamp;
  provider: Provider;
  ticks: boolean;
}

export interface ReplayPlaceOrderArgs {
  sessionId: string;
  order: Omit<Order, "id">;
}

export interface ReplayPlaceOrderResult {
  ok: boolean;
  order?: Order;
  events: EngineEvent[];
}

export interface BtRunJob {
  code: string;
  symbol: string;
  timeframe: Tf;
  from: Timestamp;
  to: Timestamp;
  fillModel: FillModel;
  startingCapital: number;
  sizing: Sizing;
  riskRules: "on" | "off";
  params?: Record<string, number>;
}

export interface BtRunGetResult {
  run: RunMeta;
  metrics: Metrics;
  equity: Bar[];
  trades: TradeRow[];
  folds?: FoldRow[];
}

export interface AppSettingsSetArgs {
  section: string;
  patch: Record<string, unknown>;
}

/**
 * `screenshots_save` (P1-T08, §5.4 Alt+S): persists a chart PNG snapshot
 * under `<data_dir>/screenshots/`. `name` is a display stem (e.g.
 * `"BTCUSDT 1d"`); the Rust side sanitizes it and de-duplicates collisions.
 */
export interface ScreenshotSaveArgs {
  name?: string;
  /** PNG payload, base64-encoded. */
  dataBase64: string;
}

export interface ScreenshotSaved {
  /** Absolute path of the written PNG. */
  path: string;
}

// ---------------------------------------------------------------------------
// Invocation plumbing
// ---------------------------------------------------------------------------

/** Structured IPC failure surfaced through the whole UI (toasts, banners). */
export class PwIpcError extends Error {
  readonly code: "not_implemented" | "bridge_unavailable" | "command_failed";

  constructor(code: PwIpcError["code"], message: string) {
    super(message);
    this.name = "PwIpcError";
    this.code = code;
  }
}

/** Commands with a live Rust implementation. Grows as each card lands its
 * Rust side; everything else stays a typed `not_implemented` stub. */
const IMPLEMENTED: ReadonlySet<string> = new Set(["app_hello", "screenshots_save"]);

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!IMPLEMENTED.has(command)) {
    throw new PwIpcError(
      "not_implemented",
      `command '${command}' is declared by the contract but not implemented yet`,
    );
  }
  try {
    return await invoke<T>(command, args);
  } catch (err) {
    if (err instanceof PwIpcError) throw err;
    // No Tauri runtime (plain browser) or command failure on the Rust side.
    throw new PwIpcError("bridge_unavailable", String(err));
  }
}

// — dynamic import keeps `vite build` working in plain-browser contexts —
async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const core = await import("@tauri-apps/api/core");
  return core.invoke<T>(command, args);
}

// ---------------------------------------------------------------------------
// Typed command surface
// ---------------------------------------------------------------------------

export const appHello = (): Promise<HelloInfo> => call<HelloInfo>("app_hello");

export const dataBarsGet = (query: DataBarsGetQuery): Promise<DataBarsGetResult> =>
  call<DataBarsGetResult>("data_bars_get", { ...query });

export const dataDownload = (args: DataDownloadArgs): Promise<{ jobId: string }> =>
  call<{ jobId: string }>("data_download", { ...args });

export const replayPlaceOrder = (
  args: ReplayPlaceOrderArgs,
): Promise<ReplayPlaceOrderResult> =>
  call<ReplayPlaceOrderResult>("replay_place_order", { ...args });

export const btRun = (job: BtRunJob): Promise<{ runId: string }> =>
  call<{ runId: string }>("bt_run", { job });

export const btRunGet = (runId: string): Promise<BtRunGetResult> =>
  call<BtRunGetResult>("bt_run_get", { runId });

export const appSettingsSet = (args: AppSettingsSetArgs): Promise<{ ok: boolean }> =>
  call<{ ok: boolean }>("app_settings_set", { ...args });

/**
 * Saves a chart PNG snapshot to `<data_dir>/screenshots/` (Alt+S). The Rust
 * command takes one struct argument (`data`), hence the wrapper shape.
 */
export const screenshotsSave = (args: ScreenshotSaveArgs): Promise<ScreenshotSaved> =>
  call<ScreenshotSaved>("screenshots_save", { data: { ...args } });

// ---------------------------------------------------------------------------
// Events (§1.4) — names + payload types; subscription runtime lands in P1-T06
// ---------------------------------------------------------------------------

export const EVENT = {
  barsLoaded: (paneId: string) => `bars:loaded:${paneId}`,
  downloadProgress: (jobId: string) => `download:progress:${jobId}`,
  replayEvents: (sessionId: string) => `replay:events:${sessionId}`,
  paperEvents: (sessionId: string) => `paper:events:${sessionId}`,
  btProgress: (runId: string) => `bt:progress:${runId}`,
  riskEvents: (sessionId: string) => `risk:events:${sessionId}`,
  alertsTriggered: (alertId: string) => `alerts:triggered:${alertId}`,
  feedStatus: "feed:status",
  bridgeStatus: "bridge:status",
} as const;

export interface BarsLoadedPayload {
  symbol: string;
  timeframe: Tf;
  count: number;
}

export interface DownloadProgressPayload {
  pct: number;
  phase: string;
  symbol: string;
  timeframe: Tf;
}

export interface ReplayEventsPayload {
  events: EngineEvent[];
  cursor: Timestamp;
  equity: number;
}

export interface PaperEventsPayload {
  events: EngineEvent[];
  equity: number;
  position: number;
}

export interface BtProgressPayload {
  pct: number;
  phase: string;
  current?: string;
}

export interface RiskEventsPayload {
  events: EngineEvent[];
}

export interface AlertsTriggeredPayload {
  alert: unknown;
  value: number;
  time: Timestamp;
}

export interface FeedStatusPayload {
  state: "live" | "replay" | "offline";
  lastTs: Timestamp | null;
  symbol?: string;
}

export interface BridgeStatusPayload {
  state: "off" | "running" | "error";
  detail?: string;
}
