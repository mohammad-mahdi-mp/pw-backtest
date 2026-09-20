"""Generate synthetic BTC/USDT 1h data so the UI has something to show on first run."""
from __future__ import annotations

import math
import random
from datetime import datetime, timedelta
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

import pandas as pd  # noqa: E402
from app.data.storage import save_bars  # noqa: E402


def generate(symbol: str = "BTC/USDT", timeframe: str = "1h", n: int = 1500, start_price: float = 60000.0):
    rows = []
    price = start_price
    now = datetime.utcnow().replace(minute=0, second=0, microsecond=0)
    dt = now - timedelta(hours=n)
    random.seed(42)
    for i in range(n):
        drift = 0.0
        cycle = math.sin(i / 80) * 0.002 + math.cos(i / 23) * 0.0015
        shock = random.gauss(0, 0.003)
        ret = drift + cycle + shock
        o = price
        c = price * (1 + ret)
        h = max(o, c) * (1 + abs(random.gauss(0, 0.001)))
        l = min(o, c) * (1 - abs(random.gauss(0, 0.001)))
        v = random.uniform(100, 2000)
        rows.append({
            "timestamp": dt,
            "open": o, "high": h, "low": l, "close": c, "volume": v,
        })
        price = c
        dt += timedelta(hours=1)
    df = pd.DataFrame(rows)
    count = save_bars(df, symbol, timeframe, provider="sample")
    print(f"Seeded {count} bars for {symbol} {timeframe}")
    return df


if __name__ == "__main__":
    generate("BTC/USDT", "1h")
    generate("ETH/USDT", "1h", start_price=3000.0)
    generate("EUR/USD", "1h", start_price=1.08)
