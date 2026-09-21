"""Market metadata & simulation defaults per instrument class."""
from __future__ import annotations

from dataclasses import dataclass

FOREX_CCYS = {
    "EUR", "GBP", "USD", "JPY", "AUD", "NZD", "CAD", "CHF", "SEK", "NOK", "DKK",
    "MXN", "ZAR", "TRY", "PLN", "HUF", "CZK", "SGD", "HKD", "CNH", "RUB", "ILS", "THB",
}
CRYPTO_QUOTES = {"USDT", "USDC", "BUSD", "TUSD", "FDUSD", "DAI", "BTC", "ETH", "BNB", "SOL"}
METALS = {"XAU", "XAG", "XPT", "XPD"}


@dataclass
class MarketConfig:
    market: str            # forex | crypto | stock | metal
    multiplier: float      # contract size per 1 lot/unit
    pip_size: float
    spread_pips: float
    slippage_pips: float
    commission_mode: str   # per_lot | percent | none
    commission_value: float


def classify(symbol: str) -> str:
    s = symbol.upper().replace("-", "/").replace("_", "/")
    if "/" in s:
        base, _, quote = s.partition("/")
        if base in METALS:
            return "metal"
        if quote in CRYPTO_QUOTES:
            return "crypto"
        if base in FOREX_CCYS and quote in FOREX_CCYS:
            return "forex"
        return "crypto"
    return "stock"


def get_market_config(symbol: str) -> MarketConfig:
    m = classify(symbol)
    s = symbol.upper()
    if m == "forex":
        pip = 0.01 if s.partition("/")[-1] == "JPY" else 0.0001
        return MarketConfig(m, 100_000.0, pip, 1.0, 0.5, "per_lot", 3.0)
    if m == "metal":
        return MarketConfig(m, 100.0, 0.01, 25.0, 5.0, "per_lot", 3.0)
    if m == "crypto":
        return MarketConfig(m, 1.0, 1.0, 2.0, 1.0, "percent", 0.001)
    return MarketConfig(m, 1.0, 0.01, 2.0, 1.0, "none", 0.0)
