"""Tests for the final-completion features: CSV import, Pine control flow,
Python strategy API, WS price hub, and broker routers."""
from __future__ import annotations

import random
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.data.csv_import import parse_ohlcv_csv
from app.pine.runtime import run_indicator
from app.pine.strategy import run_strategy
from app.pine.pystrategy import run_py_strategy


def make_bars(n=100, seed=3, drift=0.0):
    random.seed(seed)
    bars, t = [], int(datetime(2026, 1, 1).timestamp())
    p = 100.0
    for i in range(n):
        o = p
        c = p * (1 + drift + random.gauss(0, 0.01))
        bars.append({"time": t, "open": o, "high": max(o, c) * 1.002,
                     "low": min(o, c) * 0.998, "close": c, "volume": 10})
        p = c
        t += 3600
    return bars


# ---------------------------------------------------------------- csv import

def test_csv_generic_header():
    df, meta = parse_ohlcv_csv(
        b"time,open,high,low,close,volume\n"
        b"2026-01-01T00:00:00Z,100,110,95,105,1000\n"
        b"2026-01-01 01:00:00,105,115,100,112,1200\n"
    )
    assert len(df) == 2
    assert df["close"].iloc[0] == 105
    assert meta["rows"] == 2


def test_csv_mt4_split_datetime():
    df, meta = parse_ohlcv_csv(
        b"<DATE>;<TIME>;<OPEN>;<HIGH>;<LOW>;<CLOSE>;<TICKVOL>\n"
        b"2026.01.02;09:30;1.2340;1.2360;1.2330;1.2350;1200\n"
        b"2026.01.02;10:30;1.2350;1.2380;1.2340;1.2370;900\n"
    )
    assert len(df) == 2  # split date+time must NOT collide on one timestamp
    assert df["timestamp"].iloc[0] == datetime(2026, 1, 2, 9, 30)
    assert meta["delimiter"] == ";"


def test_csv_unix_and_rejects():
    df, _ = parse_ohlcv_csv(b"1735689600,42000,42500,41800,42300,150\n1735693200,42300,42700,42100,42600,180\n")
    assert len(df) == 2
    for bad in (b"", b"a,b,c\n1,2,3\n"):
        try:
            parse_ohlcv_csv(bad)
            raise AssertionError("should reject")
        except ValueError:
            pass


# ---------------------------------------------------------------- pine control flow

def _vals(out):
    return [p["value"] for p in out[0]["data"]]


def test_pine_var_counter():
    bars = make_bars()
    out = run_indicator(
        '//@version=5\nindicator("G")\nvar g = 0\nif close > open\n    g := g + 1\nplot(g)',
        bars,
    )
    assert _vals(out)[-1] == sum(1 for b in bars if b["close"] > b["open"])


def test_pine_if_else_tier():
    bars = make_bars()
    out = run_indicator(
        '//@version=5\nindicator("T")\nvar tier = 0\n'
        'if close > 105\n    tier := 3\nelse if close > 100\n    tier := 2\nelse\n    tier := 1\nplot(tier)',
        bars,
    )
    last = bars[-1]["close"]
    assert _vals(out)[-1] == (3 if last > 105 else 2 if last > 100 else 1)


def test_pine_for_loop_with_history():
    bars = make_bars()
    out = run_indicator(
        '//@version=5\nindicator("S")\nvar s = 0.0\ns := 0.0\n'
        'for j = 0 to 2\n    s := s + close[j]\nplot(s)',
        bars,
    )
    manual = sum(b["close"] for b in bars[-3:])
    assert abs(_vals(out)[-1] - manual) < 1e-6


def test_pine_vectorized_untouched():
    bars = make_bars()
    out = run_indicator('//@version=5\nindicator("SMA")\nplot(ta.sma(close, 10))', bars)
    assert len(_vals(out)) == 100


def test_strategy_var_position_size_for():
    bars = make_bars(drift=0.002)
    res = run_strategy(
        '//@version=5\nstrategy("V", overlay=true, initial_capital=100000, '
        'default_qty_type=strategy.percent_of_equity, default_qty_value=50)\n'
        'var trend = 0\nif close > ta.sma(close, 10)\n    trend := 1\nelse\n    trend := -1\n'
        'if trend == 1 and strategy.position_size == 0\n    strategy.entry("L", strategy.long)\n'
        'if trend == -1 and strategy.position_size > 0\n    strategy.close("L")',
        bars,
    )
    assert res["metrics"]["trades"] >= 1 or res["metrics"]["has_open_position"]


# ---------------------------------------------------------------- python strategy

PY_CROSS = '''
class Strategy:
    name = "Py Cross"
    def init(self, ctx):
        self.fast = ctx.sma("close", 5)
        self.slow = ctx.sma("close", 20)

    def on_bar(self, ctx):
        if ctx.i < 20:
            return
        if ctx.cross_over(self.fast, self.slow):
            ctx.buy(qty_pct=100)
        elif ctx.cross_under(self.fast, self.slow):
            ctx.sell(qty_pct=100)
'''


