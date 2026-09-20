"""Pine runtime: vectorized evaluation of the compiler AST against bars."""
from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from app.pine.compiler import compile_pine

_CONST_IDS = {
    "strategy.long": 1,
    "strategy.short": -1,
    "strategy.percent_of_equity": "percent_of_equity",
    "strategy.fixed": "fixed",
    "strategy.cash": "cash",
    "true": True,
    "false": False,
    "na": float("nan"),
    "close": None,  # placeholder — handled via df columns
}

_COLOR_MAP = {
    "color.blue": "#2962FF", "color.red": "#F23645", "color.green": "#26a69a",
    "color.orange": "#FF9800", "color.yellow": "#FFEB3B", "color.purple": "#9C27B0",
    "color.white": "#FFFFFF", "color.black": "#000000", "color.gray": "#758696",
    "color.aqua": "#00BCD4", "color.lime": "#7CB342", "color.maroon": "#8B3A3A",
    "color.fuchsia": "#E040FB", "color.teal": "#009688",
}


def bars_to_df(bars: list[dict]) -> pd.DataFrame:
    df = pd.DataFrame(bars)
    if df.empty:
        return df
    df["timestamp"] = pd.to_datetime(df["time"], unit="s", utc=False)
    for col in ("open", "high", "low", "close", "volume"):
        if col in df.columns:
            df[col] = df[col].astype(float)
    return df


def _to_bool(x: Any) -> Any:
    if isinstance(x, pd.Series):
        return x.fillna(False).astype(bool)
    return bool(x)


def _eval_arg(x: Any, df: pd.DataFrame) -> pd.Series:
    """Coerce an evaluated value to a float Series aligned with df."""
    if isinstance(x, pd.Series):
        return x.astype(float)
    if isinstance(x, (int, float, bool)):
        return pd.Series(float(x), index=df.index)
    # identifier string fallback
    if isinstance(x, str):
        if x in df.columns:
            return df[x].astype(float)
        try:
            return pd.Series(float(x), index=df.index)
        except ValueError:
            pass
    raise ValueError(f"Cannot coerce {x!r} to series")


def _coerce_len(v: Any, default: int) -> int:
    if isinstance(v, pd.Series):
        s = v.dropna()
        return int(s.iloc[-1]) if len(s) else default
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


# ---------------------------------------------------------------- ta engine


