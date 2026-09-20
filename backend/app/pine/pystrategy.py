"""Python strategy API — write backtests in plain Python instead of Pine.

A strategy is a class subclassing `Strategy` with an `on_bar(self, ctx)` method
(optional `init(self, ctx)`). It runs on the same VirtualBroker engine as Pine
strategies and replay/paper trading: orders placed at bar close fill at the
NEXT bar's open with spread/slippage/commissions applied.

Example::

    class MyStrategy(Strategy):
        def init(self, ctx):
            self.fast = ctx.sma("close", 10)
            self.slow = ctx.sma("close", 30)

        def on_bar(self, ctx):
            f, s = self.fast[ctx.i], self.slow[ctx.i]
            if ctx.cross_over(f, s):
                ctx.buy()          # percent-of-equity sizing by default
            elif ctx.cross_under(f, s):
                ctx.close_position()

ctx attributes / methods:
    ctx.i                 current bar index (0-based)
    ctx.time              bar timestamp (unix seconds)
    ctx.open/high/low/close/volume   current bar values (float)
    ctx.close_ago(k)      close k bars back (k >= 1)
    ctx.sma(col, n) / ctx.ema(col, n) / ctx.rsi(n) / ctx.atr(n)
                          precomputed full-length lists (index by bar)
    ctx.cross_over(a, b)  True if value a crossed above b this bar
    ctx.position_size     signed size (+ long / - short / 0 flat)
    ctx.equity            mark-to-market equity at this bar's close
    ctx.buy(qty=None, qty_pct=None)   queue a long market order
    ctx.sell(qty=None, qty_pct=None)  queue a short market order
    ctx.close_position()  flatten the open position
    ctx.set_stop(price) / ctx.set_target(price)   attach SL / TP
"""
from __future__ import annotations

from typing import Any, Optional

import pandas as pd

from app.replay.engine import PendingOrder, VirtualBroker
from app.replay.markets import get_market_config
from app.backtest.metrics import compute_metrics


class Strategy:
    """Base class — subclass and implement on_bar()."""

    def init(self, ctx: "Ctx") -> None:  # noqa: D401 - optional hook
        """Called once before the first bar."""

    def on_bar(self, ctx: "Ctx") -> None:
        """Called for every bar at its close; orders fill at the next open."""


