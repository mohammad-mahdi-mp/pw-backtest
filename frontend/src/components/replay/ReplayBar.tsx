import { X, Play, Pause, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useUIStore } from "@/stores/ui";
import { fmtEpoch } from "@/lib/format";
import { cn } from "@/lib/utils";

const SPEEDS = [0.5, 1, 2, 5, 10, 50];

type Props = {
  onStep: (bars: number) => void;
  onExit: () => void;
};

export function ReplayBar({ onStep, onExit }: Props) {
  const { replayPlaying, replaySpeed, replayTime, setReplay } = useUIStore();

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

      <div className="px-2 text-[12px] text-[#d1d4dc] font-mono min-w-[150px] text-center">
        {replayTime ? fmtEpoch(replayTime) : "—"}
      </div>
    </div>
  );
}
