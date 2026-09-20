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
from app.pine.runtime import bars_to_df, eval_expr
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


def run_strategy(
    source: str,
    bars: list[dict],
    cash: Optional[float] = None,
    leverage: int = 100,
    symbol: str = "",
    timeframe: str = "1h",
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

    # ---- phase 1: vectorized precompute (assignments + if conditions) ----
    for st in ir["statements"]:
        if st["kind"] == "assign":
            env[st["name"]] = eval_expr(st["expr"], df, env)
        elif st["kind"] == "if":
            cond = eval_expr(st["cond"], df, env)
            st["_cond"] = cond.fillna(False).astype(bool) if isinstance(cond, pd.Series) else cond
            for call in st["body"]:
                if call["kind"] == "strategy_call":
                    call["_args"] = [eval_expr(a, df, env) for a in call["args"]]
                    call["_kw"] = {k: eval_expr(v, df, env) for k, v in call["kwargs"].items()}
        elif st["kind"] == "strategy_call":
            st["_args"] = [eval_expr(a, df, env) for a in st["args"]]
            st["_kw"] = {k: eval_expr(v, df, env) for k, v in st["kwargs"].items()}

    # ---- phase 2: bar-by-bar simulation ----
    broker = VirtualBroker(cfg, initial, leverage)
    times = df["timestamp"].tolist()
    opens = df["open"].tolist()
    highs = df["high"].tolist()
    lows = df["low"].tolist()
    closes = df["close"].tolist()

    queued: list[PendingOrder] = []
    equity_curve: list[dict] = []

    def process_call(call: dict, i: int) -> None:
        action = call["action"]
        args = call.get("_args", [])
        kw = call.get("_kw", {})
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

    n = len(df)
    for i in range(n):
        bar = {"time": int(times[i].timestamp()), "open": opens[i], "high": highs[i],
               "low": lows[i], "close": closes[i], "volume": 0}

        # 1) orders queued at previous close fill at this open, then limit/stop + SL/TP
        if queued:
            fill_now, queued = queued, []
            broker.on_bar(bar, open_orders=fill_now)
        else:
            broker.on_bar(bar)

        # 2) evaluate signals at this bar's close (next bar open execution)
        for st in ir["statements"]:
            k = st["kind"]
            if k == "if":
                c = st["_cond"]
                hit = bool(c.iloc[i]) if isinstance(c, pd.Series) else bool(c)
                if hit:
                    for call in st["body"]:
                        if call["kind"] == "strategy_call":
                            process_call(call, i)
            elif k == "strategy_call":
                process_call(st, i)

        # 3) mark equity at close
        equity_curve.append({"time": bar["time"], "value": broker.equity(closes[i])})

    # ---- trades & open position from events ----
    reason_map = {"order": "signal", "sl": "stop", "tp": "target"}
    trades = []
    for e in broker.events:
        if e["type"] in ("position_closed", "position_reduced"):
            notional = e["entry_price"] * e["closed_size"] * cfg.multiplier
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
