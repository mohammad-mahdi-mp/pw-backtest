/**
 * P1-T08 tests — pure interaction logic: TF order + hotkey mapping (§5.4/§5.6),
 * cursor-anchored zoom / pan math, OHLC legend, and the data window.
 */

import { describe, expect, it } from "vitest";
import {
  clampRange,
  chartKeyAction,
  chartKeyTargetOk,
  clearChartPanes,
  dataWindowRows,
  formatBarTime,
  formatPrice,
  isTf,
  legendSegments,
  nextTf,
  ohlcDeltaPct,
  prevTf,
  registerChartPane,
  chartPaneBinding,
  stepRange,
  TF_DIRECT,
  TF_ORDER,
  TF_QUICK,
  zoomCenter,
  zoomRangeAt,
  type ChartKeyInput,
} from "./interactions";
import { synthBars } from "./bars";
import type { Bar } from "../../lib/ipc";

function key(init: Partial<ChartKeyInput> = {}): ChartKeyInput {
  return { key: "", ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, ...init };
}

const BARS: Bar[] = synthBars("BTCUSDT", "1h", 100);

describe("timeframe order", () => {
  it("covers the contract Tf values exactly", () => {
    expect([...TF_ORDER]).toEqual(["1s", "1m", "5m", "15m", "1h", "4h", "1d", "1w", "1M"]);
  });

  it("next/prev wrap around the list", () => {
    expect(nextTf("15m")).toBe("1h");
    expect(nextTf("1M")).toBe("1s");
    expect(prevTf("15m")).toBe("5m");
    expect(prevTf("1s")).toBe("1M");
  });

  it("Ctrl+1…7 and D/W/M match the §5.6 table", () => {
    expect(TF_QUICK).toEqual({ "1": "1m", "2": "5m", "3": "15m", "4": "1h", "5": "4h", "6": "1d", "7": "1w" });
    expect(TF_DIRECT).toEqual({ d: "1d", w: "1w", m: "1M" });
  });

  it("isTf guards hydrated store values", () => {
    expect(isTf("1h")).toBe(true);
    expect(isTf("2h")).toBe(false);
    expect(isTf(12)).toBe(false);
    expect(isTf(undefined)).toBe(false);
  });
});

describe("zoom / pan math", () => {
  const RANGE = { from: 100, to: 200 };

  it("zoomRangeAt keeps the anchor put", () => {
    const z = zoomRangeAt(RANGE, 130, 0.5); // zoom in on the left-of-center
    expect(z.to - z.from).toBeCloseTo(50, 10);
    expect(z.from + (130 - z.from)).toBeCloseTo(130, 10); // anchor maps to itself
    // the anchor's relative position inside the range is preserved
    const relBefore = (130 - 100) / 100;
    const relAfter = (130 - z.from) / (z.to - z.from);
    expect(relAfter).toBeCloseTo(relBefore, 10);
  });

  it("zoomCenter zooms around the middle and clamps to the data", () => {
    const n = 100;
    const fit = { from: 0, to: n };
    const in1 = zoomCenter(fit, 0.5, n); // zoom in
    expect(in1.to - in1.from).toBeCloseTo(50, 10);
    const out = zoomCenter(in1, 100, n); // far zoom out → clamped to full data
    expect(out).toEqual({ from: 0, to: n });
  });

  it("stepRange shifts and clamps at the data edges", () => {
    const n = 100;
    const atEnd = { from: 95, to: 100 };
    expect(stepRange(atEnd, 5, n)).toEqual({ from: 100 - 5, to: 100 });
    const atStart = { from: 0, to: 5 };
    expect(stepRange(atStart, -3, n)).toEqual({ from: 0, to: 5 });
  });

  it("clampRange enforces the MIN_BAR_SPAN floor and data bounds", () => {
    const n = 100;
    expect(clampRange({ from: 10, to: 12 }, n).to - clampRange({ from: 10, to: 12 }, n).from).toBe(5);
    expect(clampRange({ from: -50, to: 20 }, n)).toEqual({ from: 0, to: 70 });
    expect(clampRange({ from: 0, to: 1000 }, n)).toEqual({ from: 0, to: 100 });
    expect(clampRange({ from: 0, to: 0 }, 0)).toEqual({ from: 0, to: 0 });
  });
});

