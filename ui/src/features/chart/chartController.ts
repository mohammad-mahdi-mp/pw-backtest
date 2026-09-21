/**
 * Chart controller (P1-T07) — imperative Lightweight-Charts v5 wrapper kept
 * out of React render paths. Owns: chart options (theme via §5.1 tokens),
 * the price series (8 §5.2 chart types), the volume pane (separate pane,
 * on by default), and pane add/remove (v5 native panes API).
 *
 * Renderer decision: LWC v5 per Spike A GO (62.2 fps / ~148 MiB @100k on
 * llvmpipe; run recorded in docs/spikes/lwc-webkitgtk.md).
 */

import {
  AreaSeries,
  BarSeries,
  BaselineSeries,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type SeriesDefinition,
  type SeriesType,
  type UTCTimestamp,
  type CandlestickData,
  type BarData,
  type LineData,
  type HistogramData,
} from "lightweight-charts";

import type { Bar } from "../../lib/ipc";
import { lwcChartOptions } from "../../design/applyTheme";
import { resolveTheme } from "../../design/themes";
import { hexToRgba, heikinAshi, toLwcTime } from "./bars";

/** §5.2 chart types (card P1-T07 list). */
export type ChartType =
  | "candles"
  | "hollow"
  | "bars"
  | "line"
  | "area"
  | "baseline"
  | "histogram"
  | "heikin-ashi";

