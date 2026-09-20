"""Live data feed helpers for paper trading: best-effort refresh from public providers.

No API keys required — CCXT/Binance for crypto, Yahoo Finance for stocks & FX.
All failures degrade gracefully (paper trading continues on stored data).
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta

import pandas as pd

from app.data import providers
from app.data.storage import find_bars_path, save_bars

logger = logging.getLogger("pw.paper")

# common crypto bases tradeable on Binance against USDT
_CRYPTO_BASES = {
    "BTC", "ETH", "SOL", "XRP", "DOGE", "ADA", "AVAX", "LINK", "MATIC", "LTC",
    "BNB", "DOT", "TRX", "TON", "SHIB", "BCH", "UNI", "ATOM", "XLM", "NEAR",
    "APT", "ARB", "OP", "SUI", "PEPE", "FIL", "ETC", "HBAR", "ICP", "AAVE",
}
_CRYPTO_QUOTES = {"USDT", "USD", "BTC", "ETH", "BNB", "EUR", "TRY", "FDUSD"}


def infer_provider(symbol: str) -> tuple[str, str, str]:
    """Return (provider, exchange, fetch_symbol) for a display symbol."""
    if "/" in symbol:
        base, quote = symbol.split("/", 1)
        b, q = base.upper(), quote.upper()
        if q == "USDT" or (b in _CRYPTO_BASES and q in _CRYPTO_QUOTES):
            return "ccxt", "binance", f"{b}/{q}"
        # forex / anything else with a slash → Yahoo FX convention EUR/USD → EURUSD=X
        return "yahoo", "", f"{b}{q}=X"
    return "yahoo", "", symbol.upper()


def refresh_recent(symbol: str, timeframe: str, days: int | None = None) -> int:
    """Fetch the most recent bars from the live provider and merge into storage.

    Writes into the provider folder the symbol already lives in (so charts and
    the paper broker read one continuous series). Returns rows saved.
    """
    if days is None:
        days = 1 if timeframe in ("1m", "3m", "5m") else 3
    end = datetime.utcnow()
    start = end - timedelta(days=days)
    provider, exchange, fetch_sym = infer_provider(symbol)
    try:
        if provider == "ccxt":
            df = providers.ccxt_provider.fetch_ohlcv(fetch_sym, timeframe, start, end, exchange)
        else:
            df = providers.yahoo_provider.fetch_ohlcv(fetch_sym, timeframe, start, end)
    except Exception as e:  # network down, rate limit, unknown symbol …
        logger.debug("paper refresh failed for %s %s via %s: %s", symbol, timeframe, provider, e)
        return 0

    if df is None or df.empty:
        return 0
    # merge into the folder that already holds this symbol's history
    existing = find_bars_path(symbol, timeframe)
    folder = existing.parents[2].name if existing else "live"
    return save_bars(df, symbol, timeframe, provider=folder)
