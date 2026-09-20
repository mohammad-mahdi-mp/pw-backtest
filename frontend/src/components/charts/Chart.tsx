import { useEffect, useRef, useCallback } from "react";
import { createChart, ColorType, LineStyle } from "lightweight-charts";
import type {
  IChartApi,
  IPriceLine,
  ISeriesApi,
  Time,
  CandlestickData,
  BarData,
  LineData,
  AreaData,
  HistogramData,
  SeriesMarker,
} from "lightweight-charts";
import type { Bar, PlotSeries, PaneSpec, PriceLineSpec, MarkerSpec } from "@/types";
import type { ChartType } from "@/stores/ui";

const C = {
  bg: "#131722",
  text: "#d1d4dc",
  grid: "#1e222d",
  border: "#2a2e39",
  bull: "#26a69a",
  bear: "#ef5350",
  blue: "#2962ff",
};

function heikinAshi(bars: Bar[]): Bar[] {
  const out: Bar[] = [];
  let po = 0;
  let pc = 0;
  bars.forEach((b, i) => {
    const close = (b.open + b.high + b.low + b.close) / 4;
    const open = i === 0 ? (b.open + b.close) / 2 : (po + pc) / 2;
    out.push({
      time: b.time,
      open,
      close,
      high: Math.max(b.high, open, close),
      low: Math.min(b.low, open, close),
      volume: b.volume,
    });
    po = open;
    pc = close;
  });
  return out;
}

type Props = {
  bars: Bar[];
  chartType: ChartType;
  overlays: PlotSeries[];
  panes: PaneSpec[];
  showVolume: boolean;
  precision: number;
  minMove: number;
  watermark: string;
  priceLines?: PriceLineSpec[];
  markers?: MarkerSpec[];
  onCrosshair?: (b: Bar | null) => void;
};

