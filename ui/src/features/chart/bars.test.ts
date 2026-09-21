/**
 * P1-T07 tests — fixture bar synthesis + transforms (pure functions).
 */

import { describe, expect, it } from "vitest";

import type { Bar, Tf } from "../../lib/ipc";
import {
  TF_SECONDS,
  heikinAshi,
  hexToRgba,
  synthBars,
  toLwcTime,
} from "./bars";

const TFS: Tf[] = ["1s", "1m", "5m", "15m", "1h", "4h", "1d", "1w", "1M"];

describe("synthBars", () => {
  it("is deterministic for the same symbol/tf/count", () => {
    const a = synthBars("BTCUSDT", "1d", 500);
    const b = synthBars("BTCUSDT", "1d", 500);
    expect(a).toEqual(b);
  });

  it("varies per symbol but keeps the count", () => {
    const btc = synthBars("BTCUSDT", "1h", 300);
    const eth = synthBars("ETHUSDT", "1h", 300);
    expect(btc).toHaveLength(300);
    expect(eth).toHaveLength(300);
    expect(btc[0]!.close).not.toBe(eth[0]!.close);
  });

  it("keeps OHLC invariants and positive volume", () => {
    for (const tf of TFS) {
      const bars = synthBars("BTCUSDT", tf, 200);
      for (const b of bars) {
        expect(b.high).toBeGreaterThanOrEqual(Math.max(b.open, b.close));
        expect(b.low).toBeLessThanOrEqual(Math.min(b.open, b.close));
        expect(b.volume).toBeGreaterThan(0);
        expect(Number.isFinite(b.time)).toBe(true);
      }
    }
  });

  it("spaces timestamps by the timeframe", () => {
    for (const tf of TFS) {
      const bars = synthBars("BTCUSDT", tf, 50);
      const step = TF_SECONDS[tf] * 1000;
      expect(bars[1]!.time - bars[0]!.time).toBe(step);
      expect(bars[49]!.time - bars[0]!.time).toBe(49 * step);
    }
  });

  it("walks the price (no disconnected bars)", () => {
    const bars = synthBars("BTCUSDT", "1d", 100);
    for (let i = 1; i < bars.length; i++) {
      expect(bars[i]!.open).toBe(bars[i - 1]!.close);
    }
  });
});

describe("heikinAshi", () => {
  it("seeds HA-open with (o+c)/2 and averages close afterwards", () => {
    const bars: Bar[] = [
      { time: 0, open: 10, high: 12, low: 8, close: 11, volume: 1 },
      { time: 1, open: 11, high: 14, low: 10, close: 13, volume: 1 },
    ];
    const ha = heikinAshi(bars);
    expect(ha[0]!.close).toBeCloseTo((10 + 12 + 8 + 11) / 4, 10);
    expect(ha[0]!.open).toBeCloseTo((10 + 11) / 2, 10);
    // second HA-open = (HA-open₁ + HA-close₁) / 2
    expect(ha[1]!.open).toBeCloseTo((ha[0]!.open + ha[0]!.close) / 2, 10);
    expect(ha[1]!.close).toBeCloseTo((11 + 14 + 10 + 13) / 4, 10);
  });

  it("envelops the body with HA-high/low and keeps time", () => {
    const bars = synthBars("BTCUSDT", "1h", 200);
    const ha = heikinAshi(bars);
    expect(ha).toHaveLength(bars.length);
    for (let i = 0; i < ha.length; i++) {
      expect(ha[i]!.time).toBe(bars[i]!.time);
      expect(ha[i]!.high).toBeGreaterThanOrEqual(Math.max(ha[i]!.open, ha[i]!.close));
      expect(ha[i]!.low).toBeLessThanOrEqual(Math.min(ha[i]!.open, ha[i]!.close));
      expect(ha[i]!.high).toBeGreaterThanOrEqual(bars[i]!.low);
      expect(ha[i]!.low).toBeLessThanOrEqual(bars[i]!.high);
    }
  });
});

describe("helpers", () => {
  it("converts ms → LWC seconds", () => {
    expect(toLwcTime(1_600_000_000_123)).toBe(1_600_000_000);
  });

  it("converts theme hex to rgba for volume transparency", () => {
    expect(hexToRgba("#089981", 0.5)).toBe("rgba(8, 153, 129, 0.5)");
    expect(hexToRgba("#f23645", 1)).toBe("rgba(242, 54, 69, 1)");
    // non-hex passes through (LWC accepts named colors)
    expect(hexToRgba("transparent", 0.5)).toBe("transparent");
  });
});
