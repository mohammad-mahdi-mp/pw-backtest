"""Replay API: sessions, orders, bar-by-bar broker simulation."""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.database import get_db
from app.models.session import ReplaySession
from app.models.order import Order
from app.models.trade import Trade
from app.data.storage import load_bars
from app.replay.engine import PendingOrder, Position, VirtualBroker
from app.replay.markets import MarketConfig, get_market_config

router = APIRouter()

_TF_MINUTES = {
    "1m": 1, "3m": 3, "5m": 5, "15m": 15, "30m": 30, "45m": 45,
    "1h": 60, "2h": 120, "3h": 180, "4h": 240, "1d": 1440, "1w": 10080, "1mo": 43200,
}


def _tf_minutes(tf: str) -> int:
    return _TF_MINUTES.get(tf, 60)


def _cfg_for(sess: ReplaySession) -> MarketConfig:
    base = get_market_config(sess.symbol)
    return MarketConfig(
        market=base.market,
        multiplier=base.multiplier,
        pip_size=base.pip_size,
        spread_pips=sess.spread_pips,
        slippage_pips=sess.slippage_pips,
        commission_mode=sess.commission_mode,
        commission_value=sess.commission_value,
    )


def _bars_after(symbol: str, timeframe: str, after: datetime, until: datetime) -> list[dict]:
    df = load_bars(symbol, timeframe, start=after, end=until, limit=1_000_000)
    if df is None or df.empty:
        return []
    out = []
    for _, row in df.iterrows():
        ts = row["timestamp"].to_pydatetime()
        if ts <= after:
            continue
        out.append({
            "time": int(ts.timestamp()),
            "open": float(row["open"]), "high": float(row["high"]),
            "low": float(row["low"]), "close": float(row["close"]),
            "volume": float(row.get("volume", 0) or 0),
            "_dt": ts,
        })
    return out


def _last_close(symbol: str, timeframe: str, at: datetime) -> Optional[float]:
    df = load_bars(symbol, timeframe, end=at, limit=1)
    if df is None or df.empty:
        return None
    return float(df.iloc[-1]["close"])


# ------------------------------------------------------------------ snapshot


async def _open_trade(db: AsyncSession, sid: int) -> Optional[Trade]:
    r = await db.execute(
        select(Trade).where(Trade.session_id == sid, Trade.exit_time.is_(None))
    )
    return r.scalar_one_or_none()


async def _broker_from_db(db: AsyncSession, sess: ReplaySession) -> VirtualBroker:
    open_trade = await _open_trade(db, sess.id)
    position = None
    if open_trade:
        position = Position(
            side=open_trade.side,
            size=open_trade.size,
            entry_price=open_trade.entry_price,
            entry_time=open_trade.entry_time,
            stop_loss=open_trade.stop_loss,
            take_profit=open_trade.take_profit,
            entry_commission=open_trade.commission or 0.0,
        )
    r = await db.execute(
        select(Order).where(Order.session_id == sess.id, Order.status == "pending")
    )
    pending = [
        PendingOrder(
            id=o.id, side=o.side, order_type=o.order_type, size=o.size,
            price=o.price, stop_loss=o.stop_loss, take_profit=o.take_profit,
        )
        for o in r.scalars().all()
        if o.price is not None
    ]
    return VirtualBroker(_cfg_for(sess), sess.cash, sess.leverage, position, pending)


