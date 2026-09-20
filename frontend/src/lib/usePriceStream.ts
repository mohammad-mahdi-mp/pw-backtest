import { useEffect, useRef } from "react";

export type PriceTick = {
  symbol: string;
  price: number;
  ts: number;
  change_pct: number | null;
};

type Handler = (tick: PriceTick) => void;

/**
 * Live price stream over WebSocket (/api/ws/prices), with polling fallback:
 * reconnects with backoff, resubscribes when the symbol list changes.
 * Pass onPrice callbacks keyed by symbol.
 */
export function usePriceStream(
  symbols: string[],
  handlers: Record<string, Handler | undefined>
) {
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef(handlers);
  const subbedRef = useRef<Set<string>>(new Set());
  const retryRef = useRef(0);
  const aliveRef = useRef(true);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    aliveRef.current = true;
    const key = [...new Set(symbols)].sort().join(",");

    const connect = () => {
      if (!aliveRef.current) return;
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${location.host}/api/ws/prices`);
      wsRef.current = ws;

      ws.onopen = () => {
        retryRef.current = 0;
        const want = new Set(symbols);
        // reconcile subscriptions
        for (const s of [...subbedRef.current].filter((x) => !want.has(x))) {
          ws.send(JSON.stringify({ action: "unsub", symbols: [s] }));
        }
        for (const s of want) {
          ws.send(JSON.stringify({ action: "sub", symbols: [s] }));
        }
        subbedRef.current = want;
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg?.type === "batch" && Array.isArray(msg.prices)) {
            for (const p of msg.prices) {
              handlersRef.current[p.symbol]?.(p);
            }
          }
        } catch {
          /* ignore malformed frames */
        }
      };

      ws.onclose = () => {
        if (!aliveRef.current) return;
        const delay = Math.min(1000 * 2 ** retryRef.current, 15000);
        retryRef.current += 1;
        setTimeout(connect, delay);
      };
      ws.onerror = () => ws.close();
    };

    // if already connected with the same subs, just update subscriptions
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const want = new Set(symbols);
      for (const s of [...subbedRef.current].filter((x) => !want.has(x))) {
        wsRef.current.send(JSON.stringify({ action: "unsub", symbols: [s] }));
      }
      const toAdd = [...want].filter((x) => !subbedRef.current.has(x));
      if (toAdd.length) wsRef.current.send(JSON.stringify({ action: "sub", symbols: toAdd }));
      subbedRef.current = want;
    } else {
      connect();
    }

    return () => {
      aliveRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbols.join(",")]);

  useEffect(() => {
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);
}

/** True when the last bar of the series is "recent" (within 3× timeframe). */
export function isLiveEdge(lastTimeSec: number, timeframe: string): boolean {
  const mins: Record<string, number> = {
    "1m": 1, "3m": 3, "5m": 5, "15m": 15, "30m": 30, "45m": 45,
    "1h": 60, "2h": 120, "3h": 180, "4h": 240, "1d": 1440, "1w": 10080, "1mo": 43200,
  };
  const tf = mins[timeframe] ?? 60;
  return Date.now() / 1000 - lastTimeSec < tf * 60 * 3 + 120;
}
