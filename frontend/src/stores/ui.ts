import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ChartType = "candles" | "bars" | "line" | "area" | "heikin";
export type BottomTab = "trade" | "pine" | "backtest" | "account";

export type ActiveIndicator = {
  id: string;
  title: string;
  source: string;
  overlay: boolean;
};
// NOTE: chartType / showVolume / indicators moved to the per-pane layout store

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
  backtestRequest: BacktestRequest | null;

  replayActive: boolean;
  replayPlaying: boolean;
  replaySpeed: number;
  replayTime: number | null; // epoch seconds of replay cursor
  paperActive: boolean;
  paperSessionId: number | null;

  toggleRightSidebar: () => void;
  toggleBottomPanel: (open?: boolean) => void;
  setBottomTab: (t: BottomTab) => void;
  setReplay: (p: ReplayStatePatch) => void;
  setBacktestRequest: (r: BacktestRequest | null) => void;
  setPaper: (p: { paperActive?: boolean; paperSessionId?: number | null }) => void;
};

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      rightSidebarOpen: false,
      bottomPanelOpen: false,
      bottomTab: "trade",
      backtestRequest: null,

      replayActive: false,
      replayPlaying: false,
      replaySpeed: 1,
      replayTime: null,
      paperActive: false,
      paperSessionId: null,

      toggleRightSidebar: () => set((s) => ({ rightSidebarOpen: !s.rightSidebarOpen })),
      toggleBottomPanel: (open) =>
        set((s) => ({ bottomPanelOpen: open !== undefined ? open : !s.bottomPanelOpen })),
      setBottomTab: (bottomTab) => set({ bottomTab, bottomPanelOpen: true }),
      setReplay: (p) => set(p),
      setBacktestRequest: (backtestRequest) => set({ backtestRequest }),
      setPaper: (p) => set(p),
    }),
    {
      name: "pw-ui",
      // persist the workspace layout only — never live session state
      partialize: (s) => ({
        bottomTab: s.bottomTab,
        bottomPanelOpen: s.bottomPanelOpen,
        rightSidebarOpen: s.rightSidebarOpen,
      }),
    }
  )
);
