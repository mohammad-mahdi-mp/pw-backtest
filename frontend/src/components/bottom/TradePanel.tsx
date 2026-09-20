import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAppStore } from "@/stores/app";
import { cn } from "@/lib/utils";
import { fmtNumber, fmtEpoch } from "@/lib/format";

export function TradePanel() {
  return (
    <div className="w-full h-full flex min-h-0">
      <OrderTicketForm />
      <OrdersTable />
    </div>
  );
}

function OrderTicketForm() {
  const { sessionId } = useAppStore();
  const { symbol } = useAppStore();
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
      await api.placeOrder(sessionId, {
        side,
        type: orderType,
        size,
        price: orderType === "market" ? null : parseFloat(price) || null,
        stop_loss: sl ? parseFloat(sl) : null,
        take_profit: tp ? parseFloat(tp) : null,
      });
      setResult({ ok: true, text: `${side.toUpperCase()} ${size} ${symbol} placed ✓` });
    } catch (e: any) {
      setResult({ ok: false, text: e?.message || "Order failed" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-[280px] shrink-0 border-r border-tvborder p-3 flex flex-col gap-2 text-[12px]">
      <div className="text-[11px] uppercase tracking-wider text-[#787b86]">Order Ticket</div>

      {/* side toggle */}
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

      {result && (
        <div className={cn("text-[11px]", result.ok ? "text-bull" : "text-bear")}>{result.text}</div>
      )}
    </div>
  );
}

function OrdersTable() {
  const { sessionId } = useAppStore();
  const { data } = useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => api.getSession(sessionId!),
    enabled: !!sessionId,
    refetchInterval: 2000,
  });

  const orders = data?.orders ?? [];
  const trades = data?.trades ?? [];

  return (
    <div className="flex-1 min-w-0 overflow-y-auto">
      {/* Orders */}
      <div className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wider text-[#787b86]">
        Orders ({orders.length})
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
            <th className="px-3 py-1 font-normal">Status</th>
          </tr>
        </thead>
        <tbody>
          {orders.length === 0 && (
            <tr>
              <td colSpan={7} className="px-3 py-3 text-[#787b86]">
                No orders. Start a replay session and place orders from the ticket.
              </td>
            </tr>
          )}
          {orders.map((o) => (
            <tr key={o.id} className="border-t border-tvborder/60">
              <td className={cn("px-3 py-1.5 font-semibold", o.side === "buy" ? "text-bull" : "text-bear")}>
                {o.side.toUpperCase()}
              </td>
              <td className="px-3 py-1.5 text-[#d1d4dc]">{o.type}</td>
              <td className="px-3 py-1.5 text-[#d1d4dc]">{fmtNumber(o.size, 2)}</td>
              <td className="px-3 py-1.5 text-[#d1d4dc]">{o.price ?? "—"}</td>
              <td className="px-3 py-1.5 text-bear">{o.stop_loss ?? "—"}</td>
              <td className="px-3 py-1.5 text-bull">{o.take_profit ?? "—"}</td>
              <td className="px-3 py-1.5 text-[#787b86]">{o.status}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Trades */}
      <div className="px-3 pt-4 pb-1 text-[11px] uppercase tracking-wider text-[#787b86]">
        Closed Trades ({trades.length})
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
          </tr>
        </thead>
        <tbody>
          {trades.length === 0 && (
            <tr>
              <td colSpan={6} className="px-3 py-3 text-[#787b86]">
                No closed trades yet.
              </td>
            </tr>
          )}
          {trades.map((t) => (
            <tr key={t.id} className="border-t border-tvborder/60">
              <td className={cn("px-3 py-1.5 font-semibold", t.side === "long" ? "text-bull" : "text-bear")}>
                {t.side.toUpperCase()}
              </td>
              <td className="px-3 py-1.5 text-[#d1d4dc]">{fmtNumber(t.size, 2)}</td>
              <td className="px-3 py-1.5 text-[#d1d4dc]">{t.entry_price}</td>
              <td className="px-3 py-1.5 text-[#d1d4dc]">{t.exit_price ?? "—"}</td>
              <td className="px-3 py-1.5 text-[#787b86]">
                {t.entry_time ? fmtEpoch(new Date(t.entry_time).getTime() / 1000, false) : "—"}
              </td>
              <td className={cn("px-3 py-1.5 font-semibold", t.pnl >= 0 ? "text-bull" : "text-bear")}>
                {t.pnl >= 0 ? "+" : ""}{fmtNumber(t.pnl, 2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
