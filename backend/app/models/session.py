"""Replay / backtest session model."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import String, DateTime, Float, Integer, Boolean
from sqlalchemy.orm import Mapped, mapped_column

from app.models.database import Base


class ReplaySession(Base):
    __tablename__ = "replay_sessions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, default="Untitled")
    symbol: Mapped[str] = mapped_column(String, index=True)
    timeframe: Mapped[str] = mapped_column(String, default="1h")
    start_time: Mapped[datetime] = mapped_column(DateTime)
    current_time: Mapped[datetime] = mapped_column(DateTime)
    end_time: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    cash: Mapped[float] = mapped_column(Float, default=100_000.0)
    equity: Mapped[float] = mapped_column(Float, default=100_000.0)
    commission_mode: Mapped[str] = mapped_column(String, default="per_lot")
    commission_value: Mapped[float] = mapped_column(Float, default=3.0)
    spread_pips: Mapped[float] = mapped_column(Float, default=1.0)
    slippage_pips: Mapped[float] = mapped_column(Float, default=0.5)
    leverage: Mapped[int] = mapped_column(Integer, default=100)
    mode: Mapped[str] = mapped_column(String, default="replay")  # replay | backtest | paper
    is_running: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
