import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, Plus } from "lucide-react";
import { BUILTIN_INDICATORS, makeIndicator } from "@/lib/indicators";
import { useUIStore } from "@/stores/ui";
import { cn } from "@/lib/utils";

export function IndicatorsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const addIndicator = useUIStore((s) => s.addIndicator);
  const active = useUIStore((s) => s.indicators);

  const grouped = useMemo(() => {
    const query = q.trim().toLowerCase();
    const items = BUILTIN_INDICATORS.filter((i) => !query || i.title.toLowerCase().includes(query));
    const map = new Map<string, typeof BUILTIN_INDICATORS>();
    items.forEach((i) => {
      if (!map.has(i.category)) map.set(i.category, []);
      map.get(i.category)!.push(i);
    });
    return [...map.entries()];
  }, [q]);

  useEffect(() => {
    if (open) {
      setQ("");
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative w-[520px] max-w-[92vw] bg-tvpanel border border-tvborder rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-tvborder">
          <Search className="w-4 h-4 text-[#787b86]" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && onClose()}
            placeholder="Search indicators…"
            className="flex-1 bg-transparent outline-none text-sm text-[#d1d4dc] placeholder:text-[#787b86]"
          />
          <button onClick={onClose} className="text-[#787b86] hover:text-[#d1d4dc]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-[420px] overflow-y-auto">
          <div className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wider text-[#787b86]">
            Built-ins
          </div>
          {grouped.map(([cat, items]) => (
            <div key={cat} className="mb-1">
              <div className="px-4 py-1 text-[11px] text-[#787b86]">{cat}</div>
              {items.map((i) => (
                <button
                  key={i.title}
                  onClick={() => {
                    addIndicator(makeIndicator(i));
                    onClose();
                  }}
                  className="w-full flex items-center justify-between px-4 py-2 text-sm hover:bg-[#2a2e39]"
                >
                  <span className="text-[#d1d4dc]">{i.title}</span>
                  <Plus className="w-3.5 h-3.5 text-[#787b86]" />
                </button>
              ))}
            </div>
          ))}

          {active.length > 0 && (
            <>
              <div className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wider text-[#787b86]">
                On chart
              </div>
              {active.map((a) => (
                <div key={a.id} className="flex items-center justify-between px-4 py-2 text-sm">
                  <span className="text-[#d1d4dc]">{a.title}</span>
                  <button
                    className="text-[11px] text-[#787b86] hover:text-[#ef5350]"
                    onClick={() => useUIStore.getState().removeIndicator(a.id)}
                  >
                    remove
                  </button>
                </div>
              ))}
            </>
          )}

          <div className="px-4 py-3 text-[11px] text-[#787b86] border-t border-tvborder mt-2">
            Custom Pine scripts: open the <span className="text-[#d1d4dc]">Pine Editor</span> tab at the
            bottom and press “Add to chart”.
          </div>
        </div>
      </div>
    </div>
  );
}
