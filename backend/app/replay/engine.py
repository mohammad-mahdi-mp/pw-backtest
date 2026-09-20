"""Virtual broker for bar-by-bar replay simulation.

Pure logic — no DB. The API layer snapshots DB state into a broker, runs it
over bars, then persists the emitted events.

Event types
-----------
- order_filled      {order_id, side, size, order_type, price, time}
- position_opened   {side, size, entry_price, entry_time, stop_loss, take_profit, commission}
- position_increased{size, entry_price (new avg), added_size, time, commission}
- position_reduced  {closed chunk realized; open trade shrinks}  -> API creates a closed Trade row
- position_closed   {exit_price, exit_time, pnl (net), reason: order|sl|tp}
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Optional

from app.replay.markets import MarketConfig


@dataclass
class Position:
    side: str  # long | short
    size: float
    entry_price: float
    entry_time: datetime
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    entry_commission: float = 0.0  # commissions paid when opening/increasing (for net pnl reporting)

    @property
    def direction(self) -> int:
        return 1 if self.side == "long" else -1


@dataclass
class PendingOrder:
    id: int
    side: str        # buy | sell
    order_type: str  # limit | stop | market
    size: float
    price: Optional[float] = None
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None


class VirtualBroker:
    def __init__(
        self,
        cfg: MarketConfig,
        balance: float,
        leverage: int = 100,
        position: Optional[Position] = None,
        pending: Optional[list[PendingOrder]] = None,
    ):
        self.cfg = cfg
        self.balance = balance
        self.leverage = leverage
        self.position = position
        self.pending = pending or []
        self.events: list[dict[str, Any]] = []
        self.last_price: Optional[float] = None

    # ---------- helpers ----------
    @property
    def spread(self) -> float:
        return self.cfg.spread_pips * self.cfg.pip_size

    @property
    def slippage(self) -> float:
        return self.cfg.slippage_pips * self.cfg.pip_size

    def commission(self, size: float, price: float) -> float:
        if self.cfg.commission_mode == "per_lot":
            return abs(size) * self.cfg.commission_value
        if self.cfg.commission_mode == "percent":
            return abs(size) * price * self.cfg.multiplier * self.cfg.commission_value
        return 0.0

    def buy_fill(self, ref: float) -> float:
        return ref + self.spread / 2 + self.slippage

    def sell_fill(self, ref: float) -> float:
        return ref - self.spread / 2 - self.slippage

    def unrealized(self, mark: Optional[float] = None) -> float:
        if not self.position:
            return 0.0
        m = mark if mark is not None else self.last_price
        if m is None:
            return 0.0
        p = self.position
        return p.direction * (m - p.entry_price) * p.size * self.cfg.multiplier

    def equity(self, mark: Optional[float] = None) -> float:
        return self.balance + self.unrealized(mark)

    def used_margin(self) -> float:
        if not self.position:
            return 0.0
        p = self.position
        return p.size * self.cfg.multiplier * p.entry_price / self.leverage

    def free_margin(self, ref: Optional[float] = None) -> float:
        return self.equity(ref if ref is not None else self.last_price) - self.used_margin()

    def can_submit(self, size: float, ref_price: float) -> tuple[bool, str]:
        if size <= 0:
            return False, "Size must be positive"
        notional = size * self.cfg.multiplier * ref_price
        required = notional / self.leverage
        free = self.free_margin(ref_price)
        if required > free + 1e-9:
            return False, f"Insufficient margin: need {required:.2f}, free {free:.2f}"
        return True, ""

    # ---------- order entry ----------
    def market_fill(self, order: PendingOrder, ref_price: float, t: datetime) -> None:
        px = self.buy_fill(ref_price) if order.side == "buy" else self.sell_fill(ref_price)
        self.events.append({
            "type": "order_filled", "order_id": order.id, "side": order.side,
            "size": order.size, "order_type": order.order_type, "price": px, "time": t.isoformat(),
        })
        self._apply_fill(order, px, t)

    # ---------- bar processing ----------
    def on_bar(self, bar: dict, open_orders: Optional[list[PendingOrder]] = None) -> None:
        """Process one bar.

        open_orders: market orders queued at the previous bar's close — they
        fill at this bar's OPEN (Pine strategy semantics), before pending
        limit/stop fills and SL/TP checks.
        """
        t = datetime.utcfromtimestamp(bar["time"])
        o, h, l, c = bar["open"], bar["high"], bar["low"], bar["close"]

        # 0) queued market orders fill at this bar's open
        if open_orders:
            for od in open_orders:
                px = self.buy_fill(o) if od.side == "buy" else self.sell_fill(o)
                self.events.append({
                    "type": "order_filled", "order_id": od.id, "side": od.side,
                    "size": od.size, "order_type": od.order_type, "price": px, "time": t.isoformat(),
                })
                self._apply_fill(od, px, t)

        # 1) pending limit/stop fills
        still: list[PendingOrder] = []
        for od in self.pending:
            px = self._trigger_price(od, o, h, l)
            if px is None:
                still.append(od)
            else:
                self.events.append({
                    "type": "order_filled", "order_id": od.id, "side": od.side,
                    "size": od.size, "order_type": od.order_type, "price": px, "time": t.isoformat(),
                })
                self._apply_fill(od, px, t)
        self.pending = still

        # 2) SL/TP on position (may have just opened from a fill above)
        if self.position:
            self._check_exits(o, h, l, t)

        # 3) mark-to-market
        self.last_price = c

    def _trigger_price(self, od: PendingOrder, o: float, h: float, l: float) -> Optional[float]:
        p = od.price
        if p is None:
            return None
        if od.order_type == "limit":
            if od.side == "buy":
                if o <= p:
                    return o
                if l <= p:
                    return p
            else:
                if o >= p:
                    return o
                if h >= p:
                    return p
        elif od.order_type == "stop":
            if od.side == "buy":
                if o >= p:
                    return o + self.slippage
                if h >= p:
                    return p + self.slippage
            else:
                if o <= p:
                    return o - self.slippage
                if l <= p:
                    return p - self.slippage
        return None

    def _check_exits(self, o: float, h: float, l: float, t: datetime) -> None:
        p = self.position
        assert p is not None
        exit_px: Optional[float] = None
        reason: Optional[str] = None

        if p.side == "long":
            if p.stop_loss is not None and (o <= p.stop_loss or l <= p.stop_loss):
                exit_px = o if o <= p.stop_loss else p.stop_loss - self.slippage
                reason = "sl"
            elif p.take_profit is not None and (o >= p.take_profit or h >= p.take_profit):
                exit_px = o if o >= p.take_profit else p.take_profit
                reason = "tp"
        else:
            if p.stop_loss is not None and (o >= p.stop_loss or h >= p.stop_loss):
                exit_px = o if o >= p.stop_loss else p.stop_loss + self.slippage
                reason = "sl"
            elif p.take_profit is not None and (o <= p.take_profit or l <= p.take_profit):
                exit_px = o if o <= p.take_profit else p.take_profit
                reason = "tp"

        if exit_px is not None and reason is not None:
            self._close_position(exit_px, t, reason)

    # ---------- position mutation ----------
    def _close_position(self, exit_px: float, t: datetime, reason: str, size: Optional[float] = None) -> None:
        p = self.position
        assert p is not None
        size_before = p.size
        closed = size_before if size is None else min(size, size_before)
        gross = p.direction * (exit_px - p.entry_price) * closed * self.cfg.multiplier
        exit_comm = self.commission(closed, exit_px)
        # proportional share of entry commission for the closed chunk
        entry_comm_chunk = p.entry_commission * (closed / size_before) if size_before > 0 else 0.0
        p.entry_commission -= entry_comm_chunk
        self.balance += gross - exit_comm
        remaining = size_before - closed
        self.events.append({
            "type": "position_closed" if remaining <= 1e-9 else "position_reduced",
            "reason": reason,
            "side": p.side,
            "entry_price": p.entry_price,
            "entry_time": p.entry_time.isoformat(),
            "exit_price": exit_px,
            "exit_time": t.isoformat(),
            "closed_size": closed,
            "remaining_size": max(remaining, 0.0),
            "pnl": gross - exit_comm - entry_comm_chunk,
            "commission": exit_comm + entry_comm_chunk,
        })
        if remaining <= 1e-9:
            self.position = None
        else:
            p.size = remaining

    def _apply_fill(self, order: PendingOrder, px: float, t: datetime) -> None:
        want_long = order.side == "buy"
        o_size = order.size

        # open new
        if self.position is None:
            comm = self.commission(o_size, px)
            self.balance -= comm
            self.position = Position(
                side="long" if want_long else "short",
                size=o_size,
                entry_price=px,
                entry_time=t,
                stop_loss=order.stop_loss,
                take_profit=order.take_profit,
                entry_commission=comm,
            )
            self.events.append({
                "type": "position_opened", "side": self.position.side, "size": o_size,
                "entry_price": px, "entry_time": t.isoformat(),
                "stop_loss": order.stop_loss, "take_profit": order.take_profit,
                "commission": comm,
            })
            return

        p = self.position
        same_dir = (p.side == "long") == want_long

        if same_dir:
            # increase: weighted-average entry
            new_size = p.size + o_size
            avg = (p.entry_price * p.size + px * o_size) / new_size
            comm = self.commission(o_size, px)
            self.balance -= comm
            p.size = new_size
            p.entry_price = avg
            p.entry_commission += comm
            if order.stop_loss is not None:
                p.stop_loss = order.stop_loss
            if order.take_profit is not None:
                p.take_profit = order.take_profit
            self.events.append({
                "type": "position_increased", "size": new_size, "entry_price": avg,
                "added_size": o_size, "time": t.isoformat(), "commission": comm,
            })
        else:
            # reduce / close / flip
            pos_size = p.size
            self._close_position(px, t, "order", size=o_size)
            if o_size > pos_size + 1e-9:
                rem = o_size - pos_size
                comm = self.commission(rem, px)
                self.balance -= comm
                self.position = Position(
                    side="long" if want_long else "short",
                    size=rem,
                    entry_price=px,
                    entry_time=t,
                    stop_loss=order.stop_loss,
                    take_profit=order.take_profit,
                    entry_commission=comm,
                )
                self.events.append({
                    "type": "position_opened", "side": self.position.side, "size": rem,
                    "entry_price": px, "entry_time": t.isoformat(),
                    "stop_loss": order.stop_loss, "take_profit": order.take_profit,
                    "commission": comm,
                })