async def _persist_events(db: AsyncSession, sess: ReplaySession, broker: VirtualBroker) -> None:
    for ev in broker.events:
        et = ev["type"]
        if et == "order_filled":
            o = await db.get(Order, ev["order_id"])
            if o:
                o.status = "filled"
                o.fill_price = ev["price"]
                o.fill_time = datetime.fromisoformat(ev["time"])
        elif et == "position_opened":
            db.add(Trade(
                session_id=sess.id, symbol=sess.symbol, side=ev["side"], size=ev["size"],
                entry_price=ev["entry_price"], entry_time=datetime.fromisoformat(ev["entry_time"]),
                stop_loss=ev.get("stop_loss"), take_profit=ev.get("take_profit"),
                commission=ev.get("commission", 0.0),
            ))
        elif et == "position_increased":
            tr = await _open_trade(db, sess.id)
            if tr:
                tr.size = ev["size"]
                tr.entry_price = ev["entry_price"]
                tr.commission = (tr.commission or 0) + ev.get("commission", 0)
        elif et == "position_reduced":
            tr = await _open_trade(db, sess.id)
            if tr:
                db.add(Trade(
                    session_id=sess.id, symbol=sess.symbol, side=ev["side"], size=ev["closed_size"],
                    entry_price=ev["entry_price"], entry_time=datetime.fromisoformat(ev["entry_time"]),
                    exit_price=ev["exit_price"], exit_time=datetime.fromisoformat(ev["exit_time"]),
                    pnl=ev["pnl"], commission=ev.get("commission", 0.0),
                ))
                tr.size = ev["remaining_size"]
        elif et == "position_closed":
            tr = await _open_trade(db, sess.id)
            if tr:
                cfg = broker.cfg
                tr.exit_price = ev["exit_price"]
                tr.exit_time = datetime.fromisoformat(ev["exit_time"])
                tr.pnl = ev["pnl"]
                d = 1 if tr.side == "long" else -1
                tr.pnl_pips = d * (ev["exit_price"] - tr.entry_price) / cfg.pip_size
                tr.commission = (tr.commission or 0) + ev.get("commission", 0)


def _sync_session(sess: ReplaySession, broker: VirtualBroker) -> None:
    sess.cash = broker.balance
    mark = _last_close(sess.symbol, sess.timeframe, sess.current_time)
    sess.equity = broker.equity(mark)


def _parse_dt(v: Any) -> Optional[datetime]:
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.replace(tzinfo=None) if v.tzinfo else v
    return datetime.fromisoformat(str(v).replace("Z", "+00:00")).replace(tzinfo=None)


# ------------------------------------------------------------------ endpoints


@router.post("/sessions")
async def create_session(payload: dict, db: AsyncSession = Depends(get_db)) -> dict:
    symbol = payload["symbol"]
    timeframe = payload.get("timeframe", "1h")
    start = _parse_dt(payload.get("start_time")) or datetime.utcnow() - timedelta(days=90)
    cfg = get_market_config(symbol)
    cash = float(payload.get("cash", settings.default_cash))
    sess = ReplaySession(
        name=payload.get("name", f"Replay {symbol}"),
        symbol=symbol,
        timeframe=timeframe,
        start_time=start,
        current_time=start,
        processed_time=start,
        cash=cash,
        equity=cash,
        leverage=int(payload.get("leverage", 100)),
        commission_mode=cfg.commission_mode,
        commission_value=cfg.commission_value,
        spread_pips=cfg.spread_pips,
        slippage_pips=cfg.slippage_pips,
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
            "id": s.id, "name": s.name, "symbol": s.symbol, "timeframe": s.timeframe,
            "current_time": s.current_time.isoformat(), "equity": s.equity, "mode": s.mode,
        }
        for s in result.scalars().all()
    ]