def test_py_strategy_runs():
    import math
    bars, t = [], int(datetime(2026, 1, 1).timestamp())
    for i in range(300):
        c = 100 + 10 * math.sin(i / 20)
        o = 100 + 10 * math.sin((i - 1) / 20)
        bars.append({"time": t, "open": o, "high": max(o, c) + 0.5,
                     "low": min(o, c) - 0.5, "close": c, "volume": 10})
        t += 3600
    res = run_py_strategy(PY_CROSS, bars, symbol="BTC/USDT")
    assert res["kind"] == "pystrategy"
    assert res["metrics"]["trades"] >= 3


def test_py_strategy_stop_target_and_errors():
    bars = make_bars(80)
    res = run_py_strategy(
        'class Strategy:\n'
        '    def on_bar(self, ctx):\n'
        '        if ctx.i == 10:\n'
        '            ctx.buy(qty_pct=100, stop=ctx.close * 0.9, target=ctx.close * 1.5)\n',
        bars, symbol="BTC/USDT",
    )
    assert res["metrics"]["trades"] >= 1 or res["metrics"]["has_open_position"]
    for bad, expect in [
        ("class Strategy:\n    def on_bar(self, ctx):\n        raise RuntimeError('x')\n", "on_bar"),
        ("x = 1\n", "Strategy"),
    ]:
        try:
            run_py_strategy(bad, bars[:3])
            raise AssertionError("should raise")
        except ValueError as e:
            assert expect in str(e)


# ---------------------------------------------------------------- ws hub

def test_ws_hub_subscribe_and_broadcast():
    import asyncio
    from app.api.ws import PriceHub

    class FakeWS:
        def __init__(self):
            self.sent = []

        async def send_json(self, msg):
            self.sent.append(msg)

    async def main():
        hub = PriceHub()
        ws = FakeWS()
        hub.clients[ws] = set()
        hub.sub(ws, ["BTC/USDT", "ETH/USDT"])
        assert hub.symbols == {"BTC/USDT", "ETH/USDT"}

        # stub the fetcher — no network in tests
        hub._fetch = lambda sym: {"price": 42.0, "open": 41.0, "ts": 1_700_000_000, "source": "live"}
        await hub.poll_once()
        assert len(ws.sent) == 1
        batch = ws.sent[0]
        assert batch["type"] == "batch"
        assert {p["symbol"] for p in batch["prices"]} == {"BTC/USDT", "ETH/USDT"}
        assert batch["prices"][0]["price"] == 42.0
        assert abs(batch["prices"][0]["change_pct"] - (42 / 41 - 1) * 100) < 1e-9

        hub.unsub(ws, ["ETH/USDT"])
        assert hub.symbols == {"BTC/USDT"}
        hub.leave(ws)
        assert not hub.symbols

    asyncio.run(main())


# ---------------------------------------------------------------- brokers

def test_oanda_router_guards_and_symbol():
    from app.brokers.oanda_router import OandaRouter, OandaNotConfigured, OandaConfig, to_oanda_symbol

    assert to_oanda_symbol("EUR/USD") == "EUR_USD"

    r = OandaRouter(cfg=None)  # not configured
    assert r.configured is False
    for fn in (r.account_summary, r.positions):
        try:
            fn()
            raise AssertionError("should raise")
        except OandaNotConfigured:
            pass

    # order building with a fake transport
    r2 = OandaRouter(cfg=OandaConfig(api_key="k", account_id="A", env="practice"))
    captured = {}

    class FakeResp:
        status_code = 201
        text = "{}"
        def json(self):
            return {"orderFillTransaction": {"id": "9", "units": "100", "price": "1.2345"}}

    class FakeClient:
        def __init__(self, **kw):
            pass
        def __enter__(self):
            return self
        def __exit__(self, *a):
            return False
        def post(self, url, json=None):
            captured["url"] = url
            captured["json"] = json
            return FakeResp()

    import app.brokers.oanda_router as ormod
    orig_client = ormod.httpx.Client
    ormod.httpx.Client = FakeClient
    try:
        fill = r2.place_market_order("EUR/USD", 100, stop=1.2, target=1.3)
    finally:
        ormod.httpx.Client = orig_client

    assert fill["order_id"] == "9" and fill["price"] == 1.2345
    assert captured["url"] == "/v3/accounts/A/orders"
    order = captured["json"]["order"]
    assert order["instrument"] == "EUR_USD"
    assert order["stopLossOnFill"]["price"] == "1.20000"
    assert order["takeProfitOnFill"]["price"] == "1.30000"


def test_ibkr_router_guard():
    from app.brokers.ibkr_router import IbkrRouter, IbkrError

    r = IbkrRouter()
    st = r.status()
    assert "installed" in st and "host" in st
    try:
        r.connect()
        raise AssertionError("should raise without TWS")
    except IbkrError:
        pass


# ---------------------------------------------------------------- run

def run_all():
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
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
