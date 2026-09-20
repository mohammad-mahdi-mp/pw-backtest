"""Screener API: scan every symbol with stored data for basic conditions.

Computes per-symbol metrics (last price, change %, RSI, SMA position, volume
ratio) from the local parquet store — no network needed. The frontend renders
a sortable table and jumps to a symbol on click.
"""
from __future__ import annotations

from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter

from app.core.config import settings
from app.data import storage
from app.data.storage import load_bars

router = APIRouter()


def _discover_symbols(timeframe: str) -> list[str]:
    """All symbols that have stored bars for the timeframe."""
    out: set[str] = set()
    market_dir = storage.MARKET_DIR
    if not market_dir.exists():
        return []
    for provider_dir in market_dir.iterdir():
        if not provider_dir.is_dir():
            continue
        for sym_dir in provider_dir.iterdir():
            if sym_dir.is_dir() and (sym_dir / timeframe / "data.parquet").exists():
                out.add(sym_dir.name.replace("_", "/"))
    return sorted(out)


def _rsi(closes: pd.Series, length: int = 14) -> float:
    delta = closes.astype(float).diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    ag = gain.ewm(alpha=1 / length, adjust=False).mean()
    al = loss.ewm(alpha=1 / length, adjust=False).mean()
    rs = ag / al.replace(0, np.nan)
    rsi = 100 - 100 / (1 + rs)
    v = rsi.iloc[-1]
    return float(v) if pd.notna(v) else 50.0


@router.get("/scan")
async def scan(timeframe: str = "1h", limit: int = 100) -> dict:
    symbols = _discover_symbols(timeframe)
    rows: list[dict] = []

    # change% window ≈ 24h worth of bars
    tf_minutes = {"1m": 1, "5m": 5, "15m": 15, "30m": 30, "1h": 60, "2h": 120,
                  "4h": 240, "1d": 1440}.get(timeframe, 60)
    chg_bars = max(1, round(24 * 60 / tf_minutes))

    for sym in symbols:
        try:
            df = load_bars(sym, timeframe, limit=400)
            if df is None or len(df) < 30:
                continue
            closes = df["close"].astype(float)
            vols = df["volume"].astype(float)
            last = float(closes.iloc[-1])
            ref = float(closes.iloc[-1 - chg_bars]) if len(closes) > chg_bars else float(closes.iloc[0])
            chg = (last / ref - 1) * 100 if ref else 0.0

            sma20 = float(closes.rolling(20).mean().iloc[-1]) if len(closes) >= 20 else None
            sma50 = float(closes.rolling(50).mean().iloc[-1]) if len(closes) >= 50 else None
            sma200 = float(closes.rolling(200).mean().iloc[-1]) if len(closes) >= 200 else None

            avg_vol = float(vols.rolling(20).mean().iloc[-1]) if len(vols) >= 20 else 0.0
            vol_ratio = (float(vols.iloc[-1]) / avg_vol) if avg_vol > 0 else None

            hi = float(df["high"].tail(200).max())
            lo = float(df["low"].tail(200).min())
            pos52 = ((last - lo) / (hi - lo) * 100) if hi > lo else 50.0

            rows.append({
                "symbol": sym,
                "timeframe": timeframe,
                "last": last,
                "chg_pct": chg,
                "rsi": _rsi(closes),
                "above_sma20": (last > sma20) if sma20 else None,
                "above_sma50": (last > sma50) if sma50 else None,
                "above_sma200": (last > sma200) if sma200 else None,
                "vol_ratio": round(vol_ratio, 2) if vol_ratio is not None else None,
                "range_pos": round(pos52, 1),
                "bars": len(closes),
            })
        except Exception:
            continue  # unreadable store for this symbol — skip

    rows.sort(key=lambda r: r["chg_pct"], reverse=True)
    return {"timeframe": timeframe, "symbols": len(rows), "rows": rows[:limit]}
