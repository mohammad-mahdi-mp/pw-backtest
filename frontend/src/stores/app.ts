import { create } from "zustand";

type AppState = {
  symbol: string;
  timeframe: string;
  sessionId: number | null;
  setSymbol: (s: string) => void;
  setTimeframe: (t: string) => void;
  setSessionId: (id: number | null) => void;
};

export const useAppStore = create<AppState>((set) => ({
  symbol: "BTC/USDT",
  timeframe: "1h",
  sessionId: null,
  setSymbol: (symbol) => set({ symbol }),
  setTimeframe: (timeframe) => set({ timeframe }),
  setSessionId: (sessionId) => set({ sessionId }),
}));