def _ta_eval(fn: str, args: list, df: pd.DataFrame) -> Any:
    a0 = _eval_arg(args[0], df) if args else df["close"]
    fn_l = fn.lower()

    if fn_l == "crossover":
        a = _eval_arg(args[0], df)
        b = _eval_arg(args[1], df)
        return ((a > b) & (a.shift(1) <= b.shift(1))).fillna(False).astype(bool)
    if fn_l == "crossunder":
        a = _eval_arg(args[0], df)
        b = _eval_arg(args[1], df)
        return ((a < b) & (a.shift(1) >= b.shift(1))).fillna(False).astype(bool)

    if fn_l in ("sma",):
        length = _coerce_len(args[1], 14) if len(args) > 1 else 14
        return a0.rolling(length, min_periods=1).mean()
    if fn_l in ("ema",):
        length = _coerce_len(args[1], 14) if len(args) > 1 else 14
        return a0.ewm(span=length, adjust=False).mean()
    if fn_l in ("wma",):
        length = _coerce_len(args[1], 14) if len(args) > 1 else 14
        w = np.arange(1, length + 1)
        return a0.rolling(length, min_periods=1).apply(
            lambda x: np.dot(x, w[-len(x):]) / w[-len(x):].sum(), raw=True
        )
    if fn_l in ("rma",):
        length = _coerce_len(args[1], 14) if len(args) > 1 else 14
        return a0.ewm(alpha=1.0 / length, adjust=False).mean()
    if fn_l in ("rsi",):
        length = _coerce_len(args[1], 14) if len(args) > 1 else 14
        delta = a0.astype(float).diff()
        gain = delta.clip(lower=0)
        loss = -delta.clip(upper=0)
        ag = gain.ewm(alpha=1 / length, adjust=False).mean()
        al = loss.ewm(alpha=1 / length, adjust=False).mean()
        rs = ag / al.replace(0, np.nan)
        return (100 - 100 / (1 + rs)).fillna(50)
    if fn_l == "macd":
        fast = _coerce_len(args[1], 12) if len(args) > 1 else 12
        slow = _coerce_len(args[2], 26) if len(args) > 2 else 26
        sig = _coerce_len(args[3], 9) if len(args) > 3 else 9
        fl = a0.ewm(span=fast, adjust=False).mean()
        sl = a0.ewm(span=slow, adjust=False).mean()
        macd = fl - sl
        signal = macd.ewm(span=sig, adjust=False).mean()
        return pd.DataFrame({"macd": macd, "signal": signal, "hist": macd - signal})
    if fn_l in ("bb", "bollinger_bands"):
        length = _coerce_len(args[1], 20) if len(args) > 1 else 20
        mult = 2.0
        if len(args) > 2:
            m = args[2]
            if isinstance(m, pd.Series):
                m = m.dropna().iloc[-1] if len(m.dropna()) else 2.0
            mult = float(m)
        mid = a0.rolling(length, min_periods=1).mean()
        std = a0.rolling(length, min_periods=1).std(ddof=0)
        return pd.DataFrame({"upper": mid + mult * std, "middle": mid, "lower": mid - mult * std})
    if fn_l == "atr":
        length = _coerce_len(args[1], 14) if len(args) > 1 else 14
        h, l, c = df["high"], df["low"], df["close"]
        tr = pd.concat([h - l, (h - c.shift()).abs(), (l - c.shift()).abs()], axis=1).max(axis=1)
        return tr.ewm(alpha=1 / length, adjust=False).mean()
    if fn_l == "stoch":
        k_len = _coerce_len(args[1], 14) if len(args) > 1 else 14
        hh = df["high"].rolling(k_len, min_periods=1).max()
        ll = df["low"].rolling(k_len, min_periods=1).min()
        k = 100 * (df["close"] - ll) / (hh - ll).replace(0, np.nan)
        return k.fillna(50)
    if fn_l in ("highest",):
        length = _coerce_len(args[1], 20) if len(args) > 1 else 20
        return a0.rolling(length, min_periods=1).max()
    if fn_l in ("lowest",):
        length = _coerce_len(args[1], 20) if len(args) > 1 else 20
        return a0.rolling(length, min_periods=1).min()
    if fn_l == "vwap":
        tp = (df["high"] + df["low"] + df["close"]) / 3
        v = df["volume"].replace(0, np.nan).fillna(0)
        return (tp * v).cumsum() / v.cumsum().replace(0, np.nan)
    if fn_l == "change":
        length = _coerce_len(args[1], 1) if len(args) > 1 else 1
        return a0.diff(length)
    if fn_l == "stdev":
        length = _coerce_len(args[1], 20) if len(args) > 1 else 20
        return a0.rolling(length, min_periods=1).std(ddof=0)

    raise NotImplementedError(f"ta.{fn} is not yet implemented")


def _math_eval(fn: str, args: list, df: pd.DataFrame) -> Any:
    fn_l = fn.lower()
    a = args[0] if args else 0
    if fn_l == "abs":
        return abs(a)
    if fn_l == "max":
        return max(args)
    if fn_l == "min":
        return min(args)
    if fn_l == "round":
        return round(a)
    if fn_l == "floor":
        return np.floor(a)
    if fn_l == "ceil":
        return np.ceil(a)
    if fn_l == "sqrt":
        return np.sqrt(_eval_arg(a, df) if not isinstance(a, (int, float)) else a)
    if fn_l == "pow":
        return args[0] ** args[1]
    raise NotImplementedError(f"math.{fn} is not yet implemented")


# ---------------------------------------------------------------- evaluator


