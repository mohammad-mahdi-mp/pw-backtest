import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { TopBar } from "@/components/topbar/TopBar";
import { DrawingToolbar } from "@/components/chart/DrawingToolbar";
import { ChartPane } from "@/components/chart/ChartPane";
import { ReplayBar } from "@/components/replay/ReplayBar";
import { PaperBar } from "@/components/replay/PaperBar";
import { BottomPanel } from "@/components/bottom/BottomPanel";
import { RightSidebar } from "@/components/sidebar/RightSidebar";
import { useAppStore } from "@/stores/app";
import { useUIStore } from "@/stores/ui";
import { useLayoutStore, visiblePanes } from "@/stores/layout";
import { comboOf, matchAction, useShortcutStore } from "@/stores/shortcuts";
import type { ReplayEvent, SessionDetail } from "@/types";
import { fmtNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

type Toast = { id: number; text: string; kind: "info" | "good" | "bad" };

export default function App() {
  const { symbol, timeframe, sessionId, setSessionId } = useAppStore();
  const {
    replayActive,
    replayPlaying,
    replaySpeed,
    replayTime,
    setReplay,
    paperActive,
    paperSessionId,
    setPaper,
    toggleBottomPanel,
    toggleRightSidebar,
    bottomPanelOpen,
    rightSidebarOpen,
  } = useUIStore();
  const { grid, panes, activePane, setActivePane, cyclePane, removeIndicator } = useLayoutStore();
  const shortcutBindings = useShortcutStore((s) => s.bindings);
  const qc = useQueryClient();

  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(1);

  // ---------- active pane → app store mirror (panels read symbol/timeframe) ----------
  const activeCfg = panes.find((p) => p.id === activePane) ?? panes[0];
  useEffect(() => {
    if (activeCfg && activeCfg.symbol !== symbol) useAppStore.getState().setSymbol(activeCfg.symbol);
    if (activeCfg && activeCfg.timeframe !== timeframe) useAppStore.getState().setTimeframe(activeCfg.timeframe);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCfg?.symbol, activeCfg?.timeframe]);

  // ---------- live session (positions, orders, equity) ----------
  const { data: session } = useQuery<SessionDetail>({
    queryKey: ["session", sessionId],
    queryFn: () => api.getSession(sessionId!),
    enabled: !!sessionId,
    refetchInterval: 1500,
  });

  // ---------- toasts + desktop notifications ----------
  const toast = useCallback((text: string, kind: Toast["kind"] = "info") => {
    const id = toastId.current++;
    setToasts((t) => [...t.slice(-4), { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const handleEvents = useCallback(
    (events: ReplayEvent[]) => {
      if (!events?.length) return;
      for (const ev of events) {
        let text = "";
        let good: Toast["kind"] = "info";
        if (ev.type === "order_filled") {
          text = `${(ev.side ?? "").toUpperCase()} ${fmtNumber(ev.size ?? 0, 2)} filled @ ${ev.price}`;
        } else if (ev.type === "position_closed") {
          const pnl = ev.pnl ?? 0;
          good = pnl >= 0 ? "good" : "bad";
          text = `Closed ${ev.side === "long" ? "LONG" : "SHORT"} ${fmtNumber(ev.closed_size ?? 0, 2)} @ ${ev.exit_price ?? ev.price} · ${pnl >= 0 ? "+" : ""}$${fmtNumber(pnl, 2)} (${ev.reason === "sl" ? "SL" : ev.reason === "tp" ? "TP" : "manual"})`;
        } else if (ev.type === "position_reduced") {
          text = `Reduced to ${fmtNumber(ev.remaining_size ?? 0, 2)} @ ${ev.exit_price ?? ev.price}`;
        } else if (ev.type === "position_opened") {
          text = `${ev.side === "long" ? "LONG" : "SHORT"} ${fmtNumber(ev.size ?? 0, 2)} @ ${ev.entry_price ?? ev.price}`;
        }
        if (!text) continue;
        toast(text, good);
        if (
          typeof Notification !== "undefined" &&
          Notification.permission === "granted" &&
          document.hidden
        ) {
          try {
            new Notification("pw-backtest", { body: text, tag: `pw-${ev.type}-${ev.time ?? ""}` });
          } catch {
            /* ignore */
          }
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

  const toggleReplay = useCallback(async () => {
    if (replayActive) {
      setReplay({ replayActive: false, replayPlaying: false });
      return;
    }
    if (paperActive) await stopPaper(true);
    // bars of the ACTIVE pane for the replay starting point
    try {
      const d = await api.getBars(symbol, timeframe, 400);
      if (!d.bars.length) return;
      const startIdx = Math.max(0, d.bars.length - 300);
      const startTime = new Date(d.bars[startIdx].time * 1000).toISOString();
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
  }, [replayActive, symbol, timeframe, setReplay, setSessionId, toast, paperActive, stopPaper]);

  // ---------- paper trading ----------
  const togglePaper = useCallback(async () => {
    if (paperActive) {
      await stopPaper();
      return;
    }
    try {
      if (replayActive) setReplay({ replayActive: false, replayPlaying: false });
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        Notification.requestPermission().catch(() => undefined);
      }
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

  // surface server-side auto-advance events (paper)
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

  // ---------- keyboard shortcuts (configurable) ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as any)?.editor) return;
      const action = matchAction(useShortcutStore.getState().bindings, comboOf(e));
      if (!action) return;
      e.preventDefault();
      switch (action) {
        case "replayPlayPause":
          if (replayActive) setReplay({ replayPlaying: !useUIStore.getState().replayPlaying });
          break;
        case "stepForward":
          if (replayActive) stepRef.current(1);
          break;
        case "stepBack":
          if (replayActive) stepRef.current(-1);
          break;
        case "closePosition":
          if (sessionId) closePos();
          break;
        case "nextPane":
          cyclePane(1);
          break;
        case "prevPane":
          cyclePane(-1);
          break;
        case "toggleBottomPanel":
          toggleBottomPanel();
          break;
        case "toggleRightSidebar":
          toggleRightSidebar();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [replayActive, sessionId, setReplay, closePos, cyclePane, toggleBottomPanel, toggleRightSidebar]);

  // ---------- chart grid ----------
  const visPanes = visiblePanes(grid, panes);
  const gridClass =
    grid === "1"
      ? "flex flex-row"
      : grid === "2h"
        ? "flex flex-row"
        : grid === "2v"
          ? "flex flex-col"
          : "grid grid-cols-2 grid-rows-2";

  return (
    <div className="h-screen w-screen flex flex-col bg-tvbg overflow-hidden select-none">
      <TopBar replayActive={replayActive} onToggleReplay={toggleReplay} paperActive={paperActive} onTogglePaper={togglePaper} />

      <div className="flex flex-1 min-h-0">
        <DrawingToolbar />

        <div className="flex-1 min-w-0 flex flex-col">
          <div className={cn("relative flex-1 min-h-0 gap-px bg-tvborder", gridClass)}>
            {visPanes.map((pane, i) => (
              <ChartPane
                key={pane.id}
                pane={pane}
                active={pane.id === activePane}
                onFocus={() => setActivePane(pane.id)}
                session={session}
                replayActive={replayActive}
                replayTime={replayTime}
                paperActive={paperActive}
                onRemoveIndicator={removeIndicator}
              />
            ))}

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
