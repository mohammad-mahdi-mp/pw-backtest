"""OANDA provider (stub; Phase 1 will complete when API key is configured)."""
from __future__ import annotations

from datetime import datetime
import pandas as pd


def fetch_ohlcv(symbol: str, timeframe: str, start: datetime, end: datetime) -> pd.DataFrame:
    try:
        import oandapyV20
        from oandapyV20.endpoints import instruments
        from app.core.config import settings
    except ImportError:
        raise RuntimeError("oandapyV20 is not installed")

    if not settings.oanda_api_key or not settings.oanda_account_id:
        raise RuntimeError("OANDA API key / account id not configured in .env")

    # OANDA instruments use EUR_USD format
    inst = symbol.replace("/", "_")
    tf_map = {"1m": "M1", "5m": "M5", "15m": "M15", "30m": "M30", "1h": "H1", "4h": "H4", "1d": "D"}
    gran = tf_map.get(timeframe, "H1")

    client = oandapyV20.API(access_token=settings.oanda_api_key,
                            environment=settings.oanda_env)
    params = {"granularity": gran, "from": start.isoformat() + "Z", "to": end.isoformat() + "Z", "price": "M"}
    r = instruments.InstrumentsCandles(instrument=inst, params=params)
    client.request(r)
    candles = r.response.get("candles", [])
    rows = []
    for c in candles:
        if not c["complete"]:
            continue
        m = c["mid"]
        rows.append({
            "timestamp": pd.to_datetime(c["time"]).tz_localize(None),
            "open": float(m["o"]), "high": float(m["h"]),
            "low": float(m["l"]), "close": float(m["c"]),
            "volume": float(c["volume"]),
        })
    return pd.DataFrame(rows, columns=["timestamp", "open", "high", "low", "close", "volume"])
