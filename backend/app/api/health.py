"""Health check endpoint."""
from __future__ import annotations

from fastapi import APIRouter

router = APIRouter()


@router.get("")
async def health() -> dict:
    return {"status": "ok", "service": "pw-backtest"}
