import { useCallback, useEffect, useRef, useState } from "react";
import type { IChartApi, ISeriesApi, Point, MouseEventParams } from "lightweight-charts";
import type { Bar } from "@/types";
import {
  useDrawStore,
  type Drawing,
  type DrawPoint,
  type DrawTool,
} from "@/stores/draw";
import type { ChartApiHandle } from "@/components/charts/Chart";

type Props = {
  api: ChartApiHandle | null;
  bars: Bar[];
};

const FIB_LEVELS = [
  { v: 0, c: "#787b86" },
  { v: 0.236, c: "#f23645" },
  { v: 0.382, c: "#ff9800" },
  { v: 0.5, c: "#4caf50" },
  { v: 0.618, c: "#2962ff" },
  { v: 0.786, c: "#9c27b0" },
  { v: 1, c: "#787b86" },
];
const SEL_COLOR = "#f0b90b";
const DRAW_COLOR = "#2962ff";

/** time (s) → logical bar index (extrapolates beyond both ends) */
function timeToLogical(time: number, bars: Bar[]): number {
  if (!bars.length) return 0;
  const n = bars.length;
  if (time <= bars[0].time) {
    const tf = bars.length > 1 ? bars[1].time - bars[0].time : 3600;
    return -(bars[0].time - time) / tf;
  }
  if (time >= bars[n - 1].time) {
    const tf = bars.length > 1 ? bars[n - 1].time - bars[n - 2].time : 3600;
    return n - 1 + (time - bars[n - 1].time) / tf;
  }
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].time <= time) lo = mid;
    else hi = mid;
  }
  const tf = bars[hi].time - bars[lo].time || 3600;
  return lo + (time - bars[lo].time) / tf;
}

/** logical bar index → time (s) */
function logicalToTime(logical: number, bars: Bar[]): number {
  if (!bars.length) return Math.floor(Date.now() / 1000);
  const n = bars.length;
  if (logical <= 0) {
    const tf = n > 1 ? bars[1].time - bars[0].time : 3600;
    return bars[0].time + logical * tf;
  }
  if (logical >= n - 1) {
    const tf = n > 1 ? bars[n - 1].time - bars[n - 2].time : 3600;
    return bars[n - 1].time + (logical - (n - 1)) * tf;
  }
  const i = Math.floor(logical);
  const tf = bars[i + 1].time - bars[i].time || 3600;
  return bars[i].time + (logical - i) * tf;
}

/** snap price to the nearest OHLC of the bar at `time` (magnet mode) */
function magnetPrice(time: number, price: number, bars: Bar[]): number {
  if (!bars.length) return price;
  let lo = 0;
  let hi = bars.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].time <= time) lo = mid;
    else hi = mid;
  }
  const b = Math.abs(bars[lo].time - time) < Math.abs(bars[hi].time - time) ? bars[lo] : bars[hi];
  const cands = [b.open, b.high, b.low, b.close];
  return cands.reduce((best, c) => (Math.abs(c - price) < Math.abs(best - price) ? c : best), cands[0]);
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2)) : 0;
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

