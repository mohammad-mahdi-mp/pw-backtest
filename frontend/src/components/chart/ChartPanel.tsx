import { useEffect, useMemo, useState } from "react";
import { Chart } from "@/components/charts/Chart";
import type { Bar, PaneSpec, PlotSeries } from "@/types";
import type { ActiveIndicator } from "@/stores/ui";
import { useUIStore } from "@/stores/ui";
import { useAppStore } from "@/stores/app";
import { fmtPrice, pricePrecision } from "@/lib/format";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  bars: Bar[];
  overlays: PlotSeries[];
  panes: PaneSpec[];
  indicators: ActiveIndicator[];
  indicatorValues: Record<string, string>;
  onRemoveIndicator: (id: string) => void;
};

export function ChartPanel({ bars, overlays, panes, indicators, indicatorValues, onRemoveIndicator }: Props) {
  const { symbol, timeframe } = useAppStore();
  const { chartType, showVolume } = useChartOpts();
  const [hoverBar, setHoverBar] = useState<Bar | null>(null);

  const { precision, minMove } = useMemo(() => pricePrecision(symbol), [symbol]);

  const shown = hoverBar ?? bars[bars.length - 1] ?? null;
  const up = shown ? shown.close >= shown.open : true;
  const chg = shown ? ((shown.close - shown.open) / shown.open) * 100 : 0;

  return (
    <div className="relative w-full h-full min-h-0 bg-tvbg">
      <Chart
        bars={bars}
        chartType={chartType}
        overlays={overlays}
        panes={panes}
        showVolume={showVolume}
        precision={precision}
        minMove={minMove}
        watermark={`${symbol} · ${timeframe}`}
        onCrosshair={setHoverBar}
      />

      {/* Legend — top-left, like TradingView */}
      <div className="absolute top-1.5 left-2 z-10 pointer-events-none select-none text-[12px] leading-[1.15] font-[Trebuchet_MS]">
        <div className="flex items-center gap-1.5">
          <span className="text-[#d1d4dc] font-bold">{symbol}</span>
          <span className="text-[#787b86]">·</span>
          <span className="text-[#787b86]">{tfLabel(timeframe)}</span>
          <span className="text-[#787b86]">·</span>
          <span className="text-[#787b86]">{typeLabel(chartType)}</span>
          {shown && (
            <span className="ml-1 flex gap-1.5" style={{ color: up ? "#26a69a" : "#ef5350" }}>
              <span>O<span className="text-[#d1d4dc] ml-0.5">{fmtPrice(shown.open, symbol)}</span></span>
              <span>H<span className="text-[#d1d4dc] ml-0.5">{fmtPrice(shown.high, symbol)}</span></span>
              <span>L<span className="text-[#d1d4dc] ml-0.5">{fmtPrice(shown.low, symbol)}</span></span>
              <span>C<span className="text-[#d1d4dc] ml-0.5">{fmtPrice(shown.close, symbol)}</span></span>
              <span>{chg >= 0 ? "+" : ""}{chg.toFixed(2)}%</span>
            </span>
          )}
        </div>
        {/* Indicator chips */}
        <div className="mt-1 flex flex-col gap-0.5">
          {indicators.map((ind) => (
            <div key={ind.id} className="flex items-center gap-1.5 pointer-events-auto group">
              <button
                onClick={() => onRemoveIndicator(ind.id)}
                className="opacity-0 group-hover:opacity-100 text-[#787b86] hover:text-[#ef5350]"
                title="Remove indicator"
              >
                <X className="w-3 h-3" />
              </button>
              <span className="text-[#d1d4dc] font-semibold">{ind.title}</span>
              <span className="text-[#787b86]">{indicatorValues[ind.id] || ""}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Clock — bottom-right corner above time axis */}
      <Clock />

      {/* Volume badge */}
      {shown && shown.volume > 0 && (
        <div className={cn(
          "absolute bottom-9 left-2 z-10 pointer-events-none text-[11px] flex gap-1.5"
        )} style={{ color: "#787b86" }}>
          <span>Vol</span>
          <span className="text-[#d1d4dc]">{shown.volume >= 1000 ? `${(shown.volume / 1000).toFixed(1)}K` : shown.volume.toFixed(2)}</span>
        </div>
      )}
    </div>
  );
}

function useChartOpts() {
  const chartType = useUIStore((s) => s.chartType);
  const showVolume = useUIStore((s) => s.showVolume);
  return { chartType, showVolume };
}

function tfLabel(tf: string): string {
  const m: Record<string, string> = { "1m": "1", "5m": "5", "15m": "15", "30m": "30", "1h": "60", "4h": "240", "1d": "D", "1w": "W", "1mo": "M" };
  return m[tf] ?? tf;
}

function typeLabel(t: string): string {
  const m: Record<string, string> = { candles: "Candles", bars: "Bars", line: "Line", area: "Area", heikin: "Heikin Ashi" };
  return m[t] ?? t;
}

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="absolute bottom-9 right-20 z-10 pointer-events-none text-[11px]" style={{ color: "#787b86" }}>
      {now.toLocaleTimeString("en-GB")}
    </div>
  );
}
