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
  data: { time: number; value: number; color?: string }[];
};

export type PaneSpec = {
  id: string;
  title: string;
  series: PlotSeries[];
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

export type OrderInfo = {
  id: number;
  side: "buy" | "sell";
  type: string;
  size: number;
  price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  status: string;
  fill_price: number | null;
};

export type TradeInfo = {
  id: number;
  side: "long" | "short";
  size: number;
  entry_price: number;
  exit_price: number | null;
  entry_time: string | null;
  exit_time: string | null;
  pnl: number;
  pnl_pips: number;
  note: string;
};

export type SessionDetail = {
  id: number;
  name: string;
  symbol: string;
  timeframe: string;
  current_time: string;
  start_time: string;
  cash: number;
  equity: number;
  leverage: number;
  orders: OrderInfo[];
  trades: TradeInfo[];
};

export type ApiError = { ok: false; error: string };
