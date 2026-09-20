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

export type PositionInfo = {
  trade_id: number;
  side: "long" | "short";
  size: number;
  entry_price: number;
  entry_time: string | null;
  stop_loss: number | null;
  take_profit: number | null;
  mark_price: number | null;
  unrealized: number;
  unrealized_pips: number;
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

export type SessionStats = {
  balance: number;
  closed_trades: number;
  wins: number;
  losses: number;
  win_rate: number;
  total_pnl: number;
  avg_win: number;
  avg_loss: number;
  profit_factor: number | null;
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
  commission_mode: string;
  commission_value: number;
  spread_pips: number;
  slippage_pips: number;
  position: PositionInfo | null;
  orders: OrderInfo[];
  pending_orders: OrderInfo[];
  trades: TradeInfo[];
  stats: SessionStats;
  /** paper mode: events produced by the server-side auto-advance during this poll */
  events?: ReplayEvent[];
};

export type ReplayEvent = {
  type: string;
  reason?: string;
  side?: string;
  size?: number;
  closed_size?: number;
  remaining_size?: number;
  added_size?: number;
  price?: number;
  entry_price?: number;
  exit_price?: number;
  pnl?: number;
  commission?: number;
  order_id?: number;
  time?: string;
};

export type PriceLineSpec = {
  price: number;
  color: string;
  title: string;
  dashed?: boolean;
};

export type MarkerSpec = {
  time: number;
  position: "aboveBar" | "belowBar";
  color: string;
  shape: "arrowUp" | "arrowDown" | "circle";
  text: string;
};

export type BacktestTrade = {
  entry_time: string;
  exit_time: string;
  side: "long" | "short";
  size: number;
  entry_price: number;
  exit_price: number;
  pnl: number;
  pnl_pct: number;
  reason: "signal" | "stop" | "target";
};

export type BacktestMetrics = {
  net_pnl: number;
  final_equity: number;
  return_pct: number;
  max_drawdown_pct: number;
  sharpe: number;
  sortino: number;
  cagr_pct: number;
  trades: number;
  wins: number;
  losses: number;
  win_rate: number;
  profit_factor: number | null;
  expectancy: number;
  avg_trade: number;
  best_trade: number;
  worst_trade: number;
  max_consecutive_wins: number;
  max_consecutive_losses: number;
  has_open_position: boolean;
  bars_processed: number;
};

export type CurvePoint = { time: number; value: number };

export type BacktestResult = {
  ok: true;
  id: number;
  name: string;
  kind: string;
  initial_capital: number;
  leverage: number;
  metrics: BacktestMetrics;
  equity_curve: CurvePoint[];
  drawdown_curve: CurvePoint[];
  trades: BacktestTrade[];
  open_position: { side: string; size: number; entry_price: number; unrealized: number } | null;
};

export type BacktestRunSummary = {
  id: number;
  name: string;
  symbol: string;
  timeframe: string;
  created_at: string;
  net_pnl: number | null;
  return_pct: number | null;
  win_rate: number | null;
  trades: number | null;
};
