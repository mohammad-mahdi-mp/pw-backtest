import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAppStore } from "@/stores/app";
import { fmtMoney, fmtNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SessionDetail } from "@/types";

export function AccountPanel() {
  const { sessionId } = useAppStore();
  const { data } = useQuery<SessionDetail>({
    queryKey: ["session", sessionId],
    queryFn: () => api.getSession(sessionId!),
    enabled: !!sessionId,
    refetchInterval: 2500,
  });

  if (!sessionId || !data) {
    return (
      <div className="flex items-center justify-center h-full text-[13px] text-[#787b86]">
        No replay session active — press <span className="text-primary mx-1">Replay</span> in the top bar to start.
      </div>
    );
  }

  const s = data.stats;
  const pos = data.position;

  const cards = [
    { label: "Equity", value: fmtMoney(data.equity), color: data.equity >= s.balance ? "#26a69a" : "#ef5350" },
    { label: "Balance", value: fmtMoney(s.balance), color: "#d1d4dc" },
    { label: "Unrealized", value: pos ? `${pos.unrealized >= 0 ? "+" : ""}${fmtMoney(pos.unrealized)}` : "—", color: pos ? (pos.unrealized >= 0 ? "#26a69a" : "#ef5350") : "#787b86" },
    { label: "Leverage", value: `1:${data.leverage}`, color: "#d1d4dc" },
    { label: "Closed Trades", value: String(s.closed_trades), color: "#d1d4dc" },
    { label: "Win Rate", value: `${fmtNumber(s.win_rate, 1)}%`, color: s.win_rate >= 50 ? "#26a69a" : "#ef5350" },
    { label: "Wins / Losses", value: `${s.wins} / ${s.losses}`, color: "#d1d4dc" },
    { label: "Avg Win", value: fmtMoney(s.avg_win), color: "#26a69a" },
    { label: "Avg Loss", value: fmtMoney(s.avg_loss), color: "#ef5350" },
    {
      label: "Profit Factor",
      value: s.profit_factor != null ? fmtNumber(s.profit_factor, 2) : "—",
      color: s.profit_factor != null && s.profit_factor >= 1 ? "#26a69a" : "#ef5350",
    },
    { label: "Total P&L", value: `${s.total_pnl >= 0 ? "+" : ""}${fmtMoney(s.total_pnl)}`, color: s.total_pnl >= 0 ? "#26a69a" : "#ef5350" },
    { label: "Costs", value: `${data.commission_mode === "per_lot" ? `$${fmtNumber(data.commission_value, 2)}/lot` : data.commission_mode === "percent" ? `${fmtNumber(data.commission_value * 100, 2)}%` : "none"} · spread ${fmtNumber(data.spread_pips, 1)}p`, color: "#787b86", small: true },
  ];

  return (
    <div className="p-3 grid grid-cols-4 gap-2 max-w-[900px]">
      {cards.map((c) => (
        <div key={c.label} className="bg-[#131722] border border-tvborder rounded p-2.5">
          <div className="text-[10px] text-[#787b86] uppercase tracking-wide">{c.label}</div>
          <div
            className={cn("font-bold mt-0.5", c.small ? "text-[12px]" : "text-[17px]")}
            style={{ color: c.color }}
          >
            {c.value}
          </div>
        </div>
      ))}
    </div>
  );
}
