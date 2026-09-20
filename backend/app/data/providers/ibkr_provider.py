"""Interactive Brokers provider (stub: requires running TWS/Gateway)."""
from __future__ import annotations

from datetime import datetime
import pandas as pd


def fetch_ohlcv(symbol: str, timeframe: str, start: datetime, end: datetime) -> pd.DataFrame:
    try:
        import asyncio
        from ib_insync import IB, Forex, Stock, Future, util
        from app.core.config import settings
    except ImportError as e:
        raise RuntimeError("ib_insync is not installed") from e

    # Duration/bar-size mapping
    barsize_map = {"1m": "1 min", "5m": "5 mins", "15m": "15 mins", "30m": "30 mins",
                   "1h": "1 hour", "4h": "4 hours", "1d": "1 day"}
    bar_size = barsize_map.get(timeframe, "1 hour")

    ib = IB()
    try:
        ib.connect(settings.ibkr_host, settings.ibkr_port, clientId=settings.ibkr_client_id, readonly=True)
        # heuristic contract detection
        if "/" in symbol:  # e.g. EUR/USD
            base, quote = symbol.split("/")
            contract = Forex(base + quote)
        else:
            contract = Stock(symbol, "SMART", "USD")
        # IB requires durationStr; cap at 1 Y for daily
        days = max((end - start).days, 1)
        if days <= 1:
            duration = "1 D"
        elif days <= 30:
            duration = f"{days} D"
        else:
            duration = f"{min(days // 365 + 1, 1)} Y"
        bars = ib.reqHistoricalData(
            contract,
            endDateTime=end.strftime("%Y%m%d %H:%M:%S"),
            durationStr=duration,
            barSizeSetting=bar_size,
            whatToShow="MIDPOINT",
            useRTH=True,
            formatDate=1,
        )
        df = util.df(bars)
    finally:
        ib.disconnect()

    if df is None or df.empty:
        return pd.DataFrame(columns=["timestamp", "open", "high", "low", "close", "volume"])
    df = df.rename(columns={"date": "timestamp"})
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=False).dt.tz_localize(None)
    return df[["timestamp", "open", "high", "low", "close", "volume"]].reset_index(drop=True)
