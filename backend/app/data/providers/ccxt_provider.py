"""CCXT provider (crypto exchanges)."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

import pandas as pd


_CCXT_EXCHANGE_CACHE: dict = {}


def _get_exchange(name: str):
    if name in _CCXT_EXCHANGE_CACHE:
        return _CCXT_EXCHANGE_CACHE[name]
    try:
        import ccxt
    except ImportError as e:
        raise RuntimeError("ccxt is not installed. pip install ccxt") from e
    cls = getattr(ccxt, name)
    ex = cls({"enableRateLimit": True})
    _CCXT_EXCHANGE_CACHE[name] = ex
    return ex


_TF_CCXT = {
    "1m": "1m", "3m": "3m", "5m": "5m", "15m": "15m", "30m": "30m",
    "1h": "1h", "2h": "2h", "4h": "4h", "6h": "6h", "12h": "12h",
    "1d": "1d", "1w": "1w",
}


def fetch_ohlcv(
    symbol: str,
    timeframe: str,
    start: datetime,
    end: datetime,
    exchange: str = "binance",
) -> pd.DataFrame:
    ex = _get_exchange(exchange)
    tf = _TF_CCXT.get(timeframe, "1h")
    limit = 1000
    since = int(start.timestamp() * 1000)
    end_ms = int(end.timestamp() * 1000)
    all_ohlcv = []
    while since < end_ms:
        ohlcv = ex.fetch_ohlcv(symbol, timeframe=tf, since=since, limit=limit)
        if not ohlcv:
            break
        all_ohlcv.extend(ohlcv)
        last_ts = ohlcv[-1][0]
        if last_ts == since:
            break
        since = last_ts + 1
        if len(ohlcv) < limit:
            break
    df = pd.DataFrame(all_ohlcv, columns=["timestamp", "open", "high", "low", "close", "volume"])
    df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms", utc=False)
    df = df[df["timestamp"] <= pd.Timestamp(end)]
    return df.reset_index(drop=True)
