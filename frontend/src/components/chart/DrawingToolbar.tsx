import { useState } from "react";
import {
  MousePointer2,
  Crosshair,
  TrendingUp,
  Minus,
  Ruler,
  Type,
  Magnet,
  Trash2,
  EyeOff,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TOOLS = [
  { id: "cursor", icon: MousePointer2, label: "Cursor" },
  { id: "crosshair", icon: Crosshair, label: "Crosshair" },
  { id: "trendline", icon: TrendingUp, label: "Trend Line" },
  { id: "hline", icon: Minus, label: "Horizontal Line" },
  { id: "ruler", icon: Ruler, label: "Measure" },
  { id: "text", icon: Type, label: "Text" },
];

const SEPARATOR = { id: "sep1" };

const BOTTOM_TOOLS = [
  { id: "magnet", icon: Magnet, label: "Magnet Mode" },
  { id: "hide", icon: EyeOff, label: "Hide Drawings" },
  { id: "trash", icon: Trash2, label: "Remove Drawings" },
];

export function DrawingToolbar() {
  const [active, setActive] = useState("cursor");

  return (
    <div className="w-11 shrink-0 bg-tvpanel border-r border-tvborder flex flex-col items-center py-1 gap-0.5">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          title={t.label}
          onClick={() => setActive(t.id)}
          className={cn(
            "w-8 h-8 rounded flex items-center justify-center transition-colors",
            active === t.id ? "bg-primary/20 text-primary" : "text-[#b2b5be] hover:bg-[#2a2e39]"
          )}
        >
          <t.icon className="w-4 h-4" />
        </button>
      ))}
      <div className="w-6 h-px bg-tvborder my-1" />
      {BOTTOM_TOOLS.map((t) => (
        <button
          key={t.id}
          title={t.label}
          className="w-8 h-8 rounded flex items-center justify-center text-[#b2b5be] hover:bg-[#2a2e39]"
        >
          <t.icon className="w-4 h-4" />
        </button>
      ))}
      <div className="flex-1" />
    </div>
  );
}
