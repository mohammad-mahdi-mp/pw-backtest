"""Backtest API: run Pine strategies against stored data, persist & list runs."""
from __future__ import annotations

import itertools
import math
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.data.storage import load_bars
from app.models.database import get_db
from app.models.backtest_run import BacktestRun
from app.pine.compiler import compile_pine
from app.pine.strategy import run_strategy
from app.pine.pystrategy import run_py_strategy

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


def _load_bars_or_400(symbol: str, timeframe: str, start, end) -> list[dict]:
    df = load_bars(symbol, timeframe, start, end, limit=200_000)
    if df is None or df.empty:
        raise HTTPException(
            status_code=400,
            detail=f"No data for {symbol} {timeframe} — press Load Data first (or seed sample data)",
        )
    return [
        {
            "time": int(row["timestamp"].timestamp()),
            "open": float(row["open"]), "high": float(row["high"]),
            "low": float(row["low"]), "close": float(row["close"]),
            "volume": float(row.get("volume", 0) or 0),
        }
        for _, row in df.iterrows()
    ]


_METRICS = ("net_pnl", "return_pct", "sharpe", "sortino", "profit_factor", "trades", "cagr_pct")


def _metric_value(m: dict, metric: str) -> float:
    v = m.get(metric)
    return float(v) if isinstance(v, (int, float)) else 0.0


def _run_row(result: dict, combo: dict) -> dict:
    m = result["metrics"]
    return {
        "params": combo,
        "net_pnl": m["net_pnl"],
        "return_pct": m["return_pct"],
        "max_drawdown_pct": m["max_drawdown_pct"],
        "sharpe": m["sharpe"],
        "sortino": m["sortino"],
        "profit_factor": m["profit_factor"],
        "trades": m["trades"],
        "win_rate": m["win_rate"],
        "cagr_pct": m["cagr_pct"],
    }


@router.post("/run")
async def run_backtest(payload: dict, db: AsyncSession = Depends(get_db)) -> dict:
    source = payload.get("source", "")
    symbol = payload.get("symbol") or "BTC/USDT"
    timeframe = payload.get("timeframe", "1h")
    start = _parse_dt(payload.get("start"))
    end = _parse_dt(payload.get("end"))
    cash = payload.get("cash")
    leverage = int(payload.get("leverage", 100))
    inputs = payload.get("inputs") or None
    engine = payload.get("engine")  # "pine" | "python" | None (auto)

    if not source.strip():
        return {"ok": False, "error": "Empty strategy source"}

    # engine detection: explicit flag wins, else sniff the source
    is_python = engine == "python" or (
        engine is None
        and "//@version" not in source
        and "strategy(" not in source
        and "indicator(" not in source
        and ("class Strategy" in source or "def on_bar" in source)
    )

    bars = _load_bars_or_400(symbol, timeframe, start, end)

    try:
        if is_python:
            result = run_py_strategy(
                source, bars,
                cash=float(cash) if cash else None,
                leverage=leverage,
                symbol=symbol,
                timeframe=timeframe,
            )
        else:
            result = run_strategy(
                source, bars,
                cash=float(cash) if cash else None,
                leverage=leverage,
                symbol=symbol,
                timeframe=timeframe,
                inputs=inputs,
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
        params={"cash": result["initial_capital"], "leverage": leverage, "bars": len(bars), "inputs": inputs or {}},
        result=result,
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)
    return {"ok": True, "id": run.id, **result}