export const CHART_TYPES: readonly ChartType[] = [
  "candles",
  "hollow",
  "bars",
  "line",
  "area",
  "baseline",
  "histogram",
  "heikin-ashi",
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySeries = ISeriesApi<SeriesType, any, any>;

interface SeriesSpec {
  definition: SeriesDefinition<SeriesType>;
  data(bars: Bar[], themeId: string): unknown[];
  options(themeId: string): Record<string, unknown>;
}

/** Hollow candles: rising bars hollow (bg fill + up border), falling filled. */
function hollowData(bars: Bar[]): CandlestickData<UTCTimestamp>[] {
  const c = resolveTheme("grey");
  return bars.map((b) => {
    const up = b.close >= b.open;
    return {
      time: toLwcTime(b.time) as UTCTimestamp,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      color: up ? "transparent" : c.down,
      borderColor: up ? c.up : c.down,
      wickColor: up ? c.up : c.down,
    };
  });
}

function seriesSpec(type: ChartType): SeriesSpec {
  const candleOpts = (themeId: string) => {
    const c = resolveTheme(themeId);
    return {
      upColor: c.up,
      downColor: c.down,
      borderUpColor: c.up,
      borderDownColor: c.down,
      wickUpColor: c.up,
      wickDownColor: c.down,
    };
  };
  const lineData = (bars: Bar[]): LineData<UTCTimestamp>[] =>
    bars.map((b) => ({ time: toLwcTime(b.time) as UTCTimestamp, value: b.close }));
  switch (type) {
    case "candles":
      return {
        definition: CandlestickSeries,
        data: (bars) => candlesData(bars),
        options: candleOpts,
      };
    case "heikin-ashi":
      return {
        definition: CandlestickSeries,
        data: (bars) => candlesData(heikinAshi(bars)),
        options: candleOpts,
      };
    case "hollow":
      return { definition: CandlestickSeries, data: (bars) => hollowData(bars), options: candleOpts };
    case "bars":
      return {
        definition: BarSeries,
        data: (bars) => barsData(bars),
        options: (themeId) => {
          const c = resolveTheme(themeId);
          return { upColor: c.up, downColor: c.down, openVisible: true, thinBars: true };
        },
      };
    case "line":
      return {
        definition: LineSeries,
        data: lineData,
        options: (themeId) => ({ color: resolveTheme(themeId).accent, lineWidth: 2 }),
      };
    case "area":
      return {
        definition: AreaSeries,
        data: lineData,
        options: (themeId) => {
          const c = resolveTheme(themeId);
          return { lineColor: c.accent, topColor: hexToRgba(c.accent, 0.28), bottomColor: hexToRgba(c.accent, 0.02) };
        },
      };
    case "baseline":
      return {
        definition: BaselineSeries,
        data: lineData,
        options: (themeId) => {
          const c = resolveTheme(themeId);
          return {
            baseValue: { type: "price", price: 0 }, // replaced at setData time
            topLineColor: c.up,
            topFillColor1: hexToRgba(c.up, 0.28),
            topFillColor2: hexToRgba(c.up, 0.05),
            bottomLineColor: c.down,
            bottomFillColor1: hexToRgba(c.down, 0.05),
            bottomFillColor2: hexToRgba(c.down, 0.28),
          };
        },
      };
    case "histogram":
      return {
        definition: HistogramSeries,
        data: (bars) =>
          bars.map((b) => ({ time: toLwcTime(b.time) as UTCTimestamp, value: b.close })),
        options: (themeId) => ({ color: resolveTheme(themeId).accent }),
      };
  }
}

function candlesData(bars: Bar[]): CandlestickData<UTCTimestamp>[] {
  return bars.map((b) => ({
    time: toLwcTime(b.time) as UTCTimestamp,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
  }));
}

function barsData(bars: Bar[]): BarData<UTCTimestamp>[] {
  return bars.map((b) => ({
    time: toLwcTime(b.time) as UTCTimestamp,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
  }));
}

function volumeData(bars: Bar[], themeId: string): HistogramData<UTCTimestamp>[] {
  const c = resolveTheme(themeId);
  return bars.map((b) => ({
    time: toLwcTime(b.time) as UTCTimestamp,
    value: b.volume,
    color: hexToRgba(b.close >= b.open ? c.up : c.down, 0.5),
  }));
}

/** Baseline base value = first fixture close (TV uses session open). */
function baselineBase(bars: Bar[]): number {
  return bars[0]?.close ?? 0;
}

export interface ChartControllerOptions {
  themeId: string;
  /** Default visible bars from the right edge. */
  visibleBars?: number;
}

/**
 * Owns one LWC chart instance. React talks to it through this controller;
 * jsdom tests drive it against a mocked `lightweight-charts`.
 */
export class ChartController {
  private chart: IChartApi | null = null;
  private price: AnySeries | null = null;
  private volume: ISeriesApi<"Histogram"> | null = null;
  private extraPanes: AnySeries[] = [];
  private bars: Bar[] = [];
  private type: ChartType = "candles";
  private themeId = "grey";
  private visibleBars: number;

  constructor(opts?: ChartControllerOptions) {
    this.themeId = opts?.themeId ?? "grey";
    this.visibleBars = opts?.visibleBars ?? 300;
  }

  get paneCount(): number {
    return this.chart ? this.chart.panes().length : 0;
  }

  /** Creates the chart, price series (pane 0) and the volume pane (pane 1). */
  attach(container: HTMLElement): void {
    if (this.chart) return;
    const base = lwcChartOptions(this.themeId) as Record<string, unknown>;
    const c = resolveTheme(this.themeId);
    this.chart = createChart(container, {
      ...base,
      autoSize: true,
      layout: {
        ...(base.layout as Record<string, unknown>),
        panes: { separatorColor: c.border, separatorHoverColor: c.accent },
      },
    } as Parameters<typeof createChart>[1]);
    this.volume = this.chart.addSeries(
      HistogramSeries,
      { priceScaleId: "" },
      1,
    ) as ISeriesApi<"Histogram">;
    this.volume.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    this.mountPriceSeries();
  }

  private mountPriceSeries(): void {
    if (!this.chart) return;
    if (this.price) {
      this.chart.removeSeries(this.price);
      this.price = null;
    }
    const spec = seriesSpec(this.type);
    this.price = this.chart.addSeries(
      spec.definition,
      spec.options(this.themeId) as never,
      0,
    ) as AnySeries;
    this.applyPriceData();
  }

  private applyPriceData(): void {
    if (!this.price || !this.chart) return;
    const spec = seriesSpec(this.type);
    const data = spec.data(this.bars, this.themeId);
    // One setData call per load — the §5 perf batching requirement.
    this.price.setData(data as never);
    if (this.type === "baseline") {
      this.price.applyOptions({
        baseValue: { type: "price", price: baselineBase(this.bars) },
      } as never);
    }
    const n = this.bars.length;
    if (n > 0) {
      const from = Math.max(0, n - this.visibleBars);
      this.chart.timeScale().setVisibleLogicalRange({ from, to: n });
    }
  }

  /** Replaces the whole series data (§1.3 `Bar[]`, ms timestamps). */
  setBars(bars: Bar[]): void {
    this.bars = bars;
    if (!this.chart) return;
    this.applyPriceData();
    this.volume?.setData(volumeData(this.bars, this.themeId));
  }

  /** Switches the price-series type (recreates the series, keeps the data). */
  setType(type: ChartType): void {
    if (type === this.type) return;
    this.type = type;
    if (!this.chart) return;
    this.mountPriceSeries();
  }

  /** Re-applies chart + series options (theme switch). */
  setTheme(themeId: string): void {
    this.themeId = themeId;
    if (!this.chart) return;
    const base = lwcChartOptions(themeId) as Record<string, unknown>;
    const c = resolveTheme(themeId);
    this.chart.applyOptions({
      ...base,
      layout: {
        ...(base.layout as Record<string, unknown>),
        panes: { separatorColor: c.border, separatorHoverColor: c.accent },
      },
    } as never);
    // Series colors are theme-derived — remount keeps options in one place.
    this.mountPriceSeries();
    this.volume?.setData(volumeData(this.bars, this.themeId));
  }

  /** Adds an auxiliary price pane (line of closes) — "pane add" gate. */
  addPricePane(): void {
    if (!this.chart) return;
    const idx = this.chart.panes().length;
    const series = this.chart.addSeries(
      LineSeries,
      { color: resolveTheme(this.themeId).accent, lineWidth: 1 },
      idx,
    ) as AnySeries;
    series.setData(
      this.bars.map((b) => ({ time: toLwcTime(b.time) as UTCTimestamp, value: b.close })),
    );
    this.extraPanes.push(series);
  }

  /** Removes the last auxiliary pane — "pane remove" gate. */
  removeLastPane(): void {
    if (!this.chart) return;
    const series = this.extraPanes.pop();
    if (series) {
      this.chart.removeSeries(series);
      return;
    }
    const count = this.chart.panes().length;
    if (count > 1) this.chart.removePane(count - 1); // drops the volume pane
  }

  /** Destroys the chart (React unmount). */
  detach(): void {
    this.chart?.remove();
    this.chart = null;
    this.price = null;
    this.volume = null;
    this.extraPanes = [];
  }
}