def eval_expr(ast: dict, df: pd.DataFrame, env: dict) -> Any:
    t = ast["t"]
    if t == "num":
        return ast["v"]
    if t == "str":
        return ast["v"]
    if t == "id":
        v = ast["v"]
        if v in _CONST_IDS and _CONST_IDS[v] is not None:
            return _CONST_IDS[v]
        if v in df.columns:
            return df[v].astype(float)
        if v in env:
            return env[v]
        try:
            return float(v)
        except ValueError:
            raise ValueError(f"Unknown identifier: {v}")
    if t == "un":
        x = eval_expr(ast["x"], df, env)
        if ast["op"] == "-":
            return -x
        return ~_to_bool(x)
    if t == "bin":
        l = eval_expr(ast["l"], df, env)
        r = eval_expr(ast["r"], df, env)
        op = ast["op"]
        if op == "and":
            return _to_bool(l) & _to_bool(r)
        if op == "or":
            return _to_bool(l) | _to_bool(r)
        if op == "+":
            return l + r
        if op == "-":
            return l - r
        if op == "*":
            return l * r
        if op == "/":
            return l / r
        if op == ">":
            return l > r
        if op == "<":
            return l < r
        if op == ">=":
            return l >= r
        if op == "<=":
            return l <= r
        if op == "==":
            return l == r
        if op == "!=":
            return l != r
        raise NotImplementedError(f"operator {op}")
    if t == "ternary":
        c = _to_bool(eval_expr(ast["c"], df, env))
        a = eval_expr(ast["a"], df, env)
        b = eval_expr(ast["b"], df, env)
        if isinstance(c, pd.Series):
            return pd.Series(np.where(c, a, b), index=df.index)
        return a if c else b
    if t == "call":
        fn = ast["fn"]
        args = [eval_expr(a, df, env) for a in ast["args"]]
        if fn.startswith("ta."):
            return _ta_eval(fn[3:], args, df)
        if fn.startswith("math."):
            return _math_eval(fn[5:], args, df)
        if fn == "input":
            # input(...) inline without assignment — return default
            return args[0] if args else 0
        raise NotImplementedError(f"Function {fn}() is not yet implemented")
    raise NotImplementedError(f"AST node {t}")


# ---------------------------------------------------------------- indicators


def _resolve_color(c: Any) -> str:
    if isinstance(c, str):
        if c in _COLOR_MAP:
            return _COLOR_MAP[c]
        if c.startswith("color."):
            return _COLOR_MAP.get(c, c)
        return c
    return "#2962FF"


def _series_to_output(title: str, series: pd.Series, df: pd.DataFrame, plot_meta: dict) -> dict:
    is_hist = title.lower().endswith(".hist") or title.lower() == "hist"
    data = []
    for t, v in zip(df["timestamp"], series.values):
        if v is None or (isinstance(v, float) and (np.isnan(v) or np.isinf(v))):
            continue
        pt: dict = {"time": int(t.timestamp()), "value": float(v)}
        if is_hist:
            pt["color"] = "#26a69a" if v >= 0 else "#ef5350"
        data.append(pt)
    return {
        "id": f"{title}-{plot_meta.get('color', '')}",
        "title": title,
        "color": _resolve_color(plot_meta.get("color", "#2962FF")),
        "type": "histogram" if is_hist else "line",
        "data": data,
    }


def run_indicator(source: str, bars: list[dict]) -> list[dict]:
    ir = compile_pine(source)
    df = bars_to_df(bars)
    if df.empty:
        return []

    env: dict[str, Any] = {inp["name"]: inp["default"] for inp in ir["inputs"]}
    outputs: list[dict] = []

    for st in ir["statements"]:
        k = st["kind"]
        if k == "assign":
            env[st["name"]] = eval_expr(st["expr"], df, env)
        elif k == "plot":
            v = eval_expr(st["expr"], df, env)
            title = st["title"] or st["src"]
            if isinstance(v, pd.DataFrame):
                for col in v.columns:
                    outputs.append(_series_to_output(f"{title}.{col}", v[col], df, st))
            else:
                outputs.append(_series_to_output(title, v, df, st))
    return outputs
