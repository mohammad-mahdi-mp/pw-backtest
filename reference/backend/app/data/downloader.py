"""Historical data downloader (Phase 1). Supports ccxt and yfinance out of the box.
OANDA / IBKR / Dukascopy connectors will be added as modules under providers/.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

import pandas as pd

from app.data.storage import save_bars
from app.data import providers


async def backfill(
    symbol: str,
    timeframe: str = "1h",
    provider: str = "ccxt",
    exchange: str = "binance",
    start: Optional[str] = None,
    end: Optional[str] = None,
) -> int:
    """Download OHLCV data and save to parquet. Returns number of candles saved."""
    end_dt = datetime.fromisoformat(end.replace("Z", "+00:00")).replace(tzinfo=None) if end else datetime.utcnow()
    if start:
        start_dt = datetime.fromisoformat(start.replace("Z", "+00:00")).replace(tzinfo=None)
    else:
        start_dt = end_dt - timedelta(days=90)

    if provider == "ccxt":
        df = providers.ccxt_provider.fetch_ohlcv(symbol, timeframe, start_dt, end_dt, exchange)
    elif provider == "yahoo":
        df = providers.yahoo_provider.fetch_ohlcv(symbol, timeframe, start_dt, end_dt)
    elif provider == "oanda":
        df = providers.oanda_provider.fetch_ohlcv(symbol, timeframe, start_dt, end_dt)
    elif provider == "ibkr":
        df = providers.ibkr_provider.fetch_ohlcv(symbol, timeframe, start_dt, end_dt)
    else:
        raise ValueError(f"Unknown provider: {provider}")

    return save_bars(df, symbol, timeframe, provider=provider)
