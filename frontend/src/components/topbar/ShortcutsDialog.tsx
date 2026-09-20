import { useEffect, useState } from "react";
import { X, Keyboard, RotateCcw } from "lucide-react";
import {
  SHORTCUT_ACTIONS,
  comboOf,
  DEFAULT_SHORTCUTS,
  useShortcutStore,
  type ShortcutAction,
} from "@/stores/shortcuts";
import { cn } from "@/lib/utils";

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { bindings, setBinding, resetAll } = useShortcutStore();
  const [listening, setListening] = useState<ShortcutAction | null>(null);

  useEffect(() => {
    if (!open) setListening(null);
  }, [open]);

  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setListening(null);
        return;
      }
      const combo = comboOf(e);
      if (combo) setBinding(listening, combo);
      setListening(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [listening, setBinding]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative w-[440px] max-w-[92vw] bg-tvpanel border border-tvborder rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-tvborder">
          <Keyboard className="w-4 h-4 text-primary" />
          <span className="text-[14px] font-bold text-[#d1d4dc]">Keyboard Shortcuts</span>
          <div className="flex-1" />
          <button
            onClick={resetAll}
            className="flex items-center gap-1 h-6 px-2 rounded text-[11px] text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#2a2e39]"
            title="Reset to defaults"
          >
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#2a2e39]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-1.5">
          {SHORTCUT_ACTIONS.map((a) => {
            const keys = bindings[a.id] ?? "";
            const isDefault = keys === DEFAULT_SHORTCUTS[a.id];
            return (
              <div
                key={a.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#2a2e39]/60"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] text-[#d1d4dc]">{a.label}</div>
                  {a.hint && <div className="text-[10px] text-[#787b86]">{a.hint}</div>}
                </div>
                <button
                  onClick={() => setListening(a.id)}
                  className={cn(
                    "h-7 min-w-[90px] px-2 rounded text-[11px] font-mono border transition-colors",
                    listening === a.id
                      ? "border-primary text-primary bg-primary/10 animate-pulse"
                      : isDefault
                        ? "border-tvborder text-[#d1d4dc] bg-[#131722] hover:border-[#787b86]"
                        : "border-primary/40 text-primary/90 bg-[#131722] hover:border-primary"
                  )}
                >
                  {listening === a.id ? "press keys…" : keys || "—"}
                </button>
              </div>
            );
          })}
          <div className="px-2 py-1.5 text-[10px] text-[#787b86]">
            Click a binding, then press the new key combination. Esc cancels. Modified bindings are
            shown in blue. Drawings: Del removes the selected drawing, Esc cancels the active tool.
          </div>
        </div>
      </div>
    </div>
  );
}