class Ctx:
    """Per-run context handed to strategy.init / strategy.on_bar."""

    def __init__(self, df: pd.DataFrame, broker: VirtualBroker, queued: list,
                 qty_pct: float, initial: float):
        self._df = df
        self._broker = broker
        self._queued = queued
        self._qty_pct = qty_pct
        self._initial = initial
        self.i: int = 0
        self._cache: dict[tuple, list] = {}
        self._bar_seq: int = 0
        self._call_idx: int = 0
        self._cross_state: dict[tuple, tuple] = {}

    # ---- bar data ----
    @property
    def time(self) -> int:
        return int(self._df["timestamp"].iloc[self.i].timestamp())

    @property
    def open(self) -> float:
        return float(self._df["open"].iloc[self.i])

    @property
    def high(self) -> float:
        return float(self._df["high"].iloc[self.i])

    @property
    def low(self) -> float:
        return float(self._df["low"].iloc[self.i])

    @property
    def close(self) -> float:
        return float(self._df["close"].iloc[self.i])

    @property
    def volume(self) -> float:
        return float(self._df["volume"].iloc[self.i]) if "volume" in self._df.columns else 0.0

    def bar(self, k: int = 0) -> dict:
        """The bar k bars back (k=0 -> current)."""
        j = self.i - k
        if j < 0:
            return {}
        r = self._df.iloc[j]
        return {"time": int(r["timestamp"].timestamp()), "open": float(r["open"]),
                "high": float(r["high"]), "low": float(r["low"]), "close": float(r["close"])}

    def value(self, col: str, k: int = 0) -> Optional[float]:
        """Column value k bars back (col: open/high/low/close/volume)."""
        j = self.i - k
        if j < 0 or col not in self._df.columns:
            return None
        return float(self._df[col].iloc[j])

    def close_ago(self, k: int) -> Optional[float]:
        return self.value("close", k)

    # ---- indicators (precomputed, O(1) per access after first call) ----
    def _series(self, key: tuple, fn) -> list:
        if key not in self._cache:
            self._cache[key] = [None if pd.isna(v) else float(v) for v in fn()]
        return self._cache[key]

    def sma(self, col: str, n: int) -> list:
        return self._series(("sma", col, n), lambda: self._df[col].rolling(n).mean())

    def ema(self, col: str, n: int) -> list:
        return self._series(("ema", col, n), lambda: self._df[col].ewm(span=n, adjust=False).mean())

    def rsi(self, n: int = 14) -> list:
        def _rsi() -> pd.Series:
            d = self._df["close"].diff()
            up = d.clip(lower=0).ewm(alpha=1 / n, adjust=False).mean()
            dn = (-d.clip(upper=0)).ewm(alpha=1 / n, adjust=False).mean()
            rs = up / dn.replace(0, pd.NA)
            return 100 - 100 / (1 + rs)
        return self._series(("rsi", n), _rsi)

    def atr(self, n: int = 14) -> list:
        def _atr() -> pd.Series:
            d = self._df
            tr = pd.concat([
                d["high"] - d["low"],
                (d["high"] - d["close"].shift()).abs(),
                (d["low"] - d["close"].shift()).abs(),
            ], axis=1).max(axis=1)
            return tr.ewm(alpha=1 / n, adjust=False).mean()
        return self._series(("atr", n), _atr)

    def highest(self, col: str, n: int) -> list:
        return self._series(("hh", col, n), lambda: self._df[col].rolling(n).max())

    def lowest(self, col: str, n: int) -> list:
        return self._series(("ll", col, n), lambda: self._df[col].rolling(n).min())

    # ---- helpers ----
    def cross_over(self, a, b) -> bool:
        """a crossed above b this bar. Prefer the list form: ctx.cross_over(self.fast, self.slow)
        (uses bars i and i-1). The scalar form tracks per-bar call order."""
        if isinstance(a, (list, tuple)) or isinstance(b, (list, tuple)):
            if self.i == 0:
                return False
            av, bv = a[self.i], b[self.i]
            pa, pb = a[self.i - 1], b[self.i - 1]
            if av is None or bv is None or pa is None or pb is None:
                return False
            return av > bv and not (pa > pb)
        return self._cross_scalar(float(a), float(b), "over")

    def cross_under(self, a, b) -> bool:
        if isinstance(a, (list, tuple)) or isinstance(b, (list, tuple)):
            if self.i == 0:
                return False
            av, bv = a[self.i], b[self.i]
            pa, pb = a[self.i - 1], b[self.i - 1]
            if av is None or bv is None or pa is None or pb is None:
                return False
            return av < bv and not (pa < pb)
        return self._cross_scalar(float(a), float(b), "under")

    def _cross_scalar(self, a: float, b: float, op: str) -> bool:
        """Track scalars per (call-order, op) slot across bars."""
        key = (self._bar_seq, self._call_idx, op)
        self._call_idx += 1
        pa, pb = self._cross_state.get(key, (None, None))
        self._cross_state[key] = (a, b)
        if pa is None or pb is None:
            return False
        if op == "over":
            return a > b and not (pa > pb)
        return a < b and not (pa < pb)

    # ---- broker state ----
    @property
    def position_size(self) -> float:
        p = self._broker.position
        return 0.0 if not p else (p.size if p.side == "long" else -p.size)

    @property
    def equity(self) -> float:
        return self._broker.equity(self.close)

    # ---- orders (fill at the NEXT bar's open) ----
    def _queue(self, side: str, size: float, stop: Optional[float] = None,
               target: Optional[float] = None) -> None:
        if size <= 0:
            return
        self._queued.append(PendingOrder(id=0, side=side, order_type="market", size=size,
                                         stop_loss=float(stop) if stop else None,
                                         take_profit=float(target) if target else None))

    def buy(self, qty: Optional[float] = None, qty_pct: Optional[float] = None,
            stop: Optional[float] = None, target: Optional[float] = None) -> None:
        """Go long (reverses a short automatically). qty: units; qty_pct: % of equity
        notional; stop/target: absolute prices attached to the fill."""
        p = self._broker.position
        if p and p.side == "long":
            return  # pyramiding 0
        if p and p.side == "short":
            self._queue("buy", p.size)  # reverse the short first
        self._queue("buy", self._size(qty, qty_pct), stop=stop, target=target)

    def sell(self, qty: Optional[float] = None, qty_pct: Optional[float] = None,
             stop: Optional[float] = None, target: Optional[float] = None) -> None:
        """Go short (reverses a long automatically)."""
        p = self._broker.position
        if p and p.side == "short":
            return
        if p and p.side == "long":
            self._queue("sell", p.size)
        self._queue("sell", self._size(qty, qty_pct), stop=stop, target=target)

    def _size(self, qty: Optional[float], qty_pct: Optional[float]) -> float:
        if qty is not None and qty > 0:
            return qty
        pct = qty_pct if qty_pct is not None else self._qty_pct
        eq = self._broker.equity(self.close)
        notional = eq * pct / 100.0
        return notional / self.close

    def close_position(self) -> None:
        p = self._broker.position
        if not p:
            return
        self._queue("sell" if p.side == "long" else "buy", p.size)

    def set_stop(self, price: float) -> None:
        p = self._broker.position
        if p:
            p.stop_loss = float(price)

    def set_target(self, price: float) -> None:
        p = self._broker.position
        if p:
            p.take_profit = float(price)


