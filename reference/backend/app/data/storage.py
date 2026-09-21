"""Parquet + DuckDB storage layer for OHLCV market data."""
from __future__ import annotations

from pathlib import Path
from datetime import datetime
from typing import Optional

import pandas as pd

from app.core.config import settings

MARKET_DIR = settings.data_dir / "market"
MARKET_DIR.mkdir(parents=True, exist_ok=True)


def _path(symbol: str, timeframe: str, provider: str = "generic") -> Path:
    safe_symbol = symbol.replace("/", "_")
    folder = MARKET_DIR / provider / safe_symbol / timeframe
    folder.mkdir(parents=True, exist_ok=True)
    return folder / "data.parquet"


def save_bars(df: pd.DataFrame, symbol: str, timeframe: str, provider: str = "generic") -> int:
    """Persist OHLCV bars to parquet. Returns number of rows saved."""
    if df is None or df.empty:
        return 0
    df = df.copy()
    expected_cols = ["timestamp", "open", "high", "low", "close", "volume"]
    for c in expected_cols:
        if c not in df.columns:
            if c == "volume":
                df[c] = 0.0
            else:
                raise ValueError(f"missing column {c}")
    df = df[expected_cols].sort_values("timestamp").drop_duplicates(subset=["timestamp"], keep="last")
    path = _path(symbol, timeframe, provider)
    if path.exists():
        existing = pd.read_parquet(path)
        df = pd.concat([existing, df], ignore_index=True)
        df = df.sort_values("timestamp").drop_duplicates(subset=["timestamp"], keep="last")
    df.to_parquet(path, index=False)
    return len(df)


def find_bars_path(symbol: str, timeframe: str) -> Optional[Path]:
    """Locate the existing parquet for symbol/timeframe across provider folders."""
    safe_symbol = symbol.replace("/", "_")
    if not MARKET_DIR.exists():
        return None
    for provider_dir in sorted(MARKET_DIR.iterdir()):
        candidate = provider_dir / safe_symbol / timeframe / "data.parquet"
        if candidate.exists():
            return candidate
    return None


def load_bars(
    symbol: str,
    timeframe: str,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    limit: int = 2000,
    provider: str = "generic",
) -> Optional[pd.DataFrame]:
    """Load bars from parquet. Returns None if no data."""
    # try generic path first, then any provider subfolder
    path = _path(symbol, timeframe, provider)
    if not path.exists():
        # search other providers
        safe_symbol = symbol.replace("/", "_")
        for p in MARKET_DIR.iterdir():
            candidate = p / safe_symbol / timeframe / "data.parquet"
            if candidate.exists():
                path = candidate
                break
        else:
            return None
    df = pd.read_parquet(path)
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=False)
    if start:
        df = df[df["timestamp"] >= pd.Timestamp(start)]
    if end:
        df = df[df["timestamp"] <= pd.Timestamp(end)]
    df = df.sort_values("timestamp").tail(limit).reset_index(drop=True)
    return df
