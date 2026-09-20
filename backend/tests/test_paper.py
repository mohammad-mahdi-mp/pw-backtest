"""Paper trading tests: session lifecycle, auto-advance, live fills, SL trigger.

Network is mocked (refresh_recent no-ops) — "live" bars are simulated by
appending future bars to the parquet store, exactly like an exchange feed
delivering new closed candles. Each test runs in its own temp data dir; all
bars are anchored well before "now" so candle-closure edge cases don't bite.
"""
from __future__ import annotations

import asyncio
import sys
import tempfile
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pandas as pd  # noqa: E402

import app.api.replay as replay_mod  # noqa: E402
from app.api import paper as paper_mod  # noqa: E402
from app.api.replay import place_order, get_session, update_position  # noqa: E402
from app.data import storage as storage_mod  # noqa: E402
from app.data.storage import save_bars  # noqa: E402
from app.models.database import async_session, init_db  # noqa: E402
from app.models.session import ReplaySession  # noqa: E402
from app.models.order import Order  # noqa: E402
from app.models.trade import Trade  # noqa: E402


SYMBOL = "EUR/USD"
TF = "1h"


def _isolate() -> Path:
    """Fresh market-data dir so tests never see each other's bars."""
    tmp = Path(tempfile.mkdtemp(prefix="pw-paper-test-"))
    storage_mod.MARKET_DIR = tmp
    return tmp


def _gen(start: datetime, n: int, price: float, drift: float = 0.0):
    rows = []
    dt = start
    for _ in range(n):
        o = price
        c = price * (1 + drift)
        rows.append({
            "timestamp": dt,
            "open": o, "high": max(o, c) * 1.0002, "low": min(o, c) * 0.9998,
            "close": c, "volume": 100,
        })
        price = c
        dt += timedelta(hours=1)
    return pd.DataFrame(rows), price


def _hour() -> datetime:
    return datetime.utcnow().replace(minute=0, second=0, microsecond=0)


async def _cleanup(sess_ids: list[int]):
    async with async_session() as db:
        for sid in sess_ids:
            await db.execute(Order.__table__.delete().where(Order.session_id == sid))
            await db.execute(Trade.__table__.delete().where(Trade.session_id == sid))
            await db.execute(ReplaySession.__table__.delete().where(ReplaySession.id == sid))
        await db.commit()


async def test_provider_inference():
    from app.paper.feed import infer_provider
    assert infer_provider("BTC/USDT") == ("ccxt", "binance", "BTC/USDT")
    assert infer_provider("ETH/BTC") == ("ccxt", "binance", "ETH/BTC")
    assert infer_provider("EUR/USD") == ("yahoo", "", "EURUSD=X")
    assert infer_provider("AAPL") == ("yahoo", "", "AAPL")
    print("  ✓ provider inference")


async def test_paper_lifecycle():
    _isolate()
    now = _hour()
    # bars A: 40 flat bars ending 8h ago (all long closed)
    df_a, last_price = _gen(now - timedelta(hours=47), 40, 1.0850)
    save_bars(df_a, SYMBOL, TF, provider="sample")

    made = []
    try:
        async with async_session() as db:
            # 1) start paper session (refresh mocked → offline path)
            s = await paper_mod.start_paper({"symbol": SYMBOL, "timeframe": TF, "cash": 100_000}, db)
            made.append(s["id"])
            assert s["equity"] == 100_000
            assert s["current_time"], "session must start at the last closed bar"

            # 2) market buy fills at the live (last stored) close + spread
            o = await place_order(s["id"], {"side": "buy", "type": "market", "size": 0.5}, db)
            assert o["status"] == "filled" and o["fill_price"] > 0
            fill = o["fill_price"]
            assert abs(fill - 1.0850) < 0.001, f"fill should be near market, got {fill}"

            # 3) attach a tight stop below entry
            await update_position(s["id"], {"stop_loss": round(fill - 0.0020, 5)}, db)

            # 4) simulate the exchange delivering 5 new CLOSED bars that crash
            t0 = datetime.strptime(s["current_time"], "%Y-%m-%dT%H:%M:%S") + timedelta(hours=1)
            df_b, _ = _gen(t0, 5, last_price, drift=-0.002)
            save_bars(df_b, SYMBOL, TF, provider="sample")

            # 5) polling the session auto-advances → SL should fire
            replay_mod._paper_last_refresh.clear()  # bypass the 4s poll throttle
            snap = await get_session(s["id"], db)
            assert snap["position"] is None, "stop loss should have closed the position"
            closed = [t for t in snap["trades"] if t["exit_time"]]
            assert closed and closed[0]["pnl"] < 0, f"expected SL loss, got {closed}"
            assert snap["stats"]["closed_trades"] == 1
            assert any(e["type"] == "position_closed" for e in snap["events"]), snap["events"]

            # 6) stop the session; orders are refused afterwards
            r = await paper_mod.stop_paper({"id": s["id"]}, db)
            assert r["stopped"] is True
            try:
                await place_order(s["id"], {"side": "buy", "type": "market", "size": 0.1}, db)
                raise AssertionError("stopped session must refuse orders")
            except Exception as e:  # noqa: BLE001
                assert "stopped" in str(getattr(e, "detail", e)).lower()

            # 7) list shows the stopped session
            lst = await paper_mod.list_paper(db)
            assert any(x["id"] == s["id"] and not x["is_running"] for x in lst)
    finally:
        await _cleanup(made)
    print("  ✓ paper lifecycle: start → market fill → SL auto-trigger → stop")


async def test_paper_gap_fill_limit():
    _isolate()
    now = _hour()
    df_a, last_price = _gen(now - timedelta(hours=31), 24, 1.1000)  # ends 8h ago
    save_bars(df_a, SYMBOL, TF, provider="sample")

    made = []
    try:
        async with async_session() as db:
            s = await paper_mod.start_paper({"symbol": SYMBOL, "timeframe": TF}, db)
            made.append(s["id"])

            # limit order below market + new bars that dip through it → fills
            await place_order(s["id"], {"side": "buy", "type": "limit", "size": 0.2,
                                        "price": round(last_price - 0.0030, 5)}, db)
            t0 = datetime.strptime(s["current_time"], "%Y-%m-%dT%H:%M:%S") + timedelta(hours=1)
            df_b, _ = _gen(t0, 3, last_price, drift=-0.002)
            save_bars(df_b, SYMBOL, TF, provider="sample")
            replay_mod._paper_last_refresh.clear()
            snap = await get_session(s["id"], db)
            assert snap["position"] is not None, "limit order should have filled through the dip"
            assert snap["position"]["side"] == "long"
    finally:
        await _cleanup(made)
    print("  ✓ pending limit fills across auto-advance")


def run_all():
    # mock the network refresh for everything imported by replay/paper
    replay_mod.refresh_recent = lambda *a, **k: 0
    paper_mod.refresh_recent = lambda *a, **k: 0

    asyncio.run(init_db())
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for fn in fns:
        try:
            asyncio.run(fn())
        except AssertionError as e:
            failed += 1
            print(f"  ✗ {fn.__name__}: {e}")
        except Exception as e:  # noqa: BLE001
            failed += 1
            print(f"  ✗ {fn.__name__}: {type(e).__name__}: {e}")
    print(f"\n{len(fns) - failed}/{len(fns)} passed")
    return failed


if __name__ == "__main__":
    sys.exit(run_all())
