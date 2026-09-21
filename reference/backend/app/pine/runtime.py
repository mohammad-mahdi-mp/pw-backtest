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
    if t == "hist":
        base = eval_expr(ast["x"], df, env)
        k = eval_expr(ast["k"], df, env)
        k = int(k) if isinstance(k, (int, float)) and not pd.isna(k) else 0
        if isinstance(base, pd.Series):
            return base.shift(k)
        return base  # scalar history is itself
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


# ---------------------------------------------------- scalar (per-bar) evaluator

_EMPTY_DF = pd.DataFrame()


def eval_scalar(ast: dict, scope: dict, prev_scope: dict, hist=None) -> Any:
    """Evaluate an expression to a scalar at one bar.

    `scope` maps every visible name to its value at this bar; `prev_scope`
    holds the previous bar's values (used by ta.crossover/crossunder/change).
    `hist(name, k)` (optional) resolves history access like `close[k]`.
    """
    t = ast["t"]
    if t == "num":
        return ast["v"]
    if t == "str":
        return ast["v"]
    if t == "hist":
        if hist is None:
            raise NotImplementedError("history access close[k] is only available inside indicator control flow")
        name = ast["x"]["v"] if ast["x"].get("t") == "id" else None
        if name is None:
            raise NotImplementedError("history access is only supported on variables (close[1])")
        k = int(eval_scalar(ast["k"], scope, prev_scope, hist))
        v = hist(name, k)
        return float("nan") if v is None else v
    if t == "id":
        v = ast["v"]
        if v in _CONST_IDS and _CONST_IDS[v] is not None:
            return _CONST_IDS[v]
        if v in scope:
            return scope[v]
        if v in prev_scope:
            return prev_scope[v]
        raise ValueError(f"Unknown identifier: {v}")
    if t == "un":
        x = eval_scalar(ast["x"], scope, prev_scope, hist)
        return -x if ast["op"] == "-" else (not _to_bool(x))
    if t == "bin":
        op = ast["op"]
        if op == "and":
            return bool(_to_bool(eval_scalar(ast["l"], scope, prev_scope, hist)) and
                        _to_bool(eval_scalar(ast["r"], scope, prev_scope, hist)))
        if op == "or":
            return bool(_to_bool(eval_scalar(ast["l"], scope, prev_scope, hist)) or
                        _to_bool(eval_scalar(ast["r"], scope, prev_scope, hist)))
        l = eval_scalar(ast["l"], scope, prev_scope, hist)
        r = eval_scalar(ast["r"], scope, prev_scope, hist)
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
        c = eval_scalar(ast["c"], scope, prev_scope, hist)
        return (eval_scalar(ast["a"], scope, prev_scope, hist) if _to_bool(c)
                else eval_scalar(ast["b"], scope, prev_scope, hist))
    if t == "call":
        fn = ast["fn"]
        args = [eval_scalar(a, scope, prev_scope, hist) for a in ast["args"]]
        if fn.startswith("math."):
            return _math_eval(fn[5:], args, _EMPTY_DF)
        if fn == "ta.crossover":
            if len(args) != 2:
                raise ValueError("ta.crossover needs 2 arguments")
            pa = _prev_val(ast["args"][0], scope, prev_scope, hist)
            pb = _prev_val(ast["args"][1], scope, prev_scope, hist)
            return bool(args[0] > args[1] and not (pa > pb))
        if fn == "ta.crossunder":
            if len(args) != 2:
                raise ValueError("ta.crossunder needs 2 arguments")
            pa = _prev_val(ast["args"][0], scope, prev_scope, hist)
            pb = _prev_val(ast["args"][1], scope, prev_scope, hist)
            return bool(args[0] < args[1] and not (pa < pb))
        if fn == "ta.change":
            pa = _prev_val(ast["args"][0], scope, prev_scope, hist)
            return args[0] - pa
        if fn == "input":
            return args[0] if args else 0
        raise NotImplementedError(
            f"{fn}() cannot be used inside if/for blocks — precompute it at top level"
        )
    raise NotImplementedError(f"AST node {t}")


