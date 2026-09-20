const BASE = "";  // same origin via vite proxy

import type {
  BacktestResult,
  BacktestRunSummary,
  Bar,
  ReplayEvent,
  SessionDetail,
  Symbol as SymbolInfo,
} from "@/types";

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => request<{ status: string }>("/api/health"),

  // Data
  listSymbols: () => request<SymbolInfo[]>("/api/data/symbols"),
  addSymbol: (payload: any) => request<any>("/api/data/symbols", { method: "POST", body: JSON.stringify(payload) }),
  getBars: (symbol: string, timeframe = "1h", limit = 2000) =>
    request<{ symbol: string; timeframe: string; bars: Bar[] }>(
      `/api/data/bars?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&limit=${limit}`
    ),
  backfill: (payload: any) =>
    request<{ downloaded: number; symbol: string; timeframe: string; provider: string }>("/api/data/backfill", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // Replay
  createSession: (payload: any) =>
    request<{ id: number; current_time: string; equity: number }>("/api/replay/sessions", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  listSessions: () => request<any[]>("/api/replay/sessions"),
  getSession: (id: number) => request<SessionDetail>(`/api/replay/sessions/${id}`),
  placeOrder: (sid: number, payload: any) =>
    request<{ id: number; status: string; fill_price?: number; events: ReplayEvent[] }>(
      `/api/replay/sessions/${sid}/orders`,
      { method: "POST", body: JSON.stringify(payload) }
    ),
  advance: (sid: number, bars = 1) =>
    request<{ current_time: string; equity: number; balance: number; position: any; events: ReplayEvent[] }>(
      `/api/replay/sessions/${sid}/advance`,
      { method: "POST", body: JSON.stringify({ bars }) }
    ),
  closePosition: (sid: number) =>
    request<{ closed: boolean; pnl: number; events: ReplayEvent[] }>(`/api/replay/sessions/${sid}/close`, {
      method: "POST",
      body: "{}",
    }),
  cancelOrder: (sid: number, oid: number) =>
    request<{ id: number; status: string }>(`/api/replay/sessions/${sid}/orders/${oid}/cancel`, {
      method: "POST",
      body: "{}",
    }),
  updatePosition: (sid: number, payload: { stop_loss?: number | null; take_profit?: number | null }) =>
    request<{ trade_id: number; stop_loss: number | null; take_profit: number | null }>(
      `/api/replay/sessions/${sid}/position`,
      { method: "POST", body: JSON.stringify(payload) }
    ),
  setTradeNote: (sid: number, tid: number, note: string) =>
    request<{ id: number; note: string }>(`/api/replay/sessions/${sid}/trades/${tid}/note`, {
      method: "POST",
      body: JSON.stringify({ note }),
    }),

  // Paper trading
  paperStart: (payload: { symbol: string; timeframe: string; cash?: number; leverage?: number }) =>
    request<{ id: number; symbol: string; timeframe: string; current_time: string; cash: number; equity: number }>(
      "/api/paper/start",
      { method: "POST", body: JSON.stringify(payload) }
    ),
  paperStop: (id: number) =>
    request<{ id: number; stopped: boolean; equity: number }>("/api/paper/stop", {
      method: "POST",
      body: JSON.stringify({ id }),
    }),

  // Pine
  listScripts: () => request<any[]>("/api/pine/scripts"),
  saveScript: (payload: any) => request<{ id: number; name: string }>("/api/pine/scripts", { method: "POST", body: JSON.stringify(payload) }),
  compileScript: (source: string) =>
    request<{ ok: boolean; ir?: any; error?: string }>("/api/pine/compile", {
      method: "POST",
      body: JSON.stringify({ source }),
    }),
  runScript: (source: string, bars: Bar[]) =>
    request<{ ok: boolean; series?: any[]; error?: string }>("/api/pine/run", {
      method: "POST",
      body: JSON.stringify({ source, bars }),
    }),

  // Backtest
  runBacktest: (payload: {
    source: string;
    symbol: string;
    timeframe: string;
    cash?: number;
    leverage?: number;
  }) =>
    request<BacktestResult | { ok: false; error: string }>("/api/backtest/run", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  listBacktestRuns: () => request<BacktestRunSummary[]>("/api/backtest/runs"),
  getBacktestRun: (id: number) => request<BacktestResult>(`/api/backtest/runs/${id}`),
};
