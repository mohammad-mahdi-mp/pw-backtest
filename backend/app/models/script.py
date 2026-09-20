"""Pine script model."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import String, DateTime, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.database import Base


class PineScript(Base):
    __tablename__ = "pine_scripts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, index=True)
    description: Mapped[str] = mapped_column(String, default="")
    source: Mapped[str] = mapped_column(Text)          # Pine source code
    version: Mapped[str] = mapped_column(String, default="v5")
    kind: Mapped[str] = mapped_column(String, default="indicator")  # indicator | strategy
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
