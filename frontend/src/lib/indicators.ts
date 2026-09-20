import type { ActiveIndicator } from "@/stores/ui";

export type BuiltinIndicator = Omit<ActiveIndicator, "id"> & {
  category: "Moving averages" | "Oscillators" | "Bands" | "Volume";
};

export const BUILTIN_INDICATORS: BuiltinIndicator[] = [
  {
    title: "Moving Average (SMA 20)",
    category: "Moving averages",
    overlay: true,
    source: `//@version=5
indicator("SMA 20", overlay=true)
plot(ta.sma(close, 20), color=color.blue)`,
  },
  {
    title: "EMA 50",
    category: "Moving averages",
    overlay: true,
    source: `//@version=5
indicator("EMA 50", overlay=true)
plot(ta.ema(close, 50), color=color.orange)`,
  },
  {
    title: "RSI (14)",
    category: "Oscillators",
    overlay: false,
    source: `//@version=5
indicator("RSI")
len = input.int(14)
r = ta.rsi(close, len)
plot(r, color=color.purple)`,
  },
  {
    title: "MACD (12, 26, 9)",
    category: "Oscillators",
    overlay: false,
    source: `//@version=5
indicator("MACD")
macdVals = ta.macd(close, 12, 26, 9)
plot(macdVals)`,
  },
  {
    title: "Bollinger Bands (20, 2)",
    category: "Bands",
    overlay: true,
    source: `//@version=5
indicator("BB", overlay=true)
bbands = ta.bb(close, 20, 2.0)
plot(bbands)`,
  },
  {
    title: "Stochastic (14)",
    category: "Oscillators",
    overlay: false,
    source: `//@version=5
indicator("Stoch")
k = ta.stoch(close, 14)
plot(k, color=color.blue)`,
  },
  {
    title: "ATR (14)",
    category: "Bands",
    overlay: false,
    source: `//@version=5
indicator("ATR")
a = ta.atr(14)
plot(a, color=color.orange)`,
  },
];

export function makeIndicator(b: BuiltinIndicator): ActiveIndicator {
  return { id: `ind-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ...b };
}
