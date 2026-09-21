/**
 * P1-T07 tests — ChartController against a mocked Lightweight-Charts v5.
 * Asserts the wiring contract: theme options, volume pane on by default,
 * single `setData` batching, type switch, pane add/remove, seconds-typed
 * times.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// --- lightweight-charts mock (factory references only vi) -------------------

vi.mock("lightweight-charts", () => ({
  createChart: vi.fn(),
  CandlestickSeries: { type: "Candlestick" },
  BarSeries: { type: "Bar" },
  LineSeries: { type: "Line" },
  AreaSeries: { type: "Area" },
  BaselineSeries: { type: "Baseline" },
  HistogramSeries: { type: "Histogram" },
  PriceScaleMode: { Normal: 0, Logarithmic: 1, Percent: 2, IndexedTo100: 3 },
  LineStyle: { Solid: 0, Dotted: 1, Dashed: 2, LargeDashed: 3, SparseDotted: 4 },
}));

import { createChart } from "lightweight-charts";
import { ChartController, type ChartType } from "./chartController";
import { synthBars } from "./bars";

interface RangeStub {
  from: number;
  to: number;
}

function makeSeriesStub() {
  return {
    setData: vi.fn(),
    applyOptions: vi.fn(),
    priceScale: () => ({ applyOptions: vi.fn() }),
    createPriceLine: vi.fn<(opts: { price: number; lineStyle: number; axisLabelVisible: boolean }) => { kind: string }>(
      (opts) => ({ kind: "price-line", price: opts.price }),
    ),
    removePriceLine: vi.fn(),
  };
}

function makeChartStub() {
  const tsStub = {
    setVisibleLogicalRange: vi.fn(),
    getVisibleLogicalRange: vi.fn<() => RangeStub | null>(() => null),
    fitContent: vi.fn(),
    coordinateToLogical: vi.fn<(x: number) => number | null>(() => null),
  };
  const psStub = { applyOptions: vi.fn() };
  return {
    addSeries: vi.fn((..._args: unknown[]) => makeSeriesStub()),
    removeSeries: vi.fn(),
    panes: vi.fn(() => [{}, {}, {}]),
    removePane: vi.fn(),
    applyOptions: vi.fn(),
    remove: vi.fn(),
    timeScale: () => tsStub,
    priceScale: vi.fn(() => psStub),
    subscribeCrosshairMove: vi.fn(),
    unsubscribeCrosshairMove: vi.fn(),
    takeScreenshot: vi.fn(() => ({ toDataURL: () => "data:image/png;base64,TEST" })),
  };
}

type ChartStub = ReturnType<typeof makeChartStub>;
type SeriesStub = ReturnType<typeof makeSeriesStub>;

const mockCreate = vi.mocked(createChart);
let chart: ChartStub;

beforeEach(() => {
  chart = makeChartStub();
  mockCreate.mockReset();
  mockCreate.mockReturnValue(chart as never);
});

function lastSeries(): SeriesStub {
  return chart.addSeries.mock.results[
    chart.addSeries.mock.results.length - 1
  ]!.value as SeriesStub;
}

const BARS = synthBars("BTCUSDT", "1h", 120);

describe("attach", () => {
  it("creates the chart with §5.1 theme options + autosize", () => {
    const c = new ChartController({ themeId: "black" });
    const el = document.createElement("div");
    c.attach(el);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const opts = mockCreate.mock.calls[0]![1] as Record<string, { color?: string } & Record<string, unknown>>;
    expect(opts.autoSize).toBe(true);
    expect(opts.layout).toBeDefined();
    expect((opts.layout as { background: { color: string } }).background.color).toBe("#000000");
  });

  it("mounts the volume pane (Histogram, paneIndex 1) by default", () => {
    const c = new ChartController({ themeId: "grey" });
    c.attach(document.createElement("div"));
    const hist = chart.addSeries.mock.calls.find(
      (call) => (call[0] as { type: string }).type === "Histogram",
    );
    expect(hist).toBeDefined();
    expect(hist![2]).toBe(1); // paneIndex
    const price = chart.addSeries.mock.calls.find((call) => call[2] === 0);
    expect(price).toBeDefined();
    expect((price![0] as { type: string }).type).toBe("Candlestick");
  });
});

describe("setBars", () => {
  it("batches one setData with seconds-typed times", () => {
    const c = new ChartController({ themeId: "grey" });
    c.attach(document.createElement("div"));
    c.setBars(BARS);
    const series = lastSeries(); // price series was mounted last
    expect(series.setData).toHaveBeenCalled();
    const data = series.setData.mock.calls.at(-1)![0] as Array<{ time: number; close: number }>;
    expect(data).toHaveLength(BARS.length);
    expect(data[0]!.time).toBe(Math.floor(BARS[0]!.time / 1000));
    expect(data[59]!.close).toBe(BARS[59]!.close);
    // volume went to its series exactly once (mount does not pre-fill it)
    const volumeSeries = (chart.addSeries.mock.results[0]!.value as SeriesStub);
    expect(volumeSeries.setData).toHaveBeenCalledTimes(1);
  });

  it("shows the rightmost window (visibleBars)", () => {
    const c = new ChartController({ themeId: "grey", visibleBars: 50 });
    c.attach(document.createElement("div"));
    c.setBars(synthBars("BTCUSDT", "1d", 200));
    expect(chart.timeScale().setVisibleLogicalRange).toHaveBeenLastCalledWith({
      from: 150,
      to: 200,
    });
  });
});

describe("setType", () => {
  it.each([
    "hollow",
    "bars",
    "line",
    "area",
    "baseline",
    "histogram",
    "heikin-ashi",
  ] as ChartType[])("recreates the price series for %s", (t) => {
    const c = new ChartController({ themeId: "grey" });
    c.attach(document.createElement("div"));
    c.setBars(BARS);
    const removesBefore = chart.removeSeries.mock.calls.length;
    c.setType(t);
    expect(chart.removeSeries.mock.calls.length).toBe(removesBefore + 1);
    const lastDef = chart.addSeries.mock.calls.at(-1)![0] as { type: string };
    expect(["Candlestick", "Bar", "Line", "Area", "Baseline", "Histogram"]).toContain(lastDef.type);
    const last = lastSeries();
    expect(last.setData).toHaveBeenCalled();
  });

  it("hollow marks rising bars hollow and falling bars filled down-color", () => {
    const c = new ChartController({ themeId: "grey" });
    c.attach(document.createElement("div"));
    c.setBars(BARS);
    c.setType("hollow");
    const data = lastSeries().setData.mock.calls[0]![0] as Array<{
      color: string;
      borderColor: string;
      open: number;
      close: number;
    }>;
    const rising = data.find((d) => d.close >= d.open)!;
    const falling = data.find((d) => d.close < d.open)!;
    expect(rising.color).toBe("transparent");
    expect(rising.borderColor).toBe("#089981");
    expect(falling.color).toBe("#f23645");
  });

  it("heikin-ashi feeds transformed candles", () => {
    const c = new ChartController({ themeId: "grey" });
    c.attach(document.createElement("div"));
    c.setBars(BARS);
    c.setType("heikin-ashi");
    const data = lastSeries().setData.mock.calls[0]![0] as Array<{ close: number }>;
    expect(data).toHaveLength(BARS.length);
    // HA close of bar 0 = (o+h+l+c)/4
    const b = BARS[0]!;
    expect(data[0]!.close).toBeCloseTo((b.open + b.high + b.low + b.close) / 4, 5);
  });

  it("baseline applies the first close as base value", () => {
    const c = new ChartController({ themeId: "grey" });
    c.attach(document.createElement("div"));
    c.setBars(BARS);
    c.setType("baseline");
    const last = lastSeries();
    const opts = last.applyOptions.mock.calls.at(-1)![0] as { baseValue: { price: number } };
    expect(opts.baseValue.price).toBe(BARS[0]!.close);
  });
});

describe("theme + panes", () => {
  it("setTheme re-applies chart options and repaints volume", () => {
    const c = new ChartController({ themeId: "grey" });
    c.attach(document.createElement("div"));
    c.setBars(BARS);
    c.setTheme("blue");
    expect(chart.applyOptions).toHaveBeenCalled();
    const volume = chart.addSeries.mock.results[0]!.value as SeriesStub;
    expect(volume.setData).toHaveBeenCalledTimes(2);
  });

  it("addPricePane adds a series in the next pane index; removeLastPane pops it", () => {
    const c = new ChartController({ themeId: "grey" });
    c.attach(document.createElement("div"));
    c.addPricePane();
    const call = chart.addSeries.mock.calls.at(-1)!;
    expect(call[2]).toBe(3); // stub panes() reports 3
    const extra = lastSeries();
    c.removeLastPane();
    expect(chart.removeSeries).toHaveBeenCalledWith(extra);
  });

  it("removeLastPane without extras drops the last chart pane", () => {
    const c = new ChartController({ themeId: "grey" });
    c.attach(document.createElement("div"));
    c.removeLastPane();
    expect(chart.removePane).toHaveBeenCalledWith(2);
  });

  it("detach removes the chart instance", () => {
    const c = new ChartController({ themeId: "grey" });
    c.attach(document.createElement("div"));
    c.detach();
    expect(chart.remove).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// P1-T08 — §5.4 interaction surface
// ---------------------------------------------------------------------------

describe("P1-T08 interactions", () => {
  it("setLogScale applies PriceScaleMode to the pane-0 price scale", () => {
    const c = new ChartController({ themeId: "grey" });
    c.attach(document.createElement("div"));
    c.setLogScale(true);
    expect(chart.priceScale).toHaveBeenCalledWith("right", 0);
    const ps = chart.priceScale.mock.results[0]!.value as { applyOptions: ReturnType<typeof vi.fn> };
    expect(ps.applyOptions).toHaveBeenCalledWith({ mode: 1 }); // Logarithmic
    expect(c.getLogScale()).toBe(true);
    c.setLogScale(false);
    expect(c.getLogScale()).toBe(false);
    expect(ps.applyOptions).toHaveBeenLastCalledWith({ mode: 0 }); // Normal
  });

  it("zoomCenter / stepBars / zoomAt clamp to the loaded data", () => {
    const c = new ChartController({ themeId: "grey" });
    c.attach(document.createElement("div"));
    c.setBars(synthBars("BTCUSDT", "1h", 100));

    const ts = chart.timeScale();
    ts.getVisibleLogicalRange.mockReturnValue({ from: 0, to: 100 });
    c.zoomCenter(0.8);
    expect(ts.setVisibleLogicalRange).toHaveBeenLastCalledWith({ from: 10, to: 90 });

    ts.getVisibleLogicalRange.mockReturnValue({ from: 10, to: 90 });
    c.stepBars(-50); // would start at -40 → clamped at 0
    expect(ts.setVisibleLogicalRange).toHaveBeenLastCalledWith({ from: 0, to: 80 });

    ts.getVisibleLogicalRange.mockReturnValue({ from: 0, to: 80 });
    c.zoomCenter(100); // far zoom out → clamped to the full data
    expect(ts.setVisibleLogicalRange).toHaveBeenLastCalledWith({ from: 0, to: 100 });

    ts.getVisibleLogicalRange.mockReturnValue({ from: 0, to: 100 });
    c.zoomAt(25, 0.5); // cursor-anchored: 25 stays at 25% of the window
    expect(ts.setVisibleLogicalRange).toHaveBeenLastCalledWith({ from: 12.5, to: 62.5 });
  });

  it("zoomToFit delegates to LWC fitContent", () => {
    const c = new ChartController({ themeId: "grey" });
    c.attach(document.createElement("div"));
    c.setBars(synthBars("BTCUSDT", "1h", 50));
    c.zoomToFit();
    expect(chart.timeScale().fitContent).toHaveBeenCalledTimes(1);
  });

  it("panRangeFromPixels maps a rubber band to a clamped logical range", () => {
    const c = new ChartController({ themeId: "grey" });
    c.attach(document.createElement("div"));
    c.setBars(synthBars("BTCUSDT", "1h", 100));
    const ts = chart.timeScale();
    ts.coordinateToLogical.mockImplementation((x: number) => x / 2);
    expect(c.panRangeFromPixels(20, 80)).toEqual({ from: 10, to: 40 });
    expect(c.panRangeFromPixels(80, 20)).toEqual({ from: 10, to: 40 }); // order-insensitive
    ts.coordinateToLogical.mockReturnValue(null);
    expect(c.panRangeFromPixels(1, 2)).toBeNull();
  });

  it("subscribeCrosshair maps logical → bar index, null off-data, unsubscribes", () => {
    const c = new ChartController({ themeId: "grey" });
    c.attach(document.createElement("div"));
    c.setBars(synthBars("BTCUSDT", "1h", 120));
    const seen: Array<number | null> = [];
    const off = c.subscribeCrosshair((i) => seen.push(i));
    const handler = chart.subscribeCrosshairMove.mock.calls[0]![0] as (p: {
      logical?: number;
      seriesData: Map<unknown, unknown>;
    }) => void;
    handler({ logical: 5.4, seriesData: new Map() });
    handler({ logical: 5.6, seriesData: new Map() });
    handler({ logical: 999, seriesData: new Map() }); // past the last bar
    handler({ seriesData: new Map() }); // crosshair left the chart
    off();
    expect(chart.unsubscribeCrosshairMove).toHaveBeenCalledWith(handler);
    expect(seen).toEqual([5, 6, null, null]);
  });

  it("last-price line: on by default after setBars, toggleable, recreated on type switch", () => {
    const c = new ChartController({ themeId: "grey" });
    c.attach(document.createElement("div"));
    const bars = synthBars("BTCUSDT", "1h", 60);
    c.setBars(bars);
    const price = lastSeries();
    expect(price.createPriceLine).toHaveBeenCalledTimes(1);
    const opts = price.createPriceLine.mock.calls[0]![0] as {
      price: number;
      lineStyle: number;
      axisLabelVisible: boolean;
    };
    expect(opts.price).toBe(bars[bars.length - 1]!.close);
    expect(opts.lineStyle).toBe(2); // LineStyle.Dashed
    expect(opts.axisLabelVisible).toBe(true);

    c.setLastPriceLine(false);
    expect(price.removePriceLine).toHaveBeenCalledTimes(1);
    c.setLastPriceLine(true);
    expect(price.createPriceLine).toHaveBeenCalledTimes(2);

    c.setType("line"); // remount → the fresh series carries the line again
    const fresh = lastSeries();
    expect(fresh.createPriceLine).toHaveBeenCalledTimes(1);
  });

  it("snapshotDataUrl takes the LWC screenshot (no crosshair) or null when detached", () => {
    const c = new ChartController({ themeId: "grey" });
    c.attach(document.createElement("div"));
    expect(c.snapshotDataUrl()).toBe("data:image/png;base64,TEST");
    expect(chart.takeScreenshot).toHaveBeenCalledWith(false, false);
    c.detach();
    expect(c.snapshotDataUrl()).toBeNull();
  });
});
