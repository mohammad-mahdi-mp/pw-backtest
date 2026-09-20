"""Backtest API (placeholder — will be extended in Phase 5)."""
from __future__ import annotations

from fastapi import APIRouter

router = APIRouter()


@router.get("/")
async def backtest_status() -> dict:
    return {"status": "coming-soon", "phase": 5}


@router.post("/run")
async def run_backtest(payload: dict) -> dict:
    # Will execute Pine script / Python strategy against data and return metrics.
    return {"queued": True, "payload_keys": list(payload.keys())}
