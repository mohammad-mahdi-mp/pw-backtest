import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Chart } from "@/components/charts/Chart";
import { Watchlist } from "@/components/watchlist/Watchlist";
import { TopBar } from "@/components/topbar/TopBar";
import { PineEditor } from "@/components/pine-editor/PineEditor";
import { ReplayControls } from "@/components/replay/ReplayControls";
import { OrderTicket } from "@/components/replay/OrderTicket";
import { PositionsPanel } from "@/components/replay/PositionsPanel";
import { useAppStore } from "@/stores/app";
import type { PlotSeries } from "@/types";

export default function App() {
  const { symbol, timeframe } = useAppStore();
  const [overlays, setOverlays] = useState<PlotSeries[]>([]);
  const [panes, setPanes] = useState<PlotSeries[]>([]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["bars", symbol, timeframe],
    queryFn: () => api.getBars(symbol, timeframe, 2000),
    refetchOnWindowFocus: false,
  });

  const bars = data?.bars || [];

  // detect pane vs overlay: assume RSI/histogram go to sub-panes; everything else overlay.
  // (Simple heuristic for MVP; proper handling from IR later.)
  const runPine = async (source: string) => {
    if (!bars.length) return;
    const r = await api.runScript(source, bars);
    if (!r.ok) {
      console.error("pine error", r.error);
      return;
    }
    const series: PlotSeries[] = r.series || [];
    const isPane = (t: string) => /rsi/i.test(t) || /macd\.hist/i.test(t);
    setOverlays(series.filter((s) => !isPane(s.title)));
    setPanes(series.filter((s) => isPane(s.title)));
  };

  useEffect(() => {
    // Clear overlays when symbol changes
    setOverlays([]);
    setPanes([]);
    refetch();
  }, [symbol, timeframe, refetch]);

  const chartHeight = useMemo(() => {
    const paneHeight = panes.length ? panes.length * 160 : 0;
    return Math.max(300, 500 - paneHeight);
  }, [panes.length]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-tvbg">
      <TopBar />
      <div className="flex flex-1 min-h-0">
        {/* Left sidebar: watchlist */}
        <aside className="w-56 shrink-0 border-r border-tvborder">
          <Watchlist />
        </aside>

        {/* Center: chart + replay controls */}
        <main className="flex-1 min-w-0 flex flex-col">
          <ReplayControls />
          <div className="flex-1 min-h-0 p-2 bg-tvbg">
            {isLoading ? (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                Loading {symbol} {timeframe}…
              </div>
            ) : bars.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-2">
                <div>No data for {symbol} on {timeframe}.</div>
                <div className="text-xs">Click <span className="text-primary">Load Data</span> to download from Binance/Yahoo.</div>
              </div>
            ) : (
              <Chart bars={bars} overlays={overlays} panes={panes} height={chartHeight} />
            )}
          </div>
        </main>

        {/* Right sidebar: order ticket + positions */}
        <aside className="w-72 shrink-0 flex flex-col border-l border-tvborder">
          <OrderTicket />
          <PositionsPanel />
        </aside>
      </div>

      {/* Bottom: Pine editor */}
      <div className="h-80 border-t border-tvborder">
        <PineEditor onRun={runPine} />
      </div>
    </div>
  );
}
