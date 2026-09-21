/**
 * Chart interactions (P1-T08) — pure logic for the §5.4 behavioral spec:
 * timeframe order + hotkey mapping, cursor-anchored zoom / pan range math,
 * OHLC legend formatting, and the data window.
 *
 * Everything exported here is deterministic and unit-tested
 * (`interactions.test.ts`); the DOM wiring lives in `ChartPane.tsx`, the
 * controller methods in `chartController.ts`, and the global pane registry
 * (bottom of this file) lets the shell toolbar / hotkeys reach the active
 * pane's controller without prop-drilling.
 *
 * Native vs. custom split (§5.4): the mouse wheel (cursor-anchored time
 * zoom), left/middle drag pan, and price-scale drag are LWC v5 native
 * (verified against the installed 5.2.1 build). This module owns what LWC
 * does not: keyboard zoom/pan/TF jumps, scale toggling, legend, data
 * window, snapshot routing, and the Shift+drag rubber-band math.
 */

import type { Bar, Tf } from "../../lib/ipc";

// ---------------------------------------------------------------------------
// Timeframes
// ---------------------------------------------------------------------------

/** All timeframes, coarsest-last (contract §1.3 `Tf`). */
export const TF_ORDER: readonly Tf[] = ["1s", "1m", "5m", "15m", "1h", "4h", "1d", "1w", "1M"];

/** Ctrl+1…7 → 1m/5m/15m/1h/4h/D/W (§5.6 TV parity). */
export const TF_QUICK: Readonly<Record<string, Tf>> = {
  "1": "1m",
  "2": "5m",
  "3": "15m",
  "4": "1h",
  "5": "4h",
  "6": "1d",
  "7": "1w",
};

/** Bare-key direct jumps (D / W / M — §5.4, TV defaults). */
export const TF_DIRECT: Readonly<Record<string, Tf>> = { d: "1d", w: "1w", m: "1M" };

export function isTf(v: unknown): v is Tf {
  return typeof v === "string" && (TF_ORDER as readonly string[]).includes(v);
}

/** Next timeframe in `TF_ORDER` (wraps 1M → 1s). */
export function nextTf(tf: Tf): Tf {
  const i = TF_ORDER.indexOf(tf);
  return TF_ORDER[(i + 1) % TF_ORDER.length]!;
}

/** Previous timeframe in `TF_ORDER` (wraps 1s → 1M). */
export function prevTf(tf: Tf): Tf {
  const i = TF_ORDER.indexOf(tf);
  return TF_ORDER[(i - 1 + TF_ORDER.length) % TF_ORDER.length]!;
}

// ---------------------------------------------------------------------------
// Zoom / pan range math (logical bar indices)
// ---------------------------------------------------------------------------

/** Visible logical range (bar indices; the right edge may sit past the last bar). */
export interface LogicalRange {
  from: number;
  to: number;
}

/**
 * Minimum span (bars) for keyboard/rubber-band zoom — keeps a single click
 * or a 1-px drag from degenerating into an unreadable 1-bar view.
 */
export const MIN_BAR_SPAN = 5;

/** Cursor-anchored zoom: the position under `anchorLogical` stays put while
 * the span is multiplied by `factor` (<1 zooms in, >1 zooms out). */
export function zoomRangeAt(range: LogicalRange, anchorLogical: number, factor: number): LogicalRange {
  const from = anchorLogical - (anchorLogical - range.from) * factor;
  return { from, to: from + (range.to - range.from) * factor };
}

/** Zoom around the range center (ArrowUp/Down), clamped to the data. */
export function zoomCenter(range: LogicalRange, factor: number, barCount: number): LogicalRange {
  const center = (range.from + range.to) / 2;
  return clampRange(zoomRangeAt(range, center, factor), barCount);
}

/** Shift the visible window by `delta` bars (ArrowLeft/Right), clamped. */
export function stepRange(range: LogicalRange, delta: number, barCount: number): LogicalRange {
  return clampRange({ from: range.from + delta, to: range.to + delta }, barCount);
}

/**
 * Clamp a range to sane bounds: span within [MIN_BAR_SPAN, barCount], and
 * the window inside [0, barCount] (the window may start left of bar 0
 * visually in LWC, but the fixture data ends at index barCount).
 */
