import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAppStore } from "@/stores/app";
import { cn } from "@/lib/utils";
import { fmtNumber, fmtEpoch } from "@/lib/format";
import { X, Pencil, Crosshair } from "lucide-react";
import type { OrderInfo, SessionDetail } from "@/types";

export function TradePanel() {
  return (
    <div className="w-full h-full flex min-h-0">
      <OrderTicketForm />
      <PositionsAndOrders />
    </div>
  );
}

function useSession() {
  const { sessionId } = useAppStore();
  const { data } = useQuery<SessionDetail>({
    queryKey: ["session", sessionId],
    queryFn: () => api.getSession(sessionId!),
    enabled: !!sessionId,
    refetchInterval: 1500,
  });
  return { sessionId, data };
}

function OrderTicketForm() {
  const { symbol } = useAppStore();
  const { sessionId } = useSession();
  const qc = useQueryClient();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [orderType, setOrderType] = useState("market");
  const [size, setSize] = useState(0.1);
  const [price, setPrice] = useState("");
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!sessionId) {
      setResult({ ok: false, text: "Start a Replay session first (Replay button, top bar)." });
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const r = await api.placeOrder(sessionId, {
        side,
        type: orderType,
        size,
        price: orderType === "market" ? null : parseFloat(price) || null,
        stop_loss: sl ? parseFloat(sl) : null,
        take_profit: tp ? parseFloat(tp) : null,
      });
      setResult({
        ok: true,
        text:
          r.status === "filled"
            ? `${side.toUpperCase()} ${size} ${symbol} filled @ ${r.fill_price}`
            : `${side.toUpperCase()} ${orderType} ${size} ${symbol} pending @ ${price}`,
      });
      qc.invalidateQueries({ queryKey: ["session", sessionId] });
    } catch (e: any) {
      const m = (e?.message || "").match(/"detail":"([^"]+)"/);
      setResult({ ok: false, text: m ? m[1] : e?.message || "Order failed" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-[280px] shrink-0 border-r border-tvborder p-3 flex flex-col gap-2 text-[12px] overflow-y-auto">
      <div className="text-[11px] uppercase tracking-wider text-[#787b86]">Order Ticket</div>

      <div className="grid grid-cols-2 gap-1">
        <button
          onClick={() => setSide("buy")}
          className={cn(
            "h-8 rounded text-[12px] font-bold transition-colors",
            side === "buy" ? "bg-bull text-white" : "bg-[#2a2e39] text-[#787b86] hover:text-[#d1d4dc]"
          )}
        >
          BUY
        </button>
        <button
          onClick={() => setSide("sell")}
          className={cn(
            "h-8 rounded text-[12px] font-bold transition-colors",
            side === "sell" ? "bg-bear text-white" : "bg-[#2a2e39] text-[#787b86] hover:text-[#d1d4dc]"
          )}
        >
          SELL
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[#787b86]">Type</span>
          <select
            value={orderType}
            onChange={(e) => setOrderType(e.target.value)}
            className="h-7 bg-[#131722] border border-tvborder rounded px-1.5 text-[#d1d4dc] outline-none"
          >
            <option value="market">Market</option>
            <option value="limit">Limit</option>
            <option value="stop">Stop</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[#787b86]">Size (lot)</span>
          <input
            type="number"
            step="0.01"
            value={size}
            onChange={(e) => setSize(parseFloat(e.target.value) || 0)}
            className="h-7 bg-[#131722] border border-tvborder rounded px-1.5 text-[#d1d4dc] outline-none"
          />
        </label>
      </div>

      {orderType !== "market" && (
        <label className="flex flex-col gap-1">
          <span className="text-[#787b86]">Price</span>
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="entry price"
            className="h-7 bg-[#131722] border border-tvborder rounded px-1.5 text-[#d1d4dc] outline-none placeholder:text-[#787b86]/60"
          />
        </label>
      )}

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[#787b86]">Stop Loss</span>
          <input
            value={sl}
            onChange={(e) => setSl(e.target.value)}
            placeholder="price"
            className="h-7 bg-[#131722] border border-tvborder rounded px-1.5 text-[#d1d4dc] outline-none placeholder:text-[#787b86]/60"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[#787b86]">Take Profit</span>
          <input
            value={tp}
            onChange={(e) => setTp(e.target.value)}
            placeholder="price"
            className="h-7 bg-[#131722] border border-tvborder rounded px-1.5 text-[#d1d4dc] outline-none placeholder:text-[#787b86]/60"
          />
        </label>
      </div>

      <button
        onClick={submit}
        disabled={busy}
        className={cn(
          "h-8 rounded text-[12px] font-bold text-white disabled:opacity-50 mt-1",
          side === "buy" ? "bg-bull hover:bg-bull/85" : "bg-bear hover:bg-bear/85"
        )}
      >
        {busy ? "Placing…" : `${side === "buy" ? "BUY" : "SELL"} ${size} ${symbol}`}
      </button>

      <div className="text-[10px] text-[#787b86] leading-relaxed">
        Market orders fill instantly at the current bar close (+spread/slippage). Limit/Stop orders wait
        for the price. SL/TP trigger automatically on every revealed bar. Press <span className="text-[#d1d4dc]">X</span> to close the position.
      </div>

      {result && (
        <div className={cn("text-[11px]", result.ok ? "text-bull" : "text-bear")}>{result.text}</div>
      )}
    </div>
  );
}

function PositionsAndOrders() {
  const { sessionId, data } = useSession();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [slEdit, setSlEdit] = useState("");
  const [tpEdit, setTpEdit] = useState("");
  const [editMsg, setEditMsg] = useState("");

  const pos = data?.position ?? null;
  const pending: OrderInfo[] = data?.pending_orders ?? [];
  const trades = data?.trades ?? [];

  const invalidate = () => sessionId && qc.invalidateQueries({ queryKey: ["session", sessionId] });

  const closePos = async () => {
    if (!sessionId || !pos || busy) return;
    setBusy(true);
    try {
      await api.closePosition(sessionId);
      invalidate();
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (oid: number) => {
    if (!sessionId) return;
    await api.cancelOrder(sessionId, oid);
    invalidate();
  };

  const saveStops = async () => {
    if (!sessionId || !pos) return;
    setBusy(true);
    setEditMsg("");
    try {
      await api.updatePosition(sessionId, {
        stop_loss: slEdit.trim() ? parseFloat(slEdit) : null,
        take_profit: tpEdit.trim() ? parseFloat(tpEdit) : null,
      });
      setEditMsg("SL/TP updated ✓");
      invalidate();
    } catch {
      setEditMsg("Update failed");
    } finally {
      setBusy(false);
    }
  };

  const editNote = async (tid: number, current: string) => {
    if (!sessionId) return;
    const note = window.prompt("Trade journal note:", current);
    if (note === null) return;
    await api.setTradeNote(sessionId, tid, note);
    invalidate();
  };

  return (
    <div className="flex-1 min-w-0 overflow-y-auto">
      {/* Open position */}
      <div className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wider text-[#787b86]">
        Position {pos ? "" : "— flat"}
      </div>
      {pos ? (
        <div className="mx-3 mb-2 p-2 rounded border border-tvborder bg-[#131722] flex items-center gap-3 text-[12px]">
          <span
            className={cn(
              "px-2 py-0.5 rounded font-bold text-[11px]",
              pos.side === "long" ? "bg-bull/15 text-bull" : "bg-bear/15 text-bear"
            )}
          >
            {pos.side === "long" ? "LONG" : "SHORT"} {fmtNumber(pos.size, 2)}
          </span>
          <span className="text-[#787b86]">
            Entry <span className="text-[#d1d4dc] font-mono">{pos.entry_price}</span>
          </span>
          {pos.mark_price != null && (
            <span className="text-[#787b86]">
              Mark <span className="text-[#d1d4dc] font-mono">{pos.mark_price}</span>
            </span>
          )}
          <span className={cn("font-bold font-mono", pos.unrealized >= 0 ? "text-bull" : "text-bear")}>
            {pos.unrealized >= 0 ? "+" : ""}${fmtNumber(pos.unrealized, 2)} ({pos.unrealized_pips >= 0 ? "+" : ""}
            {fmtNumber(pos.unrealized_pips, 1)}p)
          </span>

          <div className="flex items-center gap-1 ml-2">
            <input
              value={slEdit}
              onChange={(e) => setSlEdit(e.target.value)}
              placeholder={pos.stop_loss != null ? String(pos.stop_loss) : "SL"}
              className="w-20 h-6 bg-[#1e222d] border border-tvborder rounded px-1.5 text-[11px] text-bear outline-none placeholder:text-[#787b86]/70"
            />
            <input
              value={tpEdit}
              onChange={(e) => setTpEdit(e.target.value)}
              placeholder={pos.take_profit != null ? String(pos.take_profit) : "TP"}
              className="w-20 h-6 bg-[#1e222d] border border-tvborder rounded px-1.5 text-[11px] text-bull outline-none placeholder:text-[#787b86]/70"
            />
            <button
              onClick={saveStops}
              disabled={busy}
              className="h-6 px-2 rounded bg-[#2a2e39] text-[11px] text-[#d1d4dc] hover:bg-[#363a45] disabled:opacity-50"
            >
              Set
            </button>
            {editMsg && <span className="text-[10px] text-bull">{editMsg}</span>}
          </div>

          <button
            onClick={closePos}
            disabled={busy}
            className="ml-auto h-7 px-3 rounded bg-bear text-white text-[11px] font-bold hover:bg-bear/85 disabled:opacity-50"
            title="Close at market (X)"
          >
            CLOSE
          </button>
        </div>
      ) : (
        <div className="px-3 pb-2 text-[11px] text-[#787b86]">
          No open position — place an order from the ticket.
        </div>
      )}

      {/* Pending orders */}
      <div className="px-3 pb-1 text-[11px] uppercase tracking-wider text-[#787b86]">
        Pending Orders ({pending.length})
      </div>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-[#787b86] text-left">
            <th className="px-3 py-1 font-normal">Side</th>
            <th className="px-3 py-1 font-normal">Type</th>
            <th className="px-3 py-1 font-normal">Size</th>
            <th className="px-3 py-1 font-normal">Price</th>
            <th className="px-3 py-1 font-normal">SL</th>
            <th className="px-3 py-1 font-normal">TP</th>
            <th className="px-3 py-1 font-normal w-16"></th>
          </tr>
        </thead>
        <tbody>
          {pending.length === 0 && (
            <tr>
              <td colSpan={7} className="px-3 py-2 text-[#787b86] text-[11px]">
                No pending orders.
              </td>
            </tr>
          )}
          {pending.map((o) => (
            <tr key={o.id} className="border-t border-tvborder/60">
              <td className={cn("px-3 py-1.5 font-semibold", o.side === "buy" ? "text-bull" : "text-bear")}>
                {o.side.toUpperCase()}
              </td>
              <td className="px-3 py-1.5 text-[#d1d4dc]">{o.type}</td>
              <td className="px-3 py-1.5 text-[#d1d4dc]">{fmtNumber(o.size, 2)}</td>
              <td className="px-3 py-1.5 text-[#d1d4dc] font-mono">{o.price ?? "—"}</td>
              <td className="px-3 py-1.5 text-bear font-mono">{o.stop_loss ?? "—"}</td>
              <td className="px-3 py-1.5 text-bull font-mono">{o.take_profit ?? "—"}</td>
              <td className="px-3 py-1.5">
                <button
                  onClick={() => cancel(o.id)}
                  className="text-[#787b86] hover:text-[#ef5350]"
                  title="Cancel order"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Order history */}
      {(data?.orders ?? []).length > 0 && (
        <>
          <div className="px-3 pt-3 pb-1 text-[11px] uppercase tracking-wider text-[#787b86]">
            Order History ({data!.orders.length})
          </div>
          <table className="w-full text-[12px]">
            <tbody>
              {data!.orders.map((o) => (
                <tr key={`h${o.id}`} className="border-t border-tvborder/40 text-[#787b86]">
                  <td className="px-3 py-1 w-16">
                    <span className={o.side === "buy" ? "text-bull" : "text-bear"}>{o.side.toUpperCase()}</span>
                  </td>
                  <td className="px-3 py-1 w-16">{o.type}</td>
                  <td className="px-3 py-1 w-16">{fmtNumber(o.size, 2)}</td>
                  <td className="px-3 py-1 font-mono">{o.fill_price ?? o.price ?? "—"}</td>
                  <td className="px-3 py-1">{o.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* Closed trades */}
      <div className="px-3 pt-4 pb-1 text-[11px] uppercase tracking-wider text-[#787b86]">
        Trades ({trades.filter((t) => t.exit_time).length})
      </div>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-[#787b86] text-left">
            <th className="px-3 py-1 font-normal">Side</th>
            <th className="px-3 py-1 font-normal">Size</th>
            <th className="px-3 py-1 font-normal">Entry</th>
            <th className="px-3 py-1 font-normal">Exit</th>
            <th className="px-3 py-1 font-normal">Opened</th>
            <th className="px-3 py-1 font-normal">P&L</th>
            <th className="px-3 py-1 font-normal w-10"></th>
          </tr>
        </thead>
        <tbody>
          {trades.filter((t) => t.exit_time).length === 0 && (
            <tr>
              <td colSpan={7} className="px-3 py-2 text-[#787b86] text-[11px]">
                No closed trades yet.
              </td>
            </tr>
          )}
          {trades
            .filter((t) => t.exit_time)
            .map((t) => (
              <tr key={t.id} className="border-t border-tvborder/60">
                <td className={cn("px-3 py-1.5 font-semibold", t.side === "long" ? "text-bull" : "text-bear")}>
                  {t.side.toUpperCase()}
                </td>
                <td className="px-3 py-1.5 text-[#d1d4dc]">{fmtNumber(t.size, 2)}</td>
                <td className="px-3 py-1.5 text-[#d1d4dc] font-mono">{t.entry_price}</td>
                <td className="px-3 py-1.5 text-[#d1d4dc] font-mono">{t.exit_price ?? "—"}</td>
                <td className="px-3 py-1.5 text-[#787b86]">
                  {t.entry_time ? fmtEpoch(new Date(t.entry_time).getTime() / 1000, false) : "—"}
                </td>
                <td className={cn("px-3 py-1.5 font-semibold font-mono", t.pnl >= 0 ? "text-bull" : "text-bear")}>
                  {t.pnl >= 0 ? "+" : ""}${fmtNumber(t.pnl, 2)}
                </td>
                <td className="px-3 py-1.5">
                  <button
                    onClick={() => editNote(t.id, t.note)}
                    className={cn("hover:text-primary", t.note ? "text-primary" : "text-[#787b86]")}
                    title={t.note || "Add journal note"}
                  >
                    {t.note ? <Pencil className="w-3.5 h-3.5" /> : <Crosshair className="w-3.5 h-3.5" />}
                  </button>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
