import { create } from "zustand";

export type DrawTool = "cursor" | "trendline" | "ray" | "hline" | "rect" | "fib";

export type DrawPoint = { time: number; price: number };

export type Drawing = {
  id: string;
  type: Exclude<DrawTool, "cursor">;
  points: DrawPoint[]; // 1 for hline, 2 for the rest
  color: string;
};

const LS_PREFIX = "pw-drawings-";

function load(key: string): Drawing[] {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    return raw ? (JSON.parse(raw) as Drawing[]) : [];
  } catch {
    return [];
  }
}

function persist(key: string, drawings: Drawing[]) {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(drawings));
  } catch {
    /* quota — ignore */
  }
}

type DrawState = {
  chartKey: string; // symbol|timeframe — drawings are scoped per chart
  drawings: Drawing[];
  activeTool: DrawTool;
  selectedId: string | null;
  hidden: boolean;
  magnet: boolean;

  setChartKey: (key: string) => void;
  setActiveTool: (t: DrawTool) => void;
  addDrawing: (d: Drawing) => void;
  removeDrawing: (id: string) => void;
  removeSelected: () => void;
  clearAll: () => void;
  select: (id: string | null) => void;
  toggleHidden: () => void;
  toggleMagnet: () => void;
};

export const useDrawStore = create<DrawState>((set, get) => ({
  chartKey: "",
  drawings: [],
  activeTool: "cursor",
  selectedId: null,
  hidden: false,
  magnet: false,

  setChartKey: (key) => {
    if (key === get().chartKey) return;
    set({ chartKey: key, drawings: load(key), selectedId: null });
  },
  setActiveTool: (t) => set({ activeTool: t, selectedId: null }),
  addDrawing: (d) => {
    const { chartKey, drawings } = get();
    const next = [...drawings, d];
    persist(chartKey, next);
    set({ drawings: next, selectedId: d.id });
  },
  removeDrawing: (id) => {
    const { chartKey, drawings } = get();
    const next = drawings.filter((x) => x.id !== id);
    persist(chartKey, next);
    set({ drawings: next, selectedId: null });
  },
  removeSelected: () => {
    const id = get().selectedId;
    if (id) get().removeDrawing(id);
  },
  clearAll: () => {
    const { chartKey } = get();
    persist(chartKey, []);
    set({ drawings: [], selectedId: null });
  },
  select: (id) => set({ selectedId: id }),
  toggleHidden: () => set((s) => ({ hidden: !s.hidden })),
  toggleMagnet: () => set((s) => ({ magnet: !s.magnet })),
}));
