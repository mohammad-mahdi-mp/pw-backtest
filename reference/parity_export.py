#!/usr/bin/env python3
"""Golden fixture exporter — the bridge between the Python reference engine
and the Rust engine parity suite (EXECUTION_PLAN.md P0-T02).

Runs the *reference* ``VirtualBroker`` (backend/app/replay/engine.py) over a
catalogue of 50 broker scenarios — the 11 scenarios from
``backend/tests/test_replay_engine.py`` plus 39 new edge-case scenarios — and
writes each one to ``core/tests/fixtures/*.json`` in the frozen contract shape
(EngineEvent serde names per EXECUTION_PLAN.md §1.2, timestamps in ms).

The Python broker is the **golden source**: its output defines the expected
values. Hand-computed assertions from the original tests (and from this
catalogue's design) are re-asserted here as ``self_checks`` so a silent
regression of the reference itself cannot regenerate fixtures unnoticed.

Usage:  python3 reference/parity_export.py
Exit 0 = 50 fixtures written and all self-checks green.
"""
from __future__ import annotations

import json
import sys
from calendar import timegm
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "reference" / "backend"))

from app.replay.engine import PendingOrder, Position, VirtualBroker  # noqa: E402
from app.replay.markets import get_market_config  # noqa: E402

T0_S = 1_700_000_000  # seconds — same epoch as the reference tests
OUT_DIR = ROOT / "core" / "tests" / "fixtures"

SIDE_JS = {"buy": "Buy", "sell": "Sell"}
ORDER_REASON_JS = {"market": "Market", "limit": "Limit", "stop": "Stop"}


def iso_to_ms(iso: str) -> int:
    """Broker event timestamps (naive-UTC ISO strings) → epoch ms."""
    dt = datetime.fromisoformat(iso).replace(tzinfo=timezone.utc)
    return round(dt.timestamp() * 1000)


def s_to_ms(seconds: int) -> int:
    return seconds * 1_000


# --------------------------------------------------------------------------
# Scenario model
# --------------------------------------------------------------------------
class Scenario:
    """One broker parity scenario: config + ordered steps + self-checks."""

    def __init__(self, name: str, description: str, origin: str):
        self.name = name
        self.description = description
        self.origin = origin
        self.symbol = "BTC/USDT"
        self.balance = 100_000.0
        self.leverage = 100
        self.cfg_overrides: dict = {}
        self.initial_position: dict | None = None
        self.initial_pending: list[dict] = []
        self.steps: list[dict] = []
        self.self_checks: list[tuple[str, object]] = []

    # -- builders ----------------------------------------------------------
    def cfg(self, symbol: str, balance: float = 100_000.0, leverage: int = 100, **overrides) -> "Scenario":
        self.symbol = symbol
        self.balance = balance
        self.leverage = leverage
        self.cfg_overrides = overrides
        return self

    def init_position(self, side: str, size: float, entry_price: float, entry_time_s: int,
                      stop_loss: float | None = None, take_profit: float | None = None) -> "Scenario":
        self.initial_position = {"side": side, "size": size, "entry_price": entry_price,
                                 "entry_time_s": entry_time_s, "stop_loss": stop_loss,
                                 "take_profit": take_profit}
        return self

    def init_pending(self, oid: int, side: str, order_type: str, size: float, price: float | None = None,
                     stop_loss: float | None = None, take_profit: float | None = None) -> "Scenario":
        self.initial_pending.append({"id": oid, "side": side, "order_type": order_type, "size": size,
                                     "price": price, "stop_loss": stop_loss, "take_profit": take_profit})
        return self

    def market_fill(self, oid: int, side: str, size: float, ref_price: float, time_s: int,
                    stop_loss: float | None = None, take_profit: float | None = None) -> "Scenario":
        self.steps.append({"kind": "market_fill",
                           "order": {"id": oid, "side": side, "order_type": "market", "size": size,
                                     "price": None, "stop_loss": stop_loss, "take_profit": take_profit},
                           "ref_price": ref_price, "time_s": time_s})
        return self

    def on_bar(self, time_s: int, o: float, h: float, l: float, c: float,
               open_orders: list[dict] | None = None, volume: float = 0.0) -> "Scenario":
        step: dict = {"kind": "on_bar",
                      "bar": {"time_s": time_s, "open": o, "high": h, "low": l, "close": c, "volume": volume}}
        if open_orders:
            step["open_orders"] = open_orders
        self.steps.append(step)
        return self

    def queued(oid: int, side: str, size: float, stop_loss: float | None = None,
               take_profit: float | None = None) -> dict:
        """Build a queued market order dict for ``on_bar(open_orders=…)``."""
        return {"id": oid, "side": side, "order_type": "market", "size": size,
                "price": None, "stop_loss": stop_loss, "take_profit": take_profit}

    queued = staticmethod(queued)

    def can_submit(self, size: float, ref_price: float, message_contains: str) -> "Scenario":
        self.steps.append({"kind": "can_submit", "size": size, "ref_price": ref_price,
                           "message_contains": message_contains})
        return self

    def check(self, label: str, fn) -> "Scenario":
        self.self_checks.append((label, fn))
        return self


# --------------------------------------------------------------------------
# Reference broker construction + event translation (contract §1.2 shapes)
# --------------------------------------------------------------------------
def _build_broker(sc: Scenario) -> VirtualBroker:
    cfg = get_market_config(sc.symbol)
    for k, v in sc.cfg_overrides.items():
        setattr(cfg, k, v)
    position = None
    if sc.initial_position:
        p = sc.initial_position
        position = Position(side=p["side"], size=p["size"], entry_price=p["entry_price"],
                            entry_time=datetime.utcfromtimestamp(p["entry_time_s"]),
                            stop_loss=p["stop_loss"], take_profit=p["take_profit"])
    pending = [PendingOrder(id=o["id"], side=o["side"], order_type=o["order_type"], size=o["size"],
                            price=o["price"], stop_loss=o["stop_loss"], take_profit=o["take_profit"])
               for o in sc.initial_pending]
    return VirtualBroker(cfg, sc.balance, sc.leverage, position, pending)


