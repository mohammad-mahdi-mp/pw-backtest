import { X, Play, Pause, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAppStore } from "@/stores/app";
import { useUIStore } from "@/stores/ui";
import { fmtEpoch, fmtNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const SPEEDS = [0.5, 1, 2, 5, 10, 50];

type Props = {
  onStep: (bars: number) => void;
  onExit: () => void;
};

export function ReplayBar({ onStep, onExit }: Props) {
  const { replayPlaying, replaySpeed, replayTime, setReplay } = useUIStore();
  const { sessionId } = useAppStore();
  const { data: session } = useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => api.getSession(sessionId!),
    enabled: !!sessionId,
    refetchInterval: 1500,
  });

  const pos = session?.position;
  const equity = session?.equity ?? 0;

  return (
    <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 px-2 py-1.5 rounded-lg bg-tvpanel/95 border border-tvborder shadow-2xl backdrop-blur">
      <button
        onClick={onExit}
        className="w-7 h-7 flex items-center justify-center rounded text-[#787b86] hover:text-[#ef5350] hover:bg-[#2a2e39]"
        title="Exit replay"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="w-px h-5 bg-tvborder mx-0.5" />

      <button
        onClick={() => onStep(-50)}
        className="w-7 h-7 flex items-center justify-center rounded text-[#d1d4dc] hover:bg-[#2a2e39]"
        title="Jump back 50 bars"
      >
        <ChevronsLeft className="w-4 h-4" />
      </button>
      <button
        onClick={() => onStep(-1)}
        className="w-7 h-7 flex items-center justify-center rounded text-[#d1d4dc] hover:bg-[#2a2e39]"
        title="Previous bar (←)"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <button
        onClick={() => setReplay({ replayPlaying: !replayPlaying })}
        className={cn(
          "w-8 h-7 flex items-center justify-center rounded font-semibold",
          replayPlaying ? "bg-primary/25 text-primary" : "text-[#d1d4dc] hover:bg-[#2a2e39]"
        )}
        title="Play / Pause (Space)"
      >
        {replayPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
      </button>
      <button
        onClick={() => onStep(1)}
        className="w-7 h-7 flex items-center justify-center rounded text-[#d1d4dc] hover:bg-[#2a2e39]"
        title="Next bar (→)"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
      <button
        onClick={() => onStep(50)}
        className="w-7 h-7 flex items-center justify-center rounded text-[#d1d4dc] hover:bg-[#2a2e39]"
        title="Jump forward 50 bars"
      >
        <ChevronsRight className="w-4 h-4" />
      </button>

      <div className="w-px h-5 bg-tvborder mx-0.5" />

      <select
        value={replaySpeed}
        onChange={(e) => setReplay({ replaySpeed: Number(e.target.value) })}
        className="h-7 bg-[#131722] border border-tvborder rounded px-1 text-[12px] text-[#d1d4dc] outline-none"
        title="Replay speed"
      >
        {SPEEDS.map((s) => (
          <option key={s} value={s}>
            ×{s}
          </option>
        ))}
      </select>

      {/* Position badge */}
      {pos ? (
        <div
          className={cn(
            "px-2 h-7 flex items-center gap-1.5 rounded text-[12px] font-bold",
            pos.side === "long" ? "text-bull bg-bull/10" : "text-bear bg-bear/10"
          )}
          title={`Entry ${pos.entry_price} · Unrealized ${pos.unrealized >= 0 ? "+" : ""}$${fmtNumber(pos.unrealized, 2)}`}
        >
          <span>{pos.side === "long" ? "▲" : "▼"}</span>
          <span>{pos.size}</span>
          <span className={pos.unrealized >= 0 ? "text-bull" : "text-bear"}>
            {pos.unrealized >= 0 ? "+" : ""}${fmtNumber(pos.unrealized, 2)}
          </span>
        </div>
      ) : (
        <div className="px-2 h-7 flex items-center rounded text-[12px] text-[#787b86]" title="No open position">
          Flat
        </div>
      )}

      {/* Equity */}
      <div
        className={cn(
          "px-2 h-7 flex items-center rounded text-[12px] font-mono font-semibold",
          equity >= (session?.cash ?? equity) ? "text-bull" : equity < (session?.cash ?? equity) ? "text-bear" : "text-[#d1d4dc]"
        )}
        title="Equity (balance + unrealized)"
      >
        Eq ${fmtNumber(equity, 2)}
      </div>

      <div className="px-2 text-[12px] text-[#d1d4dc] font-mono min-w-[150px] text-center">
        {replayTime ? fmtEpoch(replayTime) : "—"}
      </div>
    </div>
  );
}
