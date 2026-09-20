"""Database setup: SQLAlchemy async engine + session + base model."""
from __future__ import annotations

from pathlib import Path
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings


# Ensure data dir exists for sqlite
Path(settings.db_url.replace("sqlite:///", "")).parent.mkdir(parents=True, exist_ok=True)

# For sqlite+aiosqlite we need async driver specifier
_db_url = settings.db_url
if _db_url.startswith("sqlite:///") and not _db_url.startswith("sqlite+aiosqlite:///"):
    _db_url = _db_url.replace("sqlite:///", "sqlite+aiosqlite:///", 1)

engine = create_async_engine(_db_url, echo=False, future=True)
async_session = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


class Base(DeclarativeBase):
    pass


async def init_db() -> None:
    """Create all tables on startup."""
    from app.models import symbol, trade, order, script, session as session_model  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        yield session
