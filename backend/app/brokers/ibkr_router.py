"""IBKR order routing via ib_insync (requires TWS / IB Gateway running locally).

Enable in backend/.env:
    IBKR_HOST=127.0.0.1
    IBKR_PORT=7497          # 7497 TWS paper | 7496 Gateway paper | 7492 TWS live
    IBKR_CLIENT_ID=1

ib_insync must be installed (pip install ib-insync — already in requirements.txt).
Every method raises IbkrError with a human message when unavailable.
"""
from __future__ import annotations

import os
from typing import Optional


class IbkrError(RuntimeError):
    pass


def _import_ib():
    try:
        import ib_insync  # noqa: PLC0415
        return ib_insync
    except ImportError as e:
        raise IbkrError("ib_insync is not installed — pip install ib-insync") from e


class IbkrRouter:
    def __init__(self, host: Optional[str] = None, port: Optional[int] = None, client_id: Optional[int] = None):
        self.host = host or os.getenv("IBKR_HOST", "127.0.0.1")
        self.port = int(port or os.getenv("IBKR_PORT", "7497"))
        self.client_id = int(client_id or os.getenv("IBKR_CLIENT_ID", "1"))
        self._ib = None
        self._ib_mod = None

    @property
    def available(self) -> bool:
        try:
            _import_ib()
            return True
        except IbkrError:
            return False

    def connect(self):
        if self._ib and self._ib.isConnected():
            return self._ib
        ib_mod = _import_ib()
        self._ib_mod = ib_mod
        ib = ib_mod.IB()
        try:
            ib.connect(self.host, self.port, clientId=self.client_id, timeout=8)
        except Exception as e:  # noqa: BLE001
            raise IbkrError(
                f"Cannot connect to TWS/Gateway at {self.host}:{self.port} — "
                f"start TWS and enable API connections (File → Global Configuration → API → Settings)"
            ) from e
        self._ib = ib
        return ib

    def disconnect(self) -> None:
        if self._ib and self._ib.isConnected():
            self._ib.disconnect()
        self._ib = None

    def status(self) -> dict:
        return {
            "installed": self.available,
            "host": self.host,
            "port": self.port,
            "connected": bool(self._ib and self._ib.isConnected()),
            "hint": "Requires TWS or IB Gateway running with API access enabled"
                    if not (self._ib and self._ib.isConnected()) else "",
        }

    # ---- trading ----
    def _contract(self, symbol: str):
        """Map a display symbol to an IB contract. 'EUR/USD' → Forex; else STK."""
        ib = self.connect()
        if "/" in symbol:
            base, quote = symbol.split("/", 1)
            return ib_mod_forex(self._ib_mod, base, quote)
        return self._ib_mod.Stock(symbol.upper(), "SMART", "USD")

    def place_market_order(self, symbol: str, quantity: float, side: str = "buy") -> dict:
        ib = self.connect()
        contract = self._contract(symbol)
        order = self._ib_mod.MarketOrder("BUY" if side.lower() == "buy" else "SELL", abs(float(quantity)))
        trade = ib.placeOrder(contract, order)
        ib.sleep(2)  # allow fill
        filled = trade.orderStatus.status == "Filled"
        return {
            "symbol": symbol, "side": side, "quantity": abs(float(quantity)),
            "status": trade.orderStatus.status,
            "filled": filled,
            "avg_fill_price": float(trade.orderStatus.avgFillPrice or 0) or None,
        }

    def positions(self) -> list[dict]:
        ib = self.connect()
        out = []
        for p in ib.positions():
            out.append({
                "symbol": (p.contract.symbol + (f".{p.contract.currency}" if p.contract.currency else "")),
                "quantity": float(p.position),
                "avg_cost": float(p.avgCost),
            })
        return out

    def account_summary(self) -> list[dict]:
        ib = self.connect()
        vals = ib.accountSummary()
        keep = ("NetLiquidation", "TotalCashValue", "BuyingPower", "UnrealizedPnL")
        return [{"tag": v.tag, "value": v.value, "currency": v.currency}
                for v in vals if v.tag in keep]


def ib_mod_forex(ib_mod, base: str, quote: str):
    return ib_mod.Forex(base.upper(), quote.upper())
