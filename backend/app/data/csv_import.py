"""CSV OHLCV import — MT4/MT5, TradingView and generic exports.

Accepts a CSV file and turns it into the internal parquet bar format:
- delimiter auto-detection (comma / semicolon / tab)
- header auto-detection + fuzzy column mapping
  (time|date|datetime|timestamp|utc / open|o / high|h / low|l / close|c|price /
   volume|vol|v, case-insensitive; MT4 style split date+time columns)
- timestamp auto-detection: unix seconds / unix milliseconds / ISO 8601 /
  "YYYY.MM.DD[ ,]HH:MM" (MT4/MT5) / "YYYY-MM-DD" / "DD/MM/YYYY"
"""
from __future__ import annotations

import csv
import io
import math
import re
from datetime import datetime, timezone
from typing import Optional

import pandas as pd

_COL_ALIASES: dict[str, tuple[str, ...]] = {
    "timestamp": ("time", "date", "datetime", "timestamp", "utc", "t", "local time",
                  "time (utc)", "date (utc)", "unix", "epoch"),
    "open": ("open", "o", "openprice", "open price"),
    "high": ("high", "h", "highprice", "high price"),
    "low": ("low", "l", "lowprice", "low price"),
    "close": ("close", "c", "closeprice", "close price", "price"),
    "volume": ("volume", "vol", "v", "tickvol", "tickvol.", "volumefrom"),
}


def _detect_dialect(sample: str) -> csv.Dialect:
    best, best_cols = ",", 1
    for delim in (",", ";", "\t"):
        n = len(next(csv.reader(io.StringIO(sample), delimiter=delim)))
        if n > best_cols:
            best, best_cols = delim, n
    d = csv.excel
    d = type("D", (csv.excel,), {"delimiter": best})
    return d()


def _norm_col(cell: str) -> str:
    return str(cell).strip().lower().lstrip("<").rstrip(">").strip()


def _looks_like_header(row: list[str]) -> bool:
    if not row:
        return False
    aliases = {a for al in _COL_ALIASES.values() for a in al}
    hits = sum(1 for cell in row if _norm_col(cell) in aliases)
    # a numeric bar row never has 2+ alias cells
    if hits >= 2:
        return True
    return hits >= 1 and any(not _is_number(c) for c in row) and len(row) >= 4


def _is_number(s: str) -> bool:
    try:
        float(str(s).replace(",", "").strip())
        return True
    except (ValueError, TypeError):
        return False


_TS_FORMATS = (
    "%Y.%m.%d %H:%M",     # MT4/MT5
    "%Y.%m.%d %H:%M:%S",
    "%Y.%m.%d,%H:%M",
    "%Y.%m.%d",
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d %H:%M",
    "%Y-%m-%d",
    "%d/%m/%Y %H:%M",
    "%d/%m/%Y",
    "%m/%d/%Y %H:%M",
    "%m/%d/%Y",
)


def parse_timestamp(raw: str) -> Optional[datetime]:
    """Parse a timestamp cell into a naive UTC datetime."""
    s = str(raw).strip().strip('"').replace("T", " ").replace("Z", "").strip()
    if not s:
        return None
    # unix epoch (s or ms)
    if re.fullmatch(r"\d{9,13}(\.\d+)?", s):
        v = float(s)
        if v > 1e12:  # milliseconds
            v /= 1000.0
        return datetime.fromtimestamp(v, tz=timezone.utc).replace(tzinfo=None)
    # ISO with space separator
    try:
        return datetime.fromisoformat(s).replace(tzinfo=None)
    except ValueError:
        pass
    # explicit formats
    for fmt in _TS_FORMATS:
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None


