const BASE = "";  // same origin via vite proxy

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
  listSymbols: () => request<any[]>("/api/data/symbols"),
  addSymbol: (payload: any) => request<any>("/api/data/symbols", { method: "POST", body: JSON.stringify(payload) }),
  getBars: (symbol: string, timeframe = "1h", limit = 2000) =>
    request<any>(`/api/data/bars?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&limit=${limit}`),
  backfill: (payload: any) => request<any>("/api/data/backfill", { method: "POST", body: JSON.stringify(payload) }),

  // Replay
  createSession: (payload: any) => request<any>("/api/replay/sessions", { method: "POST", body: JSON.stringify(payload) }),
  listSessions: () => request<any[]>("/api/replay/sessions"),
  getSession: (id: number) => request<any>(`/api/replay/sessions/${id}`),
  placeOrder: (sid: number, payload: any) =>
    request<any>(`/api/replay/sessions/${sid}/orders`, { method: "POST", body: JSON.stringify(payload) }),
  advance: (sid: number, bars = 1) =>
    request<any>(`/api/replay/sessions/${sid}/advance`, { method: "POST", body: JSON.stringify({ bars }) }),

  // Pine
  listScripts: () => request<any[]>("/api/pine/scripts"),
  saveScript: (payload: any) => request<any>("/api/pine/scripts", { method: "POST", body: JSON.stringify(payload) }),
  compileScript: (source: string) =>
    request<any>("/api/pine/compile", { method: "POST", body: JSON.stringify({ source }) }),
  runScript: (source: string, bars: any[]) =>
    request<any>("/api/pine/run", { method: "POST", body: JSON.stringify({ source, bars }) }),

  // Backtest
  runBacktest: (payload: any) => request<any>("/api/backtest/run", { method: "POST", body: JSON.stringify(payload) }),
};
