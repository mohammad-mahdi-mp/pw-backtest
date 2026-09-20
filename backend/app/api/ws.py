"""Real-time price streaming over WebSocket.

Clients connect to /api/ws/prices and send {"action": "sub", "symbols": ["BTC/USDT"]}
(any number of sub/unsub messages). The hub polls public providers (Binance via
ccxt for crypto, Yahoo otherwise) ~every 1.2 s and pushes
{"type": "price", "symbol", "price", "ts", "change"} frames.

The poller only fetches symbols someone is actually subscribed to, and a small
negative cache avoids hammering a provider after an error.
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.paper.feed import infer_provider

logger = logging.getLogger("pw.ws")

router = APIRouter()

POLL_SECONDS = 1.2
ERROR_COOLDOWN = 10.0
YF_CACHE_SECONDS = 2.0


class PriceHub:
    def __init__(self) -> None:
        self.clients: dict[WebSocket, set[str]] = {}
        self.symbols: set[str] = set()
        self.last: dict[str, dict] = {}          # symbol -> {"price","ts","open"}
        self._err_until: dict[str, float] = {}   # symbol -> epoch until which to skip
        self._yf_ts: float = 0.0
        self._yf: Any = None                     # cached yf module handle
        self._task: asyncio.Task | None = None

    # ---- client management ----
    def join(self, ws: WebSocket) -> None:
        self.clients[ws] = set()

    def leave(self, ws: WebSocket) -> None:
        self.clients.pop(ws, None)
        self._recount()

    def sub(self, ws: WebSocket, symbols: list[str]) -> None:
        have = self.clients.get(ws)
        if have is None:
            return
        for s in symbols:
            have.add(s)
        self._recount()

    def unsub(self, ws: WebSocket, symbols: list[str]) -> None:
        have = self.clients.get(ws)
        if have is None:
            return
        for s in symbols:
            have.discard(s)
        self._recount()

    def _recount(self) -> None:
        self.symbols = {s for subs in self.clients.values() for s in subs}

    # ---- price fetching ----
    def _stored_fallback(self, symbol: str) -> dict | None:
        """Last stored close from parquet — used when live providers are unreachable."""
        try:
            from app.data.storage import load_bars
            for tf in ("1m", "5m", "15m", "1h", "1d"):
                df = load_bars(symbol, tf, None, None, limit=1)
                if df is not None and not df.empty:
                    r = df.iloc[-1]
                    return {"price": float(r["close"]), "open": None,
                            "ts": int(r["timestamp"].timestamp()), "source": "stored"}
        except Exception:  # noqa: BLE001
            pass
        return None

    def _fetch(self, symbol: str) -> dict | None:
        """Blocking fetch of last price — run in a thread."""
        now = time.time()
        if now < self._err_until.get(symbol, 0):
            return self._stored_fallback(symbol)
        try:
            provider, exchange, fetch_sym = infer_provider(symbol)
            if provider == "ccxt":
                import ccxt
                ex = getattr(ccxt, exchange)({"enableRateLimit": True, "timeout": 8000})
                try:
                    t = ex.fetch_ticker(fetch_sym)
                    last = t.get("last") or t.get("close")
                    if last is None:
                        return None
                    return {"price": float(last), "open": t.get("open"),
                            "ts": int((t.get("timestamp") or now * 1000) / 1000),
                            "source": "live"}
                finally:
                    if hasattr(ex, "close"):
                        try:
                            ex.close()
                        except Exception:  # noqa: BLE001
                            pass
            # yahoo
            if self._yf is None or now - self._yf_ts > YF_CACHE_SECONDS:
                import yfinance
                self._yf = yfinance
                self._yf_ts = now
            tk = self._yf.Ticker(fetch_sym)
            fi = tk.fast_info
            last = fi.get("last_price") if hasattr(fi, "get") else fi["last_price"]
            if last is None:
                return None
            return {"price": float(last), "open": None, "ts": int(now), "source": "live"}
        except Exception as e:  # noqa: BLE001
            self._err_until[symbol] = now + ERROR_COOLDOWN
            logger.debug("ws fetch failed for %s (%s) — falling back to stored bars", symbol, e)
            return self._stored_fallback(symbol)

    async def poll_once(self) -> None:
        if not self.symbols:
            return
        results = await asyncio.gather(
            *(asyncio.to_thread(self._fetch, s) for s in list(self.symbols)),
            return_exceptions=True,
        )
        frames = []
        for sym, r in zip(list(self.symbols), results):
            if isinstance(r, Exception) or not r:
                continue
            change = None
            if r.get("open"):
                change = (r["price"] / r["open"] - 1) * 100
            self.last[sym] = r
            frames.append({
                "type": "price", "symbol": sym, "price": r["price"],
                "ts": r["ts"], "change_pct": change,
                "source": r.get("source", "live"),
            })
        if not frames:
            return
        dead = []
        msg = {"type": "batch", "prices": frames}
        for ws, subs in list(self.clients.items()):
            payload = {"type": "batch", "prices": [f for f in frames if f["symbol"] in subs]}
            if not payload["prices"]:
                continue
            try:
                await ws.send_json(payload)
            except Exception:  # noqa: BLE001
                dead.append(ws)
        for ws in dead:
            self.leave(ws)

    async def _run(self) -> None:
        while True:
            try:
                await self.poll_once()
            except Exception as e:  # noqa: BLE001
                logger.warning("ws poller error: %s", e)
            await asyncio.sleep(POLL_SECONDS)

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._task = asyncio.get_event_loop().create_task(self._run())

    def stop(self) -> None:
        if self._task:
            self._task.cancel()
            self._task = None


hub = PriceHub()


@router.websocket("/prices")
async def prices_ws(ws: WebSocket) -> None:
    await ws.accept()
    hub.join(ws)
    # prime with the last known prices so the UI has something instantly
    try:
        cached = [
            {"type": "price", "symbol": s, "price": d["price"], "ts": d["ts"], "change_pct": None}
            for s, d in hub.last.items()
        ]
        if cached:
            await ws.send_json({"type": "batch", "prices": cached})
    except Exception:  # noqa: BLE001
        pass
    try:
        while True:
            msg = await ws.receive_json()
            action = msg.get("action")
            symbols = msg.get("symbols") or []
            if not isinstance(symbols, list):
                continue
            if action == "sub":
                hub.sub(ws, symbols)
            elif action == "unsub":
                hub.unsub(ws, symbols)
            elif action == "ping":
                await ws.send_json({"type": "pong"})
    except WebSocketDisconnect:
        pass
    except Exception:  # noqa: BLE001
        pass
    finally:
        hub.leave(ws)