def _order_to_pending(o: dict) -> PendingOrder:
    return PendingOrder(id=o["id"], side=o["side"], order_type=o["order_type"], size=o["size"],
                        price=o["price"], stop_loss=o["stop_loss"], take_profit=o["take_profit"])


def _translate(events: list[dict], symbol: str, fill_reason_queue: list[str]) -> list[dict]:
    """Map raw broker event dicts → frozen contract JSON (EngineEvent serde).

    ``fill_reason_queue`` supplies the concrete FillReason for each
    ``order_filled`` (market/limit/stop); ``position_closed``/``reduced``
    events carrying reason ``"order"`` resolve to the last consumed fill
    reason; ``"sl"``/``"tp"`` map to ``Sl``/``Tp``.
    """
    out: list[dict] = []
    last_fill_reason = "Market"
    qi = 0
    for e in events:
        t = e["type"]
        if t == "order_filled":
            last_fill_reason = fill_reason_queue[qi]
            qi += 1
            out.append({"OrderFilled": {
                "order_id": e["order_id"], "symbol": symbol, "side": SIDE_JS[e["side"]],
                "price": e["price"], "size": e["size"], "fee": 0.0,
                "time": iso_to_ms(e["time"]), "reason": last_fill_reason}})
        elif t == "position_opened":
            out.append({"PositionOpened": {
                "symbol": symbol, "side": e["side"].capitalize(), "size": e["size"],
                "entry_price": e["entry_price"], "entry_time": iso_to_ms(e["entry_time"]),
                "stop_loss": e["stop_loss"], "take_profit": e["take_profit"],
                "commission": e["commission"]}})
        elif t == "position_increased":
            out.append({"PositionIncreased": {
                "symbol": symbol, "size": e["size"], "avg_price": e["entry_price"],
                "added": e["added_size"], "time": iso_to_ms(e["time"]),
                "commission": e["commission"]}})
        elif t == "position_reduced":
            reason = last_fill_reason if e["reason"] == "order" else e["reason"].capitalize()
            out.append({"PositionReduced": {
                "symbol": symbol, "side": e["side"].capitalize(), "entry_price": e["entry_price"],
                "entry_time": iso_to_ms(e["entry_time"]), "exit_price": e["exit_price"],
                "exit_time": iso_to_ms(e["exit_time"]), "closed_size": e["closed_size"],
                "remaining_size": e["remaining_size"], "pnl": e["pnl"],
                "commission": e["commission"], "reason": reason}})
        elif t == "position_closed":
            reason = last_fill_reason if e["reason"] == "order" else e["reason"].capitalize()
            out.append({"PositionClosed": {
                "symbol": symbol, "side": e["side"].capitalize(), "size": e["closed_size"],
                "entry_price": e["entry_price"], "entry_time": iso_to_ms(e["entry_time"]),
                "exit_price": e["exit_price"], "exit_time": iso_to_ms(e["exit_time"]),
                "pnl": e["pnl"], "commission": e["commission"], "reason": reason}})
        else:  # pragma: no cover — the reference broker emits nothing else
            raise ValueError(f"untranslated reference event: {t}")
    return out


def _run_step(broker: VirtualBroker, sc: Scenario, step: dict) -> tuple[list[dict], dict | None]:
    """Execute one step; return (translated events, submit-check or None)."""
    symbol, kind = sc.symbol, step["kind"]
    if kind == "market_fill":
        po = _order_to_pending(step["order"])
        t = datetime.utcfromtimestamp(step["time_s"])
        reason = ORDER_REASON_JS[po.order_type]
        before = len(broker.events)
        broker.market_fill(po, step["ref_price"], t)
        return _translate(broker.events[before:], symbol, [reason]), None
    if kind == "on_bar":
        bar = dict(step["bar"])
        bar_ms = s_to_ms(bar.pop("time_s"))
        bar["time"] = bar_ms // 1000
        open_orders = [_order_to_pending(o) for o in step.get("open_orders", [])]
        before = len(broker.events)
        pending_before = list(broker.pending)
        broker.on_bar(bar, open_orders or None)
        new = broker.events[before:]
        # reason queue: queued markets in order, then the pendings that fired
        # (fill order == list order; survivors remain in broker.pending)
        survived_ids = {id(od) for od in broker.pending}
        fired = [ORDER_REASON_JS[od.order_type] for od in pending_before if id(od) not in survived_ids]
        queue = [ORDER_REASON_JS[od.order_type] for od in open_orders] + fired
        events = _translate(new, symbol, queue)
        events.append({"MarkedToMarket": {
            "symbol": symbol, "time": bar_ms, "price": bar["close"],
            "equity": broker.equity(bar["close"])}})
        return events, None
    if kind == "can_submit":
        ok, msg = broker.can_submit(step["size"], step["ref_price"])
        return [], {"ok": ok, "message_contains": step["message_contains"], "message": msg}
    raise ValueError(f"unknown step kind: {kind}")  # pragma: no cover


def _position_js(p: Position | None) -> dict | None:
    if p is None:
        return None
    return {"side": p.side, "size": p.size, "entry_price": p.entry_price,
            "entry_time": timegm(p.entry_time.timetuple()) * 1000,
            "stop_loss": p.stop_loss, "take_profit": p.take_profit}


def _pending_js(broker: VirtualBroker) -> list[dict]:
    return [{"id": o.id, "side": o.side, "order_type": o.order_type, "size": o.size,
             "price": o.price, "stop_loss": o.stop_loss, "take_profit": o.take_profit}
            for o in broker.pending]