export function Chart({
  bars,
  chartType,
  overlays,
  panes,
  showVolume,
  precision,
  minMove,
  watermark,
  priceLines = [],
  markers = [],
  onCrosshair,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainRef = useRef<ISeriesApi<any> | null>(null);
  const volRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const overlayRefs = useRef<ISeriesApi<any>[]>([]);
  const priceLineRefs = useRef<IPriceLine[]>([]);
  const paneRefs = useRef<HTMLDivElement[]>([]);
  const paneChartRefs = useRef<IChartApi[]>([]);

  const priceFormat = { type: "price" as const, precision, minMove };

  // ---- create main chart ----
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: C.bg },
        textColor: C.text,
        fontFamily: "Trebuchet MS, -apple-system, Roboto, sans-serif",
        fontSize: 12,
      },
      grid: {
        vertLines: { color: C.grid },
        horzLines: { color: C.grid },
      },
      crosshair: {
        mode: 1,
        vertLine: { color: "#758696", width: 1, style: 3, labelBackgroundColor: "#363a45" },
        horzLine: { color: "#758696", width: 1, style: 3, labelBackgroundColor: "#363a45" },
      },
      rightPriceScale: {
        borderColor: C.border,
        scaleMargins: { top: 0.1, bottom: 0.25 },
      },
      timeScale: { borderColor: C.border, timeVisible: true, secondsVisible: false, rightOffset: 6 },
      watermark: {
        visible: true,
        text: watermark,
        color: "rgba(120, 123, 134, 0.20)",
        fontSize: 52,
        horzAlign: "center",
        vertAlign: "center",
        fontFamily: "Trebuchet MS, sans-serif",
      },
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });
    chartRef.current = chart;

    chart.subscribeCrosshairMove((p) => {
      if (!p || !p.time || !mainRef.current) {
        onCrosshair?.(null);
        return;
      }
      const d = p.seriesData.get(mainRef.current);
      if (d) {
        const b = d as any;
        onCrosshair?.({
          time: p.time as number,
          open: b.open ?? b.value,
          high: b.high ?? b.value,
          low: b.low ?? b.value,
          close: b.close ?? b.value,
          volume: 0,
        });
      }
    });

    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      mainRef.current = null;
      volRef.current = null;
      overlayRefs.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // watermark text update
  useEffect(() => {
    chartRef.current?.applyOptions({ watermark: { text: watermark } } as any);
  }, [watermark]);

  // ---- main series (type + data) ----
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (mainRef.current) {
      chart.removeSeries(mainRef.current);
      mainRef.current = null;
    }

    const src = chartType === "heikin" ? heikinAshi(bars) : bars;

    if (chartType === "candles" || chartType === "heikin") {
      const s = chart.addCandlestickSeries({
        upColor: C.bull,
        downColor: C.bear,
        borderUpColor: C.bull,
        borderDownColor: C.bear,
        wickUpColor: C.bull,
        wickDownColor: C.bear,
        priceFormat,
      });
      s.setData(
        src.map((b) => ({ time: b.time as Time, open: b.open, high: b.high, low: b.low, close: b.close })) as CandlestickData<Time>[]
      );
      mainRef.current = s;
    } else if (chartType === "bars") {
      const s = chart.addBarSeries({
        upColor: C.bull,
        downColor: C.bear,
        thinBars: false,
        priceFormat,
      });
      s.setData(
        src.map((b) => ({ time: b.time as Time, open: b.open, high: b.high, low: b.low, close: b.close })) as BarData<Time>[]
      );
      mainRef.current = s;
    } else if (chartType === "line") {
      const s = chart.addLineSeries({ color: C.blue, lineWidth: 2, priceFormat });
      s.setData(src.map((b) => ({ time: b.time as Time, value: b.close })) as LineData<Time>[]);
      mainRef.current = s;
    } else {
      const s = chart.addAreaSeries({
        lineColor: C.blue,
        topColor: "rgba(41, 98, 255, 0.28)",
        bottomColor: "rgba(41, 98, 255, 0.02)",
        lineWidth: 2,
        priceFormat,
      });
      s.setData(src.map((b) => ({ time: b.time as Time, value: b.close })) as AreaData<Time>[]);
      mainRef.current = s;
    }

    if (bars.length) chart.timeScale().fitContent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bars, chartType]);

  // ---- price lines (entry / SL / TP / pending orders) ----
  useEffect(() => {
    const chart = chartRef.current;
    const main = mainRef.current;
    if (!chart || !main) return;
    priceLineRefs.current.forEach((pl) => {
      try {
        main.removePriceLine(pl);
      } catch {
        /* series may have been replaced */
      }
    });
    priceLineRefs.current = [];
    for (const pl of priceLines) {
      const line = main.createPriceLine({
        price: pl.price,
        color: pl.color,
        lineWidth: 1,
        lineStyle: pl.dashed === false ? LineStyle.Solid : LineStyle.Dashed,
        axisLabelVisible: true,
        title: pl.title,
      });
      priceLineRefs.current.push(line);
    }
  }, [priceLines, chartType, bars]);

  // ---- trade markers ----
  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    const sorted = [...markers].sort((a, b) => a.time - b.time);
    main.setMarkers(
      sorted.map((m) => ({
        time: m.time as Time,
        position: m.position,
        color: m.color,
        shape: m.shape,
        text: m.text,
      })) as SeriesMarker<Time>[]
    );
  }, [markers, chartType, bars]);

  // ---- volume ----
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (volRef.current) {
      chart.removeSeries(volRef.current);
      volRef.current = null;
    }
    if (!showVolume || bars.length === 0) return;
    const s = chart.addHistogramSeries({
      priceScaleId: "vol",
      priceFormat: { type: "volume" },
      lastValueVisible: false,
      priceLineVisible: false,
    });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    s.setData(
      bars.map((b) => ({
        time: b.time as Time,
        value: b.volume,
        color: b.close >= b.open ? "rgba(38, 166, 154, 0.45)" : "rgba(239, 83, 80, 0.45)",
      })) as HistogramData<Time>[]
    );
    volRef.current = s;
  }, [bars, showVolume, chartType]);

  // ---- overlays ----
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    overlayRefs.current.forEach((s) => chart.removeSeries(s));
    overlayRefs.current = [];
    for (const o of overlays) {
      const s = chart.addLineSeries({
        color: o.color || C.blue,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      s.setData(o.data.map((d) => ({ time: d.time as Time, value: d.value })) as LineData<Time>[]);
      overlayRefs.current.push(s);
    }
  }, [overlays]);

  // ---- sub panes ----
  const setPaneRef = useCallback((idx: number) => (el: HTMLDivElement | null) => {
    if (el) paneRefs.current[idx] = el;
  }, []);

  useEffect(() => {
    paneChartRefs.current.forEach((c) => c.remove());
    paneChartRefs.current = [];

    panes.forEach((pane, idx) => {
      const container = paneRefs.current[idx];
      if (!container) return;
      const chart = createChart(container, {
        layout: {
          background: { type: ColorType.Solid, color: C.bg },
          textColor: C.text,
          fontFamily: "Trebuchet MS, -apple-system, Roboto, sans-serif",
          fontSize: 11,
        },
        grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
        rightPriceScale: { borderColor: C.border, scaleMargins: { top: 0.15, bottom: 0.05 } },
        timeScale: { borderColor: C.border, visible: false },
        width: container.clientWidth,
        height: container.clientHeight,
        handleScroll: false,
        handleScale: false,
      });

      for (const ps of pane.series) {
        if (ps.type === "histogram") {
          const h = chart.addHistogramSeries({ priceLineVisible: false });
          h.setData(
            ps.data.map((d) => ({
              time: d.time as Time,
              value: d.value,
              color: d.color || (d.value >= 0 ? "rgba(38,166,154,0.5)" : "rgba(239,83,80,0.5)"),
            })) as HistogramData<Time>[]
          );
        } else {
          const l = chart.addLineSeries({ color: ps.color || C.blue, lineWidth: 2, priceLineVisible: false });
          l.setData(ps.data.map((d) => ({ time: d.time as Time, value: d.value })) as LineData<Time>[]);
        }
      }

      // sync with main chart time scale
      if (chartRef.current) {
        const mainTs = chartRef.current.timeScale();
        const paneTs = chart.timeScale();
        mainTs.subscribeVisibleLogicalRangeChange((r) => {
          if (r) paneTs.setVisibleLogicalRange(r);
        });
      }

      const ro = new ResizeObserver(() => {
        chart.applyOptions({ width: container.clientWidth, height: container.clientHeight });
      });
      ro.observe(container);
      paneChartRefs.current.push(chart);
    });

    return () => {
      paneChartRefs.current.forEach((c) => c.remove());
      paneChartRefs.current = [];
    };
  }, [panes]);

  return (
    <div className="flex flex-col w-full h-full min-h-0">
      <div ref={containerRef} className="flex-1 min-h-0" />
      {panes.map((p, i) => (
        <div key={p.id} className="border-t" style={{ borderColor: C.border, height: 130 }} >
          <div className="text-[10px] px-2 pt-0.5" style={{ color: "#787b86" }}>
            {p.title}
          </div>
          <div ref={setPaneRef(i)} className="w-full" style={{ height: 118 }} />
        </div>
      ))}
    </div>
  );
}
