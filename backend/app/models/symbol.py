"""Symbol model (financial instruments)."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import String, Float, Boolean, DateTime, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.models.database import Base


class Symbol(Base):
    __tablename__ = "symbols"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, index=True, unique=True)  # e.g. EUR_USD, BTC/USDT, AAPL
    provider: Mapped[str] = mapped_column(String)  # oanda | ibkr | ccxt | yahoo | csv
    market_type: Mapped[str] = mapped_column(String, default="forex")  # forex | crypto | stock | future
    base_currency: Mapped[str] = mapped_column(String, default="")
    quote_currency: Mapped[str] = mapped_column(String, default="")
    tick_size: Mapped[float] = mapped_column(Float, default=1e-5)
    pip_size: Mapped[float] = mapped_column(Float, default=1e-4)       # forex: 0.0001, JPY: 0.01
    contract_size: Mapped[float] = mapped_column(Float, default=100_000.0)
    min_lot: Mapped[float] = mapped_column(Float, default=0.01)
    max_lot: Mapped[float] = mapped_column(Float, default=100.0)
    commission_per_lot: Mapped[float] = mapped_column(Float, default=0.0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
