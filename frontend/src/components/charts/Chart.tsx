import { useEffect, useRef, useState, useCallback } from "react";
import { createChart } from "lightweight-charts";
import type {
  IChartApi,
  ISeriesApi,
  CandlestickData,
  Time,
  LineData,
  HistogramData,
} from "lightweight-charts";
import type { Bar, PlotSeries } from "@/types";

type Props = {
  bars: Bar[];
  overlays?: PlotSeries[];
  panes?: PlotSeries[];
  height?: number;
  onCrosshair?: (b: Bar | null) => void;
};

export function Chart({ bars, overlays = [], panes = [], height = 500, onCrosshair }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const overlayRefs = useRef<ISeriesApi<any>[]>([]);
  const paneContainers = useRef<(HTMLDivElement | null)[]>([]);
  const paneCharts = useRef<IChartApi[]>([]);

  const [lastBar, setLastBar] = useState<Bar | null>(null);

  // Create main chart
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: "#131722" },
        textColor: "#d1d4dc",
        fontFamily: "Inter, ui-sans-serif, system-ui",
      },
      grid: {
        vertLines: { color: "#1e222d" },
        horzLines: { color: "#1e222d" },
      },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: "#2a2e39" },
      timeScale: { borderColor: "#2a2e39", timeVisible: true, secondsVisible: false },
      width: containerRef.current.clientWidth,
      height,
    });
    chartRef.current = chart;

    const candles = chart.addCandlestickSeries({
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderUpColor: "#26a69a",
      borderDownColor: "#ef5350",
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
    });
    mainSeriesRef.current = candles;

    chart.subscribeCrosshairMove((p) => {
      if (!p || !p.time) {
        setLastBar(null);
        onCrosshair?.(null);
        return;
      }
      const d = p.seriesData.get(candles) as CandlestickData<Time> | undefined;
      if (d) {
        const bar: Bar = {
          time: d.time as number,
          open: d.open as number,
          high: d.high as number,
          low: d.low as number,
          close: d.close as number,
          volume: 0,
        };
        setLastBar(bar);
        onCrosshair?.(bar);
      }
    });

    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      mainSeriesRef.current = null;
      overlayRefs.current = [];
    };
  }, [height, onCrosshair]);

  // Load bars
  useEffect(() => {
    if (!mainSeriesRef.current || !chartRef.current) return;
    const data: CandlestickData<Time>[] = bars.map((b) => ({
      time: b.time as Time,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
    }));
    mainSeriesRef.current.setData(data);
    if (data.length) chartRef.current.timeScale().fitContent();
  }, [bars]);

  // Overlays
  useEffect(() => {
    if (!chartRef.current) return;
    overlayRefs.current.forEach((s) => chartRef.current!.removeSeries(s));
    overlayRefs.current = [];
    for (const o of overlays) {
      const s = chartRef.current.addLineSeries({
        color: o.color || "#2962FF",
        lineWidth: 2,
        priceLineVisible: false,
      });
      s.setData(o.data.map((d) => ({ time: d.time as Time, value: d.value } as LineData<Time>)));
      overlayRefs.current.push(s);
    }
  }, [overlays]);

  // Sub-panes
  const setPaneRef = useCallback((idx: number) => (el: HTMLDivElement | null) => {
    paneContainers.current[idx] = el;
  }, []);

  useEffect(() => {
    paneCharts.current.forEach((c) => c.remove());
    paneCharts.current = [];

    panes.forEach((p, idx) => {
      const container = paneContainers.current[idx];
      if (!container) return;
      const chart = createChart(container, {
        layout: { background: { color: "#131722" }, textColor: "#d1d4dc" },
        grid: { vertLines: { color: "#1e222d" }, horzLines: { color: "#1e222d" } },
        rightPriceScale: { borderColor: "#2a2e39" },
        timeScale: { borderColor: "#2a2e39", visible: false },
        width: container.clientWidth,
        height: 150,
      });
      let s: ISeriesApi<any>;
      if (p.type === "histogram") {
        s = chart.addHistogramSeries({ color: p.color, priceLineVisible: false });
      } else {
        s = chart.addLineSeries({ color: p.color, lineWidth: 2, priceLineVisible: false });
      }
      const mapped = p.data.map((d) =>
        p.type === "histogram"
          ? ({ time: d.time as Time, value: d.value } as HistogramData<Time>)
          : ({ time: d.time as Time, value: d.value } as LineData<Time>)
      );
      s.setData(mapped as any);

      // sync time scale with main chart
      if (chartRef.current) {
        const mainTs = chartRef.current.timeScale();
        const paneTs = chart.timeScale();
        mainTs.subscribeVisibleLogicalRangeChange((r) => {
          if (r) paneTs.setVisibleLogicalRange(r);
        });
        mainTs.subscribeVisibleTimeRangeChange((r) => {
          if (r) paneTs.setVisibleRange({ from: r.from, to: r.to });
        });
      }

      const ro = new ResizeObserver(() => {
        chart.applyOptions({ width: container.clientWidth });
      });
      ro.observe(container);

      paneCharts.current.push(chart);
    });

    return () => {
      paneCharts.current.forEach((c) => c.remove());
      paneCharts.current = [];
    };
  }, [panes, bars.length]);

  return (
    <div className="flex flex-col w-full h-full">
      <div ref={containerRef} className="chart-container bg-tvbg rounded-md" />
      <div className="flex flex-col">
        {panes.map((p, i) => (
          <div key={p.id} className="border-t border-tvborder">
            <div className="text-[10px] text-muted-foreground px-2 py-0.5">{p.title}</div>
            <div ref={setPaneRef(i)} className="chart-container bg-tvbg" style={{ height: 150 }} />
          </div>
        ))}
      </div>
      {lastBar && (
        <div className="text-xs text-muted-foreground px-2 py-1 flex gap-3">
          <span>O <span className="text-slate-200">{lastBar.open.toFixed(5)}</span></span>
          <span>H <span className="text-bull">{lastBar.high.toFixed(5)}</span></span>
          <span>L <span className="text-bear">{lastBar.low.toFixed(5)}</span></span>
          <span>C <span className="text-slate-200">{lastBar.close.toFixed(5)}</span></span>
          <span className="ml-2">{new Date(lastBar.time * 1000).toISOString().replace("T", " ").slice(0, 19)}</span>
        </div>
      )}
    </div>
  );
}
