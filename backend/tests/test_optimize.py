"""Tests for the optimizer endpoint + input overrides + MAE/MFE excursions."""
from __future__ import annotations

import asyncio
import random
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api.backtest import optimize
from app.pine.strategy import run_strategy


def make_bars(n=600, start=60_000.0, drift=0.0015, seed=11):
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


MA_CROSS = """//@version=5
strategy("MA cross", overlay=true, initial_capital=100000, default_qty_type=strategy.percent_of_equity, default_qty_value=100)
fastlen = input.int(10, "Fast")
slowlen = input.int(30, "Slow")
f = ta.sma(close, fastlen)
s = ta.sma(close, slowlen)
if ta.crossover(f, s)
    strategy.entry("L", strategy.long)
if ta.crossunder(f, s)
    strategy.close("L")
"""


# patch load_bars so we don't need a DB
import app.api.backtest as bt_mod


class _DF:
    """Mimics the storage dataframe: df.empty + df.iterrows() -> (i, row)."""

    empty = False

    def __init__(self, bars):
        self._rows = [
            {"timestamp": datetime.fromtimestamp(b["time"]), "open": b["open"],
             "high": b["high"], "low": b["low"], "close": b["close"],
             "volume": b["volume"]}
            for b in bars
        ]

    def iterrows(self):
        for i, r in enumerate(self._rows):
            yield i, r


bt_mod.load_bars = lambda *a, **k: _DF(make_bars())

BARS = make_bars()


def test_input_override_changes_trades():
    base = run_strategy(MA_CROSS, BARS)
    tuned = run_strategy(MA_CROSS, BARS, inputs={"fastlen": 4, "slowlen": 40})
    assert base["metrics"]["trades"] != tuned["metrics"]["trades"] or \
           abs(base["metrics"]["net_pnl"] - tuned["metrics"]["net_pnl"]) > 1e-9
    # unknown inputs are ignored, not fatal
    ok = run_strategy(MA_CROSS, BARS[:100], inputs={"nope": 5})
    assert ok["metrics"]["trades"] >= 0


def test_grid_returns_sorted_rows_and_best():
    r = asyncio.run(optimize({
        "source": MA_CROSS, "symbol": "TEST/USD", "timeframe": "1h",
        "mode": "grid", "metric": "net_pnl",
        "grid": {"fastlen": [4, 10, 20], "slowlen": [20, 40]},
    }))
    assert r["ok"] is True
    assert r["mode"] == "grid"
    assert r["runs"] == 6
    assert len(r["rows"]) == 6
    pnls = [row["net_pnl"] for row in r["rows"]]
    assert pnls == sorted(pnls, reverse=True)
    assert r["best"] is r["rows"][0] or r["best"] == r["rows"][0]
    assert {"fastlen", "slowlen"} == set(r["best"]["params"].keys())
    # an equal-length SMA pair never crosses -> at least one zero-trade combo
    assert any(row["trades"] == 0 for row in r["rows"] if row["params"]["fastlen"] == row["params"]["slowlen"])


def test_grid_rejects_bad_payloads():
    r1 = asyncio.run(optimize({"source": "", "grid": {"x": [1]}}))
    assert r1["ok"] is False
    r2 = asyncio.run(optimize({"source": MA_CROSS, "grid": {"unknown": [1]}}))
    assert r2["ok"] is False and "Unknown inputs" in r2["error"]
    r3 = asyncio.run(optimize({"source": MA_CROSS, "grid": {"fastlen": list(range(300))}, "metric": "bogus"}))
    assert r3["ok"] is False
    ind = '//@version=5\nindicator("i")\nplot(close)'
    r4 = asyncio.run(optimize({"source": ind, "grid": {}}))
    assert r4["ok"] is False and "strategy()" in r4["error"]


def test_walkforward_returns_folds_and_summary():
    r = asyncio.run(optimize({
        "source": MA_CROSS, "symbol": "TEST/USD", "timeframe": "1h",
        "mode": "walkforward", "metric": "net_pnl",
        "train_bars": 200, "test_bars": 100,
        "grid": {"fastlen": [4, 10], "slowlen": [20, 40]},
    }))
    assert r["ok"] is True
    assert r["mode"] == "walkforward"
    assert r["folds"] >= 3  # 600 bars -> 200 train + (100 test advancing) folds
    assert len(r["rows"]) == r["folds"]
    fold = r["rows"][0]
    assert {"params", "train", "test"} <= set(fold.keys())
    assert fold["train"]["end"] < fold["test"]["start"]  # no leakage
    s = r["summary"]
    assert {"initial_capital", "final_equity", "net_pnl", "return_pct",
            "max_drawdown_pct", "trades", "win_rate", "profit_factor"} <= set(s.keys())
    assert s["final_equity"] == s["initial_capital"] + s["net_pnl"]
    assert len(r["oos_equity_curve"]) > 0
    assert len(r["oos_trades"]) == s["trades"] or len(r["oos_trades"]) == 500


def test_walkforward_rejects_tiny_windows():
    r = asyncio.run(optimize({
        "source": MA_CROSS, "mode": "walkforward",
        "train_bars": 10, "test_bars": 5, "grid": {"fastlen": [10]},
    }))
    assert r["ok"] is False


def test_mae_mfe_sane():
    res = run_strategy(MA_CROSS, BARS)
    trades = res["trades"]  # all entries here are closed trades
    assert trades, "expected closed trades"
    for t in trades:
        assert "mae" in t and "mfe" in t
        assert t["mae"] <= 0.0001, f"long trade MAE must be <= 0, got {t['mae']}"
        assert t["mfe"] >= -0.0001, f"trade MFE must be >= 0, got {t['mfe']}"
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
