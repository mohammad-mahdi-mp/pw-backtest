import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAppStore } from "@/stores/app";
import { fmtMoney, fmtNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export function AccountPanel() {
  const { sessionId } = useAppStore();
  const { data } = useQuery({
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

  const trades = data.trades ?? [];
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const winRate = trades.length ? (wins.length / trades.length) * 100 : 0;

  const stats = [
    { label: "Equity", value: fmtMoney(data.equity ?? 0), color: "#d1d4dc" },
    { label: "Cash", value: fmtMoney(data.cash ?? 0), color: "#d1d4dc" },
    { label: "Leverage", value: `1:${data.leverage}`, color: "#d1d4dc" },
    { label: "Closed Trades", value: String(trades.length), color: "#d1d4dc" },
    {
      label: "Win Rate",
      value: `${fmtNumber(winRate, 1)}%`,
      color: winRate >= 50 ? "#26a69a" : "#ef5350",
    },
    { label: "Wins / Losses", value: `${wins.length} / ${losses.length}`, color: "#d1d4dc" },
    {
      label: "Total P&L",
      value: `${totalPnl >= 0 ? "+" : ""}${fmtMoney(totalPnl)}`,
      color: totalPnl >= 0 ? "#26a69a" : "#ef5350",
    },
    { label: "Symbol", value: data.symbol, color: "#d1d4dc" },
    { label: "Timeframe", value: data.timeframe, color: "#d1d4dc" },
  ];

  return (
    <div className="p-4 grid grid-cols-3 gap-3 max-w-[720px]">
      {stats.map((s) => (
        <div key={s.label} className="bg-[#131722] border border-tvborder rounded p-3">
          <div className="text-[11px] text-[#787b86] uppercase tracking-wide">{s.label}</div>
          <div className={cn("text-[18px] font-bold mt-0.5")} style={{ color: s.color }}>
            {s.value}
          </div>
        </div>
      ))}
    </div>
  );
}