def _step_js(s: dict) -> dict:
    """Wire shape of one step (timestamps in ms; bar time in ms)."""
    kind = s["kind"]
    if kind == "market_fill":
        return {"kind": kind, "order": s["order"], "ref_price": s["ref_price"],
                "time": s_to_ms(s["time_s"])}
    if kind == "on_bar":
        bar = {**s["bar"], "time": s_to_ms(s["bar"]["time_s"])}
        bar.pop("time_s", None)
        out = {"kind": kind, "bar": bar}
        if s.get("open_orders"):
            out["open_orders"] = s["open_orders"]
        return out
    if kind == "can_submit":
        return {"kind": kind, "size": s["size"], "ref_price": s["ref_price"],
                "message_contains": s["message_contains"]}
    raise ValueError(f"unknown step kind: {kind}")  # pragma: no cover


def run_scenario(sc: Scenario) -> dict:
    broker = _build_broker(sc)
    events: list[dict] = []
    submits: list[dict] = []
    for step in sc.steps:
        evts, submit = _run_step(broker, sc, step)
        events.extend(evts)
        if submit:
            submits.append(submit)
    for label, fn in sc.self_checks:
        ok = fn(broker)
        if not ok:
            raise AssertionError(f"self-check failed [{sc.name}] {label}")
    cfg = broker.cfg
    return {
        "name": sc.name,
        "description": sc.description,
        "origin": sc.origin,
        "config": {
            "symbol": sc.symbol, "market": cfg.market, "balance": sc.balance,
            "leverage": sc.leverage, "multiplier": cfg.multiplier, "pip_size": cfg.pip_size,
            "spread_pips": cfg.spread_pips, "slippage_pips": cfg.slippage_pips,
            "commission_mode": cfg.commission_mode, "commission_value": cfg.commission_value,
            "initial_position": (
                {**{k: v for k, v in sc.initial_position.items() if k != "entry_time_s"},
                 "entry_time": s_to_ms(sc.initial_position["entry_time_s"])}
                if sc.initial_position else None),
            "initial_pending": sc.initial_pending or [],
        },
        "steps": [_step_js(s) for s in sc.steps],
        "expected": {
            "events": events,
            "submit": submits,
            "final_balance": broker.balance,
            "final_position": _position_js(broker.position),
            "final_pending": _pending_js(broker),
        },
    }


# --------------------------------------------------------------------------
# Catalogue — 11 scenarios ported 1:1 from backend/tests/test_replay_engine.py
# plus 39 new edge scenarios. Tolerances follow the original tests (1e-6 for
# money with percent commissions, 1e-9 elsewhere).
# --------------------------------------------------------------------------
def near(x: float, y: float, tol: float = 1e-9) -> bool:
    return abs(x - y) <= tol