def _load_strategy_class(source: str) -> type:
    """Exec user source and return the strategy class: either a class named
    `Strategy` (with on_bar), or the single subclass of the base Strategy."""
    ns: dict[str, Any] = {"Strategy": Strategy, "Ctx": Ctx}
    try:
        exec(compile(source, "<strategy>", "exec"), ns)  # noqa: S102 - sandboxed personal tool
    except SyntaxError as e:
        raise ValueError(f"Python syntax error: {e}") from e
    cls = ns.get("Strategy")
    # a user class named Strategy that shadows the base is fine (duck-typed)
    if isinstance(cls, type) and callable(getattr(cls, "on_bar", None)) and cls is not Strategy:
        return cls
    subs = [v for v in ns.values()
            if isinstance(v, type) and issubclass(v, Strategy) and v is not Strategy
            and callable(getattr(v, "on_bar", None))]
    if len(subs) == 1:
        return subs[0]
    raise ValueError('Define a class named "Strategy" with an on_bar(self, ctx) method '
                     '(it may subclass Strategy or stand alone)')


def run_py_strategy(
    source: str,
    bars: list[dict],
    cash: Optional[float] = None,
    leverage: int = 100,
    symbol: str = "",
    timeframe: str = "1h",
    initial_capital: float = 100_000.0,
    qty_pct: float = 100.0,
) -> dict:
    """Run a Python strategy over bars — mirrors run_strategy's result shape."""
    from app.pine.runtime import bars_to_df  # local import to avoid cycle

    cls = _load_strategy_class(source)
    df = bars_to_df(bars)
    if df.empty:
        raise ValueError("No bars provided")

    cfg = get_market_config(symbol)
    initial = float(cash) if cash else initial_capital
    broker = VirtualBroker(cfg, initial, leverage)
    strat = cls()
    queued: list[PendingOrder] = []
    ctx = Ctx(df, broker, queued, qty_pct, initial)

    if hasattr(strat, "init"):
        strat.init(ctx)

    n = len(df)
    equity_curve: list[dict] = []
    for i in range(n):
        bar = {**bars[i]}
        if queued:
            fill_now = list(queued)
            queued.clear()  # ctx._queued is the SAME list — clear in place
            broker.on_bar(bar, open_orders=fill_now)
        else:
            broker.on_bar(bar)

        ctx.i = i
        ctx._bar_seq += 1
        ctx._call_idx = 0
        try:
            strat.on_bar(ctx)
        except Exception as e:  # noqa: BLE001 - surface user errors clearly
            raise ValueError(f"{type(e).__name__} in on_bar at bar {i}: {e}") from e

        equity_curve.append({"time": bar["time"], "value": broker.equity(float(df["close"].iloc[i]))})

    # ---- result assembly (same shape as Pine run_strategy) ----
    reason_map = {"order": "signal", "sl": "stop", "tp": "target"}
    trades = []
    for e in broker.events:
        if e["type"] in ("position_closed", "position_reduced"):
            notional = e["entry_price"] * e["closed_size"] * cfg.multiplier
            trades.append({
                "entry_time": e["entry_time"], "exit_time": e["exit_time"],
                "side": e["side"], "size": e["closed_size"],
                "entry_price": e["entry_price"], "exit_price": e["exit_price"],
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
            "unrealized": broker.unrealized(float(df["close"].iloc[-1])),
        }

    peak = initial
    dd_curve = []
    for pt in equity_curve:
        peak = max(peak, pt["value"])
        dd_curve.append({"time": pt["time"], "value": (pt["value"] / peak - 1.0) * 100.0})

    tf_minutes = {"1m": 1, "5m": 5, "15m": 15, "30m": 30, "1h": 60, "4h": 240,
                  "1d": 1440, "1w": 10080}.get(timeframe, 60)
    metrics = compute_metrics(equity_curve, trades, initial, 525_600.0 / tf_minutes, open_position)
    metrics["bars_processed"] = n

    return {
        "name": getattr(strat, "name", cls.__name__),
        "kind": "pystrategy",
        "initial_capital": initial,
        "leverage": leverage,
        "metrics": metrics,
        "equity_curve": equity_curve,
        "drawdown_curve": dd_curve,
        "trades": trades,
        "open_position": open_position,
    }
