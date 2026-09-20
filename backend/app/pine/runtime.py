"""Execute compiled Pine IR against bars and return series for charts.

This MVP supports a small but useful set: ta.sma, ta.ema, ta.rsi, ta.wma,
plus passthrough series (open/high/low/close/volume) and arithmetic placeholders.
"""
from __future__ import annotations

import re
from typing import Any

import numpy as np
import pandas as pd

from app.pine.compiler import _split_args

_TA_INLINE_RE = re.compile(r"^ta\.([A-Za-z0-9_]+)\s*\((.+)\)$")


def _parse_literal(v: str) -> Any:
    """Parse an inline argument: quoted string, number, bool, or identifier."""
    v = v.strip()
    if v.startswith('"') and v.endswith('"'):
        return v[1:-1]
    if v in ("true", "false"):
        return v == "true"
    try:
        if "." in v:
            return float(v)
        return int(v)
    except ValueError:
        return v


def _bars_to_df(bars: list[dict]) -> pd.DataFrame:
    df = pd.DataFrame(bars)
    if df.empty:
        return df
    df["timestamp"] = pd.to_datetime(df["time"], unit="s", utc=False)
    for col in ("open", "high", "low", "close", "volume"):
        if col in df.columns:
            df[col] = df[col].astype(float)
    return df


def _resolve_series(name: str, df: pd.DataFrame, env: dict):
    if name in df.columns:
        return df[name].astype(float)
    if name in env:
        val = env[name]
        if isinstance(val, (pd.Series, pd.DataFrame)):
            return val
        return pd.Series([val] * len(df), index=df.index)
    # try to interpret as numeric literal
    try:
        v = float(name)
        return pd.Series([v] * len(df), index=df.index)
    except ValueError:
        pass
    raise ValueError(f"Unknown identifier: {name}")


def _eval_arg(arg: Any, df: pd.DataFrame, env: dict) -> Any:
    if isinstance(arg, (int, float, bool)):
        return arg
    if isinstance(arg, str):
        return _resolve_series(arg, df, env)
    return arg


def _coerce_int(v: Any, df: pd.DataFrame, env: dict, default: int = 14) -> int:
    if isinstance(v, (int, float)):
        return int(v)
    resolved = _eval_arg(v, df, env)
    if isinstance(resolved, pd.Series):
        return int(resolved.dropna().iloc[-1]) if len(resolved.dropna()) else default
    try:
        return int(float(resolved))
    except (TypeError, ValueError):
        return default


def _coerce_float(v: Any, df: pd.DataFrame, env: dict, default: float = 2.0) -> float:
    if isinstance(v, (int, float)):
        return float(v)
    resolved = _eval_arg(v, df, env)
    if isinstance(resolved, pd.Series):
        return float(resolved.dropna().iloc[-1]) if len(resolved.dropna()) else default
    try:
        return float(resolved)
    except (TypeError, ValueError):
        return default


