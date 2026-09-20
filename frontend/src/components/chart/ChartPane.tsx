import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ChartPanel } from "@/components/chart/ChartPanel";
import type { PaneConfig } from "@/stores/layout";
import { useUIStore, type ActiveIndicator } from "@/stores/ui";
import type {
  Bar,
  MarkerSpec,
  PaneSpec,
  PlotSeries,
  PriceLineSpec,
  SessionDetail,
} from "@/types";
import { fmtNumber, fmtPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = {
  pane: PaneConfig;
  active: boolean;
  onFocus: () => void;
  /** live/replay session driving lines & markers (only matching symbol panes render them) */
  session?: SessionDetail;
  replayActive: boolean;
  replayTime: number | null;
  paperActive: boolean;
  onRemoveIndicator: (paneId: string, indId: string) => void;
};

export function ChartPane({
  pane,
  active,
  onFocus,
  session,
  replayActive,
  replayTime,
  paperActive,
  onRemoveIndicator,
}: Props) {
  const { symbol, timeframe } = pane;
  const setReplay = useUIStore((s) => s.setReplay);
  const [overlays, setOverlays] = useState<PlotSeries[]>([]);
  const [subPanes, setSubPanes] = useState<PaneSpec[]>([]);
  const [indValues, setIndValues] = useState<Record<string, string>>({});

  const isSessionPane = !!session && session.symbol === symbol;

  // ---------- data ----------
  const { data, isLoading } = useQuery({
    queryKey: ["bars", symbol, timeframe],
    queryFn: () => api.getBars(symbol, timeframe, 3000),
    refetchOnWindowFocus: false,
    refetchInterval: paperActive && isSessionPane ? 5000 : false,
  });
  const bars: Bar[] = useMemo(() => data?.bars ?? [], [data]);

  // replay hides the future only on the replayed symbol's pane
  const visibleBars = useMemo(() => {
    if (!replayActive || !replayTime || !isSessionPane) return bars;
    return bars.filter((b) => b.time <= replayTime);
  }, [bars, replayActive, replayTime, isSessionPane]);

  const barsKey = `${symbol}|${timeframe}|${visibleBars.length}|${visibleBars[visibleBars.length - 1]?.time ?? 0}`;

  // stop replay play-loop at the end of data
  useEffect(() => {
    if (replayActive && replayTime && isSessionPane && bars.length) {
      const last = bars[bars.length - 1].time;
      if (replayTime >= last) setReplay({ replayPlaying: false });
    }
  }, [replayActive, replayTime, isSessionPane, bars, setReplay]);

  // ---------- indicators (per pane) ----------
  const indKey = pane.indicators.map((i) => i.id).join(",");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!visibleBars.length || pane.indicators.length === 0) {
        setOverlays([]);
        setSubPanes([]);
        setIndValues({});
        return;
      }
      const results = await Promise.all(
        pane.indicators.map(async (ind) => {
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
        if (res.ind.overlay) ov.push(...res.series);
        else pn.push({ id: res.ind.id, title: res.ind.title, series: res.series });
        const last = res.series[0]?.data?.at(-1);
        vals[res.ind.id] = last ? last.value.toFixed(2) : "";
      });
      setOverlays(ov);
      setSubPanes(pn);
      setIndValues(vals);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indKey, barsKey, symbol, timeframe]);

  // ---------- session price lines & markers ----------
  const priceLines: PriceLineSpec[] = useMemo(() => {
    if (!isSessionPane || !session) return [];
    const out: PriceLineSpec[] = [];
    const pos = session.position;
    if (pos) {
      out.push({
        price: pos.entry_price,
        color: "#2962ff",
        title: `${pos.side === "long" ? "LONG" : "SHORT"} ${pos.size} @ ${fmtPrice(pos.entry_price, session.symbol)}`,
      });
      if (pos.stop_loss != null)
        out.push({ price: pos.stop_loss, color: "#ef5350", title: `SL ${fmtPrice(pos.stop_loss, session.symbol)}`, dashed: false });
      if (pos.take_profit != null)
        out.push({ price: pos.take_profit, color: "#26a69a", title: `TP ${fmtPrice(pos.take_profit, session.symbol)}`, dashed: false });
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
  }, [session, isSessionPane]);

  const markers: MarkerSpec[] = useMemo(() => {
    if (!isSessionPane || !session) return [];
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
  }, [session, isSessionPane]);

  return (
    <div
      className={cn(
        "relative flex-1 min-w-0 min-h-0 bg-tvbg",
        active ? "ring-1 ring-primary/70 ring-inset z-[5]" : "cursor-pointer"
      )}
      onMouseDown={onFocus}
    >
      {isLoading ? (
        <div className="absolute inset-0 flex items-center justify-center text-[13px] text-[#787b86]">
          Loading {symbol} · {timeframe}…
        </div>
      ) : visibleBars.length === 0 ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[#787b86] text-[13px]">
          <div className="text-[15px] text-[#d1d4dc]">No data for {symbol} · {timeframe}</div>
          <div>
            Press <span className="text-primary font-semibold">Load Data</span> in the top bar, or run{" "}
            <code className="text-[#d1d4dc] bg-[#2a2e39] px-1 rounded">python scripts/seed_sample_data.py</code>
          </div>
          {replayActive && isSessionPane && (
            <div className="text-[#d1d4dc]">Replay is active — step forward to reveal bars.</div>
          )}
        </div>
      ) : (
        <ChartPanel
          symbol={symbol}
          timeframe={timeframe}
          chartType={pane.chartType}
          showVolume={pane.showVolume}
          autoScroll={replayActive || (paperActive && isSessionPane)}
          bars={visibleBars}
          overlays={overlays}
          panes={subPanes}
          indicators={pane.indicators}
          indicatorValues={indValues}
          onRemoveIndicator={(id) => onRemoveIndicator(pane.id, id)}
          priceLines={priceLines}
          markers={markers}
        />
      )}
    </div>
  );
}

export type { ActiveIndicator };
