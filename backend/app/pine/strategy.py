"""Pine strategy executor: vectorized precompute + bar-by-bar VirtualBroker.

Pine semantics implemented:
- indicator calculations at bar close; orders queued and filled at the NEXT
  bar's open (spread/slippage applied)
- pyramiding=0: same-direction entries ignored while a position is open;
  opposite entries reverse the position
- sizing: default_qty_type = percent_of_equity | fixed (qty kwarg overrides,
  interpreted in lots/units like the manual order ticket)
- strategy.exit(stop=, limit=) attaches/updates SL & TP on the open position
- strategy.close / strategy.close_all close at next bar open
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

import pandas as pd

from app.pine.compiler import compile_pine
from app.pine.runtime import bars_to_df, eval_expr, eval_scalar, _is_stateful, _ast_ids
from app.replay.engine import PendingOrder, VirtualBroker
from app.replay.markets import get_market_config
from app.backtest.metrics import compute_metrics


def _scalar_at(v: Any, i: int) -> Any:
    if isinstance(v, pd.Series):
        s = v.iloc[i]
        if pd.isna(s):
            return None
        return float(s)
    if v is None:
        return None
    if isinstance(v, (int, float, bool)):
        return float(v)
    return v  # string


_SCALAR_CONST_IDS = {"strategy.long", "strategy.short", "strategy.percent_of_equity",
                     "strategy.fixed", "strategy.cash", "true", "false", "na"}


def _needs_scalar(ast: dict, state_names: set[str]) -> bool:
    """True if the expression must be evaluated per-bar (state vars / runtime broker ids)."""
    ids = _ast_ids(ast)
    if ids & state_names:
        return True
    return any(i.startswith("strategy.") and i not in _SCALAR_CONST_IDS for i in ids)


def run_strategy(
    source: str,
    bars: list[dict],
    cash: Optional[float] = None,
    leverage: int = 100,
    symbol: str = "",
    timeframe: str = "1h",
    inputs: Optional[dict] = None,
) -> dict:
    ir = compile_pine(source)
    if ir["kind"] != "strategy":
        raise ValueError(
            "Script declares indicator() — a strategy() declaration is required for backtesting"
        )

    cfg = get_market_config(symbol)
    df = bars_to_df(bars)
    if df.empty:
        raise ValueError("No bars provided")

    params = ir["params"]
    initial = float(cash) if cash else params["initial_capital"]

    env: dict[str, Any] = {inp["name"]: inp["default"] for inp in ir["inputs"]}
    # caller-supplied input overrides (optimizer / API)
    override: dict[str, Any] = {}
    if inputs:
        known = {inp["name"] for inp in ir["inputs"]}
        for k, v in inputs.items():
            if k in known:
                env[k] = v
                override[k] = v

    # ---- phase 1: vectorized precompute (assignments + if conditions) ----
    # Expressions touching control-flow state vars or broker state
    # (strategy.position_size) are deferred to the bar loop (phase 2).
    state_names: set[str] = set(ir.get("state_vars", []))
    n = len(df)

    def _prep_call(call: dict) -> None:
        """Precompute call args; stateful ones stay as ASTs for per-bar eval."""
        spec: list = []
        for a in call["args"]:
            if _needs_scalar(a, state_names):
                spec.append(("s", a))
            else:
                spec.append(("v", eval_expr(a, df, env)))
        call["_args_v"] = spec
        kwspec: dict = {}
        for k_, v in call["kwargs"].items():
            kwspec[k_] = ("s", v) if _needs_scalar(v, state_names) else ("v", eval_expr(v, df, env))
        call["_kw_v"] = kwspec

    def _prep_block(stmts: list[dict]) -> None:
        for s in stmts:
            k = s.get("kind")
            if k == "strategy_call":
                _prep_call(s)
            elif k == "if":
                if _needs_scalar(s["cond"], state_names):
                    s["_cond_scalar"] = True
                else:
                    cond = eval_expr(s["cond"], df, env)
                    s["_cond"] = cond.fillna(False).astype(bool) if isinstance(cond, pd.Series) else cond
                _prep_block(s["body"])
                for e in s.get("elifs", []):
                    if _needs_scalar(e["cond"], state_names):
                        e["_cond_scalar"] = True
                    else:
                        c = eval_expr(e["cond"], df, env)
                        e["_cond"] = c.fillna(False).astype(bool) if isinstance(c, pd.Series) else c
                    _prep_block(e["body"])
                _prep_block(s.get("else_body", []) or [])

    for st in ir["statements"]:
        if st["kind"] == "assign":
            if st["name"] in override:
                # input declaration with caller-supplied value — keep the override
                env[st["name"]] = override[st["name"]]
                continue
            if st.get("reassign") or _needs_scalar(st["expr"], state_names):
                st["_per_bar"] = True
            else:
                env[st["name"]] = eval_expr(st["expr"], df, env)
        elif st["kind"] == "if":
            if _needs_scalar(st["cond"], state_names):
                st["_cond_scalar"] = True
            else:
                cond = eval_expr(st["cond"], df, env)
                st["_cond"] = cond.fillna(False).astype(bool) if isinstance(cond, pd.Series) else cond
            _prep_block(st["body"])
            for e in st.get("elifs", []):
                if _needs_scalar(e["cond"], state_names):
                    e["_cond_scalar"] = True
                else:
                    c = eval_expr(e["cond"], df, env)
                    e["_cond"] = c.fillna(False).astype(bool) if isinstance(c, pd.Series) else c
                _prep_block(e["body"])
            _prep_block(st.get("else_body", []) or [])
        elif st["kind"] == "strategy_call":
            _prep_call(st)
        elif st["kind"] == "for":
            _prep_block(st["body"])
        # var_decl: initialized in phase 2

    # ---- phase 2: bar-by-bar simulation ----
    broker = VirtualBroker(cfg, initial, leverage)
    times = df["timestamp"].tolist()
    opens = df["open"].tolist()
    highs = df["high"].tolist()
    lows = df["low"].tolist()
    closes = df["close"].tolist()

    queued: list[PendingOrder] = []
    equity_curve: list[dict] = []

    # per-bar state for var / control-flow assigns
    arrays: dict[str, list] = {name: [None] * n for name in state_names}

    def hist_at(name: str, k: int, i: int):
        j = i - k
        if name in arrays:
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
            return v
        return None

    def build_scope(i: int, extra: dict | None = None) -> dict:
        scope: dict[str, Any] = {}
        for name, v in env.items():
            scope[name] = _scalar_at(v, i) if isinstance(v, pd.Series) else v
        for c in ("open", "high", "low", "close", "volume"):
            scope[c] = float(df[c].iloc[i])
        for name in arrays:
            if extra and name in extra:
                continue
            v = arrays[name][i]
            scope[name] = 0 if v is None else v
        p = broker.position
        scope["strategy.position_size"] = 0.0 if not p else (p.size if p.side == "long" else -p.size)
        if extra:
            scope.update(extra)
        return scope

    def process_call(call: dict, i: int, scope: dict, prev: dict) -> None:
        action = call["action"]
        args = [v if kind == "v" else eval_scalar(v, scope, prev, lambda nm, kk: hist_at(nm, kk, i))
                for kind, v in call.get("_args_v", [])]
        kw = {k_: (v if kind == "v" else eval_scalar(v, scope, prev, lambda nm, kk: hist_at(nm, kk, i)))
              for k_, (kind, v) in call.get("_kw_v", {}).items()}
        pos = broker.position

        if action == "entry":
            dirv = _scalar_at(args[1], i) if len(args) > 1 else 1.0
            side = "buy" if (dirv is None or dirv >= 0) else "sell"
            # pyramiding = 0: skip same-direction entries
            if pos and ((pos.side == "long") == (side == "buy")):
                return
            qty = _scalar_at(kw["qty"], i) if "qty" in kw else None
            if qty is not None and qty > 0:
                size = qty
            elif params["default_qty_type"] == "percent_of_equity":
                eq = broker.equity(closes[i])
                notional = eq * params["default_qty_value"] / 100.0
                size = notional / (closes[i] * cfg.multiplier)
            else:
                size = params["default_qty_value"]
            if size <= 0:
                return
            ok, _err = broker.can_submit(size, closes[i])
            if not ok:
                return
            queued.append(PendingOrder(id=0, side=side, order_type="market", size=size))

        elif action in ("close", "close_all"):
            if not pos:
                return
            side = "sell" if pos.side == "long" else "buy"
            queued.append(PendingOrder(id=0, side=side, order_type="market", size=pos.size))

        elif action == "exit":
            if not pos:
                return
            stop = _scalar_at(kw["stop"], i) if "stop" in kw else None
            limit = _scalar_at(kw["limit"], i) if "limit" in kw else None
            if stop is not None:
                pos.stop_loss = stop
            if limit is not None:
                pos.take_profit = limit

        elif action in ("cancel", "cancel_all"):
            queued.clear()
            broker.pending.clear()

    def cond_true(node: dict, i: int, scope: dict, prev: dict) -> bool:
        if node.get("_cond_scalar"):
            return bool(eval_scalar(node["cond"], scope, prev, lambda nm, kk: hist_at(nm, kk, i)))
        c = node["_cond"]
        return bool(c.iloc[i]) if isinstance(c, pd.Series) else bool(c)

    def exec_block(stmts: list[dict], i: int, prev: dict, extra: dict | None = None) -> None:
        for s in stmts:
            k = s.get("kind")
            scope = build_scope(i, extra)  # fresh: reflects writes from earlier statements
            if k == "strategy_call":
                process_call(s, i, scope, prev)
            elif k == "assign":
                if s["name"] not in arrays:
                    arrays[s["name"]] = [None] * n
                arrays[s["name"]][i] = eval_scalar(s["expr"], scope, prev, lambda nm, kk: hist_at(nm, kk, i))
            elif k == "if":
                if cond_true(s, i, scope, prev):
                    exec_block(s["body"], i, prev, extra)
                else:
                    for e in s.get("elifs", []):
                        if cond_true(e, i, scope, prev):
                            exec_block(e["body"], i, prev, extra)
                            break
                    else:
                        if s.get("else_body"):
                            exec_block(s["else_body"], i, prev, extra)
            elif k == "for":
                scope0 = build_scope(i, extra)
                a = int(eval_scalar(s["from"], scope0, prev, lambda nm, kk: hist_at(nm, kk, i)))
                bnd = int(eval_scalar(s["to"], scope0, prev, lambda nm, kk: hist_at(nm, kk, i)))
                by = int(eval_scalar(s["by"], scope0, prev, lambda nm, kk: hist_at(nm, kk, i))) if s.get("by") else None
                step = by if by is not None else (1 if a <= bnd else -1)
                for j in range(a, bnd + (1 if step > 0 else -1), step):
                    exec_block(s["body"], i, prev, {**(extra or {}), s["var"]: j})
            elif k in ("break", "continue"):
                return  # no-op at strategy block level

    prev_scope: dict = {}
    for i in range(n):
        bar = {"time": int(times[i].timestamp()), "open": opens[i], "high": highs[i],
               "low": lows[i], "close": closes[i], "volume": 0}

        # 1) orders queued at previous close fill at this open, then limit/stop + SL/TP
        if queued:
            fill_now, queued = queued, []
            broker.on_bar(bar, open_orders=fill_now)
        else:
            broker.on_bar(bar)

        # carry control-flow state forward
        for name in arrays:
            if i > 0 and arrays[name][i] is None:
                arrays[name][i] = arrays[name][i - 1]

        # 2) evaluate signals at this bar's close (next bar open execution)
        scope = build_scope(i)
        prev_eff = prev_scope if prev_scope else scope  # bar 0: no history yet
        for st in ir["statements"]:
            k = st["kind"]
            if k == "if":
                exec_block([st], i, prev_eff)
            elif k == "strategy_call":
                process_call(st, i, build_scope(i), prev_eff)
            elif k == "var_decl":
                if i == 0:
                    if st["name"] not in arrays:
                        arrays[st["name"]] = [None] * n
                    arrays[st["name"]][0] = eval_scalar(st["expr"], build_scope(0), build_scope(0), lambda nm, kk: hist_at(nm, kk, 0))
            elif k == "assign":
                if st.get("_per_bar"):
                    if st["name"] not in arrays:
                        arrays[st["name"]] = [None] * n
                    arrays[st["name"]][i] = eval_scalar(st["expr"], build_scope(i), prev_eff, lambda nm, kk: hist_at(nm, kk, i))
            elif k == "for":
                exec_block([st], i, prev_eff)
        prev_scope = build_scope(i)

        # 3) mark equity at close
        equity_curve.append({"time": bar["time"], "value": broker.equity(closes[i])})

    # ---- trades & open position from events ----
    reason_map = {"order": "signal", "sl": "stop", "tp": "target"}
    ts_idx = df["timestamp"]
    lows = df["low"].values
    highs = df["high"].values

    def _excursions(e: dict) -> tuple[float, float]:
        """(MAE %, MFE %) of a closed chunk — max adverse / favourable move vs entry."""
        try:
            i0 = ts_idx.searchsorted(datetime.fromisoformat(e["entry_time"]), "left")
            i1 = ts_idx.searchsorted(datetime.fromisoformat(e["exit_time"]), "right")
        except Exception:  # noqa: BLE001
            return 0.0, 0.0
        if i1 <= i0 or i0 >= len(lows):
            return 0.0, 0.0
        i1 = min(i1, len(lows))
        ep = e["entry_price"]
        if ep <= 0:
            return 0.0, 0.0
        if e["side"] == "long":
            mae = (lows[i0:i1].min() - ep) / ep * 100
            mfe = (highs[i0:i1].max() - ep) / ep * 100
        else:
            mae = (ep - highs[i0:i1].max()) / ep * 100
            mfe = (ep - lows[i0:i1].min()) / ep * 100
        return round(float(mae), 3), round(float(mfe), 3)

    trades = []
    for e in broker.events:
        if e["type"] in ("position_closed", "position_reduced"):
            notional = e["entry_price"] * e["closed_size"] * cfg.multiplier
            mae, mfe = _excursions(e)
            trades.append({
                "entry_time": e["entry_time"],
                "exit_time": e["exit_time"],
                "side": e["side"],
                "size": e["closed_size"],
                "entry_price": e["entry_price"],
                "exit_price": e["exit_price"],
                "pnl": e["pnl"],
                "pnl_pct": (e["pnl"] / notional * 100) if notional else 0.0,
                "reason": reason_map.get(e["reason"], e["reason"]),
                "mae": mae,
                "mfe": mfe,
            })

    open_position = None
    if broker.position:
        p = broker.position
        open_position = {
            "side": p.side, "size": p.size, "entry_price": p.entry_price,
            "entry_time": p.entry_time.isoformat(),
            "unrealized": broker.unrealized(closes[-1]),
        }

    # ---- drawdown curve ----
    peak = initial
    dd_curve = []
    for pt in equity_curve:
        peak = max(peak, pt["value"])
        dd_curve.append({"time": pt["time"], "value": (pt["value"] / peak - 1.0) * 100.0})

    tf_minutes = _TF_MINUTES.get(timeframe, 60)
    bars_per_year = 525_600.0 / tf_minutes

    metrics = compute_metrics(equity_curve, trades, initial, bars_per_year, open_position)
    metrics["bars_processed"] = n

    return {
        "name": ir["name"],
        "kind": "strategy",
        "initial_capital": initial,
        "leverage": leverage,
        "metrics": metrics,
        "equity_curve": equity_curve,
        "drawdown_curve": dd_curve,
        "trades": trades,
        "open_position": open_position,
        "events": broker.events if len(broker.events) < 500 else broker.events[:500],
    }


_TF_MINUTES = {
    "1m": 1, "3m": 3, "5m": 5, "15m": 15, "30m": 30, "45m": 45,
    "1h": 60, "2h": 120, "3h": 180, "4h": 240, "1d": 1440, "1w": 10080, "1mo": 43200,
}
