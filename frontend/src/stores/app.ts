import { create } from "zustand";
import { persist } from "zustand/middleware";

type AppState = {
  symbol: string;
  timeframe: string;
  sessionId: number | null;
  setSymbol: (s: string) => void;
  setTimeframe: (t: string) => void;
  setSessionId: (id: number | null) => void;
};

/** symbol/timeframe persist across reloads (layout saving, minimal). */
export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      symbol: "BTC/USDT",
      timeframe: "1h",
      sessionId: null,
      setSymbol: (symbol) => set({ symbol }),
      setTimeframe: (timeframe) => set({ timeframe }),
      setSessionId: (sessionId) => set({ sessionId }),
    }),
    {
      name: "pw-app",
      partialize: (s) => ({ symbol: s.symbol, timeframe: s.timeframe }),
    }
  )
);