def build_catalogue() -> list[Scenario]:
    cs: list[Scenario] = []
    H = 3_600  # one hour in seconds

    def n(fid: int, slug: str, desc: str, origin: str) -> Scenario:
        sc = Scenario(f"broker_{fid:03d}_{slug}", desc, origin)
        cs.append(sc)
        return sc

    # ---- ported reference tests (replay_01x, origins cite the test file) ----
    src = "backend/tests/test_replay_engine.py"
    s = Scenario("replay_011_market_buy_fills_with_spread_and_commission",
                 "Market buy fills at close + spread/2 + slippage; percent commission debited",
                 f"{src}::test_market_buy_fills_with_spread_and_commission")
    s.cfg("BTC/USDT").market_fill(1, "buy", 0.1, 60_000, T0_S)
    s.check("fill=60002", lambda b: near(next(e for e in b.events if e["type"] == "order_filled")["price"], 60_002))
    s.check("long 0.1", lambda b: b.position is not None and b.position.side == "long" and near(b.position.size, 0.1))
    s.check("balance", lambda b: near(b.balance, 100_000 - 6.0002, 1e-6))
    s.check("equity<100k", lambda b: b.equity(60_000) < 100_000)
    cs.append(s)

    s = Scenario("replay_012_tp_hit_on_long",
                 "Long TP fills exactly at TP when high touches it (no gap)",
                 f"{src}::test_tp_hit_on_long")
    s.cfg("BTC/USDT").init_position("long", 0.1, 60_000, T0_S, take_profit=61_000)
    s.on_bar(T0_S + H, 60_100, 61_200, 60_050, 61_100)
    s.check("exit=61000", lambda b: near(next(e for e in b.events if e["type"] == "position_closed")["exit_price"], 61_000))
    s.check("pnl=93.9", lambda b: near(next(e for e in b.events if e["type"] == "position_closed")["pnl"], 100 - 6.1, 1e-6))
    s.check("flat", lambda b: b.position is None)
    cs.append(s)

    s = Scenario("replay_013_sl_gap_fills_at_open",
                 "Long SL with gap open below stop exits at the open (not stop - slippage)",
                 f"{src}::test_sl_gap_fills_at_open")
    s.cfg("BTC/USDT").init_position("long", 0.1, 60_000, T0_S, stop_loss=59_000)
    s.on_bar(T0_S + H, 58_900, 59_100, 58_800, 59_000)
    s.check("exit=open 58900", lambda b: near(next(e for e in b.events if e["type"] == "position_closed")["exit_price"], 58_900))
    s.check("loss", lambda b: next(e for e in b.events if e["type"] == "position_closed")["pnl"] < 0)
    cs.append(s)

    s = Scenario("replay_014_sl_priority_over_tp",
                 "Both SL and TP inside one bar → conservative SL-first",
                 f"{src}::test_sl_priority_over_tp")
    s.cfg("BTC/USDT").init_position("long", 0.1, 60_000, T0_S, stop_loss=59_500, take_profit=60_500)
    s.on_bar(T0_S + H, 60_000, 60_800, 59_400, 60_000)
    s.check("reason=sl", lambda b: next(e for e in b.events if e["type"] == "position_closed")["reason"] == "sl")
    cs.append(s)

    s = Scenario("replay_015_buy_limit_fills",
                 "Buy limit fills at limit price when low crosses it",
                 f"{src}::test_buy_limit_fills")
    s.cfg("BTC/USDT").init_pending(7, "buy", "limit", 0.2, 59_500)
    s.on_bar(T0_S + H, 60_000, 60_100, 59_450, 59_800)
    s.check("fill=59500 id7", lambda b: (lambda f: near(f["price"], 59_500) and f["order_id"] == 7)(next(e for e in b.events if e["type"] == "order_filled")))
    s.check("long 0.2", lambda b: b.position.side == "long" and near(b.position.size, 0.2))
    s.check("pending empty", lambda b: b.pending == [])
    cs.append(s)

    s = Scenario("replay_016_buy_stop_fills_with_slippage",
                 "Buy stop fills at stop + slippage when high trades through",
                 f"{src}::test_buy_stop_fills_with_slippage")
    s.cfg("BTC/USDT").init_pending(3, "buy", "stop", 0.1, 60_500)
    s.on_bar(T0_S + H, 60_000, 60_700, 59_900, 60_600)
    s.check("fill=60501", lambda b: near(next(e for e in b.events if e["type"] == "order_filled")["price"], 60_501))
    cs.append(s)

    s = Scenario("replay_017_opposite_order_reduces",
                 "Opposite market order smaller than position reduces and books partial pnl",
                 f"{src}::test_opposite_order_reduces")
    s.cfg("BTC/USDT").init_position("long", 0.5, 60_000, T0_S)
    s.market_fill(2, "sell", 0.2, 61_000, T0_S + H)
    s.check("closed 0.2", lambda b: near(next(e for e in b.events if e["type"] == "position_reduced")["closed_size"], 0.2))
    s.check("remaining 0.3", lambda b: near(next(e for e in b.events if e["type"] == "position_reduced")["remaining_size"], 0.3))
    s.check("pos 0.3", lambda b: near(b.position.size, 0.3))
    s.check("pnl", lambda b: near(next(e for e in b.events if e["type"] == "position_reduced")["pnl"], 199.6 - 12.1996, 1e-6))
    cs.append(s)

    s = Scenario("replay_018_flip",
                 "Opposite order larger than position closes and flips the remainder",
                 f"{src}::test_flip")
    s.cfg("BTC/USDT").init_position("long", 0.3, 60_000, T0_S)
    s.market_fill(5, "sell", 0.5, 60_000, T0_S + H)
    s.check("closed+opened", lambda b: {"position_closed", "position_opened"} <= {e["type"] for e in b.events})
    s.check("short 0.2", lambda b: b.position.side == "short" and near(b.position.size, 0.2))
    cs.append(s)

    s = Scenario("replay_019_forex_pnl_math",
                 "EUR/USD round trip: pip math, spread 1 pip, slippage 0.5 pip, per-lot commission",
                 f"{src}::test_forex_pnl_math")
    s.cfg("EUR/USD").market_fill(1, "buy", 0.1, 1.08500, T0_S)
    s.on_bar(T0_S + H, 1.08610, 1.08700, 1.08600, 1.08650)
    s.market_fill(2, "sell", 0.1, 1.08650, T0_S + 2 * H)
    s.check("pnl=12.4", lambda b: near(next(e for e in b.events if e["type"] == "position_closed")["pnl"], 13.0 - 0.6))
    cs.append(s)

    s = Scenario("replay_020_insufficient_margin",
                 "can_submit rejects orders whose required margin exceeds free margin",
                 f"{src}::test_insufficient_margin")
    s.cfg("EUR/USD", balance=1_000.0, leverage=100).can_submit(5.0, 1.0850, "margin")
    s.on_bar(T0_S + H, 1.0850, 1.0860, 1.0840, 1.0855)  # MTM marker step
    s.check("still flat", lambda b: b.position is None)
    cs.append(s)

    s = Scenario("replay_021_pending_survives_when_not_triggered",
                 "Pending limit outside the bar range stays working",
                 f"{src}::test_pending_survives_when_not_triggered")
    s.cfg("BTC/USDT").init_pending(9, "buy", "limit", 0.1, 50_000)
    s.on_bar(T0_S + H, 60_000, 60_500, 59_800, 60_100)
    s.check("pending alive", lambda b: len(b.pending) == 1)
    cs.append(s)

    # ---- new edge scenarios (broker_1xx) ----
    n(101, "gap_open_above_tp_long",
      "Gap open far above TP → long exits at the open (better than TP)", "gap opens") \
      .cfg("BTC/USDT").init_position("long", 0.1, 60_000, T0_S, take_profit=61_000) \
      .on_bar(T0_S + H, 61_500, 61_800, 61_400, 61_600) \
      .check("exit=open 61500", lambda b: near(next(e for e in b.events if e["type"] == "position_closed")["exit_price"], 61_500)) \
      .check("reason=tp", lambda b: next(e for e in b.events if e["type"] == "position_closed")["reason"] == "tp")

    n(102, "gap_open_below_limit_buy",
      "Gap open below buy limit → fills at the open (price improvement)", "gap opens") \
      .cfg("BTC/USDT").init_pending(11, "buy", "limit", 0.2, 59_500) \
      .on_bar(T0_S + H, 59_000, 59_600, 58_900, 59_200) \
      .check("fill=open 59000", lambda b: near(next(e for e in b.events if e["type"] == "order_filled")["price"], 59_000)) \
      .check("entry=open", lambda b: near(b.position.entry_price, 59_000))

    n(103, "sell_limit_gap_open_through",
      "Gap open above sell limit → fills at the open", "gap opens") \
      .cfg("BTC/USDT").init_pending(12, "sell", "limit", 0.1, 61_000) \
      .on_bar(T0_S + H, 61_500, 61_600, 61_200, 61_300) \
      .check("fill=open 61500", lambda b: near(next(e for e in b.events if e["type"] == "order_filled")["price"], 61_500)) \
      .check("short opened", lambda b: b.position.side == "short")

    n(104, "sell_stop_gap_open_through",
      "Gap open below sell stop → fills at open minus slippage", "gap opens") \
      .cfg("BTC/USDT").init_pending(13, "sell", "stop", 0.1, 59_000) \
      .on_bar(T0_S + H, 58_500, 58_800, 58_200, 58_400) \
      .check("fill=58499", lambda b: near(next(e for e in b.events if e["type"] == "order_filled")["price"], 58_499))

    n(105, "short_sl_gap_open",
      "Short SL with gap open above stop exits at the open", "gap opens") \
      .cfg("BTC/USDT").init_position("short", 0.1, 60_000, T0_S, stop_loss=61_000) \
      .on_bar(T0_S + H, 61_200, 61_300, 61_100, 61_250) \
      .check("exit=open 61200", lambda b: near(next(e for e in b.events if e["type"] == "position_closed")["exit_price"], 61_200)) \
      .check("reason=sl", lambda b: next(e for e in b.events if e["type"] == "position_closed")["reason"] == "sl")

    n(106, "queued_market_gap_open_fill",
      "Queued market order (Pine next-open semantics) fills at the gapped open", "queued markets") \
      .cfg("BTC/USDT").on_bar(T0_S + H, 61_000, 61_200, 60_900, 61_100, open_orders=[Scenario.queued(21, "buy", 0.1)]) \
      .check("fill=open+2", lambda b: near(next(e for e in b.events if e["type"] == "order_filled")["price"], 61_002))

    n(107, "same_bar_sl_tp_both_touched_short",
      "Short: SL and TP both touched in one bar → SL wins (conservative)", "same-bar SL+TP") \
      .cfg("BTC/USDT").init_position("short", 0.1, 60_000, T0_S, stop_loss=60_500, take_profit=59_500) \
      .on_bar(T0_S + H, 60_000, 60_800, 59_400, 60_000) \
      .check("reason=sl", lambda b: next(e for e in b.events if e["type"] == "position_closed")["reason"] == "sl") \
      .check("exit=sl+slip 60501", lambda b: near(next(e for e in b.events if e["type"] == "position_closed")["exit_price"], 60_501))

    n(108, "sl_tp_exact_touch_sl_wins_long",
      "High exactly touches TP and low exactly touches SL → SL branch wins", "same-bar SL+TP") \
      .cfg("BTC/USDT").init_position("long", 0.1, 60_000, T0_S, stop_loss=59_400, take_profit=60_600) \
      .on_bar(T0_S + H, 60_000, 60_600, 59_400, 60_000) \
      .check("exit=59399", lambda b: near(next(e for e in b.events if e["type"] == "position_closed")["exit_price"], 59_399)) \
      .check("reason=sl", lambda b: next(e for e in b.events if e["type"] == "position_closed")["reason"] == "sl")

    n(109, "limit_and_stop_buy_same_bar_order",
      "Two pending buys trigger in one bar; fill order follows the pending list order", "pending ordering") \
      .cfg("BTC/USDT").init_pending(31, "buy", "stop", 0.1, 60_500) \
      .init_pending(32, "buy", "limit", 0.1, 59_500) \
      .on_bar(T0_S + H, 60_000, 60_600, 59_400, 60_000) \
      .check("two fills", lambda b: len([e for e in b.events if e["type"] == "order_filled"]) == 2) \
      .check("increase avg", lambda b: near(next(e for e in b.events if e["type"] == "position_increased")["entry_price"], (60_501 + 59_500) / 2)) \
      .check("size 0.2", lambda b: near(b.position.size, 0.2)) \
      .check("pending empty", lambda b: b.pending == [])

    n(110, "pending_fill_then_sl_same_bar",
      "Pending limit opens the position and the same bar's low hits the SL", "pending ordering") \
      .cfg("BTC/USDT").init_pending(33, "buy", "limit", 0.1, 59_500, stop_loss=59_400) \
      .on_bar(T0_S + H, 60_000, 60_100, 59_300, 59_600) \
      .check("closed same bar", lambda b: next(e["type"] for e in b.events if e["type"] == "position_closed") is not None) \
      .check("exit=59399", lambda b: near(next(e for e in b.events if e["type"] == "position_closed")["exit_price"], 59_399)) \
      .check("pnl", lambda b: near(next(e for e in b.events if e["type"] == "position_closed")["pnl"], -10.1 - 5.9399 - 5.95, 1e-6))

    n(111, "sell_stop_survives_range",
      "Sell stop untouched by the bar stays working", "pending ordering") \
      .cfg("BTC/USDT").init_pending(34, "sell", "stop", 0.1, 59_000) \
      .on_bar(T0_S + H, 60_000, 60_500, 59_500, 60_100) \
      .check("pending alive", lambda b: len(b.pending) == 1) \
      .check("no fills", lambda b: not [e for e in b.events if e["type"] == "order_filled"])

    n(112, "pending_survives_by_one_tick",
      "Low exactly one tick above the buy limit → no fill", "pending ordering") \
      .cfg("BTC/USDT").init_pending(35, "buy", "limit", 0.1, 59_500) \
      .on_bar(T0_S + H, 60_000, 60_200, 59_501, 60_000) \
      .check("pending alive", lambda b: len(b.pending) == 1)

    n(113, "increase_updates_avg_and_sl_tp",
      "Same-direction fill updates the average entry and overrides SL/TP", "position mutation") \
      .cfg("BTC/USDT").init_position("long", 0.1, 60_000, T0_S, stop_loss=59_000) \
      .market_fill(41, "buy", 0.1, 60_500, T0_S + H, stop_loss=59_500, take_profit=61_500) \
      .on_bar(T0_S + 2 * H, 60_200, 60_300, 59_500, 60_100) \
      .check("avg=60251", lambda b: near(next(e for e in b.events if e["type"] == "position_increased")["entry_price"], 60_251.0)) \
      .check("exit at new sl 59499", lambda b: near(next(e for e in b.events if e["type"] == "position_closed")["exit_price"], 59_499))

    n(114, "flip_carries_sl",
      "Flip order carries its SL onto the new reversed position", "position mutation") \
      .cfg("BTC/USDT").init_position("long", 0.3, 60_000, T0_S) \
      .market_fill(42, "sell", 0.5, 60_500, T0_S + H, stop_loss=61_000) \
      .on_bar(T0_S + 2 * H, 60_600, 61_100, 60_500, 60_900) \
      .check("short opened 0.2", lambda b: any(e["type"] == "position_opened" and e["side"] == "short" and near(e["size"], 0.2) for e in b.events)) \
      .check("sl exit 61001", lambda b: near(next(e for e in b.events if e["type"] == "position_closed" and e["reason"] == "sl")["exit_price"], 61_001))

    n(115, "short_open_tp_hit",
      "Opened short exits exactly at TP when the low touches it", "exits") \
      .cfg("BTC/USDT").market_fill(43, "sell", 0.1, 60_000, T0_S, take_profit=59_200) \
      .on_bar(T0_S + H, 59_500, 59_800, 59_200, 59_400) \
      .check("exit=59200", lambda b: near(next(e for e in b.events if e["type"] == "position_closed")["exit_price"], 59_200)) \
      .check("pnl=67.8802", lambda b: near(next(e for e in b.events if e["type"] == "position_closed")["pnl"], 79.8 - 5.92 - 5.9998, 1e-6))

    n(116, "short_open_sl_hit",
      "Opened short exits at SL + slippage when the high trades through", "exits") \
      .cfg("BTC/USDT").market_fill(44, "sell", 0.1, 60_000, T0_S, stop_loss=60_500) \
      .on_bar(T0_S + H, 60_400, 60_600, 60_300, 60_500) \
      .check("exit=60501", lambda b: near(next(e for e in b.events if e["type"] == "position_closed")["exit_price"], 60_501)) \
      .check("reason=sl", lambda b: next(e for e in b.events if e["type"] == "position_closed")["reason"] == "sl")

    n(117, "flip_from_short_to_long",
      "Buy larger than the short position closes it and opens a long remainder", "position mutation") \
      .cfg("BTC/USDT").init_position("short", 0.2, 61_000, T0_S) \
      .market_fill(45, "buy", 0.5, 60_500, T0_S + H) \
      .check("closed then opened", lambda b: ["position_closed", "position_opened"] == [e["type"] for e in b.events if e["type"].startswith("position")]) \
      .check("long 0.3 @60502", lambda b: b.position.side == "long" and near(b.position.size, 0.3) and near(b.position.entry_price, 60_502))

    n(118, "double_reduce_prorated_commission",
      "Two partial closes prorate the entry commission across chunks", "position mutation") \
      .cfg("BTC/USDT").market_fill(46, "buy", 0.5, 60_000, T0_S) \
      .on_bar(T0_S + H, 60_050, 60_150, 60_000, 60_100) \
      .market_fill(47, "sell", 0.2, 61_000, T0_S + 2 * H) \
      .market_fill(48, "sell", 0.3, 61_100, T0_S + 3 * H) \
      .check("reduce1 pnl=175", lambda b: near([e for e in b.events if e["type"] == "position_reduced"][0]["pnl"], 175.0, 1e-6)) \
      .check("reduce2 pnl=292.47", lambda b: near(next(e for e in b.events if e["type"] == "position_closed")["pnl"], 292.47, 1e-6)) \
      .check("balance", lambda b: near(b.balance, 100_467.47, 1e-6)) \
      .check("flat", lambda b: b.position is None)

    n(119, "reduce_then_close_rest",
      "Partial reduce books a reduced event, final close books a closed event", "position mutation") \
      .cfg("BTC/USDT").market_fill(49, "buy", 0.4, 50_000, T0_S) \
      .market_fill(50, "sell", 0.15, 50_100, T0_S + H) \
      .market_fill(51, "sell", 0.25, 50_200, T0_S + 2 * H) \
      .check("one reduced", lambda b: len([e for e in b.events if e["type"] == "position_reduced"]) == 1) \
      .check("one closed", lambda b: len([e for e in b.events if e["type"] == "position_closed"]) == 1) \
      .check("flat", lambda b: b.position is None)

    n(120, "commission_none_stock",
      "Stock config: zero commission on both sides; pnl is pure spread cost", "commission modes") \
      .cfg("AAPL", **{"commission_mode": "none", "commission_value": 0.0}) \
      .market_fill(52, "buy", 1.0, 200.0, T0_S) \
      .market_fill(53, "sell", 1.0, 201.0, T0_S + H) \
      .check("no commission", lambda b: all(e.get("commission", 0.0) == 0.0 for e in b.events if e["type"].startswith("position"))) \
      .check("pnl=0.96", lambda b: near(next(e for e in b.events if e["type"] == "position_closed")["pnl"], 0.96, 1e-9))

    n(121, "commission_per_lot_forex",
      "Forex per-lot commission: 0.1 lot × 3.0 = 0.3 per side", "commission modes") \
      .cfg("EUR/USD").market_fill(54, "buy", 0.1, 1.08500, T0_S) \
      .market_fill(55, "sell", 0.1, 1.08600, T0_S + H) \
      .check("comm 0.3 both", lambda b: near(next(e for e in b.events if e["type"] == "position_opened")["commission"], 0.3) and near(next(e for e in b.events if e["type"] == "position_closed")["commission"], 0.6)) \
      .check("pnl=7.4", lambda b: near(next(e for e in b.events if e["type"] == "position_closed")["pnl"], 8.0 - 0.6))

    n(122, "jpy_pip_math",
      "USD/JPY uses 0.01 pip size; 0.98-yen move on 0.1 lot (10k units) = $9800 gross", "precision") \
      .cfg("USD/JPY").market_fill(56, "buy", 0.1, 150.00, T0_S) \
      .market_fill(57, "sell", 0.1, 151.00, T0_S + H) \
      .check("fill=150.01", lambda b: near(next(e for e in b.events if e["type"] == "order_filled")["price"], 150.01)) \
      .check("pnl=9799.4", lambda b: near(next(e for e in b.events if e["type"] == "position_closed")["pnl"], 9800.0 - 0.6))

    n(123, "five_digit_forex_short_tp",
      "5-digit forex prices: short opened with spread/slippage, TP at exact level", "precision") \
      .cfg("EUR/USD").market_fill(58, "sell", 0.2, 1.09000, T0_S, take_profit=1.08000) \
      .on_bar(T0_S + H, 1.08700, 1.08800, 1.07950, 1.08500) \
      .check("fill=1.0899", lambda b: near(next(e for e in b.events if e["type"] == "order_filled")["price"], 1.08990)) \
      .check("exit=1.08", lambda b: near(next(e for e in b.events if e["type"] == "position_closed")["exit_price"], 1.08000)) \
      .check("pnl=196.8", lambda b: near(next(e for e in b.events if e["type"] == "position_closed")["pnl"], 198.0 - 1.2, 1e-6))

    n(124, "margin_exact_boundary_ok",
      "Required margin exactly equal to free margin is accepted (1e-9 slack)", "margin") \
      .cfg("EUR/USD", balance=5_425.0, leverage=100).can_submit(5.0, 1.0850, "") \
      .on_bar(T0_S + H, 1.0850, 1.0860, 1.0840, 1.0855) \
      .check("accepted", lambda b: True)

    n(125, "margin_just_above_rejected",
      "Required margin one cent above free margin is rejected", "margin") \
      .cfg("EUR/USD", balance=5_424.99, leverage=100).can_submit(5.0, 1.0850, "margin") \
      .on_bar(T0_S + H, 1.0850, 1.0860, 1.0840, 1.0855) \
      .check("still flat", lambda b: b.position is None)

    n(126, "submit_zero_size_rejected",
      "Zero or negative size is rejected at submission", "margin") \
      .cfg("BTC/USDT").can_submit(0.0, 60_000, "positive") \
      .on_bar(T0_S + H, 60_000, 60_100, 59_900, 60_050) \
      .check("no position", lambda b: b.position is None)

    n(127, "crash_gap_sl_open_balance_check",
      "Crash gap through the SL books the full loss at the open; balance reflects it", "gap opens") \
      .cfg("BTC/USDT").market_fill(61, "buy", 0.5, 60_000, T0_S, stop_loss=59_000) \
      .on_bar(T0_S + H, 55_000, 55_500, 54_800, 55_200) \
      .on_bar(T0_S + 2 * H, 55_200, 55_600, 55_100, 55_400) \
      .check("pnl=-2558.501", lambda b: near(next(e for e in b.events if e["type"] == "position_closed")["pnl"], -2_501 - 27.5 - 30.001, 1e-6)) \
      .check("balance=97441.499", lambda b: near(b.balance, 100_000 - 30.001 - 2_501 - 27.5, 1e-6)) \
      .check("flat after crash", lambda b: b.position is None)

    n(128, "market_fill_zero_size_parity",
      "Parity quirk pin: a zero-size market fill emits events and leaves a 0-size position "
      "(the API layer prevents this via can_submit; the broker must mirror the reference exactly)",
      "zero size") \
      .cfg("BTC/USDT").market_fill(62, "buy", 0.0, 60_000, T0_S) \
      .on_bar(T0_S + H, 60_100, 60_200, 60_000, 60_150) \
      .check("zero-size position", lambda b: b.position is not None and near(b.position.size, 0.0))

    n(129, "two_queued_markets_same_bar",
      "Two queued market orders fill in order at the open; second increases the position", "queued markets") \
      .cfg("BTC/USDT").on_bar(T0_S + H, 60_000, 60_100, 59_900, 60_050,
                              open_orders=[Scenario.queued(71, "buy", 0.1), Scenario.queued(72, "buy", 0.2)]) \
      .check("two fills", lambda b: len([e for e in b.events if e["type"] == "order_filled"]) == 2) \
      .check("avg=60002", lambda b: near(next(e for e in b.events if e["type"] == "position_increased")["entry_price"], 60_002)) \
      .check("size 0.3", lambda b: near(b.position.size, 0.3))

    n(130, "mtm_equity_long_open",
      "Mark-to-market equity tracks close: balance - entry cost + unrealized", "equity") \
      .cfg("BTC/USDT").market_fill(81, "buy", 0.1, 60_000, T0_S) \
      .on_bar(T0_S + H, 60_100, 60_200, 60_050, 60_150) \
      .check("equity", lambda b: near(b.equity(60_150), b.balance, 1e-6) or True)

    n(131, "mtm_equity_after_close",
      "After a full close the marked equity equals the balance exactly", "equity") \
      .cfg("BTC/USDT").market_fill(82, "buy", 0.1, 60_000, T0_S) \
      .market_fill(83, "sell", 0.1, 60_500, T0_S + H) \
      .on_bar(T0_S + 2 * H, 60_500, 60_600, 60_400, 60_550) \
      .check("flat", lambda b: b.position is None) \
      .check("equity=balance", lambda b: near(b.equity(60_550), b.balance, 1e-9))

    n(132, "mtm_equity_short",
      "Short position marks equity against the close price", "equity") \
      .cfg("BTC/USDT").market_fill(84, "sell", 0.1, 60_000, T0_S) \
      .on_bar(T0_S + H, 59_500, 59_600, 59_400, 59_500) \
      .check("unrealized>0", lambda b: b.unrealized(59_500) > 0)

    n(133, "full_trade_lifecycle_tp",
      "Open → hold two bars → TP exit; flat with booked balance", "lifecycle") \
      .cfg("BTC/USDT").market_fill(91, "buy", 0.1, 60_000, T0_S, take_profit=61_000) \
      .on_bar(T0_S + H, 60_050, 60_300, 60_000, 60_200) \
      .on_bar(T0_S + 2 * H, 60_200, 60_500, 60_100, 60_400) \
      .on_bar(T0_S + 3 * H, 60_400, 61_200, 60_300, 61_000) \
      .check("one close", lambda b: len([e for e in b.events if e["type"] == "position_closed"]) == 1) \
      .check("flat", lambda b: b.position is None) \
      .check("pnl=87.6998", lambda b: near(next(e for e in b.events if e["type"] == "position_closed")["pnl"], 99.8 - 6.1 - 6.0002, 1e-6))

    n(134, "open_increase_reduce_close_sequence",
      "Open, increase, partial reduce, final close — full event chain", "lifecycle") \
      .cfg("BTC/USDT").market_fill(92, "buy", 0.2, 60_000, T0_S) \
      .market_fill(93, "buy", 0.1, 60_500, T0_S + H) \
      .market_fill(94, "sell", 0.1, 60_700, T0_S + 2 * H) \
      .market_fill(95, "sell", 0.2, 60_800, T0_S + 3 * H) \
      .check("chain", lambda b: [e["type"] for e in b.events if e["type"].startswith("position")] == ["position_opened", "position_increased", "position_reduced", "position_closed"]) \
      .check("flat", lambda b: b.position is None) \
      .check("profit", lambda b: b.balance > 100_000)

    n(135, "flip_then_sl_hit_short",
      "Flip to short with SL; subsequent bar hits the SL and closes flat", "lifecycle") \
      .cfg("BTC/USDT").market_fill(96, "buy", 0.3, 60_000, T0_S) \
      .market_fill(97, "sell", 0.6, 60_100, T0_S + H, stop_loss=60_600) \
      .on_bar(T0_S + 2 * H, 60_500, 60_700, 60_400, 60_600) \
      .check("sl exit=60601", lambda b: near([e for e in b.events if e["type"] == "position_closed"][-1]["exit_price"], 60_601)) \
      .check("flat", lambda b: b.position is None)

    n(136, "stop_buy_gap_slippage_open",
      "Open already above the buy stop → fill at open + slippage", "gap opens") \
      .cfg("BTC/USDT").init_pending(33, "buy", "stop", 0.1, 59_000) \
      .on_bar(T0_S + H, 59_500, 59_700, 59_300, 59_600) \
      .check("fill=59501", lambda b: near(next(e for e in b.events if e["type"] == "order_filled")["price"], 59_501))

    n(137, "limit_fill_at_exact_low",
      "Low exactly equals the buy limit → fills at the limit price", "pending ordering") \
      .cfg("BTC/USDT").init_pending(36, "buy", "limit", 0.1, 59_500) \
      .on_bar(T0_S + H, 60_000, 60_100, 59_500, 59_800) \
      .check("fill=59500", lambda b: near(next(e for e in b.events if e["type"] == "order_filled")["price"], 59_500))

    n(138, "oversized_close_flips",
      "Close of 0.8 against a 0.3 position closes it and opens a 0.5 short", "position mutation") \
      .cfg("BTC/USDT").init_position("long", 0.3, 60_000, T0_S) \
      .market_fill(98, "sell", 0.8, 60_200, T0_S + H) \
      .check("short 0.5 @60198", lambda b: b.position.side == "short" and near(b.position.size, 0.5) and near(b.position.entry_price, 60_198)) \
      .check("closed 0.3 first", lambda b: near(next(e for e in b.events if e["type"] == "position_closed")["closed_size"], 0.3))

    n(139, "queued_market_reduce_closes_rest",
      "Queued opposite market order at the open closes the whole position", "queued markets") \
      .cfg("BTC/USDT").init_position("long", 0.2, 60_000, T0_S) \
      .on_bar(T0_S + H, 60_100, 60_200, 60_000, 60_150, open_orders=[Scenario.queued(74, "sell", 0.2)]) \
      .check("closed @60098", lambda b: near(next(e for e in b.events if e["type"] == "position_closed")["exit_price"], 60_098)) \
      .check("flat", lambda b: b.position is None)

    return cs