describe("chartKeyAction (§5.4/§5.6)", () => {
  const body = document.body;
  const chartHost = (): HTMLElement => {
    const el = document.createElement("div");
    el.setAttribute("data-chart-host", "true");
    document.body.appendChild(el);
    return el;
  };

  it("maps navigation keys (on the chart host)", () => {
    const host = chartHost();
    expect(chartKeyAction(key({ key: "ArrowLeft" }), host, "1h")).toEqual({ kind: "step", delta: -1 });
    expect(chartKeyAction(key({ key: "ArrowRight" }), host, "1h")).toEqual({ kind: "step", delta: 1 });
    expect(chartKeyAction(key({ key: "ArrowUp" }), host, "1h")).toEqual({ kind: "zoom", factor: 0.8 });
    expect(chartKeyAction(key({ key: "ArrowDown" }), host, "1h")).toEqual({ kind: "zoom", factor: 1.25 });
    host.remove();
  });

  it("maps TF keys: +/− relative, Ctrl+1…7 quick, D/W/M direct", () => {
    const host = chartHost();
    // `+` arrives as `Shift+=` on US layouts — must still map.
    expect((chartKeyAction(key({ key: "+", shiftKey: true }), host, "1h") as { kind: string; tf: string }).tf).toBe("4h");
    expect((chartKeyAction(key({ key: "+" }), host, "1h") as { tf: string }).tf).toBe("4h");
    expect((chartKeyAction(key({ key: "=" }), host, "1h") as { tf: string }).tf).toBe("4h");
    expect((chartKeyAction(key({ key: "-" }), host, "1h") as { tf: string }).tf).toBe("15m");
    for (let i = 1; i <= 7; i++) {
      expect(chartKeyAction(key({ key: String(i), ctrlKey: true }), host, "1h")).toEqual({
        kind: "tf",
        tf: TF_QUICK[String(i)],
      });
    }
    expect(chartKeyAction(key({ key: "d" }), host, "1s")).toEqual({ kind: "tf", tf: "1d" });
    expect(chartKeyAction(key({ key: "W" }), host, "1s")).toEqual({ kind: "tf", tf: "1w" });
    expect(chartKeyAction(key({ key: "m" }), host, "1s")).toEqual({ kind: "tf", tf: "1M" });
    host.remove();
  });

  it("maps Alt+L (scale) and Alt+S (snapshot)", () => {
    const host = chartHost();
    expect(chartKeyAction(key({ key: "l", altKey: true }), host, "1h")).toEqual({ kind: "scale-toggle" });
    expect(chartKeyAction(key({ key: "S", altKey: true }), host, "1h")).toEqual({ kind: "snapshot" });
    host.remove();
  });

  it("ignores keys when focus is not on a chart (body is allowed, widgets are not)", () => {
    const grid = document.createElement("div");
    grid.setAttribute("role", "grid");
    document.body.appendChild(grid);
    expect(chartKeyAction(key({ key: "ArrowLeft" }), grid, "1h")).toBeNull();
    expect(chartKeyAction(key({ key: "d" }), grid, "1h")).toBeNull();
    grid.remove();
    // body: allowed (dev board / fresh focus)
    expect(chartKeyAction(key({ key: "ArrowLeft" }), body, "1h")).toEqual({ kind: "step", delta: -1 });
  });

  it("never fires from typing targets", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    expect(chartKeyAction(key({ key: "d" }), input, "1h")).toBeNull();
    expect(chartKeyAction(key({ key: "ArrowLeft" }), input, "1h")).toBeNull();
    input.remove();
  });

  it("does not swallow modifier combos that belong elsewhere", () => {
    const host = chartHost();
    expect(chartKeyAction(key({ key: "a", ctrlKey: true }), host, "1h")).toBeNull();
    expect(chartKeyAction(key({ key: "l", ctrlKey: true, shiftKey: true }), host, "1h")).toBeNull();
    expect(chartKeyAction(key({ key: "ArrowLeft", shiftKey: true }), host, "1h")).toBeNull();
    expect(chartKeyAction(key({ key: "x" }), host, "1h")).toBeNull();
    host.remove();
  });
});

describe("chartKeyTargetOk", () => {
  it("accepts the chart host, the host's descendants, and body", () => {
    const host = document.createElement("section");
    host.setAttribute("data-chart-host", "true");
    const inner = document.createElement("div");
    host.appendChild(inner);
    document.body.appendChild(host);
    expect(chartKeyTargetOk(host)).toBe(true);
    expect(chartKeyTargetOk(inner)).toBe(true);
    expect(chartKeyTargetOk(document.body)).toBe(true);
    expect(chartKeyTargetOk(null)).toBe(false);
    host.remove();
  });
});

