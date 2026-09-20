"""Brokers API — status & manual order routing for live accounts.

Everything is credential-gated: without OANDA keys / a running TWS the
endpoints return clear 400 errors and paper trading is unaffected.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.brokers.oanda_router import OandaRouter, OandaError
from app.brokers.ibkr_router import IbkrRouter, IbkrError

router = APIRouter()

_oanda = OandaRouter()
_ibkr = IbkrRouter()


@router.get("/status")
async def brokers_status() -> dict:
    return {
        "oanda": {
            "configured": _oanda.configured,
            "env": _oanda.cfg.env if _oanda.cfg else None,
            "account_id": _oanda.cfg.account_id if _oanda.cfg else None,
        },
        "ibkr": _ibkr.status(),
    }


# ---- OANDA ----

@router.get("/oanda/account")
async def oanda_account() -> dict:
    try:
        return {"ok": True, "account": _oanda.account_summary(), "positions": _oanda.positions()}
    except OandaError as e:
        raise HTTPException(400, str(e))


@router.post("/oanda/order")
async def oanda_order(payload: dict) -> dict:
    """{symbol, units (int, negative = sell), stop?, target?}"""
    symbol = payload.get("symbol", "")
    units = payload.get("units")
    if not symbol or units in (None, "", 0):
        raise HTTPException(400, "symbol and non-zero units are required")
    try:
        fill = _oanda.place_market_order(
            symbol, int(units),
            stop=payload.get("stop"), target=payload.get("target"),
        )
        return {"ok": True, "fill": fill}
    except OandaError as e:
        raise HTTPException(400, str(e))


@router.post("/oanda/close")
async def oanda_close(payload: dict) -> dict:
    try:
        return {"ok": True, **_oanda.close_position(payload.get("symbol", ""))}
    except OandaError as e:
        raise HTTPException(400, str(e))


# ---- IBKR ----

@router.get("/ibkr/account")
async def ibkr_account() -> dict:
    try:
        return {"ok": True, "summary": _ibkr.account_summary(), "positions": _ibkr.positions()}
    except IbkrError as e:
        raise HTTPException(400, str(e))


@router.post("/ibkr/order")
async def ibkr_order(payload: dict) -> dict:
    """{symbol, quantity (float), side: 'buy'|'sell'}"""
    symbol = payload.get("symbol", "")
    quantity = payload.get("quantity")
    side = payload.get("side", "buy")
    if not symbol or not quantity:
        raise HTTPException(400, "symbol and quantity are required")
    try:
        res = _ibkr.place_market_order(symbol, float(quantity), side)
        return {"ok": True, "order": res}
    except IbkrError as e:
        raise HTTPException(400, str(e))
