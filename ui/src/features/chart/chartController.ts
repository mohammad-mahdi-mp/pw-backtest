/**
 * Chart controller (P1-T07 core, P1-T08 interactions) — imperative
 * Lightweight-Charts v5 wrapper kept out of React render paths. Owns: chart
 * options (theme via §5.1 tokens), the price series (8 §5.2 chart types),
 * the volume pane (separate pane, on by default), and pane add/remove (v5
 * native panes API).
 *
 * P1-T08 adds the §5.4 interaction surface: normal/log scale (Alt+L),
 * keyboard zoom/pan (stepBars/zoomCenter), zoom-to-fit, the Shift+drag
 * rubber-band range math (panRangeFromPixels), the crosshair subscription
 * (mapped to bar indices for the legend/data window), the last-price line
 * (toggle), and PNG snapshots (`takeScreenshot` → data URL). Wheel zoom
 * (cursor-anchored), drag pan, and price-scale drag are LWC-native and need
 * no controller involvement.
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
  LineStyle,
  PriceScaleMode,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type MouseEventParams,
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
import {
  clampRange,
  stepRange,
  zoomCenter,
  zoomRangeAt,
  type LogicalRange,
} from "./interactions";

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
  private logScale = false;
  private lastPriceEnabled = true;
  private lastPriceLine: IPriceLine | null = null;

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
      // Price lines die with their series — drop the stale handle first.
      this.lastPriceLine = null;
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
    this.refreshLastPriceLine();
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
    this.refreshLastPriceLine();
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
    this.lastPriceLine = null;
  }

  // -------------------------------------------------------------------------
  // P1-T08 — §5.4 interactions
  // -------------------------------------------------------------------------

  /** Normal/log toggle (Alt+L) on the price scale of the price pane. */
  setLogScale(on: boolean): void {
    this.logScale = on;
    this.chart?.priceScale("right", 0).applyOptions({
      mode: on ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
    });
  }

  /** Current scale mode (for menu labels / toolbar state). */
  getLogScale(): boolean {
    return this.logScale;
  }

  /** Current visible logical range (bar indices), or null without data. */
  visibleRange(): LogicalRange | null {
    return this.chart ? this.chart.timeScale().getVisibleLogicalRange() : null;
  }

  /** Cursor-anchored zoom (factor <1 in, >1 out) — the wheel path is
   * LWC-native; this is the programmatic twin (keyboard, tests, e2e). */
  zoomAt(anchorLogical: number, factor: number): void {
    const range = this.visibleRange();
    if (!range || this.bars.length === 0) return;
    this.setVisibleRange(clampRange(zoomRangeAt(range, anchorLogical, factor), this.bars.length));
  }

  /** ArrowUp/Down — zoom around the visible center, clamped. */
  zoomCenter(factor: number): void {
    const range = this.visibleRange();
    if (!range || this.bars.length === 0) return;
    this.setVisibleRange(zoomCenter(range, factor, this.bars.length));
  }

  /** ArrowLeft/Right — pan ±N bars, clamped to the data. */
  stepBars(delta: number): void {
    const range = this.visibleRange();
    if (!range || this.bars.length === 0) return;
    this.setVisibleRange(stepRange(range, delta, this.bars.length));
  }

  /** Shifts the visible window by `delta` bars — the scripted-pan fps bench. */
  shiftRange(delta: number): void {
    this.stepBars(delta);
  }

  /** Context-menu "Zoom to fit" — LWC native fit over all series. */
  zoomToFit(): void {
    this.chart?.timeScale().fitContent();
  }

  /** Applies a logical range (clamped to the loaded data). */
  setVisibleRange(range: LogicalRange): void {
    if (!this.chart || this.bars.length === 0) return;
    this.chart.timeScale().setVisibleLogicalRange(clampRange(range, this.bars.length));
  }

  /**
   * Rubber-band (Shift+drag) end: maps the two pixel x-positions (local to
   * the chart element) to a clamped logical range, or null when LWC has no
   * coordinate mapping yet (no data / zero width).
   */
  panRangeFromPixels(x0: number, x1: number): LogicalRange | null {
    const ts = this.chart?.timeScale();
    if (!ts || this.bars.length === 0) return null;
    const l0 = ts.coordinateToLogical(x0);
    const l1 = ts.coordinateToLogical(x1);
    if (l0 === null || l1 === null) return null;
    return clampRange({ from: Math.min(l0, l1), to: Math.max(l0, l1) }, this.bars.length);
  }

  /**
   * Crosshair subscription for the legend + data window: LWC logical index
   * → fixture bar index (the loaded series is dense), null when the cursor
   * is off-data or outside the bars.
   */
  subscribeCrosshair(cb: (barIndex: number | null) => void): () => void {
    const chart = this.chart;
    if (!chart) return () => {};
    const handler = (param: MouseEventParams): void => {
      const logical = param.logical;
      if (logical === undefined) {
        cb(null);
        return;
      }
      const n = this.bars.length;
      if (n === 0) {
        cb(null);
        return;
      }
      const i = Math.round(logical);
      cb(i >= 0 && i < n ? i : null);
    };
    chart.subscribeCrosshairMove(handler);
    return () => {
      this.chart?.unsubscribeCrosshairMove(handler);
    };
  }

  /** Last-price line (toggle; TV default on) with an axis value tag. */
  setLastPriceLine(enabled: boolean): void {
    this.lastPriceEnabled = enabled;
    this.refreshLastPriceLine();
  }

  get lastPriceLineEnabled(): boolean {
    return this.lastPriceEnabled;
  }

  private refreshLastPriceLine(): void {
    if (this.lastPriceLine && this.price) {
      this.price.removePriceLine(this.lastPriceLine);
      this.lastPriceLine = null;
    }
    const last = this.bars[this.bars.length - 1];
    if (!this.lastPriceEnabled || !last || !this.price) return;
    this.lastPriceLine = this.price.createPriceLine({
      price: last.close,
      color: resolveTheme(this.themeId).accent,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
    });
  }

  /**
   * Alt+S — full-chart PNG (LWC `takeScreenshot`, crosshair excluded) as a
   * data URL; null when the chart is detached or the canvas is unavailable.
   */
  snapshotDataUrl(): string | null {
    const chart = this.chart;
    if (!chart) return null;
    try {
      const canvas = chart.takeScreenshot(false, false);
      return canvas.toDataURL("image/png");
    } catch {
      return null;
    }
  }
}
