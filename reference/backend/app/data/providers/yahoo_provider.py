"""Yahoo Finance provider (stocks/ETFs)."""
from __future__ import annotations

from datetime import datetime

import pandas as pd


def fetch_ohlcv(symbol: str, timeframe: str, start: datetime, end: datetime) -> pd.DataFrame:
    try:
        import yfinance as yf
    except ImportError as e:
        raise RuntimeError("yfinance is not installed") from e

    interval = {
        "1m": "1m", "2m": "2m", "5m": "5m", "15m": "15m", "30m": "30m",
        "1h": "1h", "1d": "1d", "1w": "1wk", "1mo": "1mo",
    }.get(timeframe, "1d")

    # Yahoo limits 1m data to 7 days; auto-fallback for larger ranges
    if interval == "1m" and (end - start).days > 7:
        interval = "1h"

    data = yf.download(
        symbol, start=start, end=end, interval=interval,
        auto_adjust=False, progress=False, group_by="column",
    )
    if data is None or data.empty:
        return pd.DataFrame(columns=["timestamp", "open", "high", "low", "close", "volume"])
    df = data.reset_index()
    # yfinance multi-index columns sometimes come as tuples
    df.columns = [c[0] if isinstance(c, tuple) else c for c in df.columns]
    df = df.rename(columns={df.columns[0]: "timestamp"})
    df = df[["timestamp", "Open", "High", "Low", "Close", "Volume"]]
    df.columns = ["timestamp", "open", "high", "low", "close", "volume"]
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=False).dt.tz_localize(None)
    return df.dropna().reset_index(drop=True)