def _prev_val(ast: dict, scope: dict, prev_scope: dict, hist=None) -> Any:
    """Value of an expression on the previous bar (for crossover/change)."""
    return eval_scalar(ast, prev_scope, prev_scope, hist)


def _ast_ids(ast: dict) -> set[str]:
    """Collect all identifier names referenced by an AST node."""
    out: set[str] = set()
    t = ast.get("t")
    if t == "id":
        out.add(ast["v"])
    elif t in ("un",):
        out |= _ast_ids(ast["x"])
    elif t == "bin":
        out |= _ast_ids(ast["l"]) | _ast_ids(ast["r"])
    elif t == "ternary":
        out |= _ast_ids(ast["c"]) | _ast_ids(ast["a"]) | _ast_ids(ast["b"])
    elif t == "call":
        for a in ast.get("args", []):
            out |= _ast_ids(a)
        for a in ast.get("kwargs", {}).values():
            out |= _ast_ids(a)
    return out


def _is_stateful(ast: dict, state_names: set[str]) -> bool:
    return bool(_ast_ids(ast) & state_names)


# ---------------------------------------------------------------- indicators


def run_indicator(source: str, bars: list[dict]) -> list[dict]:
    ir = compile_pine(source)
    df = bars_to_df(bars)
    if df.empty:
        return []

    env: dict[str, Any] = {inp["name"]: inp["default"] for inp in ir["inputs"]}
    outputs: list[dict] = []
    state_names: set[str] = set(ir.get("state_vars", []))

    needs_barloop = any(st.get("kind") in ("var_decl", "if", "for") for st in ir["statements"])

    if not needs_barloop:
        # ---- pure vectorized path (original behaviour) ----
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

    # ---- hybrid path: vectorized precompute + bar-by-bar control flow ----
    n = len(df)
    arrays: dict[str, list] = {name: [None] * n for name in state_names}
    vec_done: set[int] = set()  # indices of statements already vectorized
    builtin_cols = [c for c in ("open", "high", "low", "close", "volume") if c in df.columns]

    def vectorized(idx: int, st: dict) -> None:
        """Precompute a top-level plain assign vectorized (once)."""
        if idx in vec_done:
            return
        vec_done.add(idx)
        env[st["name"]] = eval_expr(st["expr"], df, env)

    def hist_at(name: str, k: int, i: int) -> Any:
        """Value of a series/state var k bars back from bar i."""
        j = i - k
        if name in state_names:
            if j < 0:
                return None
            v = arrays[name][j]
            return 0 if v is None else v
        if name in df.columns:
            if j < 0:
                return None
            v = df[name].iloc[j]
            return None if pd.isna(v) else float(v)
        if name in env:
            v = env[name]
            if isinstance(v, pd.Series):
                if j < 0:
                    return None
                s = v.iloc[j]
                return None if pd.isna(s) else float(s)
            return v  # scalar constant — same every bar
        return None

    def build_scope(i: int, extra: dict | None = None) -> dict:
        scope: dict[str, Any] = {}
        for name, v in env.items():
            if isinstance(v, pd.Series):
                s = v.iloc[i]
                scope[name] = None if pd.isna(s) else float(s)
            elif isinstance(v, pd.DataFrame):
                scope[name] = v.iloc[i].to_dict()
            else:
                scope[name] = v
        for c in builtin_cols:
            scope[c] = float(df[c].iloc[i])
        # current per-bar values of control-flow state vars
        for name in state_names:
            if extra and name in extra:
                continue
            v = arrays[name][i]
            scope[name] = 0 if v is None else v
        if extra:
            scope.update(extra)
        return scope

    def cond_bool(st: dict, i: int, prev: dict) -> bool:
        if _is_stateful(st["cond"], state_names):
            return bool(_to_bool(eval_scalar(st["cond"], build_scope(i), prev, lambda nm, kk: hist_at(nm, kk, i))))
        # vectorized cond (memoized on the statement)
        if "_cond_series" not in st:
            st["_cond_series"] = _to_bool(eval_expr(st["cond"], df, env))
        s = st["_cond_series"].iloc[i]
        return bool(s)

    def exec_stmts(stmts: list[dict], i: int, prev: dict, loop_scope: dict | None) -> tuple[bool, bool]:
        """Execute a block at bar i. Returns (broke, continued)."""
        for s in stmts:
            k = s.get("kind")
            if k == "assign":
                if s["name"] not in arrays:
                    arrays[s["name"]] = [None] * n
                    state_names.add(s["name"])
                arrays[s["name"]][i] = eval_scalar(s["expr"], build_scope(i, loop_scope), prev, lambda nm, kk: hist_at(nm, kk, i))
            elif k == "if":
                broke = cont = False
                if cond_bool(s, i, prev):
                    broke, cont = exec_stmts(s["body"], i, prev, loop_scope)
                else:
                    for elif_node in s.get("elifs", []):
                        if _cond_bool_node(elif_node, i, prev):
                            broke, cont = exec_stmts(elif_node["body"], i, prev, loop_scope)
                            break
                    else:
                        if s.get("else_body"):
                            broke, cont = exec_stmts(s["else_body"], i, prev, loop_scope)
                if broke:
                    return True, False
                if cont:
                    return False, True
            elif k == "for":
                scope0 = build_scope(i, loop_scope)
                a = int(eval_scalar(s["from"], scope0, prev, lambda nm, kk: hist_at(nm, kk, i)))
                bnd = int(eval_scalar(s["to"], scope0, prev, lambda nm, kk: hist_at(nm, kk, i)))
                by = int(eval_scalar(s["by"], scope0, prev)) if s.get("by") else None
                step = by if by is not None else (1 if a <= bnd else -1)
                rng = range(a, bnd + (1 if step > 0 else -1), step)
                for j in rng:
                    b, c = exec_stmts(s["body"], i, prev, {**(loop_scope or {}), s["var"]: j})
                    if b:
                        return True, False
                    if c:
                        continue
            elif k == "break":
                return True, False
            elif k == "continue":
                return False, True
        return False, False

    def _cond_bool_node(node: dict, i: int, prev: dict) -> bool:
        if _is_stateful(node["cond"], state_names):
            return bool(_to_bool(eval_scalar(node["cond"], build_scope(i), prev, lambda nm, kk: hist_at(nm, kk, i))))
        if "_cond_series" not in node:
            node["_cond_series"] = _to_bool(eval_expr(node["cond"], df, env))
        return bool(node["_cond_series"].iloc[i])

    # bar loop
    prev_scope: dict = {}
    for i in range(n):
        # carry var state forward
        for name in state_names:
            arrays[name][i] = arrays[name][i - 1] if i > 0 else None
        # pass 1: statements in order
        for idx, st in enumerate(ir["statements"]):
            k = st["kind"]
            if k == "var_decl":
                if i == 0:
                    scope = build_scope(0)
                    arrays[st["name"]][0] = eval_scalar(st["expr"], scope, {}, lambda nm, kk: hist_at(nm, kk, 0))
            elif k == "assign":
                if _is_stateful(st["expr"], state_names) or st.get("reassign"):
                    if st["name"] not in arrays:
                        arrays[st["name"]] = [None] * n
                        state_names.add(st["name"])
                    arrays[st["name"]][i] = eval_scalar(st["expr"], build_scope(i), prev_scope, lambda nm, kk: hist_at(nm, kk, i))
                else:
                    vectorized(idx, st)
            elif k == "if":
                exec_stmts([st], i, prev_scope, None)
            elif k == "for":
                exec_stmts([st], i, prev_scope, None)
        prev_scope = build_scope(i)
        # refresh env scalars for state vars (so later vectorized exprs can't be wrong) —
        # state vars stay out of env until the loop finishes

    # state arrays become series
    for name in arrays:
        env[name] = pd.Series(
            [v if v is not None else float("nan") for v in arrays[name]], index=df.index
        )

    # plots
    for st in ir["statements"]:
        if st["kind"] == "plot":
            v = eval_expr(st["expr"], df, env)
            title = st["title"] or st["src"]
            if isinstance(v, pd.DataFrame):
                for col in v.columns:
                    outputs.append(_series_to_output(f"{title}.{col}", v[col], df, st))
            else:
                outputs.append(_series_to_output(title, v, df, st))
    return outputs
