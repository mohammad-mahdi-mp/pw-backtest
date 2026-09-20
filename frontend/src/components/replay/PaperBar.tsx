import { X, Radio } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAppStore } from "@/stores/app";
import { fmtNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = {
  onStop: () => void;
};

/** Floating LIVE badge for paper trading sessions (mirrors the ReplayBar pill). */
export function PaperBar({ onStop }: Props) {
  const { sessionId, symbol, timeframe } = useAppStore();
  const { data: session } = useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => api.getSession(sessionId!),
    enabled: !!sessionId,
    refetchInterval: 1500,
  });

  const pos = session?.position;
  const equity = session?.equity ?? 0;
  const pnl = session?.stats?.total_pnl ?? 0;
  const uPnL = pos?.unrealized ?? 0;

  return (
    <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-tvpanel/95 border border-tvborder shadow-2xl backdrop-blur">
      <button
        onClick={onStop}
        className="w-7 h-7 flex items-center justify-center rounded text-[#787b86] hover:text-[#ef5350] hover:bg-[#2a2e39]"
        title="Stop paper trading"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex items-center gap-1.5 text-[12px] font-bold text-[#d1d4dc]">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
        </span>
        PAPER
        <span className="text-[#787b86] font-normal">
          {symbol} · {timeframe}
        </span>
      </div>

      <div className="w-px h-5 bg-tvborder" />

      <div className="text-[11px] leading-tight">
        <div className="text-[#787b86]">Equity</div>
        <div className="font-mono font-bold text-[#d1d4dc]">${fmtNumber(equity, 2)}</div>
      </div>

      {pos ? (
        <>
          <div className="w-px h-5 bg-tvborder" />
          <div className="text-[11px] leading-tight">
            <div className={cn("font-semibold", pos.side === "long" ? "text-bull" : "text-bear")}>
              {pos.side === "long" ? "LONG" : "SHORT"} {fmtNumber(pos.size, 2)}
            </div>
            <div className={cn("font-mono", uPnL >= 0 ? "text-bull" : "text-bear")}>
              {uPnL >= 0 ? "+" : ""}${fmtNumber(uPnL, 2)}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="w-px h-5 bg-tvborder" />
          <div className="text-[11px] leading-tight">
            <div className="text-[#787b86]">Realized</div>
            <div className={cn("font-mono", pnl >= 0 ? "text-bull" : "text-bear")}>
              {pnl >= 0 ? "+" : ""}${fmtNumber(pnl, 2)}
            </div>
          </div>
        </>
      )}

      <div className="w-px h-5 bg-tvborder" />
      <Radio className="w-3.5 h-3.5 text-primary" />
      <span className="text-[10px] text-[#787b86]">fills at live prices</span>
    </div>
  );
}
