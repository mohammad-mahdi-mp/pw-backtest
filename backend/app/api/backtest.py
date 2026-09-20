"""Backtest API: run Pine strategies against stored data, persist & list runs."""
from __future__ import annotations

import math
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.data.storage import load_bars
from app.models.database import get_db
from app.models.backtest_run import BacktestRun
from app.pine.strategy import run_strategy

router = APIRouter()


def _parse_dt(v) -> Optional[datetime]:
    if not v:
        return None
    return datetime.fromisoformat(str(v).replace("Z", "+00:00")).replace(tzinfo=None)


def _downsample(curve: list[dict], max_points: int = 1500) -> list[dict]:
    if len(curve) <= max_points:
        return curve
    step = math.ceil(len(curve) / max_points)
    out = curve[::step]
    if out[-1] is not curve[-1]:
        out.append(curve[-1])
    return out


@router.post("/run")
async def run_backtest(payload: dict, db: AsyncSession = Depends(get_db)) -> dict:
    source = payload.get("source", "")
    symbol = payload.get("symbol") or "BTC/USDT"
    timeframe = payload.get("timeframe", "1h")
    start = _parse_dt(payload.get("start"))
    end = _parse_dt(payload.get("end"))
    cash = payload.get("cash")
    leverage = int(payload.get("leverage", 100))

    if not source.strip():
        return {"ok": False, "error": "Empty strategy source"}

    df = load_bars(symbol, timeframe, start, end, limit=200_000)
    if df is None or df.empty:
        raise HTTPException(
            status_code=400,
            detail=f"No data for {symbol} {timeframe} — press Load Data first (or seed sample data)",
        )
    bars = [
        {
            "time": int(row["timestamp"].timestamp()),
            "open": float(row["open"]), "high": float(row["high"]),
            "low": float(row["low"]), "close": float(row["close"]),
            "volume": float(row.get("volume", 0) or 0),
        }
        for _, row in df.iterrows()
    ]

    try:
        result = run_strategy(
            source, bars,
            cash=float(cash) if cash else None,
            leverage=leverage,
            symbol=symbol,
            timeframe=timeframe,
        )
    except ValueError as e:
        return {"ok": False, "error": str(e)}
    except SyntaxError as e:
        return {"ok": False, "error": f"Compile error: {e}"}
    except NotImplementedError as e:
        return {"ok": False, "error": str(e)}

    # slim the payload for transport/storage
    result["equity_curve"] = _downsample(result["equity_curve"])
    result["drawdown_curve"] = _downsample(result["drawdown_curve"])
    result.pop("events", None)

    run = BacktestRun(
        name=result["name"],
        symbol=symbol,
        timeframe=timeframe,
        source=source,
        params={"cash": result["initial_capital"], "leverage": leverage, "bars": len(bars)},
        result=result,
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)
    return {"ok": True, "id": run.id, **result}


@router.get("/runs")
async def list_runs(db: AsyncSession = Depends(get_db)) -> list[dict]:
    rows = (await db.execute(select(BacktestRun).order_by(BacktestRun.created_at.desc()).limit(50))).scalars().all()
    out = []
    for r in rows:
        m = (r.result or {}).get("metrics", {})
        out.append({
            "id": r.id, "name": r.name, "symbol": r.symbol, "timeframe": r.timeframe,
            "created_at": r.created_at.isoformat(),
            "net_pnl": m.get("net_pnl"), "return_pct": m.get("return_pct"),
            "win_rate": m.get("win_rate"), "trades": m.get("trades"),
        })
    return out


@router.get("/runs/{run_id}")
async def get_run(run_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    r = await db.get(BacktestRun, run_id)
    if not r:
        raise HTTPException(404, "Run not found")
    return {"ok": True, "id": r.id, "name": r.name, "symbol": r.symbol,
            "timeframe": r.timeframe, "created_at": r.created_at.isoformat(),
            **(r.result or {})}
