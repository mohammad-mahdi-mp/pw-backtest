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
}));

import { createChart } from "lightweight-charts";
import { ChartController, type ChartType } from "./chartController";
import { synthBars } from "./bars";

function makeSeriesStub() {
  return {
    setData: vi.fn(),
    applyOptions: vi.fn(),
    priceScale: () => ({ applyOptions: vi.fn() }),
  };
}

function makeChartStub() {
  const tsStub = { setVisibleLogicalRange: vi.fn() };
  return {
    addSeries: vi.fn((..._args: unknown[]) => makeSeriesStub()),
    removeSeries: vi.fn(),
    panes: vi.fn(() => [{}, {}, {}]),
    removePane: vi.fn(),
    applyOptions: vi.fn(),
    remove: vi.fn(),
    timeScale: () => tsStub,
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
