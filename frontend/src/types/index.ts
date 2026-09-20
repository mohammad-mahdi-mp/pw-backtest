export type Bar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type Symbol = {
  id: number;
  name: string;
  provider: string;
  market_type: string;
  base_currency?: string;
  quote_currency?: string;
};

export type PineScriptMeta = {
  id: number;
  name: string;
  kind: "indicator" | "strategy";
  version: string;
  updated_at: string;
};

export type PlotSeries = {
  id: string;
  title: string;
  color: string;
  type: "line" | "histogram";
  data: { time: number; value: number }[];
};

export type ReplaySession = {
  id: number;
  name: string;
  symbol: string;
  timeframe: string;
  current_time: string;
  cash: number;
  equity: number;
  leverage: number;
};

export type ApiError = { ok: false; error: string };
