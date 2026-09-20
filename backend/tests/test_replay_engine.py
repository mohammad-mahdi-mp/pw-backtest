"""Tests for the replay VirtualBroker engine (no DB, pure logic)."""
from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.replay.engine import PendingOrder, Position, VirtualBroker
from app.replay.markets import get_market_config


def make_broker(symbol="BTC/USDT", balance=100_000.0, leverage=100, position=None, pending=None):
    return VirtualBroker(get_market_config(symbol), balance, leverage, position, pending)


def bar(t, o, h, l, c):
    return {"time": t, "open": o, "high": h, "low": l, "close": c, "volume": 0}


T0 = 1_700_000_000


def test_market_buy_fills_with_spread_and_commission():
    b = make_broker("BTC/USDT")
    # crypto: pip=1, spread=2 pips=$2, slippage=1 pip=$1 -> buy at close + 2
    po = PendingOrder(id=1, side="buy", order_type="market", size=0.1)
    b.market_fill(po, 60_000, datetime.utcfromtimestamp(T0))
    fill = next(e for e in b.events if e["type"] == "order_filled")
    assert abs(fill["price"] - 60_002) < 1e-9, fill
    assert b.position.side == "long" and abs(b.position.size - 0.1) < 1e-9
    # commission 0.1% of notional: 0.1 * 60002 * 0.001 = 6.0002
    assert abs(b.balance - (100_000 - 6.0002)) < 1e-6
    # equity marked at entry: entry=fill price -> unrealized = spread cost against us
    assert b.equity(60_000) < 100_000


def test_tp_hit_on_long():
    b = make_broker("BTC/USDT", position=Position("long", 0.1, 60_000, datetime.utcfromtimestamp(T0), take_profit=61_000))
    b.on_bar(bar(T0 + 3600, 60_100, 61_200, 60_050, 61_100))
    closed = [e for e in b.events if e["type"] == "position_closed"]
    assert len(closed) == 1
    # exit at TP exactly (no gap: open 60100 < 61000, high >= 61000)
    assert abs(closed[0]["exit_price"] - 61_000) < 1e-9
    # gross = (61000-60000)*0.1 = 100 ; commission exit = 0.1*61000*0.001 = 6.1
    assert abs(closed[0]["pnl"] - (100 - 6.1)) < 1e-6
    assert b.position is None


def test_sl_gap_fills_at_open():
    b = make_broker("BTC/USDT", position=Position("long", 0.1, 60_000, datetime.utcfromtimestamp(T0), stop_loss=59_000))
    # opens BELOW the stop -> exit at open
    b.on_bar(bar(T0 + 3600, 58_900, 59_100, 58_800, 59_000))
    closed = next(e for e in b.events if e["type"] == "position_closed")
    assert abs(closed["exit_price"] - 58_900) < 1e-9
    assert closed["pnl"] < 0


def test_sl_priority_over_tp():
    # both SL and TP inside the same bar -> conservative: SL first
    b = make_broker("BTC/USDT", position=Position(
        "long", 0.1, 60_000, datetime.utcfromtimestamp(T0), stop_loss=59_500, take_profit=60_500))
    b.on_bar(bar(T0 + 3600, 60_000, 60_800, 59_400, 60_000))
    closed = next(e for e in b.events if e["type"] == "position_closed")
    assert closed["reason"] == "sl"


def test_buy_limit_fills():
    b = make_broker("BTC/USDT", pending=[PendingOrder(id=7, side="buy", order_type="limit", size=0.2, price=59_500)])
    b.on_bar(bar(T0 + 3600, 60_000, 60_100, 59_450, 59_800))  # low crosses limit
    fill = next(e for e in b.events if e["type"] == "order_filled")
    assert fill["order_id"] == 7 and abs(fill["price"] - 59_500) < 1e-9
    assert b.position.side == "long" and abs(b.position.size - 0.2) < 1e-9
    assert b.pending == []


def test_buy_stop_fills_with_slippage():
    b = make_broker("BTC/USDT", pending=[PendingOrder(id=3, side="buy", order_type="stop", size=0.1, price=60_500)])
    b.on_bar(bar(T0 + 3600, 60_000, 60_700, 59_900, 60_600))
    fill = next(e for e in b.events if e["type"] == "order_filled")
    # stop buy fills at price + slippage (1)
    assert abs(fill["price"] - 60_501) < 1e-9


def test_opposite_order_reduces():
    b = make_broker("BTC/USDT", position=Position("long", 0.5, 60_000, datetime.utcfromtimestamp(T0)))
    po = PendingOrder(id=2, side="sell", order_type="market", size=0.2)
    b.market_fill(po, 61_000, datetime.utcfromtimestamp(T0 + 3600))
    reduced = next(e for e in b.events if e["type"] == "position_reduced")
    assert abs(reduced["closed_size"] - 0.2) < 1e-9
    assert abs(reduced["remaining_size"] - 0.3) < 1e-9
    assert b.position and abs(b.position.size - 0.3) < 1e-9
    # sell fills at 61000 - 2 = 60998; gross = (60998-60000)*0.2 = 199.6 ; exit comm = 0.2*60998*0.001
    assert abs(reduced["pnl"] - (199.6 - 12.1996)) < 1e-6, reduced


def test_flip():
    b = make_broker("BTC/USDT", position=Position("long", 0.3, 60_000, datetime.utcfromtimestamp(T0)))
    po = PendingOrder(id=5, side="sell", order_type="market", size=0.5)
    b.market_fill(po, 60_000, datetime.utcfromtimestamp(T0 + 3600))
    types = [e["type"] for e in b.events]
    assert "position_closed" in types and "position_opened" in types
    assert b.position.side == "short" and abs(b.position.size - 0.2) < 1e-9


def test_forex_pnl_math():
    # 0.1 lot EUR/USD, 10 pips gain -> +$100
    b = make_broker("EUR/USD")
    po = PendingOrder(id=1, side="buy", order_type="market", size=0.1)
    b.market_fill(po, 1.08500, datetime.utcfromtimestamp(T0))
    # forex: pip 0.0001, spread 1 pip, slippage 0.5 -> buy at 1.08500+0.00005+0.00005=1.08510
    b.on_bar(bar(T0 + 3600, 1.08610, 1.08700, 1.08600, 1.08650))
    # close manually via opposite market at 1.08650 -> sell at 1.08650-0.0001=1.08640
    po2 = PendingOrder(id=2, side="sell", order_type="market", size=0.1)
    b.market_fill(po2, 1.08650, datetime.utcfromtimestamp(T0 + 7200))
    closed = next(e for e in b.events if e["type"] == "position_closed")
    # gross = (1.08640 - 1.08510) * 0.1 * 100000 = 13.0 ; comm = 0.3 + 0.3
    assert abs(closed["pnl"] - (13.0 - 0.6)) < 1e-9, closed


def test_insufficient_margin():
    b = make_broker("EUR/USD", balance=1_000.0, leverage=100)
    ok, err = b.can_submit(5.0, 1.0850)  # requires 5*100000*1.085/100 = 5425
    assert not ok and "margin" in err.lower()


def test_pending_survives_when_not_triggered():
    b = make_broker("BTC/USDT", pending=[PendingOrder(id=9, side="buy", order_type="limit", size=0.1, price=50_000)])
    b.on_bar(bar(T0 + 3600, 60_000, 60_500, 59_800, 60_100))
    assert len(b.pending) == 1


def run_all():
    fns = [v for k, v in globals().items() if k.startswith("test_") and callable(v)]
    failed = 0
    for fn in fns:
        try:
            fn()
            print(f"  ✓ {fn.__name__}")
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
