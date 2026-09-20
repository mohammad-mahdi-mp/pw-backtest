"""Order model (replay / paper / live)."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import String, DateTime, Float, Integer, ForeignKey, Boolean
from sqlalchemy.orm import Mapped, mapped_column

from app.models.database import Base


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(Integer, ForeignKey("replay_sessions.id", ondelete="CASCADE"), index=True)
    symbol: Mapped[str] = mapped_column(String, index=True)
    side: Mapped[str] = mapped_column(String)          # buy | sell
    order_type: Mapped[str] = mapped_column(String)    # market | limit | stop | stop_limit
    size: Mapped[float] = mapped_column(Float)
    price: Mapped[float] = mapped_column(Float, nullable=True)        # limit/stop entry price
    stop_loss: Mapped[float] = mapped_column(Float, nullable=True)
    take_profit: Mapped[float] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String, default="pending")   # pending | filled | canceled | rejected
    fill_price: Mapped[float] = mapped_column(Float, nullable=True)
    fill_time: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    comment: Mapped[str] = mapped_column(String, default="")