describe("legend (§5.4)", () => {
  it("formats O/H/L/C + Δ% with direction tones", () => {
    const bar: Bar = { time: 0, open: 100, high: 110, low: 95, close: 105, volume: 1 };
    const prev: Bar = { time: -3600e3, open: 99, high: 101, low: 98, close: 100, volume: 1 };
    const segs = legendSegments("BTCUSDT", "1h", bar, prev);
    expect(segs.map((s) => s.text)).toEqual([
      "BTCUSDT 1h",
      "O 100.0000",
      "H 110.0000",
      "L 95.0000",
      "C 105.0000",
      "+5.00%",
    ]);
    expect(segs[0]!.tone).toBe("text");
    // rising bar → up tone on the OHLC values
    expect(segs.slice(1, 5).every((s) => s.tone === "up")).toBe(true);
    expect(segs[5]!.tone).toBe("up");
  });

  it("colors a falling bar down and a negative Δ% down", () => {
    const bar: Bar = { time: 0, open: 105, high: 106, low: 94, close: 95, volume: 1 };
    const prev: Bar = { time: -1, open: 100, high: 101, low: 99, close: 100, volume: 1 };
    const segs = legendSegments("EURUSD", "1m", bar, prev);
    expect(segs[1]!.tone).toBe("down");
    expect(segs[5]!.text).toBe("-5.00%");
    expect(segs[5]!.tone).toBe("down");
  });

  it("Δ% falls back to the bar's own open for the first bar", () => {
    const bar: Bar = { time: 0, open: 100, high: 101, low: 99, close: 102, volume: 1 };
    expect(ohlcDeltaPct(bar, null)).toBeCloseTo(2, 10);
  });

  it("formatPrice picks precision by magnitude", () => {
    expect(formatPrice(60000)).toBe("60,000.00");
    expect(formatPrice(1.08421)).toBe("1.0842");
    expect(formatPrice(0.0012345)).toBe("0.00123");
    expect(formatPrice(NaN)).toBe("—");
  });
});

describe("data window", () => {
  it("shows the 8 most recent bars, oldest → newest", () => {
    const rows = dataWindowRows(BARS, null);
    expect(rows).toHaveLength(8);
    expect(rows[0]!.time).toBe(BARS[92]!.time);
    expect(rows[7]!.time).toBe(BARS[99]!.time);
    expect(rows.every((r) => !r.focused)).toBe(true);
  });

  it("pins the crosshair bar on top and de-dupes it from the recent list", () => {
    const rows = dataWindowRows(BARS, 99); // crosshair on the latest bar
    expect(rows[0]!.focused).toBe(true);
    expect(rows[0]!.time).toBe(BARS[99]!.time);
    expect(rows.filter((r) => r.time === BARS[99]!.time)).toHaveLength(1);
    expect(rows).toHaveLength(8);

    const mid = dataWindowRows(BARS, 50);
    expect(mid[0]!.time).toBe(BARS[50]!.time);
    expect(mid).toHaveLength(9); // focused row + full 8-row recent window
  });

  it("is empty for empty data", () => {
    expect(dataWindowRows([], 0)).toEqual([]);
  });
});

describe("formatBarTime", () => {
  const t = Date.UTC(2026, 8, 21, 13, 45, 7);
  it("intraday → HH:MM:SS (UTC)", () => {
    expect(formatBarTime("1h", t)).toBe("13:45:07");
    expect(formatBarTime("1s", t)).toBe("13:45:07");
  });
  it("daily and above → YYYY-MM-DD", () => {
    expect(formatBarTime("1d", t)).toBe("2026-09-21");
    expect(formatBarTime("1w", t)).toBe("2026-09-21");
  });
});

describe("pane registry", () => {
  it("registers, replaces, and unregisters by id", () => {
    clearChartPanes();
    const a = { id: "pane-0", controller: {} as never, snapshot: () => {} };
    const off = registerChartPane("pane-0", a);
    expect(chartPaneBinding("pane-0")).toBe(a);
    const b = { id: "pane-0", controller: {} as never, snapshot: () => {} };
    registerChartPane("pane-0", b);
    expect(chartPaneBinding("pane-0")).toBe(b);
    off(); // stale unregister must not remove the replacement
    expect(chartPaneBinding("pane-0")).toBe(b);
    clearChartPanes();
    expect(chartPaneBinding("pane-0")).toBeUndefined();
  });
});
