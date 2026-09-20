"""Paper trading API: live sessions on the VirtualBroker with auto-refreshing data.

A paper session is a ReplaySession with mode="paper": the replay order/position
endpoints (/api/replay/sessions/{id}/...) operate on it unchanged. This module
adds session lifecycle (start/stop/list) plus a background loop that keeps
running sessions advancing even when the UI is closed.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.database import async_session, get_db
from app.models.session import ReplaySession
from app.paper.feed import refresh_recent
from app.replay.markets import get_market_config
from app.api.replay import _bars_after, _tf_minutes, advance_paper_session

router = APIRouter()
logger = logging.getLogger("pw.paper")


@router.post("/start")
async def start_paper(payload: dict, db: AsyncSession = Depends(get_db)) -> dict:
    symbol = payload.get("symbol") or "BTC/USDT"
    timeframe = payload.get("timeframe", "1h")
    cash = float(payload.get("cash", settings.default_cash))
    leverage = int(payload.get("leverage", 100))

    # pull the freshest data (best-effort; falls back to stored bars offline)
    await asyncio.to_thread(refresh_recent, symbol, timeframe)

    now = datetime.utcnow()
    tf = _tf_minutes(timeframe)
    # find the last CLOSED bar to start from (in-progress candle excluded)
    recent = _bars_after(symbol, timeframe, now - timedelta(days=30), now)
    done = [b for b in recent if b["_dt"] + timedelta(minutes=tf) <= now]
    if not done:
        raise HTTPException(
            status_code=400,
            detail=f"No closed {timeframe} bars for {symbol} — press Load Data first",
        )
    start = done[-1]["_dt"]

    cfg = get_market_config(symbol)
    sess = ReplaySession(
        name=f"Paper {symbol}",
        symbol=symbol,
        timeframe=timeframe,
        start_time=start,
        current_time=start,
        processed_time=start,
        cash=cash,
        equity=cash,
        leverage=leverage,
        commission_mode=cfg.commission_mode,
        commission_value=cfg.commission_value,
        spread_pips=cfg.spread_pips,
        slippage_pips=cfg.slippage_pips,
        mode="paper",
        is_running=True,
    )
    db.add(sess)
    await db.commit()
    await db.refresh(sess)
    return {
        "id": sess.id, "symbol": sess.symbol, "timeframe": sess.timeframe,
        "current_time": sess.current_time.isoformat(), "cash": sess.cash,
        "equity": sess.equity, "leverage": sess.leverage,
    }


@router.post("/stop")
async def stop_paper(payload: dict, db: AsyncSession = Depends(get_db)) -> dict:
    sid = payload.get("id")
    if sid is not None:
        sess = await db.get(ReplaySession, int(sid))
        if not sess or sess.mode != "paper":
            raise HTTPException(404, "Paper session not found")
        if sess.is_running:
            # final catch-up so the stored state reflects all closed bars
            await advance_paper_session(db, sess)
            sess.is_running = False
            await db.commit()
        return {"id": sess.id, "stopped": True, "equity": sess.equity}
    # no id → stop every running paper session
    rows = (await db.execute(
        select(ReplaySession).where(ReplaySession.mode == "paper", ReplaySession.is_running == True)  # noqa: E712
    )).scalars().all()
    for sess in rows:
        sess.is_running = False
    await db.commit()
    return {"stopped": len(rows)}


@router.get("/sessions")
async def list_paper(db: AsyncSession = Depends(get_db)) -> list[dict]:
    rows = (await db.execute(
        select(ReplaySession)
        .where(ReplaySession.mode == "paper")
        .order_by(ReplaySession.created_at.desc())
        .limit(50)
    )).scalars().all()
    return [
        {
            "id": s.id, "name": s.name, "symbol": s.symbol, "timeframe": s.timeframe,
            "is_running": s.is_running, "cash": s.cash, "equity": s.equity,
            "current_time": s.current_time.isoformat() if s.current_time else None,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
        for s in rows
    ]


# ------------------------------------------------------------------ background

async def paper_loop(interval_s: float = 20.0) -> None:
    """Keep every running paper session advancing, even with the UI closed."""
    while True:
        try:
            await asyncio.sleep(interval_s)
            async with async_session() as db:
                rows = (await db.execute(
                    select(ReplaySession).where(
                        ReplaySession.mode == "paper", ReplaySession.is_running == True  # noqa: E712
                    )
                )).scalars().all()
                for sess in rows:
                    try:
                        await advance_paper_session(db, sess)
                        await db.commit()
                    except Exception as e:  # noqa: BLE001
                        await db.rollback()
                        logger.warning("paper advance failed for session %s: %s", sess.id, e)
        except asyncio.CancelledError:
            raise
        except Exception as e:  # noqa: BLE001
            logger.warning("paper loop error: %s", e)
