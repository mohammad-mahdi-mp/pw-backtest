import {
  MousePointer2,
  TrendingUp,
  Minus,
  ArrowUpRight,
  Square,
  AlignJustify,
  Magnet,
  Trash2,
  EyeOff,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDrawStore, type DrawTool } from "@/stores/draw";

const TOOLS: { id: DrawTool; icon: typeof MousePointer2; label: string }[] = [
  { id: "cursor", icon: MousePointer2, label: "Cursor (Esc)" },
  { id: "trendline", icon: TrendingUp, label: "Trend Line — click start & end" },
  { id: "ray", icon: ArrowUpRight, label: "Ray — click start & direction" },
  { id: "hline", icon: Minus, label: "Horizontal Line — click a price" },
  { id: "rect", icon: Square, label: "Rectangle — click two corners" },
  { id: "fib", icon: AlignJustify, label: "Fib Retracement — click swing low & high" },
];

export function DrawingToolbar() {
  const { activeTool, setActiveTool, clearAll, hidden, toggleHidden, magnet, toggleMagnet, drawings } =
    useDrawStore();

  return (
    <div className="w-11 shrink-0 bg-tvpanel border-r border-tvborder flex flex-col items-center py-1 gap-0.5">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          title={t.label}
          onClick={() => setActiveTool(t.id)}
          className={cn(
            "w-8 h-8 rounded flex items-center justify-center transition-colors",
            activeTool === t.id
              ? "bg-primary/20 text-primary"
              : "text-[#b2b5be] hover:bg-[#2a2e39]"
          )}
        >
          <t.icon className="w-4 h-4" />
        </button>
      ))}
      <div className="w-6 h-px bg-tvborder my-1" />
      <button
        title="Magnet — snap to OHLC"
        onClick={toggleMagnet}
        className={cn(
          "w-8 h-8 rounded flex items-center justify-center transition-colors",
          magnet ? "bg-primary/20 text-primary" : "text-[#b2b5be] hover:bg-[#2a2e39]"
        )}
      >
        <Magnet className="w-4 h-4" />
      </button>
      <button
        title={hidden ? "Show drawings" : "Hide drawings"}
        onClick={toggleHidden}
        className="w-8 h-8 rounded flex items-center justify-center text-[#b2b5be] hover:bg-[#2a2e39]"
      >
        {hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
      <button
        title={`Remove all drawings${drawings.length ? ` (${drawings.length})` : ""}`}
        onClick={clearAll}
        className="w-8 h-8 rounded flex items-center justify-center text-[#b2b5be] hover:bg-[#2a2e39] hover:text-bear"
      >
        <Trash2 className="w-4 h-4" />
      </button>
      <div className="flex-1" />
      <div className="text-[9px] text-[#787b86] mb-1 select-none">
        {drawings.length ? String(drawings.length) : ""}
      </div>
    </div>
  );
}
