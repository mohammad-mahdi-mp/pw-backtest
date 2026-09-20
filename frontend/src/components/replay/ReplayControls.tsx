import { useState } from "react";
import { Play, Pause, SkipForward, SkipBack, FastForward, Rewind } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAppStore } from "@/stores/app";

export function ReplayControls() {
  const { symbol, timeframe, sessionId, setSessionId } = useAppStore();
  const qc = useQueryClient();
  const [speed, setSpeed] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);

  const createMut = useMutation({
    mutationFn: api.createSession,
    onSuccess: (s) => {
      setSessionId(s.id);
      qc.invalidateQueries({ queryKey: ["session"] });
    },
  });
  const advanceMut = useMutation({ mutationFn: (bars: number) => api.advance(sessionId!, bars) });

  const start = () => {
    createMut.mutate({ symbol, timeframe, cash: 100_000 });
  };

  const step = (bars = 1) => {
    if (!sessionId) return;
    advanceMut.mutate(bars);
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex items-center gap-1 px-2 py-1 bg-tvpanel border-b border-tvborder text-sm">
        <Button size="sm" variant={sessionId ? "secondary" : "default"} onClick={start} disabled={!!sessionId}>
          New Replay
        </Button>
        <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" disabled={!sessionId} onClick={() => step(1)}><Rewind className="w-4 h-4" /></Button></TooltipTrigger><TooltipContent>Back 1 bar</TooltipContent></Tooltip>
        <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" disabled={!sessionId} onClick={() => setIsPlaying(!isPlaying)}>{isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}</Button></TooltipTrigger><TooltipContent>Play / Pause</TooltipContent></Tooltip>
        <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" disabled={!sessionId} onClick={() => step(1)}><SkipForward className="w-4 h-4" /></Button></TooltipTrigger><TooltipContent>Next bar (Space)</TooltipContent></Tooltip>
        <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" disabled={!sessionId} onClick={() => step(25)}><FastForward className="w-4 h-4" /></Button></TooltipTrigger><TooltipContent>Forward 25 bars</TooltipContent></Tooltip>
        <span className="mx-2 text-muted-foreground">Speed</span>
        <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="h-7 bg-background border border-input rounded px-2 text-xs">
          {[0.5, 1, 2, 5, 10, 50, 100, 500].map((s) => <option key={s} value={s}>×{s}</option>)}
        </select>
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground">
          Session {sessionId ? `#${sessionId}` : "not started"}
        </span>
      </div>
    </TooltipProvider>
  );
}
