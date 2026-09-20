"""Persisted backtest runs."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import String, DateTime, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.models.database import Base


class BacktestRun(Base):
    __tablename__ = "backtest_runs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, default="Strategy")
    symbol: Mapped[str] = mapped_column(String)
    timeframe: Mapped[str] = mapped_column(String, default="1h")
    source: Mapped[str] = mapped_column(Text)            # Pine source
    params: Mapped[dict] = mapped_column(JSON, default=dict)
    result: Mapped[dict] = mapped_column(JSON, default=dict)  # metrics + curves + trades
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