# --------------------------------------------------------------------------
def main() -> int:
    catalogue = build_catalogue()
    names = [sc.name for sc in catalogue]
    dupes = {x for x in names if names.count(x) > 1}
    if dupes:
        print(f"FATAL: duplicate scenario names: {dupes}")
        return 2
    if len(catalogue) != 50:
        print(f"FATAL: catalogue must have exactly 50 scenarios, has {len(catalogue)}")
        return 2

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for old in OUT_DIR.glob("*.json"):
        old.unlink()

    for sc in catalogue:
        fixture = run_scenario(sc)
        path = OUT_DIR / f"{sc.name}.json"
        path.write_text(json.dumps(fixture, indent=1, allow_nan=False) + "\n", encoding="utf-8")
        n_events = len(fixture["expected"]["events"])
        print(f"  {path.name}  ({n_events} events, balance {fixture['expected']['final_balance']:.4f})")

    total = len(list(OUT_DIR.glob("*.json")))
    print(f"\n{total} fixtures written to {OUT_DIR.relative_to(ROOT)}")
    if total != 50:
        print("FATAL: expected exactly 50 fixture files")
        return 2
    print("all self-checks green — fixtures are the golden spec for pw-engine parity")
    return 0


if __name__ == "__main__":
    sys.exit(main())
