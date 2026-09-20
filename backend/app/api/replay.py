"""Replay API: create session, control playback, place orders, get state."""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.database import get_db
from app.models.session import ReplaySession
from app.models.order import Order
from app.models.trade import Trade

router = APIRouter()


@router.post("/sessions")
async def create_session(payload: dict, db: AsyncSession = Depends(get_db)) -> dict:
    """Create a new replay session."""
    start = payload.get("start_time") or datetime.utcnow() - timedelta(days=90)
    if isinstance(start, str):
        start = datetime.fromisoformat(start.replace("Z", "+00:00")).replace(tzinfo=None)
    sess = ReplaySession(
        name=payload.get("name", f"Replay {payload['symbol']}"),
        symbol=payload["symbol"],
        timeframe=payload.get("timeframe", "1h"),
        start_time=start,
        current_time=start,
        cash=float(payload.get("cash", settings.default_cash)),
        equity=float(payload.get("cash", settings.default_cash)),
        leverage=int(payload.get("leverage", 100)),
        mode="replay",
    )
    db.add(sess)
    await db.commit()
    await db.refresh(sess)
    return {"id": sess.id, "current_time": sess.current_time.isoformat(), "equity": sess.equity}


@router.get("/sessions")
async def list_sessions(db: AsyncSession = Depends(get_db)) -> list[dict]:
    result = await db.execute(select(ReplaySession).order_by(ReplaySession.created_at.desc()))
    return [
        {
            "id": s.id,
            "name": s.name,
            "symbol": s.symbol,
            "timeframe": s.timeframe,
            "current_time": s.current_time.isoformat(),
            "equity": s.equity,
            "mode": s.mode,
        }
        for s in result.scalars().all()
    ]


@router.get("/sessions/{session_id}")
async def get_session(session_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    sess = await db.get(ReplaySession, session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    orders = (await db.execute(select(Order).where(Order.session_id == session_id))).scalars().all()
    trades = (await db.execute(select(Trade).where(Trade.session_id == session_id))).scalars().all()
    return {
        "id": sess.id,
        "name": sess.name,
        "symbol": sess.symbol,
        "timeframe": sess.timeframe,
        "current_time": sess.current_time.isoformat(),
        "start_time": sess.start_time.isoformat(),
        "cash": sess.cash,
        "equity": sess.equity,
        "leverage": sess.leverage,
        "orders": [
            {
                "id": o.id, "side": o.side, "type": o.order_type, "size": o.size,
                "price": o.price, "stop_loss": o.stop_loss, "take_profit": o.take_profit,
                "status": o.status, "fill_price": o.fill_price,
            }
            for o in orders
        ],
        "trades": [
            {
                "id": t.id, "side": t.side, "size": t.size,
                "entry_price": t.entry_price, "exit_price": t.exit_price,
                "entry_time": t.entry_time.isoformat() if t.entry_time else None,
                "exit_time": t.exit_time.isoformat() if t.exit_time else None,
                "pnl": t.pnl, "pnl_pips": t.pnl_pips, "note": t.note,
            }
            for t in trades
        ],
    }


@router.post("/sessions/{session_id}/orders")
async def place_order(session_id: int, payload: dict, db: AsyncSession = Depends(get_db)) -> dict:
    sess = await db.get(ReplaySession, session_id)
    if not sess:
        raise HTTPException(404, "Session not found")
    order = Order(
        session_id=session_id,
        symbol=sess.symbol,
        side=payload["side"],
        order_type=payload.get("type", "market"),
        size=float(payload["size"]),
        price=payload.get("price"),
        stop_loss=payload.get("stop_loss"),
        take_profit=payload.get("take_profit"),
        comment=payload.get("comment", ""),
    )
    db.add(order)
    await db.commit()
    await db.refresh(order)
    return {"id": order.id, "status": order.status}


@router.post("/sessions/{session_id}/advance")
async def advance(session_id: int, payload: dict, db: AsyncSession = Depends(get_db)) -> dict:
    """Move replay cursor forward N bars (placeholder for phase 3 engine)."""
    sess = await db.get(ReplaySession, session_id)
    if not sess:
        raise HTTPException(404, "Session not found")
    bars = int(payload.get("bars", 1))
    tf_minutes = _tf_to_minutes(sess.timeframe)
    sess.current_time = sess.current_time + timedelta(minutes=tf_minutes * bars)
    await db.commit()
    return {"current_time": sess.current_time.isoformat()}


def _tf_to_minutes(tf: str) -> int:
    mapping = {"1m": 1, "5m": 5, "15m": 15, "30m": 30, "1h": 60, "4h": 240, "1d": 1440, "1w": 10080}
    return mapping.get(tf, 60)
