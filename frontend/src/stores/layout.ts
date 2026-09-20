import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ChartType, ActiveIndicator } from "@/stores/ui";

export type GridMode = "1" | "2h" | "2v" | "4";

export type PaneConfig = {
  id: string;
  symbol: string;
  timeframe: string;
  chartType: ChartType;
  showVolume: boolean;
  indicators: ActiveIndicator[];
};

const DEFAULT_PANES: PaneConfig[] = [
  { id: "p1", symbol: "BTC/USDT", timeframe: "1h", chartType: "candles", showVolume: true, indicators: [] },
  { id: "p2", symbol: "ETH/USDT", timeframe: "1h", chartType: "candles", showVolume: true, indicators: [] },
  { id: "p3", symbol: "EUR/USD", timeframe: "1h", chartType: "candles", showVolume: true, indicators: [] },
  { id: "p4", symbol: "BTC/USDT", timeframe: "1h", chartType: "candles", showVolume: true, indicators: [] },
];

type LayoutState = {
  grid: GridMode;
  panes: PaneConfig[];
  activePane: string;

  setGrid: (g: GridMode) => void;
  setActivePane: (id: string) => void;
  cyclePane: (dir: 1 | -1) => void;
  setActiveSymbol: (s: string) => void;
  setActiveTimeframe: (tf: string) => void;
  setActiveChartType: (c: ChartType) => void;
  toggleActiveVolume: () => void;
  addActiveIndicator: (i: ActiveIndicator) => void;
  removeIndicator: (paneId: string, indId: string) => void;
};

export function visiblePanes(grid: GridMode, panes: PaneConfig[]): PaneConfig[] {
  if (grid === "1") return panes.slice(0, 1);
  if (grid === "4") return panes;
  return panes.slice(0, 2);
}

/** Multi-chart workspace state — source of truth for symbols/TFs/indicators. */
export const useLayoutStore = create<LayoutState>()(
  persist(
    (set, get) => ({
      grid: "1",
      panes: DEFAULT_PANES,
      activePane: "p1",

      setGrid: (grid) => set({ grid }),
      setActivePane: (id) => set({ activePane: id }),
      cyclePane: (dir) => {
        const { grid, panes, activePane } = get();
        const vis = visiblePanes(grid, panes);
        const idx = Math.max(0, vis.findIndex((p) => p.id === activePane));
        const next = vis[(idx + dir + vis.length) % vis.length];
        if (next) set({ activePane: next.id });
      },
      setActiveSymbol: (symbol) =>
        set((s) => ({
          panes: s.panes.map((p) => (p.id === s.activePane ? { ...p, symbol } : p)),
        })),
      setActiveTimeframe: (timeframe) =>
        set((s) => ({
          panes: s.panes.map((p) => (p.id === s.activePane ? { ...p, timeframe } : p)),
        })),
      setActiveChartType: (chartType) =>
        set((s) => ({
          panes: s.panes.map((p) => (p.id === s.activePane ? { ...p, chartType } : p)),
        })),
      toggleActiveVolume: () =>
        set((s) => ({
          panes: s.panes.map((p) =>
            p.id === s.activePane ? { ...p, showVolume: !p.showVolume } : p
          ),
        })),
      addActiveIndicator: (i) =>
        set((s) => ({
          panes: s.panes.map((p) =>
            p.id === s.activePane ? { ...p, indicators: [...p.indicators, i] } : p
          ),
        })),
      removeIndicator: (paneId, indId) =>
        set((s) => ({
          panes: s.panes.map((p) =>
            p.id === paneId ? { ...p, indicators: p.indicators.filter((x) => x.id !== indId) } : p
          ),
        })),
    }),
    { name: "pw-layout" }
  )
);