@router.post("/optimize")
async def optimize(payload: dict) -> dict:
    """Grid sweep over strategy inputs, with optional walk-forward validation.

    Body: {source, symbol, timeframe, cash, leverage,
           grid: {inputName: [v1, v2, ...]}, metric,
           mode: "grid" | "walkforward", train_bars, test_bars}
    """
    source = payload.get("source", "")
    symbol = payload.get("symbol") or "BTC/USDT"
    timeframe = payload.get("timeframe", "1h")
    cash = payload.get("cash")
    leverage = int(payload.get("leverage", 100))
    grid: dict = payload.get("grid") or {}
    metric = payload.get("metric", "net_pnl")
    mode = payload.get("mode", "grid")
    train_bars = int(payload.get("train_bars", 500))
    test_bars = int(payload.get("test_bars", 150))
    max_runs = 200

    if not source.strip():
        return {"ok": False, "error": "Empty strategy source"}
    if metric not in _METRICS:
        return {"ok": False, "error": f"metric must be one of {_METRICS}"}

    try:
        ir = compile_pine(source)
    except SyntaxError as e:
        return {"ok": False, "error": f"Compile error: {e}"}
    if ir["kind"] != "strategy":
        return {"ok": False, "error": "Script declares indicator() — a strategy() is required"}
    known = [inp["name"] for inp in ir["inputs"]]
    unknown = [k for k in grid if k not in known]
    if unknown:
        return {"ok": False, "error": f"Unknown inputs: {unknown}. Script inputs: {known}"}
    grid = {k: list(v) for k, v in grid.items() if isinstance(v, list) and len(v)}
    if not grid:
        return {"ok": False, "error": "Empty grid — provide values for at least one input"}

    combos = list(itertools.product(*[grid[k] for k in grid]))
    if len(combos) > max_runs:
        return {"ok": False, "error": f"{len(combos)} combinations exceed the {max_runs}-run limit"}

    bars = _load_bars_or_400(symbol, timeframe, None, None)

    def _combo_dict(c) -> dict:
        return {k: v for k, v in zip(grid.keys(), c)}

    def _safe_run(b: list[dict], combo: dict) -> Optional[dict]:
        try:
            return run_strategy(source, b, cash=float(cash) if cash else None,
                                leverage=leverage, symbol=symbol, timeframe=timeframe,
                                inputs=combo)
        except Exception:  # noqa: BLE001
            return None

    if mode != "walkforward":
        # ---- plain grid sweep over the whole history ----
        rows = []
        for combo in combos:
            r = _safe_run(bars, _combo_dict(combo))
            if r:
                rows.append(_run_row(r, _combo_dict(combo)))
        rows.sort(key=lambda x: _metric_value(x, metric), reverse=True)
        return {"ok": True, "mode": "grid", "metric": metric, "inputs": known,
                "runs": len(rows), "rows": rows,
                "best": rows[0] if rows else None}

    # ---- walk-forward: optimize on train window, validate out-of-sample ----
    if train_bars < 50 or test_bars < 10:
        return {"ok": False, "error": "train_bars >= 50 and test_bars >= 10 required"}
    if len(bars) < train_bars + test_bars:
        return {"ok": False, "error": f"Not enough bars ({len(bars)}) for train {train_bars} + test {test_bars}"}

    initial = float(cash) if cash else 100_000.0
    folds: list[dict] = []
    stitched_curve: list[dict] = []
    oos_trades: list[dict] = []
    equity = initial
    pos = 0
    while pos + train_bars + test_bars <= len(bars):
        train = bars[pos: pos + train_bars]
        test = bars[pos + train_bars: pos + train_bars + test_bars]

        best_row, best_combo = None, None
        for combo in combos:
            r = _safe_run(train, _combo_dict(combo))
            if not r:
                continue
            row = _run_row(r, _combo_dict(combo))
            if best_row is None or _metric_value(row, metric) > _metric_value(best_row, metric):
                best_row, best_combo = row, _combo_dict(combo)

        if best_combo is None or best_row is None:
            pos += test_bars
            continue

        oos = _safe_run(test, best_combo)
        oos_row = _run_row(oos, best_combo) if oos else None

        # stitch OOS equity re-based onto the running curve
        if oos:
            fold_gain = oos["metrics"]["final_equity"] - oos["initial_capital"]
            for pt in oos["equity_curve"]:
                stitched_curve.append({"time": pt["time"], "value": equity + (pt["value"] - oos["initial_capital"])})
            equity += fold_gain
            for t in oos["trades"]:
                oos_trades.append(t)

        folds.append({
            "params": best_combo,
            "train": {"start": train[0]["time"], "end": train[-1]["time"],
                      "metric": _metric_value(best_row, metric)},
            "test": None if not oos_row else {
                "start": test[0]["time"], "end": test[-1]["time"],
                "net_pnl": oos_row["net_pnl"], "return_pct": oos_row["return_pct"],
                "trades": oos_row["trades"],
            },
        })
        pos += test_bars

    if not folds:
        return {"ok": False, "error": "Walk-forward produced no folds — check window sizes"}

    stitched_curve = _downsample(stitched_curve, 3000)
    net = equity - initial
    wins = [t for t in oos_trades if t["pnl"] > 0]
    losses = [t for t in oos_trades if t["pnl"] <= 0]
    gw, gl = sum(t["pnl"] for t in wins), abs(sum(t["pnl"] for t in losses))
    peak, maxdd = initial, 0.0
    for pt in stitched_curve:
        peak = max(peak, pt["value"])
        maxdd = min(maxdd, (pt["value"] / peak - 1) * 100 if peak else 0.0)

    return {
        "ok": True, "mode": "walkforward", "metric": metric, "inputs": known,
        "folds": len(folds), "rows": folds,
        "summary": {
            "initial_capital": initial,
            "final_equity": equity,
            "net_pnl": net,
            "return_pct": (net / initial * 100) if initial else 0.0,
            "max_drawdown_pct": maxdd,
            "trades": len(oos_trades),
            "win_rate": (len(wins) / len(oos_trades) * 100) if oos_trades else 0.0,
            "profit_factor": (gw / gl) if gl > 0 else None,
        },
        "oos_trades": oos_trades[:500],
        "oos_equity_curve": stitched_curve,
    }


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
