import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { useAppStore } from "@/stores/app";
import { fmtNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ScreenerRow } from "@/types";

export function ScreenerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { symbol: currentSymbol, timeframe, setSymbol } = useAppStore();
  const [sortKey, setSortKey] = useState<keyof ScreenerRow>("chg_pct");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["screener", timeframe],
    queryFn: () => api.screenerScan(timeframe),
    enabled: open,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => refetch(), 30);
      return () => clearTimeout(t);
    }
  }, [open, refetch]);

  if (!open) return null;

  const rows = [...(data?.rows ?? [])].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * sortDir;
    return String(av).localeCompare(String(bv)) * sortDir;
  });

  const th = (key: keyof ScreenerRow, label: string, cls = "") => (
    <th
      className={cn("px-2 py-1.5 font-normal cursor-pointer select-none hover:text-[#d1d4dc]", cls)}
      onClick={() => {
        if (sortKey === key) setSortDir((d) => (d === 1 ? -1 : 1));
        else {
          setSortKey(key);
          setSortDir(-1);
        }
      }}
    >
      {label}
      {sortKey === key && <span className="ml-0.5 text-primary">{sortDir === -1 ? "↓" : "↑"}</span>}
    </th>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative w-[680px] max-w-[94vw] bg-tvpanel border border-tvborder rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-tvborder">
          <span className="text-[14px] font-bold text-[#d1d4dc]">Screener</span>
          <span className="text-[11px] text-[#787b86]">
            {data?.symbols ?? 0} symbols · {timeframe} · local data
          </span>
          <div className="flex-1" />
          <button
            onClick={() => refetch()}
            className="w-7 h-7 flex items-center justify-center rounded text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#2a2e39]"
            title="Rescan"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
          </button>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#2a2e39]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <div className="px-3 py-6 text-[12px] text-[#787b86] text-center">Scanning local data…</div>
          ) : rows.length === 0 ? (
            <div className="px-3 py-6 text-[12px] text-[#787b86] text-center">
              No stored data for {timeframe} — press Load Data first.
            </div>
          ) : (
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-tvpanel text-[#787b86] text-left border-b border-tvborder">
                <tr>
                  {th("symbol", "Symbol")}
                  {th("last", "Last", "text-right")}
                  {th("chg_pct", "Chg %", "text-right")}
                  {th("rsi", "RSI 14", "text-right")}
                  {th("above_sma20", "> SMA20", "text-center")}
                  {th("above_sma50", "> SMA50", "text-center")}
                  {th("above_sma200", "> SMA200", "text-center")}
                  {th("vol_ratio", "Vol ×", "text-right")}
                  {th("range_pos", "Range %", "text-right")}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.symbol}
                    onClick={() => {
                      setSymbol(r.symbol);
                      onClose();
                    }}
                    className={cn(
                      "border-b border-tvborder/40 cursor-pointer hover:bg-[#2a2e39]",
                      r.symbol === currentSymbol && "bg-primary/10"
                    )}
                  >
                    <td className="px-2 py-1.5 font-semibold text-[#d1d4dc]">{r.symbol}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-[#d1d4dc]">
                      {r.last >= 1000 ? fmtNumber(r.last, 1) : r.last.toPrecision(6)}
                    </td>
                    <td
                      className={cn(
                        "px-2 py-1.5 text-right font-mono font-semibold",
                        r.chg_pct >= 0 ? "text-bull" : "text-bear"
                      )}
                    >
                      {r.chg_pct >= 0 ? "+" : ""}
                      {fmtNumber(r.chg_pct, 2)}%
                    </td>
                    <td
                      className={cn(
                        "px-2 py-1.5 text-right font-mono",
                        r.rsi >= 70 ? "text-bear" : r.rsi <= 30 ? "text-bull" : "text-[#d1d4dc]"
                      )}
                    >
                      {fmtNumber(r.rsi, 1)}
                    </td>
                    {[r.above_sma20, r.above_sma50, r.above_sma200].map((v, i) => (
                      <td key={i} className="px-2 py-1.5 text-center">
                        {v == null ? (
                          <span className="text-[#787b86]">—</span>
                        ) : v ? (
                          <span className="text-bull">✓</span>
                        ) : (
                          <span className="text-bear">✕</span>
                        )}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right font-mono text-[#d1d4dc]">
                      {r.vol_ratio ?? "—"}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-[#d1d4dc]">
                      {fmtNumber(r.range_pos, 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