export function clampRange(range: LogicalRange, barCount: number): LogicalRange {
  if (barCount <= 0) return { from: 0, to: 0 };
  let { from, to } = range;
  let span = to - from;
  if (!(span > 0)) {
    const c = (from + to) / 2;
    from = c - MIN_BAR_SPAN / 2;
    to = c + MIN_BAR_SPAN / 2;
    span = MIN_BAR_SPAN;
  }
  if (span < MIN_BAR_SPAN) {
    const c = (from + to) / 2;
    from = c - MIN_BAR_SPAN / 2;
    to = c + MIN_BAR_SPAN / 2;
    span = MIN_BAR_SPAN;
  }
  const maxSpan = Math.max(barCount, MIN_BAR_SPAN);
  if (span > maxSpan) {
    const c = (from + to) / 2;
    from = c - maxSpan / 2;
    to = c + maxSpan / 2;
    span = maxSpan;
  }
  if (from < 0) {
    from = 0;
    to = span;
  }
  if (to > barCount) {
    to = barCount;
    from = to - span;
  }
  return { from, to };
}

// ---------------------------------------------------------------------------
// Keyboard hotkeys (§5.4 + §5.6) — pure mapping, no DOM
// ---------------------------------------------------------------------------

/** Per-press keyboard zoom factors (Up = in, Down = out; TV-feel asymmetry). */
export const ZOOM_IN_FACTOR = 0.8;
export const ZOOM_OUT_FACTOR = 1.25;

export type ChartKeyAction =
  | { kind: "step"; delta: number }
  | { kind: "zoom"; factor: number }
  | { kind: "tf"; tf: Tf }
  | { kind: "scale-toggle" }
  | { kind: "snapshot" };

export interface ChartKeyInput {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

/** True while typing — chart hotkeys must never fire from inputs. */
export function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)
  );
}

/**
 * Chart keys only act when focus is on the chart itself (the pane host —
 * `data-chart-host`) or on the document body. Anywhere else (grids, menus,
 * dialogs, hotkey recorders) the event belongs to that widget.
 */
export function chartKeyTargetOk(target: EventTarget | null): boolean {
  if (target === null) return false;
  if (target instanceof Element && target.closest("[data-chart-host]") !== null) return true;
  return target === document.body;
}

/**
 * Maps a keydown to a chart action, or null when the key is not a chart
 * hotkey (in which case the caller must not preventDefault).
 *
 *   arrows      ±1 bar (←/→) · zoom in/out (↑/↓)
 *   + / −       next / prev timeframe
 *   Ctrl+1…7    1m/5m/15m/1h/4h/D/W
 *   D / W / M   direct 1d/1w/1M
 *   Alt+L       normal/log scale toggle
 *   Alt+S       snapshot
 */
export function chartKeyAction(e: ChartKeyInput, target: EventTarget | null, tf: Tf): ChartKeyAction | null {
  if (isTypingTarget(target) || !chartKeyTargetOk(target)) return null;

  if (e.ctrlKey && !e.altKey && !e.metaKey) {
    const quick = TF_QUICK[e.key];
    if (quick) return { kind: "tf", tf: quick };
    return null;
  }
  // `+` is `Shift+=` on US layouts — accept it as a bare TF key.
  if (e.key === "+") return { kind: "tf", tf: nextTf(tf) };
  if (e.metaKey || e.shiftKey) return null;
  if (e.altKey) {
    const k = e.key.toLowerCase();
    if (k === "l") return { kind: "scale-toggle" };
    if (k === "s") return { kind: "snapshot" };
    return null;
  }
  switch (e.key) {
    case "ArrowLeft":
      return { kind: "step", delta: -1 };
    case "ArrowRight":
      return { kind: "step", delta: 1 };
    case "ArrowUp":
      return { kind: "zoom", factor: ZOOM_IN_FACTOR };
    case "ArrowDown":
      return { kind: "zoom", factor: ZOOM_OUT_FACTOR };
    case "=":
      return { kind: "tf", tf: nextTf(tf) };
    case "-":
    case "_":
      return { kind: "tf", tf: prevTf(tf) };
    default:
      break;
  }
  const direct = TF_DIRECT[e.key.toLowerCase()];
  return direct ? { kind: "tf", tf: direct } : null;
}

// ---------------------------------------------------------------------------
// OHLC legend (§5.4: `SYM TF · O H L C Δ%`, values colored by direction)
// ---------------------------------------------------------------------------

export type LegendTone = "text" | "up" | "down";

export interface LegendSeg {
  text: string;
  tone: LegendTone;
}

/**
 * Display precision by price magnitude (no per-symbol precision table yet —
 * the symbol layer lands in P1-T10/P2). Rounding is display-only, per the
 * guardrail: engine math stays f64, we only format here.
 */