export function DrawLayer({ api, bars }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const {
    drawings,
    activeTool,
    selectedId,
    hidden,
    magnet,
    setActiveTool,
    addDrawing,
    removeSelected,
    select,
  } = useDrawStore();

  const [draft, setDraft] = useState<DrawPoint | null>(null); // first anchor while drawing
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  const chart: IChartApi | null = api?.chart ?? null;
  const series: ISeriesApi<any> | null = api?.series ?? null;

  // ---------- coordinate helpers ----------
  const toScreen = useCallback(
    (p: DrawPoint): { x: number; y: number } | null => {
      if (!chart || !series) return null;
      try {
        const logical = timeToLogical(p.time, bars);
        const x = chart.timeScale().logicalToCoordinate(logical as any);
        const y = series.priceToCoordinate(p.price);
        if (x == null || y == null) return null;
        return { x, y };
      } catch {
        return null;
      }
    },
    [chart, series, bars]
  );

  const fromScreen = useCallback(
    (x: number, y: number): DrawPoint | null => {
      if (!chart || !series) return null;
      try {
        const logical = chart.timeScale().coordinateToLogical(x);
        const price = series.coordinateToPrice(y);
        if (logical == null || price == null) return null;
        let time = logicalToTime(Number(logical), bars);
        let p = Number(price);
        if (magnet) {
          p = magnetPrice(time, p, bars);
          time = Math.round(time / 60) * 60;
        }
        return { time, price: p };
      } catch {
        return null;
      }
    },
    [chart, series, bars, magnet]
  );

  // ---------- rendering ----------
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (hidden) return;

    const drawAnchors = (
      pts: { x: number; y: number }[],
      color: string
    ) => {
      ctx.fillStyle = "#131722";
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    };

    const drawLabel = (x: number, y: number, text: string, color: string) => {
      ctx.font = "10px Trebuchet MS, sans-serif";
      const tw = ctx.measureText(text).width;
      ctx.fillStyle = "rgba(30, 34, 45, 0.9)";
      ctx.fillRect(x, y - 8, tw + 8, 14);
      ctx.fillStyle = color;
      ctx.fillText(text, x + 4, y + 2);
    };

    for (const d of drawings) {
      const sel = d.id === selectedId;
      const color = sel ? SEL_COLOR : d.color;
      const pts = d.points.map(toScreen).filter(Boolean) as { x: number; y: number }[];
      if (!pts.length) continue;

      if (d.type === "hline") {
        const p = pts[0];
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(0, p.y);
        ctx.lineTo(w, p.y);
        ctx.stroke();
        drawLabel(w - 74, p.y, d.points[0].price.toPrecision(6), color);
      } else if (pts.length >= 2) {
        const [a, b] = pts;
        if (d.type === "trendline" || d.type === "ray") {
          ctx.strokeStyle = color;
          ctx.lineWidth = sel ? 2 : 1.5;
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          let ex = b.x;
          let ey = b.y;
          if (d.type === "ray" && b.x !== a.x) {
            const t = (w - a.x) / (b.x - a.x);
            if (t > 1) {
              ex = w;
              ey = a.y + (b.y - a.y) * t;
            }
          }
          ctx.lineTo(ex, ey);
          ctx.stroke();
        } else if (d.type === "rect") {
          ctx.strokeStyle = color;
          ctx.lineWidth = sel ? 2 : 1;
          ctx.setLineDash([]);
          ctx.fillStyle = "rgba(41, 98, 255, 0.10)";
          ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
          ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
        } else if (d.type === "fib") {
          const p1 = d.points[0].price;
          const p2 = d.points[1].price;
          const x0 = Math.min(a.x, b.x);
          const top = Math.min(a.y, b.y);
          const bottom = Math.max(a.y, b.y);
          for (const lvl of FIB_LEVELS) {
            const y = a.y + (b.y - a.y) * lvl.v;
            const price = p1 + (p2 - p1) * lvl.v;
            const inside = y >= top - 1 && y <= bottom + 1;
            ctx.strokeStyle = lvl.c;
            ctx.globalAlpha = inside ? 1 : 0.45;
            ctx.lineWidth = 1;
            ctx.setLineDash(inside ? [] : [4, 3]);
            ctx.beginPath();
            ctx.moveTo(Math.max(0, x0), y);
            ctx.lineTo(w, y);
            ctx.stroke();
            ctx.globalAlpha = 1;
            drawLabel(Math.max(2, x0), y, `${lvl.v}  ${price.toPrecision(6)}`, lvl.c);
          }
          ctx.setLineDash([4, 3]);
          ctx.strokeStyle = "#787b86";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      if (sel) drawAnchors(pts, SEL_COLOR);
    }

    // draft preview
    if (draft && cursor && activeTool !== "cursor") {
      const a = toScreen(draft);
      if (a) {
        ctx.strokeStyle = DRAW_COLOR;
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        if (activeTool === "hline") {
          ctx.moveTo(0, cursor.y);
          ctx.lineTo(w, cursor.y);
        } else {
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(cursor.x, cursor.y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }, [drawings, selectedId, hidden, draft, cursor, activeTool, toScreen]);

  // redraw on any state change + resize
  useEffect(() => {
    render();
  }, [render]);

  // redraw when the chart pans/zooms
  useEffect(() => {
    if (!chart) return;
    const cb = () => render();
    const ts = chart.timeScale();
    ts.subscribeVisibleLogicalRangeChange(cb);
    const ro = new ResizeObserver(() => render());
    if (canvasRef.current) ro.observe(canvasRef.current);
    return () => {
      try {
        ts.unsubscribeVisibleLogicalRangeChange(cb);
      } catch {
        /* chart gone */
      }
      ro.disconnect();
    };
  }, [chart, render]);

  // ---------- selection (chart clicks while not drawing) ----------
  useEffect(() => {
    if (!chart) return;
    const onClick = (param: MouseEventParams) => {
      if (activeTool !== "cursor" || !param.point) return;
      const { x, y } = param.point as Point;
      let hitId: string | null = null;
      for (const d of [...drawings].reverse()) {
        const pts = d.points.map(toScreen).filter(Boolean) as { x: number; y: number }[];
        if (!pts.length) continue;
        if (d.type === "hline") {
          if (Math.abs(y - pts[0].y) < 5) {
            hitId = d.id;
            break;
          }
        } else if (pts.length >= 2) {
          const [a, b] = pts;
          if (d.type === "rect") {
            const x0 = Math.min(a.x, b.x);
            const x1 = Math.max(a.x, b.x);
            const y0 = Math.min(a.y, b.y);
            const y1 = Math.max(a.y, b.y);
            if (x >= x0 - 4 && x <= x1 + 4 && y >= y0 - 4 && y <= y1 + 4) {
              hitId = d.id;
              break;
            }
          } else if (distToSegment(x, y, a.x, a.y, b.x, b.y) < 6) {
            hitId = d.id;
            break;
          }
        }
      }
      select(hitId);
    };
    chart.subscribeClick(onClick);
    return () => {
      try {
        chart.unsubscribeClick(onClick);
      } catch {
        /* chart gone */
      }
    };
  }, [chart, drawings, activeTool, toScreen, select]);

  // ---------- keyboard: Escape cancels, Delete removes ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as any)?.editor) return;
      if (e.key === "Escape") {
        setDraft(null);
        setActiveTool("cursor");
      } else if ((e.key === "Delete" || e.key === "Backspace") && useDrawStore.getState().selectedId) {
        e.preventDefault();
        removeSelected();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setActiveTool, removeSelected]);

  // ---------- drawing interaction ----------
  const drawing = activeTool !== "cursor";

  const onDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawing) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const p = fromScreen(x, y);
    if (!p) return;

    if (activeTool === "hline") {
      addDrawing({
        id: `d-${Date.now()}`,
        type: "hline",
        points: [p],
        color: DRAW_COLOR,
      });
      setActiveTool("cursor");
      return;
    }
    if (!draft) {
      setDraft(p);
      return;
    }
    addDrawing({
      id: `d-${Date.now()}`,
      type: activeTool as Exclude<DrawTool, "cursor">,
      points: [draft, p],
      color: DRAW_COLOR,
    });
    setDraft(null);
    setActiveTool("cursor");
  };

  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawing) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setCursor({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <div
      className="absolute inset-0 z-10"
      style={{ pointerEvents: drawing ? "auto" : "none", cursor: drawing ? "crosshair" : "default" }}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        onMouseDown={onDown}
        onMouseMove={onMove}
      />
    </div>
  );
}