@router.get("/sessions/{session_id}")
async def get_session(session_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    sess = await db.get(ReplaySession, session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    orders = (await db.execute(
        select(Order).where(Order.session_id == session_id).order_by(Order.created_at)
    )).scalars().all()
    trades = (await db.execute(
        select(Trade).where(Trade.session_id == session_id).order_by(Trade.entry_time)
    )).scalars().all()

    cfg = get_market_config(sess.symbol)
    mark = _last_close(sess.symbol, sess.timeframe, sess.current_time)
    open_trade = next((t for t in trades if t.exit_time is None), None)

    position = None
    if open_trade:
        d = 1 if open_trade.side == "long" else -1
        unreal = d * (mark - open_trade.entry_price) * open_trade.size * cfg.multiplier if mark else 0.0
        position = {
            "trade_id": open_trade.id, "side": open_trade.side, "size": open_trade.size,
            "entry_price": open_trade.entry_price,
            "entry_time": open_trade.entry_time.isoformat() if open_trade.entry_time else None,
            "stop_loss": open_trade.stop_loss, "take_profit": open_trade.take_profit,
            "mark_price": mark, "unrealized": unreal,
            "unrealized_pips": d * (mark - open_trade.entry_price) / cfg.pip_size if mark else 0.0,
        }

    closed = [t for t in trades if t.exit_time is not None]
    wins = [t for t in closed if t.pnl > 0]
    losses = [t for t in closed if t.pnl <= 0]
    total_pnl = sum(t.pnl for t in closed)
    gross_win = sum(t.pnl for t in wins)
    gross_loss = abs(sum(t.pnl for t in losses))

    return {
        "id": sess.id, "name": sess.name, "symbol": sess.symbol, "timeframe": sess.timeframe,
        "current_time": sess.current_time.isoformat(), "start_time": sess.start_time.isoformat(),
        "cash": sess.cash, "equity": sess.equity if not position or not mark else sess.cash + position["unrealized"],
        "leverage": sess.leverage,
        "commission_mode": sess.commission_mode, "commission_value": sess.commission_value,
        "spread_pips": sess.spread_pips, "slippage_pips": sess.slippage_pips,
        "position": position,
        "orders": [
            {
                "id": o.id, "side": o.side, "type": o.order_type, "size": o.size,
                "price": o.price, "stop_loss": o.stop_loss, "take_profit": o.take_profit,
                "status": o.status, "fill_price": o.fill_price,
            }
            for o in orders
        ],
        "pending_orders": [
            {
                "id": o.id, "side": o.side, "type": o.order_type, "size": o.size,
                "price": o.price, "stop_loss": o.stop_loss, "take_profit": o.take_profit,
                "status": o.status,
            }
            for o in orders if o.status == "pending"
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
        "stats": {
            "balance": sess.cash,
            "closed_trades": len(closed),
            "wins": len(wins), "losses": len(losses),
            "win_rate": (len(wins) / len(closed) * 100) if closed else 0.0,
            "total_pnl": total_pnl,
            "avg_win": (gross_win / len(wins)) if wins else 0.0,
            "avg_loss": (-gross_loss / len(losses)) if losses else 0.0,
            "profit_factor": (gross_win / gross_loss) if gross_loss > 0 else None,
        },
    }


@router.post("/sessions/{session_id}/orders")
async def place_order(session_id: int, payload: dict, db: AsyncSession = Depends(get_db)) -> dict:
    sess = await db.get(ReplaySession, session_id)
    if not sess:
        raise HTTPException(404, "Session not found")

    side = payload.get("side", "buy").lower()
    otype = payload.get("type", "market").lower()
    size = float(payload.get("size", 0) or 0)
    sl = payload.get("stop_loss")
    tp = payload.get("take_profit")
    price = payload.get("price")

    if side not in ("buy", "sell"):
        raise HTTPException(400, "side must be buy|sell")
    if otype not in ("market", "limit", "stop"):
        raise HTTPException(400, "type must be market|limit|stop")

    ref = _last_close(sess.symbol, sess.timeframe, sess.current_time)
    if ref is None:
        raise HTTPException(400, "No price data at cursor — load data first")

    broker = await _broker_from_db(db, sess)
    ok, err = broker.can_submit(size, ref)
    if not ok:
        raise HTTPException(400, err)

    order = Order(
        session_id=session_id, symbol=sess.symbol, side=side, order_type=otype,
        size=size, price=float(price) if (otype != "market" and price is not None) else None,
        stop_loss=float(sl) if sl is not None else None,
        take_profit=float(tp) if tp is not None else None,
        status="pending" if otype != "market" else "filled",
        comment=payload.get("comment", ""),
    )
    db.add(order)
    await db.flush()  # get order.id

    if otype == "market":
        po = PendingOrder(id=order.id, side=side, order_type="market", size=size,
                          stop_loss=order.stop_loss, take_profit=order.take_profit)
        broker.market_fill(po, ref, sess.current_time)
        await _persist_events(db, sess, broker)
        _sync_session(sess, broker)
        await db.commit()
        fill_price = next(
            (e["price"] for e in broker.events if e["type"] == "order_filled"), None
        )
        return {"id": order.id, "status": "filled", "fill_price": fill_price, "events": broker.events}

    await db.commit()
    return {"id": order.id, "status": "pending", "events": []}


@router.post("/sessions/{session_id}/advance")
async def advance(session_id: int, payload: dict, db: AsyncSession = Depends(get_db)) -> dict:
    """Move the replay cursor forward/back N bars; simulate every new bar in between."""
    sess = await db.get(ReplaySession, session_id)
    if not sess:
        raise HTTPException(404, "Session not found")

    bars_n = int(payload.get("bars", 1))
    tf = _tf_minutes(sess.timeframe)
    target = sess.current_time + timedelta(minutes=tf * bars_n)

    processed = sess.processed_time or sess.current_time

    if bars_n > 0:
        new_bars = _bars_after(sess.symbol, sess.timeframe, processed, target)
        if new_bars:
            broker = await _broker_from_db(db, sess)
            for bar in new_bars:
                broker.on_bar(bar)
            await _persist_events(db, sess, broker)
            sess.processed_time = new_bars[-1]["_dt"]
            _sync_session(sess, broker)
            events = broker.events
        else:
            events = []
    else:
        events = []

    sess.current_time = target
    if sess.processed_time is None:
        sess.processed_time = sess.current_time
    await db.commit()

    broker_pos = None
    open_trade = await _open_trade(db, session_id)
    if open_trade:
        cfg = get_market_config(sess.symbol)
        mark = _last_close(sess.symbol, sess.timeframe, sess.current_time)
        d = 1 if open_trade.side == "long" else -1
        broker_pos = {
            "side": open_trade.side, "size": open_trade.size,
            "entry_price": open_trade.entry_price,
            "unrealized": d * (mark - open_trade.entry_price) * open_trade.size * cfg.multiplier if mark else 0.0,
        }

    return {
        "current_time": sess.current_time.isoformat(),
        "equity": sess.equity,
        "balance": sess.cash,
        "position": broker_pos,
        "events": events,
    }


@router.post("/sessions/{session_id}/close")
async def close_position(session_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    sess = await db.get(ReplaySession, session_id)
    if not sess:
        raise HTTPException(404, "Session not found")
    broker = await _broker_from_db(db, sess)
    if not broker.position:
        raise HTTPException(400, "No open position")
    ref = _last_close(sess.symbol, sess.timeframe, sess.current_time)
    if ref is None:
        raise HTTPException(400, "No price data at cursor")
    p = broker.position
    po = PendingOrder(id=0, side="sell" if p.side == "long" else "buy", order_type="market", size=p.size)
    broker.market_fill(po, ref, sess.current_time)
    await _persist_events(db, sess, broker)
    _sync_session(sess, broker)
    await db.commit()
    close_ev = next((e for e in broker.events if e["type"] in ("position_closed", "position_reduced")), {})
    return {"closed": True, "pnl": close_ev.get("pnl", 0.0), "events": broker.events}


@router.post("/sessions/{session_id}/orders/{order_id}/cancel")
async def cancel_order(session_id: int, order_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    o = await db.get(Order, order_id)
    if not o or o.session_id != session_id:
        raise HTTPException(404, "Order not found")
    if o.status != "pending":
        raise HTTPException(400, f"Order is {o.status}, cannot cancel")
    o.status = "canceled"
    await db.commit()
    return {"id": o.id, "status": "canceled"}


@router.post("/sessions/{session_id}/position")
async def update_position(session_id: int, payload: dict, db: AsyncSession = Depends(get_db)) -> dict:
    """Update SL/TP of the open position."""
    sess = await db.get(ReplaySession, session_id)
    if not sess:
        raise HTTPException(404, "Session not found")
    tr = await _open_trade(db, session_id)
    if not tr:
        raise HTTPException(400, "No open position")
    if "stop_loss" in payload:
        tr.stop_loss = float(payload["stop_loss"]) if payload["stop_loss"] is not None else None
    if "take_profit" in payload:
        tr.take_profit = float(payload["take_profit"]) if payload["take_profit"] is not None else None
    await db.commit()
    return {"trade_id": tr.id, "stop_loss": tr.stop_loss, "take_profit": tr.take_profit}


@router.post("/sessions/{session_id}/trades/{trade_id}/note")
async def set_trade_note(session_id: int, trade_id: int, payload: dict, db: AsyncSession = Depends(get_db)) -> dict:
    t = await db.get(Trade, trade_id)
    if not t or t.session_id != session_id:
        raise HTTPException(404, "Trade not found")
    t.note = str(payload.get("note", ""))[:2000]
    await db.commit()
    return {"id": t.id, "note": t.note}
