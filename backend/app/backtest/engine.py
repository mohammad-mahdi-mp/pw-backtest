"""Event-driven backtest engine (Phase 5). Placeholder now."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class BacktestResult:
    trades: list[dict] = field(default_factory=list)
    equity_curve: list[dict] = field(default_factory=list)
    metrics: dict = field(default_factory=dict)


class BacktestEngine:
    def __init__(self, starting_cash: float = 100_000.0):
        self.cash = starting_cash

    def run(self, bars: list[dict[str, Any]], strategy) -> BacktestResult:
        # Phase 5 will implement full event loop.
        return BacktestResult(metrics={"status": "placeholder"})