def parse_ohlcv_csv(content: bytes) -> tuple[pd.DataFrame, dict]:
    """Parse CSV bytes into a (timestamp, open, high, low, close, volume) frame.

    Returns (df, meta) where meta describes what was detected.
    Raises ValueError with a user-friendly message on failure.
    """
    if not content or not content.strip():
        raise ValueError("Empty file")

    # strip BOM, decode (accept str as well as bytes)
    if isinstance(content, str):
        text = content.lstrip("﻿")
    else:
        try:
            text = content.decode("utf-8-sig")
        except UnicodeDecodeError:
            try:
                text = content.decode("latin-1")
            except Exception:  # noqa: BLE001
                raise ValueError("File is not valid UTF-8 text")

    lines = [l for l in text.splitlines() if l.strip()]
    if len(lines) < 2:
        raise ValueError("CSV needs a header/data or at least 2 rows")

    dialect = _detect_dialect("\n".join(lines[:5]))
    rows = list(csv.reader(lines, delimiter=dialect.delimiter))
    rows = [r for r in rows if r and any(c.strip() for c in r)]
    if not rows:
        raise ValueError("No rows found")

    header: Optional[list[str]] = None
    first = rows[0]
    if _looks_like_header(first):
        header = [_norm_col(c) for c in first]
        data_rows = rows[1:]
    else:
        data_rows = rows

    if not data_rows:
        raise ValueError("CSV contains a header but no data rows")
    ncols = len(data_rows[0])

    # ---- column mapping ----
    idx: dict[str, int] = {}
    if header:
        used: set[int] = set()
        # MT4/MT5 style: separate <DATE> and <TIME> columns -> combine
        date_i = time_i = None
        for i, col in enumerate(header):
            c = col.strip().lower()
            if c == "date" and date_i is None:
                date_i = i
            elif c == "time" and time_i is None:
                time_i = i
        if date_i is not None and time_i is not None:
            idx["timestamp"] = -2  # marker: combine date+time columns below
            idx["__date_col"] = date_i
            idx["__time_col"] = time_i
            used.update((date_i, time_i))
        for target, aliases in _COL_ALIASES.items():
            if target == "timestamp" and "timestamp" in idx:
                continue
            for i, col in enumerate(header):
                c = col.strip().lower()
                if c in aliases and i not in used:
                    idx[target] = i
                    used.add(i)
                    break

    def _col_at(name: str, r: list[str]) -> Optional[str]:
        i = idx.get(name)
        return r[i].strip() if i is not None and i < len(r) else None

    # heuristics for headerless files: [ts, o, h, l, c, (v)] by position;
    # MT4 headerless: <date>,<time>,<o>,<h>,<l>,<c>,<v>
    if not idx.get("timestamp"):
        sample = data_rows[0]
        # try: does column 0 parse as a timestamp?
        if parse_timestamp(sample[0]) is not None:
            idx["timestamp"] = 0
            base = 1
        elif ncols >= 7 and parse_timestamp(f"{sample[0]} {sample[1]}") is not None:
            idx["timestamp"] = -1  # marker: date+time split across cols 0,1
            base = 2
        else:
            raise ValueError("Could not find a timestamp column — add a header row (time, open, high, low, close, volume)")

        offset = base
        for target in ("open", "high", "low", "close", "volume"):
            i = offset
            offset += 1
            if i < ncols and _is_number(sample[i] if i < len(sample) else ""):
                idx[target] = i

    if not all(k in idx for k in ("open", "high", "low", "close")):
        raise ValueError(
            "Could not map OHLC columns — expected a header with time/open/high/low/close[/volume]"
        )

    # ---- rows ----
    out: list[dict] = []
    bad = 0
    for r in data_rows:
        try:
            ti = idx["timestamp"]
            if ti == -2:  # split date + time columns
                ts_raw = f"{r[idx['__date_col']]} {r[idx['__time_col']]}"
            elif ti == -1:
                ts_raw = f"{r[0]} {r[1]}"
            else:
                ts_raw = r[ti] if ti < len(r) else ""
            ts = parse_timestamp(ts_raw)
            if ts is None:
                bad += 1
                continue
            o, h, l = float(_col_at("open", r)), float(_col_at("high", r)), float(_col_at("low", r))
            c = float(_col_at("close", r))
            v_raw = _col_at("volume", r)
            v = float(v_raw) if v_raw not in (None, "") else 0.0
            if math.isnan(o) or math.isnan(c):
                bad += 1
                continue
            out.append({"timestamp": ts, "open": o, "high": h, "low": l, "close": c, "volume": v})
        except (ValueError, IndexError):
            bad += 1
            continue

    if not out:
        raise ValueError("No parsable rows — check the timestamp and OHLC columns")

    df = pd.DataFrame(out).drop_duplicates(subset=["timestamp"]).sort_values("timestamp").reset_index(drop=True)

    # sanity: OHLC coherence (allow small float noise)
    bad_ohlc = int(
        ((df["high"] < df[["open", "close"]].max(axis=1) - 1e-9) |
         (df["low"] > df[["open", "close"]].min(axis=1) + 1e-9)).sum()
    )

    meta = {
        "rows": len(df),
        "skipped": bad,
        "delimiter": dialect.delimiter,
        "header": header is not None,
        "columns": {k: (header[i] if header and i >= 0 and i < len(header) else f"col {i}")
                    for k, i in idx.items()},
        "start": df["timestamp"].iloc[0].isoformat(),
        "end": df["timestamp"].iloc[-1].isoformat(),
        "suspect_ohlc_rows": bad_ohlc,
    }
    return df, meta
