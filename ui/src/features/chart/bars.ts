/**
 * Chart data layer (P1-T07) — deterministic fixture bars + transforms.
 *
 * `synthBars` is the fixture provider the UI runs on until the data layer
 * (Phase 2) wires real IPC history: seeded, so every mount shows the same
 * series for a given symbol/timeframe/count. `heikinAshi` feeds the
 * Heikin-Ashi chart type. Time stays in **milliseconds** here (the frozen
 * `Bar` contract); conversion to LWC's UTCTimestamp (seconds) happens in the
 * controller (`toLwcTime`).
 */

import type { Bar, Tf } from "../../lib/ipc";

/** Seeded PRNG (mulberry32) — same recipe as the P0-T05 spike bench. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Timeframe length in seconds (LWC UTCTimestamp granularity). */
export const TF_SECONDS: Record<Tf, number> = {
  "1s": 1,
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "4h": 14400,
  "1d": 86400,
  "1w": 604800,
  "1M": 2592000, // 30d bucket — synthetic fixture only
};

/** Stable per-symbol seed so BTCUSDT always charts the same fixture. */
function symbolSeed(symbol: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < symbol.length; i++) {
    h ^= symbol.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Base price scale per fixture symbol class (crypto/fx/stock buckets). */
function basePrice(symbol: string): number {
  const s = symbol.toUpperCase();
  if (s.includes("BTC")) return 60_000;
  if (s.includes("ETH")) return 3_000;
  if (s.startsWith("EUR") || s.startsWith("GBP") || s.startsWith("USD")) return 1.08;
  if (s.includes("XAU")) return 2_300;
  return 180; // stock-ish default
}

/**
 * Deterministic synthetic OHLCV series (GBM-flavoured random walk with
 * occasional 3σ impulse bars so wicks/gaps show up in demos).
 */
export function synthBars(symbol: string, tf: Tf, count: number, seed = 0): Bar[] {
  const rnd = mulberry32((symbolSeed(symbol) ^ (seed * 2654435761)) >>> 0);
  const stepMs = TF_SECONDS[tf] * 1000;
  const t0 = 1_600_000_000_000 - ((count - 1) * stepMs);
  const vol = basePrice(symbol) * 0.012; // per-bar stddev
  const bars: Bar[] = [];
  let price = basePrice(symbol);
  for (let i = 0; i < count; i++) {
    const open = price;
    const impulse = rnd() < 0.01 ? (rnd() - 0.5) * 8 : 0;
    const close = Math.max(price * 0.5, open + (rnd() - 0.5) * 2 * vol + impulse * vol);
    const high = Math.max(open, close) + rnd() * vol * 0.8;
    const low = Math.min(open, close) - rnd() * vol * 0.8;
    const volume = Math.round(10 + rnd() * 990 + Math.abs(impulse) * 400);
    bars.push({
      time: t0 + i * stepMs,
      open: round(open),
      high: round(high),
      low: round(low),
      close: round(close),
      volume,
    });
    price = close;
  }
  return bars;
}

function round(v: number): number {
  return Math.round(v * 100000) / 100000;
}

/**
 * Heikin-Ashi transform: HA-close = (o+h+l+c)/4; HA-open = (prev HA-open +
 * prev HA-close)/2, seeded with (o+c)/2; HA-high/low envelope the body and
 * the raw wicks.
 */
export function heikinAshi(bars: Bar[]): Bar[] {
  const out: Bar[] = [];
  let prevOpen = 0;
  let prevClose = 0;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]!;
    const haClose = (b.open + b.high + b.low + b.close) / 4;
    const haOpen = i === 0 ? (b.open + b.close) / 2 : (prevOpen + prevClose) / 2;
    out.push({
      time: b.time,
      open: round(haOpen),
      high: round(Math.max(b.high, haOpen, haClose)),
      low: round(Math.min(b.low, haOpen, haClose)),
      close: round(haClose),
      volume: b.volume,
    });
    prevOpen = haOpen;
    prevClose = haClose;
  }
  return out;
}

/** ms epoch → LWC UTCTimestamp (seconds). */
export function toLwcTime(ms: number): number {
  return Math.floor(ms / 1000);
}

/** Theme-independent rgba from a `#rrggbb` color (volume transparency). */
export function hexToRgba(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