export function formatPrice(p: number): string {
  if (!Number.isFinite(p)) return "—";
  const digits = p >= 1000 ? 2 : p >= 1 ? 4 : 5;
  return p.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Close vs. previous close (falls back to this bar's open for bar 0). */
export function ohlcDeltaPct(bar: Bar, prev: Bar | null): number {
  const ref = prev ? prev.close : bar.open;
  if (ref === 0) return 0;
  return ((bar.close - ref) / ref) * 100;
}

/**
 * Legend segments for one bar: `SYM TF` (plain) + `O H L C` (colored by the
 * bar's own direction) + `Δ%` (colored by close vs. previous close).
 */
export function legendSegments(symbol: string, tf: Tf, bar: Bar, prev: Bar | null): LegendSeg[] {
  const dirUp = bar.close >= bar.open;
  const dirTone: LegendTone = dirUp ? "up" : "down";
  const d = ohlcDeltaPct(bar, prev);
  return [
    { text: `${symbol} ${tf}`, tone: "text" },
    { text: `O ${formatPrice(bar.open)}`, tone: dirTone },
    { text: `H ${formatPrice(bar.high)}`, tone: dirTone },
    { text: `L ${formatPrice(bar.low)}`, tone: dirTone },
    { text: `C ${formatPrice(bar.close)}`, tone: dirTone },
    { text: `${d >= 0 ? "+" : ""}${d.toFixed(2)}%`, tone: d >= 0 ? "up" : "down" },
  ];
}

// ---------------------------------------------------------------------------
// Data window (recent bars table, bottom-left, toggle)
// ---------------------------------------------------------------------------

export interface DataWindowRow {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /** The bar under the crosshair (rendered first, highlighted). */
  focused: boolean;
}

const DATA_WINDOW_DEFAULT_ROWS = 8;

/**
 * Rows for the data window: the focused (crosshair) bar first when present,
 * then the most recent bars in chronological order (oldest → newest, bottom
 * of the table = latest, TV convention).
 */
export function dataWindowRows(
  bars: Bar[],
  focusIndex: number | null,
  count: number = DATA_WINDOW_DEFAULT_ROWS,
): DataWindowRow[] {
  if (bars.length === 0) return [];
  const n = bars.length;
  const rows: DataWindowRow[] = [];
  const push = (i: number, focused: boolean): void => {
    const b = bars[i]!;
    rows.push({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume, focused });
  };
  const focusOk = focusIndex !== null && focusIndex >= 0 && focusIndex < n;
  if (focusOk) push(focusIndex!, true);
  const start = Math.max(0, n - count);
  for (let i = start; i < n; i++) {
    if (focusOk && i === focusIndex) continue; // already on top
    push(i, false);
  }
  return rows;
}

/**
 * Bar-time cell: intraday → `HH:MM:SS` UTC, daily-and-above → `YYYY-MM-DD`
 * (fixture data is UTC; the timezone selector lands in the chart properties
 * panel, P1-T11).
 */
export function formatBarTime(tf: Tf, ms: number): string {
  const tfSeconds: Record<Tf, number> = {
    "1s": 1,
    "1m": 60,
    "5m": 300,
    "15m": 900,
    "1h": 3600,
    "4h": 14400,
    "1d": 86400,
    "1w": 604800,
    "1M": 2592000,
  };
  const d = new Date(ms);
  if (tfSeconds[tf] >= 86400) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  const h = String(d.getUTCHours()).padStart(2, "0");
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  const s = String(d.getUTCSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

// ---------------------------------------------------------------------------
// Active-pane registry (shell toolbar / snapshot button reach the chart)
// ---------------------------------------------------------------------------

import type { ChartController } from "./chartController";

/** Everything the shell needs to drive one mounted chart pane. */
export interface ChartPaneBinding {
  /** Stable pane id: `pane-<index>` in the shell, `pane-dev` on the dev board. */
  id: string;
  controller: ChartController;
  /** Alt+S / toolbar 📷 — clipboard + `screenshots/` via IPC + toast. */
  snapshot: () => void;
}

const bindings = new Map<string, ChartPaneBinding>();

/** Registers a pane binding; returns the unregister callback. */
export function registerChartPane(id: string, binding: ChartPaneBinding): () => void {
  bindings.set(id, binding);
  return () => {
    if (bindings.get(id) === binding) bindings.delete(id);
  };
}

/** The current binding for a pane id (toolbar snapshot, future layout code). */
export function chartPaneBinding(id: string): ChartPaneBinding | undefined {
  return bindings.get(id);
}

/** Test hook — the module map survives across tests in one vitest run. */
export function clearChartPanes(): void {
  bindings.clear();
}
