"""OANDA live/practice order routing (REST v3, via httpx).

Enabled by setting in backend/.env:
    OANDA_API_KEY=...
    OANDA_ACCOUNT_ID=...
    OANDA_ENV=practice   # or "live"

Without credentials every method raises OandaNotConfigured — paper trading
works fully without this. Units are OANDA units (base-currency quantity,
negative = short); symbols convert from display "EUR/USD" to "EUR_USD".
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional

import httpx

API_HOSTS = {"practice": "https://api-fxpractice.oanda.com", "live": "https://api-fxtrade.oanda.com"}


class OandaError(RuntimeError):
    pass


class OandaNotConfigured(OandaError):
    pass


@dataclass
class OandaConfig:
    api_key: str
    account_id: str
    env: str = "practice"

    @property
    def host(self) -> str:
        return API_HOSTS.get(self.env, API_HOSTS["practice"])


def load_config() -> Optional[OandaConfig]:
    key = os.getenv("OANDA_API_KEY", "").strip()
    account = os.getenv("OANDA_ACCOUNT_ID", "").strip()
    if not key or not account:
        return None
    env = os.getenv("OANDA_ENV", "practice").strip().lower()
    if env not in API_HOSTS:
        env = "practice"
    return OandaConfig(api_key=key, account_id=account, env=env)


def to_oanda_symbol(symbol: str) -> str:
    return symbol.replace("/", "_").upper()


class OandaRouter:
    def __init__(self, cfg: Optional[OandaConfig] = None):
        self.cfg = cfg or load_config()

    @property
    def configured(self) -> bool:
        return self.cfg is not None

    def _require(self) -> OandaConfig:
        if not self.cfg:
            raise OandaNotConfigured(
                "OANDA is not configured — set OANDA_API_KEY and OANDA_ACCOUNT_ID in backend/.env"
            )
        return self.cfg

    def _client(self, cfg: OandaConfig) -> httpx.Client:
        return httpx.Client(
            base_url=cfg.host,
            headers={"Authorization": f"Bearer {cfg.api_key}",
                     "Content-Type": "application/json"},
            timeout=15.0,
        )

    # ---- read endpoints ----
    def account_summary(self) -> dict:
        cfg = self._require()
        with self._client(cfg) as c:
            r = c.get(f"/v3/accounts/{cfg.account_id}/summary")
        if r.status_code >= 400:
            raise OandaError(f"OANDA {r.status_code}: {r.text[:200]}")
        s = r.json().get("account", {})
        return {
            "id": s.get("id"),
            "currency": s.get("currency"),
            "balance": float(s.get("balance", 0)),
            "nav": float(s.get("NAV", 0)),
            "unrealized_pl": float(s.get("unrealizedPL", 0)),
            "margin_available": float(s.get("marginAvailable", 0)),
            "open_trade_count": int(s.get("openTradeCount", 0)),
        }

    def positions(self) -> list[dict]:
        cfg = self._require()
        with self._client(cfg) as c:
            r = c.get(f"/v3/accounts/{cfg.account_id}/openPositions")
        if r.status_code >= 400:
            raise OandaError(f"OANDA {r.status_code}: {r.text[:200]}")
        out = []
        for p in r.json().get("positions", []):
            long_u = int(p.get("long", {}).get("units", 0) or 0)
            short_u = int(p.get("short", {}).get("units", 0) or 0)
            units = long_u + short_u  # net (OANDA nets by default on hedging-off accounts)
            out.append({
                "symbol": p.get("instrument", "").replace("_", "/"),
                "units": units,
                "side": "long" if units >= 0 else "short",
                "unrealized_pl": float(p.get("unrealizedPL", 0)),
            })
        return out

    def price(self, symbol: str) -> dict:
        cfg = self._require()
        with self._client(cfg) as c:
            r = c.get(f"/v3/accounts/{cfg.account_id}/pricing", params={"instruments": to_oanda_symbol(symbol)})
        if r.status_code >= 400:
            raise OandaError(f"OANDA {r.status_code}: {r.text[:200]}")
        prices = r.json().get("prices", [])
        if not prices:
            raise OandaError(f"No price for {symbol}")
        p = prices[0]
        bid = float(p["closeoutBid"])
        ask = float(p["closeoutAsk"])
        return {"symbol": symbol, "bid": bid, "ask": ask, "mid": (bid + ask) / 2}

    # ---- order routing ----
    def place_market_order(self, symbol: str, units: int,
                           stop: Optional[float] = None, target: Optional[float] = None) -> dict:
        """Market order; units > 0 buys, < 0 sells. Absolute SL/TP prices."""
        cfg = self._require()
        order: dict = {
            "order": {
                "type": "MARKET",
                "instrument": to_oanda_symbol(symbol),
                "units": str(int(units)),
                "timeInForce": "FOK",
                "positionFill": "DEFAULT",
            }
        }
        if stop is not None:
            order["order"]["stopLossOnFill"] = {"price": f"{float(stop):.5f}", "timeInForce": "GTC"}
        if target is not None:
            order["order"]["takeProfitOnFill"] = {"price": f"{float(target):.5f}", "timeInForce": "GTC"}
        with self._client(cfg) as c:
            r = c.post(f"/v3/accounts/{cfg.account_id}/orders", json=order)
        if r.status_code >= 400:
            raise OandaError(f"OANDA {r.status_code}: {r.text[:300]}")
        body = r.json()
        fill = body.get("orderFillTransaction", {})
        return {
            "order_id": fill.get("id"),
            "symbol": symbol,
            "units": int(fill.get("units", units)),
            "price": float(fill["price"]) if fill.get("price") else None,
            "pl": float(fill.get("pl", 0) or 0),
            "time": fill.get("time"),
        }

    def close_position(self, symbol: str) -> dict:
        """Flatten the net position for a symbol."""
        cfg = self._require()
        body = {"longUnits": "ALL"}  # closing longs; shorts handled below
        with self._client(cfg) as c:
            # close whichever side exists
            r = c.put(f"/v3/accounts/{cfg.account_id}/positions/{to_oanda_symbol(symbol)}/close",
                      json={"longUnits": "ALL", "shortUnits": "ALL"})
        if r.status_code >= 400:
            raise OandaError(f"OANDA {r.status_code}: {r.text[:200]}")
        return {"symbol": symbol, "closed": True}
