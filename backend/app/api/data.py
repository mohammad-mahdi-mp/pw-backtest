"""Data API: symbols, historical bars, backfill, provider status."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import get_db
from app.models.symbol import Symbol
from app.data.storage import load_bars, save_bars
from app.data.downloader import backfill

router = APIRouter()


@router.get("/symbols")
async def list_symbols(db: AsyncSession = Depends(get_db)) -> list[dict]:
    result = await db.execute(select(Symbol).where(Symbol.is_active == True).order_by(Symbol.name))
    return [
        {
            "id": s.id,
            "name": s.name,
            "provider": s.provider,
            "market_type": s.market_type,
            "base_currency": s.base_currency,
            "quote_currency": s.quote_currency,
        }
        for s in result.scalars().all()
    ]


@router.post("/symbols")
async def add_symbol(payload: dict, db: AsyncSession = Depends(get_db)) -> dict:
    sym = Symbol(
        name=payload["name"],
        provider=payload.get("provider", "manual"),
        market_type=payload.get("market_type", "forex"),
        base_currency=payload.get("base_currency", ""),
        quote_currency=payload.get("quote_currency", ""),
        tick_size=float(payload.get("tick_size", 1e-5)),
        pip_size=float(payload.get("pip_size", 1e-4)),
        contract_size=float(payload.get("contract_size", 100_000)),
    )
    db.add(sym)
    await db.commit()
    await db.refresh(sym)
    return {"id": sym.id, "name": sym.name}


@router.get("/bars")
async def get_bars(
    symbol: str = Query(...),
    timeframe: str = Query("1h"),
    start: Optional[datetime] = Query(None),
    end: Optional[datetime] = Query(None),
    limit: int = Query(2000),
) -> dict:
    """Return OHLCV bars as arrays of [t, o, h, l, c, v]."""
    df = load_bars(symbol, timeframe, start, end, limit)
    if df is None or df.empty:
        return {"symbol": symbol, "timeframe": timeframe, "bars": []}
    bars = [
        {
            "time": int(row["timestamp"].timestamp()),
            "open": float(row["open"]),
            "high": float(row["high"]),
            "low": float(row["low"]),
            "close": float(row["close"]),
            "volume": float(row["volume"]) if "volume" in row else 0.0,
        }
        for _, row in df.iterrows()
    ]
    return {"symbol": symbol, "timeframe": timeframe, "bars": bars}


@router.post("/backfill")
async def backfill_endpoint(payload: dict) -> dict:
    """Download historical data from a provider and persist to parquet."""
    symbol = payload["symbol"]
    timeframe = payload.get("timeframe", "1h")
    provider = payload.get("provider", "ccxt")
    exchange = payload.get("exchange", "binance")
    start = payload.get("start")  # ISO string
    end = payload.get("end")
    try:
        count = await backfill(
            symbol=symbol,
            timeframe=timeframe,
            provider=provider,
            exchange=exchange,
            start=start,
            end=end,
        )
    except Exception as e:  # noqa: BLE001
        msg = str(e)
        if "NetworkError" in type(e).__name__ or "network" in msg.lower() or "connection" in msg.lower():
            raise HTTPException(
                status_code=502,
                detail=f"Cannot reach {provider} ({exchange}) — check internet connection. "
                       f"Tip: run scripts/seed_sample_data.py for offline demo data.",
            )
        raise HTTPException(status_code=400, detail=msg)
    return {"downloaded": count, "symbol": symbol, "timeframe": timeframe, "provider": provider}