def _ta_call(fn: str, args: list, kwargs: dict, df: pd.DataFrame, env: dict):
    a0 = _eval_arg(args[0], df, env) if len(args) > 0 else df["close"]
    length = _coerce_int(args[1], df, env) if len(args) > 1 else 14
    fn_l = fn.lower()
    if fn_l in ("sma",):
        return pd.Series(a0).rolling(length, min_periods=1).mean()
    if fn_l in ("ema",):
        return pd.Series(a0).ewm(span=length, adjust=False).mean()
    if fn_l in ("wma",):
        weights = np.arange(1, length + 1)
        return pd.Series(a0).rolling(length, min_periods=1).apply(
            lambda x: np.dot(x, weights[-len(x):]) / weights[-len(x):].sum(), raw=True
        )
    if fn_l in ("rma",):
        alpha = 1.0 / length
        return pd.Series(a0).ewm(alpha=alpha, adjust=False).mean()
    if fn_l in ("rsi",):
        s = pd.Series(a0).astype(float)
        delta = s.diff()
        gain = delta.clip(lower=0)
        loss = -delta.clip(upper=0)
        avg_gain = gain.ewm(alpha=1/length, adjust=False).mean()
        avg_loss = loss.ewm(alpha=1/length, adjust=False).mean()
        rs = avg_gain / avg_loss.replace(0, np.nan)
        rsi = 100 - 100 / (1 + rs)
        return rsi.fillna(50)
    if fn_l in ("macd",):
        fast = _coerce_int(args[1], df, env, 12) if len(args) > 1 else 12
        slow = _coerce_int(args[2], df, env, 26) if len(args) > 2 else 26
        sig = _coerce_int(args[3], df, env, 9) if len(args) > 3 else 9
        fast_ema = pd.Series(a0).ewm(span=fast, adjust=False).mean()
        slow_ema = pd.Series(a0).ewm(span=slow, adjust=False).mean()
        macd_line = fast_ema - slow_ema
        signal_line = macd_line.ewm(span=sig, adjust=False).mean()
        hist = macd_line - signal_line
        return pd.DataFrame({"macd": macd_line, "signal": signal_line, "hist": hist})
    if fn_l in ("bb", "bollinger_bands"):
        length = _coerce_int(args[1], df, env, 20) if len(args) > 1 else 20
        mult = _coerce_float(args[2], df, env, 2.0) if len(args) > 2 else 2.0
        mid = pd.Series(a0).rolling(length, min_periods=1).mean()
        std = pd.Series(a0).rolling(length, min_periods=1).std(ddof=0)
        return pd.DataFrame({"upper": mid + mult * std, "middle": mid, "lower": mid - mult * std})
    if fn_l in ("atr",):
        length = _coerce_int(args[1], df, env) if len(args) > 1 else 14
        h, l, c = df["high"], df["low"], df["close"]
        tr = pd.concat([h - l, (h - c.shift()).abs(), (l - c.shift()).abs()], axis=1).max(axis=1)
        return tr.ewm(alpha=1/length, adjust=False).mean()
    if fn_l in ("stoch",):
        length_k = _coerce_int(args[1], df, env) if len(args) > 1 else 14
        hh = df["high"].rolling(length_k, min_periods=1).max()
        ll = df["low"].rolling(length_k, min_periods=1).min()
        k = 100 * (df["close"] - ll) / (hh - ll).replace(0, np.nan)
        return k.fillna(50)
    if fn_l in ("highest",):
        length = _coerce_int(args[1], df, env, 20) if len(args) > 1 else 20
        return pd.Series(a0).rolling(length, min_periods=1).max()
    if fn_l in ("lowest",):
        length = _coerce_int(args[1], df, env, 20) if len(args) > 1 else 20
        return pd.Series(a0).rolling(length, min_periods=1).min()
    raise NotImplementedError(f"ta.{fn} is not yet implemented")


def run_indicator(source: str, bars: list[dict]) -> list[dict]:
    from app.pine.compiler import compile_pine
    ir = compile_pine(source)
    df = _bars_to_df(bars)
    if df.empty:
        return []

    env: dict[str, Any] = {}
    # Default inputs
    for inp in ir["inputs"]:
        env[inp["name"]] = inp["default"]

    for v in ir["vars"]:
        name = v["name"]
        expr = v["expr"]
        if expr["type"] == "ident":
            env[name] = _resolve_series(str(expr["value"]), df, env)
        elif expr["type"] == "ta":
            env[name] = _ta_call(expr["fn"], expr["args"], expr["kwargs"], df, env)

    out = []
    for i, p in enumerate(ir["plots"]):
        src_name = p["source"]
        if not isinstance(src_name, str):
            continue
        # inline ta.* call, e.g. plot(ta.sma(close, 20))
        m = _TA_INLINE_RE.match(src_name)
        if m:
            args = _split_args(m.group(2))
            pos_args = [_parse_literal(a) for a in args]
            try:
                series = _ta_call(m.group(1), pos_args, {}, df, env)
            except (IndexError, ValueError):
                continue
        else:
            series = _resolve_series(src_name, df, env)
        if isinstance(series, pd.DataFrame):
            # multi-output (macd/bb): plot each column as its own line
            for col in series.columns:
                out.append(_series_to_output(f"{src_name}.{col}", series[col], df, p))
        else:
            out.append(_series_to_output(p.get("title") or src_name, series, df, p))
    return out


def _series_to_output(title: str, series: pd.Series, df: pd.DataFrame, plot_meta: dict) -> dict:
    # Lightweight-charts expects { time, value }
    data = []
    for t, v in zip(df["timestamp"], series.values):
        if v is None or (isinstance(v, float) and (np.isnan(v) or np.isinf(v))):
            continue
        data.append({"time": int(t.timestamp()), "value": float(v)})
    return {
        "id": f"{title}-{plot_meta.get('color','')}",
        "title": title,
        "color": _resolve_color(plot_meta.get("color", "#2962FF")),
        "type": "line",
        "data": data,
    }


_COLOR_MAP = {
    "color.blue": "#2962FF", "color.red": "#F23645", "color.green": "#26a69a",
    "color.orange": "#FF9800", "color.yellow": "#FFEB3B", "color.purple": "#9C27B0",
    "color.white": "#FFFFFF", "color.black": "#000000", "color.gray": "#758696",
}


def _resolve_color(c: Any) -> str:
    if isinstance(c, str) and c.startswith("color."):
        return _COLOR_MAP.get(c, c)
    return str(c) if c else "#2962FF"
