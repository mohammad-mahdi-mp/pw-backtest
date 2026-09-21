"""Backtest performance metrics from equity curve + trade list."""
from __future__ import annotations

from typing import Any, Optional

import numpy as np


def compute_metrics(
    equity_curve: list[dict],
    trades: list[dict],
    initial: float,
    bars_per_year: float,
    open_position: Optional[dict] = None,
) -> dict[str, Any]:
    eq = np.array([p["value"] for p in equity_curve], dtype=float) if equity_curve else np.array([initial])
    final = float(eq[-1])

    # returns
    with np.errstate(divide="ignore", invalid="ignore"):
        rets = np.diff(eq) / eq[:-1] if len(eq) > 1 else np.array([])
    rets = rets[np.isfinite(rets)]

    # drawdown
    peak = np.maximum.accumulate(eq)
    dd = eq / peak - 1.0
    max_dd = float(dd.min() * 100) if len(dd) else 0.0

    def _sharpe() -> float:
        if len(rets) < 2 or rets.std() == 0:
            return 0.0
        return float(rets.mean() / rets.std() * np.sqrt(bars_per_year))

    def _sortino() -> float:
        if len(rets) < 2:
            return 0.0
        downside = rets[rets < 0]
        if len(downside) == 0:
            return 0.0
        dstd = float(np.sqrt((downside ** 2).mean()))
        if dstd == 0:
            return 0.0
        return float(rets.mean() / dstd * np.sqrt(bars_per_year))

    def _cagr() -> float:
        years = len(eq) / bars_per_year if bars_per_year > 0 else 0
        if years <= 0 or initial <= 0 or final <= 0:
            return 0.0
        return float((final / initial) ** (1.0 / years) - 1.0) * 100

    # trade stats
    pnls = [t["pnl"] for t in trades]
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p <= 0]
    gross_win = sum(wins)
    gross_loss = abs(sum(losses))

    max_consec_w = max_consec_l = 0
    cw = cl = 0
    for p in pnls:
        if p > 0:
            cw += 1
            cl = 0
        else:
            cl += 1
            cw = 0
        max_consec_w = max(max_consec_w, cw)
        max_consec_l = max(max_consec_l, cl)

    net_pnl = final - initial
    return {
        "net_pnl": net_pnl,
        "final_equity": final,
        "return_pct": (net_pnl / initial * 100) if initial else 0.0,
        "max_drawdown_pct": max_dd,
        "sharpe": _sharpe(),
        "sortino": _sortino(),
        "cagr_pct": _cagr(),
        "trades": len(trades),
        "wins": len(wins),
        "losses": len(losses),
        "win_rate": (len(wins) / len(trades) * 100) if trades else 0.0,
        "profit_factor": (gross_win / gross_loss) if gross_loss > 0 else (None if gross_win == 0 else float("inf")),
        "expectancy": (sum(pnls) / len(pnls)) if pnls else 0.0,
        "avg_trade": (sum(pnls) / len(pnls)) if pnls else 0.0,
        "best_trade": max(pnls) if pnls else 0.0,
        "worst_trade": min(pnls) if pnls else 0.0,
        "max_consecutive_wins": max_consec_w,
        "max_consecutive_losses": max_consec_l,
        "has_open_position": bool(open_position),
    }
