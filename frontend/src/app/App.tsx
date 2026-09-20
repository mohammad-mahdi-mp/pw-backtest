import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ChartPanel } from "@/components/chart/ChartPanel";
import { DrawingToolbar } from "@/components/chart/DrawingToolbar";
import { TopBar } from "@/components/topbar/TopBar";
import { ReplayBar } from "@/components/replay/ReplayBar";
import { BottomPanel } from "@/components/bottom/BottomPanel";
import { RightSidebar } from "@/components/sidebar/RightSidebar";
import { useAppStore } from "@/stores/app";
import { useUIStore, type ActiveIndicator } from "@/stores/ui";
import type { Bar, PaneSpec, PlotSeries } from "@/types";

export default function App() {
  const { symbol, timeframe, sessionId, setSessionId } = useAppStore();
  const {
    indicators,
    addIndicator,
    removeIndicator,
    replayActive,
    replayPlaying,
    replaySpeed,
    replayTime,
    setReplay,
    rightSidebarOpen,
    bottomPanelOpen,
  } = useUIStore();

  const [overlays, setOverlays] = useState<PlotSeries[]>([]);
  const [panes, setPanes] = useState<PaneSpec[]>([]);
  const [indValues, setIndValues] = useState<Record<string, string>>({});

  // ---------- data ----------
  const { data, isLoading } = useQuery({
    queryKey: ["bars", symbol, timeframe],
    queryFn: () => api.getBars(symbol, timeframe, 3000),
    refetchOnWindowFocus: false,
  });
  const bars: Bar[] = useMemo(() => data?.bars ?? [], [data]);

  // ---------- replay: hide the future ----------
  const visibleBars = useMemo(() => {
    if (!replayActive || !replayTime) return bars;
    return bars.filter((b) => b.time <= replayTime);
  }, [bars, replayActive, replayTime]);

  const barsKey = `${symbol}|${timeframe}|${visibleBars.length}|${visibleBars[visibleBars.length - 1]?.time ?? 0}`;

  // ---------- replay controls ----------
  const step = useCallback(
    async (n: number) => {
      if (!sessionId) return;
      try {
        const r = await api.advance(sessionId, n);
        const t = new Date(r.current_time).getTime() / 1000;
        setReplay({ replayTime: t });
      } catch {
        /* ignore */
      }
    },
    [sessionId, setReplay]
  );
  const stepRef = useRef(step);
  stepRef.current = step;

  const toggleReplay = useCallback(async () => {
    if (replayActive) {
      setReplay({ replayActive: false, replayPlaying: false });
      return;
    }
    if (!bars.length) return;
    const startIdx = Math.max(0, bars.length - 300);
    const startTime = new Date(bars[startIdx].time * 1000).toISOString();
    try {
      const s = await api.createSession({ symbol, timeframe, start_time: startTime, cash: 100000 });
      setSessionId(s.id);
      setReplay({
        replayActive: true,
        replayPlaying: false,
        replayTime: new Date(s.current_time).getTime() / 1000,
      });
      useUIStore.getState().setBottomTab("trade");
    } catch {
      /* ignore */
    }
  }, [replayActive, bars, symbol, timeframe, setReplay, setSessionId]);

  // play loop
  useEffect(() => {
    if (!replayPlaying || !sessionId) return;
    const perTick = Math.max(1, Math.round(replaySpeed / 5));
    const intervalMs = Math.max(60, 500 / Math.min(replaySpeed, 5));
    const t = setInterval(() => stepRef.current(perTick), intervalMs);
    return () => clearInterval(t);
  }, [replayPlaying, replaySpeed, sessionId]);

  // stop replay if we run off the end of data
  useEffect(() => {
    if (replayActive && replayTime && bars.length) {
      const last = bars[bars.length - 1].time;
      if (replayTime >= last) setReplay({ replayPlaying: false });
    }
  }, [replayActive, replayTime, bars, setReplay]);

  // ---------- keyboard shortcuts ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as any)?.editor) return;
      if (e.code === "Space" && replayActive) {
        e.preventDefault();
        setReplay({ replayPlaying: !useUIStore.getState().replayPlaying });
      } else if (e.key === "ArrowRight" && replayActive) {
        e.preventDefault();
        stepRef.current(1);
      } else if (e.key === "ArrowLeft" && replayActive) {
        e.preventDefault();
        stepRef.current(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [replayActive, setReplay]);

  // ---------- indicators ----------
  const indKey = indicators.map((i) => i.id).join(",");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!visibleBars.length || indicators.length === 0) {
        setOverlays([]);
        setPanes([]);
        setIndValues({});
        return;
      }
      const results = await Promise.all(
        indicators.map(async (ind) => {
          try {
            const r = await api.runScript(ind.source, visibleBars);
            if (!r.ok) return null;
            return { ind, series: (r.series ?? []) as PlotSeries[] };
          } catch {
            return null;
          }
        })
      );
      if (cancelled) return;
      const ov: PlotSeries[] = [];
      const pn: PaneSpec[] = [];
      const vals: Record<string, string> = {};
      results.forEach((res) => {
        if (!res) return;
        if (res.ind.overlay) {
          ov.push(...res.series);
        } else {
          pn.push({ id: res.ind.id, title: res.ind.title, series: res.series });
        }
        const last = res.series[0]?.data?.at(-1);
        vals[res.ind.id] = last ? last.value.toFixed(2) : "";
      });
      setOverlays(ov);
      setPanes(pn);
      setIndValues(vals);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indKey, barsKey]);

  const addToChart = useCallback(
    async (title: string, source: string) => {
      let overlay = true;
      try {
        const c = await api.compileScript(source);
        if (c.ok) overlay = !!c.ir?.overlay;
      } catch {
        /* default overlay */
      }
      const ind: ActiveIndicator = {
        id: `ind-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title,
        source,
        overlay,
      };
      addIndicator(ind);
    },
    [addIndicator]
  );

  return (
    <div className="h-screen w-screen flex flex-col bg-tvbg overflow-hidden select-none">
      <TopBar replayActive={replayActive} onToggleReplay={toggleReplay} />

      <div className="flex flex-1 min-h-0">
        <DrawingToolbar />

        <div className="flex-1 min-w-0 flex flex-col">
          <div className="relative flex-1 min-h-0">
            {isLoading ? (
              <div className="flex items-center justify-center h-full text-[13px] text-[#787b86]">
                Loading {symbol} · {timeframe}…
              </div>
            ) : visibleBars.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-[#787b86] text-[13px]">
                <div className="text-[15px] text-[#d1d4dc]">No data for {symbol} · {timeframe}</div>
                <div>
                  Press <span className="text-primary font-semibold">Load Data</span> in the top bar to
                  download from Binance/Yahoo, or run{" "}
                  <code className="text-[#d1d4dc] bg-[#2a2e39] px-1 rounded">python scripts/seed_sample_data.py</code>{" "}
                  for demo data.
                </div>
                {replayActive && <div className="text-[#d1d4dc]">Replay is active — step forward to reveal bars.</div>}
              </div>
            ) : (
              <ChartPanel
                bars={visibleBars}
                overlays={overlays}
                panes={panes}
                indicators={indicators}
                indicatorValues={indValues}
                onRemoveIndicator={removeIndicator}
              />
            )}

            {replayActive && <ReplayBar onStep={step} onExit={() => toggleReplay()} />}
          </div>

          {bottomPanelOpen && <BottomPanel />}
        </div>

        {rightSidebarOpen && <RightSidebar />}
      </div>
    </div>
  );
}
