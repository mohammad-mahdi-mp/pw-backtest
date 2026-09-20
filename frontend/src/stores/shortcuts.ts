import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ShortcutAction =
  | "replayPlayPause"
  | "stepForward"
  | "stepBack"
  | "closePosition"
  | "nextPane"
  | "prevPane"
  | "toggleBottomPanel"
  | "toggleRightSidebar";

export const SHORTCUT_ACTIONS: { id: ShortcutAction; label: string; hint: string }[] = [
  { id: "replayPlayPause", label: "Replay — play / pause", hint: "during replay" },
  { id: "stepForward", label: "Replay — step forward", hint: "during replay" },
  { id: "stepBack", label: "Replay — step back", hint: "during replay" },
  { id: "closePosition", label: "Close position", hint: "any session" },
  { id: "nextPane", label: "Focus next chart pane", hint: "multi-chart" },
  { id: "prevPane", label: "Focus previous chart pane", hint: "multi-chart" },
  { id: "toggleBottomPanel", label: "Toggle bottom panel", hint: "" },
  { id: "toggleRightSidebar", label: "Toggle right sidebar", hint: "" },
];

export const DEFAULT_SHORTCUTS: Record<ShortcutAction, string> = {
  replayPlayPause: "Space",
  stepForward: "ArrowRight",
  stepBack: "ArrowLeft",
  closePosition: "x",
  nextPane: "Alt+ArrowRight",
  prevPane: "Alt+ArrowLeft",
  toggleBottomPanel: "Alt+B",
  toggleRightSidebar: "Alt+S",
};

/** normalize a KeyboardEvent into a comparable combo string */
export function comboOf(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  let key = e.key;
  if (key === " ") key = "Space";
  if (key.length === 1) key = key.toLowerCase();
  else if (key.startsWith("Arrow")) key = key; // keep
  else key = key.length === 1 ? key.toLowerCase() : key;
  if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return ""; // modifier alone
  parts.push(key);
  return parts.join("+");
}

type ShortcutState = {
  bindings: Record<ShortcutAction, string>;
  setBinding: (id: ShortcutAction, combo: string) => void;
  resetAll: () => void;
};

export const useShortcutStore = create<ShortcutState>()(
  persist(
    (set) => ({
      bindings: { ...DEFAULT_SHORTCUTS },
      setBinding: (id, combo) => set((s) => ({ bindings: { ...s.bindings, [id]: combo } })),
      resetAll: () => set({ bindings: { ...DEFAULT_SHORTCUTS } }),
    }),
    { name: "pw-shortcuts" }
  )
);

/** find which action (if any) a combo triggers */
export function matchAction(
  bindings: Record<ShortcutAction, string>,
  combo: string
): ShortcutAction | null {
  if (!combo) return null;
  for (const [id, keys] of Object.entries(bindings) as [ShortcutAction, string][]) {
    if (keys.toLowerCase() === combo.toLowerCase()) return id;
  }
  return null;
}
