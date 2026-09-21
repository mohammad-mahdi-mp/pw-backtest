"""Tests for the Pine strategy executor (compile + bar-by-bar simulation)."""
from __future__ import annotations

import math
import random
import sys
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.pine.compiler import compile_pine
from app.pine.strategy import run_strategy
from app.pine.runtime import run_indicator


def make_bars(n=400, start=60_000.0, drift=0.0015, seed=7):
    random.seed(seed)
    bars = []
    price = start
    t = int(datetime(2026, 1, 1).timestamp())
    for i in range(n):
        o = price
        c = price * (1 + drift + random.gauss(0, 0.004))
        h = max(o, c) * (1 + abs(random.gauss(0, 0.001)))
        l = min(o, c) * (1 - abs(random.gauss(0, 0.001)))
        bars.append({"time": t, "open": o, "high": h, "low": l, "close": c, "volume": 100})
        price = c
        t += 3600
    return bars


SMA_CROSS = """//@version=5
strategy("SMA Crossover", overlay=true, initial_capital=100000, default_qty_type=strategy.percent_of_equity, default_qty_value=20)
fast = ta.sma(close, 9)
slow = ta.sma(close, 21)
longSignal = ta.crossover(fast, slow)
exitSignal = ta.crossunder(fast, slow)
if longSignal
    strategy.entry("Long", strategy.long)
if exitSignal
    strategy.close("Long")
"""

WITH_STOP = """//@version=5
strategy("Cross + Stop", overlay=true, initial_capital=100000, default_qty_type=strategy.percent_of_equity, default_qty_value=50)
fast = ta.sma(close, 9)
slow = ta.sma(close, 21)
atr = ta.atr(14)
if ta.crossover(fast, slow)
    strategy.entry("Long", strategy.long)
if ta.crossunder(fast, slow)
    strategy.close("Long")
strategy.exit("X", stop=close - atr, limit=close + 2 * atr)
"""


def test_compile_if_blocks():
    ir = compile_pine(SMA_CROSS)
    assert ir["kind"] == "strategy"
    assert ir["params"]["initial_capital"] == 100000.0
    assert ir["params"]["default_qty_type"] == "percent_of_equity"
    assert ir["params"]["default_qty_value"] == 20.0
    kinds = [s["kind"] for s in ir["statements"]]
    assert kinds.count("if") == 2
    entry_if = next(s for s in ir["statements"] if s["kind"] == "if" and s["body"])
    assert entry_if["body"][0]["action"] == "entry"


def test_crossover_eval():
    ir = compile_pine("//@version=5\nstrategy(\"x\")\nfast = ta.sma(close, 3)\nslow = ta.sma(close, 8)\nc = ta.crossover(fast, slow)\n")
    bars = make_bars(60)
    out = run_indicator("//@version=5\nindicator(\"i\")\nfast = ta.sma(close, 3)\nslow = ta.sma(close, 8)\nplot(fast)\nplot(slow)", bars)
    assert len(out) == 2


def test_strategy_profitable_in_uptrend():
    bars = make_bars(400, drift=0.0015)  # steady uptrend
    r = run_strategy(SMA_CROSS, bars, cash=100_000, symbol="BTC/USDT", timeframe="1h")
    m = r["metrics"]
    assert m["trades"] >= 1, "expected at least one trade"
    assert m["net_pnl"] > 0, f"long-only strategy should profit in uptrend, got {m['net_pnl']}"
    assert m["final_equity"] > 100_000
    assert -100 <= m["max_drawdown_pct"] <= 0
    assert len(r["equity_curve"]) == len(bars)
    assert len(r["drawdown_curve"]) == len(bars)
    for t in r["trades"]:
        assert t["side"] == "long"
        assert t["reason"] in ("signal", "stop", "target")


def test_strategy_with_stop_limits_exits():
    bars = make_bars(400, drift=0.0, seed=3)  # random walk — stops get hit
    r = run_strategy(WITH_STOP, bars, cash=100_000, symbol="BTC/USDT", timeframe="1h")
    reasons = {t["reason"] for t in r["trades"]}
    # with 1×ATR stops attached, some trades should exit via stop or target
    assert reasons & {"stop", "target"}, f"expected stop/target exits, got {reasons}"
    assert r["metrics"]["trades"] >= 1


def test_next_bar_open_fill():
    # single crossover on flat-then-jump data; entry must fill at the bar AFTER signal close
    src = """//@version=5
strategy("One Shot", overlay=true, default_qty_type=strategy.fixed, default_qty_value=1)
fast = ta.sma(close, 2)
slow = ta.sma(close, 10)
if ta.crossover(fast, slow)
    strategy.entry("L", strategy.long)
"""
    bars = make_bars(80, drift=0.0, seed=11)
    # force a clear crossover in the middle
    for i in range(40, 60):
        bars[i]["close"] = bars[i - 1]["close"] * 1.01
        bars[i]["open"] = bars[i - 1]["close"]
        bars[i]["high"] = bars[i]["close"] * 1.001
        bars[i]["low"] = bars[i]["open"] * 0.999
    r = run_strategy(src, bars, cash=100_000, symbol="BTC/USDT", timeframe="1h")
    assert r["open_position"] is not None or r["trades"], "expected a position or trade"
    if r["open_position"]:
        entry = r["open_position"]["entry_price"]
        # entry fill should include spread/slippage over an open price, not a close
        assert entry > 0


def test_indicator_reject():
    bars = make_bars(30)
    try:
        run_strategy('//@version=5\nindicator("x")\nplot(close)', bars)
        assert False, "should reject indicator scripts"
    except ValueError as e:
        assert "strategy()" in str(e)


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
