import { useMemo } from "react";
import { X, CalendarDays } from "lucide-react";
import { fmtMoney, fmtNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CurvePoint } from "@/types";

type Props = {
  equityCurve: CurvePoint[];
  initialCapital: number;
  onClose: () => void;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type MonthCell = { pnl: number; pct: number } | null;

/** Group the equity curve into calendar months and compute each month's P&L. */
function monthlyReturns(curve: CurvePoint[]): Map<number, MonthCell[]> {
  // curve points are (time seconds, equity) sampled per bar — walk chronologically,
  // bucket by [year][month], and take first/last equity inside each bucket.
  const buckets = new Map<string, { year: number; month: number; first: number; last: number }>();
  for (const p of curve) {
    const d = new Date(p.time * 1000);
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    const b = buckets.get(key);
    if (b) b.last = p.value;
    else buckets.set(key, { year: d.getUTCFullYear(), month: d.getUTCMonth(), first: p.value, last: p.value });
  }
  const years = new Map<number, MonthCell[]>();
  const sorted = [...buckets.values()].sort((a, b) => a.year - b.year || a.month - b.month);
  let prevLast: number | null = null;
  for (const b of sorted) {
    if (!years.has(b.year)) years.set(b.year, new Array(12).fill(null));
    const startEq = prevLast ?? b.first; // carry equity from the previous month
    const pnl = b.last - startEq;
    years.get(b.year)![b.month] = { pnl, pct: startEq ? (pnl / startEq) * 100 : 0 };
    prevLast = b.last;
  }
  return years;
}

function cellColor(pct: number): string {
  if (pct === 0) return "bg-[#1e222d] text-[#787b86]";
  const mag = Math.min(Math.abs(pct) / 8, 1); // saturate at ±8%
  if (pct > 0) return `rgba(38,166,154,${0.15 + mag * 0.65})`;
  return `rgba(239,83,80,${0.15 + mag * 0.65})`;
}

export function MonthlyHeatmap({ equityCurve, initialCapital, onClose }: Props) {
  const years = useMemo(() => monthlyReturns(equityCurve), [equityCurve]);

  const yearTotals = useMemo(() => {
    const out: { year: number; pnl: number; pct: number }[] = [];
    for (const [year, cells] of years) {
      let pnl = 0;
      // recompute the year P&L from the first & last month boundaries
      const ms = cells.filter(Boolean) as { pnl: number; pct: number }[];
      if (!ms.length) continue;
      let running = 0;
      for (const m of ms) {
        running += m.pnl;
      }
      pnl = running;
      out.push({ year, pnl, pct: initialCapital ? (pnl / initialCapital) * 100 : 0 });
    }
    return out.sort((a, b) => a.year - b.year);
  }, [years, initialCapital]);

  const totals = useMemo(() => {
    let best = -Infinity;
    let worst = Infinity;
    for (const cells of years.values())
      for (const c of cells) {
        if (!c) continue;
        best = Math.max(best, c.pnl);
        worst = Math.min(worst, c.pnl);
      }
    return { best: best === -Infinity ? 0 : best, worst: worst === Infinity ? 0 : worst };
  }, [years]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative w-[720px] max-w-[94vw] max-h-[90vh] bg-tvpanel border border-tvborder rounded-lg shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-tvborder">
          <CalendarDays className="w-4 h-4 text-primary" />
          <span className="text-[14px] font-bold text-[#d1d4dc]">Monthly Returns</span>
          <span className="text-[11px] text-[#787b86]">P&L per calendar month, carried equity</span>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#2a2e39]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3 overflow-auto">
          {[...years.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([year, cells]) => {
              const yt = yearTotals.find((t) => t.year === year)!;
              return (
                <div key={year} className="mb-3">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-[13px] font-bold text-[#d1d4dc]">{year}</span>
                    <span className={cn("text-[11px] font-mono", yt.pnl >= 0 ? "text-bull" : "text-bear")}>
                      {yt.pnl >= 0 ? "+" : ""}{fmtMoney(yt.pnl)} ({fmtNumber(yt.pct, 2)}%)
                    </span>
                  </div>
                  <div className="grid grid-cols-12 gap-1">
                    {cells.map((c, mi) => (
                      <div
                        key={mi}
                        title={c ? `${MONTHS[mi]} ${year}: ${c.pnl >= 0 ? "+" : ""}${fmtMoney(c.pnl)} (${fmtNumber(c.pct, 2)}%)` : `${MONTHS[mi]} ${year}: no data`}
                        className={cn(
                          "h-10 rounded flex flex-col items-center justify-center text-[10px] font-mono",
                          c ? "text-white/90" : "bg-[#131722] text-[#4a4e5a]"
                        )}
                        style={c ? { backgroundColor: cellColor(c.pct) } : undefined}
                      >
                        <span className="opacity-70">{MONTHS[mi]}</span>
                        {c && (
                          <span className="font-semibold">
                            {c.pct >= 0 ? "+" : ""}{fmtNumber(c.pct, 1)}%
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

          <div className="flex items-center gap-2 text-[10px] text-[#787b86]">
            <span>Worst {fmtMoney(totals.worst)}</span>
            <div className="flex gap-0.5">
              {[-8, -5, -2, 0, 2, 5, 8].map((v) => (
                <div key={v} className="w-6 h-3 rounded-sm" style={{ backgroundColor: cellColor(v) }} />
              ))}
            </div>
            <span>Best {fmtMoney(totals.best)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
