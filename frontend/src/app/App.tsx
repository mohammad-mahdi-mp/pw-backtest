import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ChartPanel } from "@/components/chart/ChartPanel";
import { DrawingToolbar } from "@/components/chart/DrawingToolbar";
import { TopBar } from "@/components/topbar/TopBar";
import { ReplayBar } from "@/components/replay/ReplayBar";
import { PaperBar } from "@/components/replay/PaperBar";
import { BottomPanel } from "@/components/bottom/BottomPanel";
import { RightSidebar } from "@/components/sidebar/RightSidebar";
import { useAppStore } from "@/stores/app";
import { useUIStore, type ActiveIndicator } from "@/stores/ui";
import type {
  Bar,
  MarkerSpec,
  PaneSpec,
  PlotSeries,
  PriceLineSpec,
  ReplayEvent,
  SessionDetail,
} from "@/types";
import { fmtNumber, fmtPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

type Toast = { id: number; text: string; kind: "info" | "good" | "bad" };

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
    paperActive,
    paperSessionId,
    setPaper,
    rightSidebarOpen,
    bottomPanelOpen,
  } = useUIStore();
  const qc = useQueryClient();

  const [overlays, setOverlays] = useState<PlotSeries[]>([]);
  const [panes, setPanes] = useState<PaneSpec[]>([]);
  const [indValues, setIndValues] = useState<Record<string, string>>({});
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(1);

  // ---------- data ----------
  const { data, isLoading } = useQuery({
    queryKey: ["bars", symbol, timeframe],
    queryFn: () => api.getBars(symbol, timeframe, 3000),
    refetchOnWindowFocus: false,
    // paper mode: keep pulling fresh bars (server refreshes parquet in the background)
    refetchInterval: paperActive ? 5000 : false,
  });
  const bars: Bar[] = useMemo(() => data?.bars ?? [], [data]);

  // ---------- live session (positions, orders, equity) ----------
  const { data: session } = useQuery<SessionDetail>({
    queryKey: ["session", sessionId],
    queryFn: () => api.getSession(sessionId!),
    enabled: !!sessionId,
    refetchInterval: 1500,
  });

  // ---------- replay: hide the future ----------
  const visibleBars = useMemo(() => {
    if (!replayActive || !replayTime) return bars;
    return bars.filter((b) => b.time <= replayTime);
  }, [bars, replayActive, replayTime]);

  const barsKey = `${symbol}|${timeframe}|${visibleBars.length}|${visibleBars[visibleBars.length - 1]?.time ?? 0}`;

  // ---------- toasts ----------
  const toast = useCallback((text: string, kind: Toast["kind"] = "info") => {
    const id = toastId.current++;
    setToasts((t) => [...t.slice(-4), { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const handleEvents = useCallback(
    (events: ReplayEvent[]) => {
      if (!events?.length) return;
      for (const ev of events) {
        if (ev.type === "order_filled") {
          toast(`${(ev.side ?? "").toUpperCase()} ${fmtNumber(ev.size ?? 0, 2)} filled @ ${ev.price}`, "info");
        } else if (ev.type === "position_closed") {
          const pnl = ev.pnl ?? 0;
          toast(
            `Closed ${ev.side === "long" ? "LONG" : "SHORT"} ${fmtNumber(ev.closed_size ?? 0, 2)} @ ${ev.exit_price ?? ev.price} · ${pnl >= 0 ? "+" : ""}$${fmtNumber(pnl, 2)} (${ev.reason === "sl" ? "SL" : ev.reason === "tp" ? "TP" : "manual"})`,
            pnl >= 0 ? "good" : "bad"
          );
        } else if (ev.type === "position_reduced") {
          toast(`Reduced to ${fmtNumber(ev.remaining_size ?? 0, 2)} @ ${ev.exit_price ?? ev.price}`, "info");
        } else if (ev.type === "position_opened") {
          toast(`${ev.side === "long" ? "LONG" : "SHORT"} ${fmtNumber(ev.size ?? 0, 2)} @ ${ev.entry_price ?? ev.price}`, "info");
        }
      }
      qc.invalidateQueries({ queryKey: ["session", sessionId] });
    },
    [toast, qc, sessionId]
  );

  // ---------- replay controls ----------
  const step = useCallback(
    async (n: number) => {
      if (!sessionId) return;
      try {
        const r = await api.advance(sessionId, n);
        setReplay({ replayTime: new Date(r.current_time).getTime() / 1000 });
        if (r.events?.length) handleEvents(r.events);
      } catch {
        /* ignore */
      }
    },
    [sessionId, setReplay, handleEvents]
  );
  const stepRef = useRef(step);
  stepRef.current = step;

  // ---------- paper trading ----------
  const stopPaper = useCallback(
    async (silent = false) => {
      const pid = useUIStore.getState().paperSessionId;
      if (pid) {
        try {
          await api.paperStop(pid);
        } catch {
          /* ignore */
        }
      }
      setPaper({ paperActive: false, paperSessionId: null });
      setSessionId(null);
      if (!silent) toast("Paper trading stopped", "info");
    },
    [setPaper, setSessionId, toast]
  );

  const togglePaper = useCallback(async () => {
    if (paperActive) {
      await stopPaper();
      return;
    }
    try {
      if (replayActive) setReplay({ replayActive: false, replayPlaying: false });
      const s = await api.paperStart({ symbol, timeframe, cash: 100000 });
      setSessionId(s.id);
      setPaper({ paperActive: true, paperSessionId: s.id });
      useUIStore.getState().setBottomTab("trade");
      toast(`Paper trading live — ${symbol} ${timeframe}`, "info");
    } catch (e: any) {
      const m = (e?.message || "").match(/"detail":"([^"]+)"/);
      toast(m ? m[1] : "Could not start paper session", "bad");
    }
  }, [paperActive, replayActive, symbol, timeframe, setPaper, setSessionId, setReplay, stopPaper, toast]);

  // one live session at a time: switching symbol/timeframe stops paper
  const paperSymRef = useRef<string>("");
  useEffect(() => {
    const key = `${symbol}|${timeframe}`;
    if (paperSymRef.current && paperSymRef.current !== key && paperActive) {
      stopPaper(true);
      toast("Paper session stopped (symbol switched)", "info");
    }
    paperSymRef.current = key;
  }, [symbol, timeframe, paperActive, stopPaper, toast]);

  // surface server-side auto-advance events (SL/TP fills, pending triggers)
  const seenEvents = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!paperActive || !session?.events?.length) return;
    const fresh = session.events.filter((e) => {
      const key = `${e.type}|${e.time}|${e.price ?? e.exit_price ?? e.order_id ?? ""}`;
      if (seenEvents.current.has(key)) return false;
      seenEvents.current.add(key);
      return true;
    });
    if (fresh.length) {
      handleEvents(fresh);
      if (seenEvents.current.size > 300) seenEvents.current = new Set([...seenEvents.current].slice(-150));
    }
  }, [session, paperActive, handleEvents]);

  const toggleReplay = useCallback(async () => {
    if (replayActive) {
      setReplay({ replayActive: false, replayPlaying: false });
      return;
    }
    if (!bars.length) return;
    if (paperActive) await stopPaper(true); // one live session at a time
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
      toast(`Replay started — ${symbol} ${timeframe}`, "info");
    } catch {
      /* ignore */
    }
  }, [replayActive, bars, symbol, timeframe, setReplay, setSessionId, toast, paperActive, stopPaper]);

  const closePos = useCallback(async () => {
    if (!sessionId) return;
    try {
      const r = await api.closePosition(sessionId);
      handleEvents(r.events ?? []);
    } catch (e: any) {
      toast(e?.message?.includes("No open position") ? "No open position" : "Close failed", "bad");
    }
  }, [sessionId, handleEvents, toast]);

  // play loop
  useEffect(() => {
    if (!replayPlaying || !sessionId) return;
    const perTick = Math.max(1, Math.round(replaySpeed / 5));
    const intervalMs = Math.max(60, 500 / Math.min(replaySpeed, 5));
    const t = setInterval(() => stepRef.current(perTick), intervalMs);
    return () => clearInterval(t);
  }, [replayPlaying, replaySpeed, sessionId]);

  // stop replay at the end of data
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
      } else if ((e.key === "x" || e.key === "X") && sessionId) {
        e.preventDefault();
        closePos();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [replayActive, sessionId, setReplay, closePos]);

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

  // ---------- chart price lines & markers from session ----------
  const priceLines: PriceLineSpec[] = useMemo(() => {
    if (!session) return [];
    const out: PriceLineSpec[] = [];
    const pos = session.position;
    if (pos) {
      out.push({
        price: pos.entry_price,
        color: "#2962ff",
        title: `${pos.side === "long" ? "LONG" : "SHORT"} ${pos.size} @ ${fmtPrice(pos.entry_price, session.symbol)}`,
      });
      if (pos.stop_loss != null) out.push({ price: pos.stop_loss, color: "#ef5350", title: `SL ${fmtPrice(pos.stop_loss, session.symbol)}`, dashed: false });
      if (pos.take_profit != null) out.push({ price: pos.take_profit, color: "#26a69a", title: `TP ${fmtPrice(pos.take_profit, session.symbol)}`, dashed: false });
    }
    for (const o of session.pending_orders ?? []) {
      if (o.price != null) {
        out.push({
          price: o.price,
          color: "#ff9800",
          title: `${o.side.toUpperCase()} ${o.type.toUpperCase()} ${o.size}`,
        });
      }
    }
    return out;
  }, [session]);

  const markers: MarkerSpec[] = useMemo(() => {
    if (!session) return [];
    const out: MarkerSpec[] = [];
    const pos = session.position;
    if (pos?.entry_time) {
      out.push({
        time: new Date(pos.entry_time).getTime() / 1000,
        position: pos.side === "long" ? "belowBar" : "aboveBar",
        color: pos.side === "long" ? "#26a69a" : "#ef5350",
        shape: pos.side === "long" ? "arrowUp" : "arrowDown",
        text: `${pos.side === "long" ? "B" : "S"} ${pos.size}`,
      });
    }
    for (const t of session.trades ?? []) {
      if (t.exit_time == null) continue;
      if (t.entry_time) {
        out.push({
          time: new Date(t.entry_time).getTime() / 1000,
          position: t.side === "long" ? "belowBar" : "aboveBar",
          color: t.side === "long" ? "#26a69a" : "#ef5350",
          shape: t.side === "long" ? "arrowUp" : "arrowDown",
          text: `${t.side === "long" ? "B" : "S"} ${t.size}`,
        });
      }
      out.push({
        time: new Date(t.exit_time).getTime() / 1000,
        position: t.side === "long" ? "aboveBar" : "belowBar",
        color: t.pnl >= 0 ? "#26a69a" : "#ef5350",
        shape: "circle",
        text: `${t.pnl >= 0 ? "+" : ""}${fmtNumber(t.pnl, 0)}`,
      });
    }
    return out;
  }, [session]);

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
      <TopBar replayActive={replayActive} onToggleReplay={toggleReplay} paperActive={paperActive} onTogglePaper={togglePaper} />

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
                priceLines={priceLines}
                markers={markers}
              />
            )}

            {replayActive && <ReplayBar onStep={step} onExit={() => toggleReplay()} />}
            {paperActive && !replayActive && <PaperBar onStop={() => stopPaper()} />}
          </div>

          {bottomPanelOpen && <BottomPanel />}
        </div>

        {rightSidebarOpen && <RightSidebar />}
      </div>

      {/* Toasts */}
      <div className="fixed top-12 right-3 z-[60] flex flex-col gap-1.5 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "px-3 py-2 rounded-md border shadow-xl text-[12px] font-semibold max-w-[380px] backdrop-blur",
              t.kind === "good" && "bg-[#182b29]/95 border-bull/60 text-bull",
              t.kind === "bad" && "bg-[#2b1818]/95 border-bear/60 text-bear",
              t.kind === "info" && "bg-tvpanel/95 border-tvborder text-[#d1d4dc]"
            )}
          >
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
