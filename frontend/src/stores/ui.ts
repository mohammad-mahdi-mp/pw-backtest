import { create } from "zustand";

export type ChartType = "candles" | "bars" | "line" | "area" | "heikin";
export type BottomTab = "trade" | "pine" | "backtest" | "account";

export type ActiveIndicator = {
  id: string;
  title: string;
  source: string;
  overlay: boolean;
};

export type BacktestRequest = { source: string; name: string; key: number };

export type ReplayStatePatch = {
  replayActive?: boolean;
  replayPlaying?: boolean;
  replaySpeed?: number;
  replayTime?: number | null;
};

type UIState = {
  rightSidebarOpen: boolean;
  bottomPanelOpen: boolean;
  bottomTab: BottomTab;
  chartType: ChartType;
  showVolume: boolean;
  indicators: ActiveIndicator[];
  backtestRequest: BacktestRequest | null;

  replayActive: boolean;
  replayPlaying: boolean;
  replaySpeed: number;
  replayTime: number | null; // epoch seconds of replay cursor

  toggleRightSidebar: () => void;
  toggleBottomPanel: (open?: boolean) => void;
  setBottomTab: (t: BottomTab) => void;
  setChartType: (c: ChartType) => void;
  toggleVolume: () => void;
  addIndicator: (i: ActiveIndicator) => void;
  removeIndicator: (id: string) => void;
  setReplay: (p: ReplayStatePatch) => void;
  setBacktestRequest: (r: BacktestRequest | null) => void;
};

export const useUIStore = create<UIState>((set) => ({
  rightSidebarOpen: false,
  bottomPanelOpen: false,
  bottomTab: "trade",
  chartType: "candles",
  showVolume: true,
  indicators: [],
  backtestRequest: null,

  replayActive: false,
  replayPlaying: false,
  replaySpeed: 1,
  replayTime: null,

  toggleRightSidebar: () => set((s) => ({ rightSidebarOpen: !s.rightSidebarOpen })),
  toggleBottomPanel: (open) =>
    set((s) => ({ bottomPanelOpen: open !== undefined ? open : !s.bottomPanelOpen })),
  setBottomTab: (bottomTab) => set({ bottomTab, bottomPanelOpen: true }),
  setChartType: (chartType) => set({ chartType }),
  toggleVolume: () => set((s) => ({ showVolume: !s.showVolume })),
  addIndicator: (i) => set((s) => ({ indicators: [...s.indicators, i] })),
  removeIndicator: (id) => set((s) => ({ indicators: s.indicators.filter((x) => x.id !== id) })),
  setReplay: (p) => set(p),
  setBacktestRequest: (backtestRequest) => set({ backtestRequest }),
}));
