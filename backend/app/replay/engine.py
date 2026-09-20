"""Replay engine (Phase 3). Placeholder for bar-by-bar state machine & virtual broker."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


@dataclass
class VirtualBroker:
    cash: float = 100_000.0
    leverage: int = 100
    spread_pips: float = 1.0
    slippage_pips: float = 0.5
    positions: list[dict] = field(default_factory=list)
    orders: list[dict] = field(default_factory=list)
    trades: list[dict] = field(default_factory=list)

    def equity(self, price_at: float) -> float:
        return self.cash + sum(p["size"] * (price_at - p["entry_price"]) * (1 if p["side"] == "long" else -1) for p in self.positions)


@dataclass
class ReplayEngine:
    symbol: str
    timeframe: str
    cursor: datetime
    broker: VirtualBroker
    speed: int = 1
    is_running: bool = False

    def step(self, bar: dict[str, Any]) -> None:
        # Phase 3 will: (1) evaluate pending orders against new bar, (2) trigger SL/TP,
        # (3) process manual/user orders, (4) mark-to-market equity.
        self.cursor = datetime.fromtimestamp(bar["time"])
