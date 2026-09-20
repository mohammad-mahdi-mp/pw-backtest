import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Card as UICard } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAppStore } from "@/stores/app";

export function PositionsPanel() {
  const { sessionId } = useAppStore();
  const { data } = useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => api.getSession(sessionId!),
    enabled: !!sessionId,
    refetchInterval: 2000,
  });

  const orders = data?.orders || [];
  const trades = data?.trades || [];

  return (
    <Card className="rounded-none border-r-0 border-t-0 bg-tvpanel">
      <CardHeader className="p-2">
        <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
          {data ? (
            <span>Equity: <span className="text-slate-100">${(data.equity || 0).toFixed(2)}</span></span>
          ) : "Positions"}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-2 text-xs space-y-2">
        <div>
          <div className="text-muted-foreground mb-1">Pending/Filled Orders ({orders.length})</div>
          <div className="space-y-1 max-h-32 overflow-auto no-scrollbar">
            {orders.length === 0 && <div className="text-muted-foreground text-[11px]">No orders.</div>}
            {orders.map((o: any) => (
              <div key={o.id} className="flex justify-between bg-tvbg px-2 py-1 rounded">
                <span className={o.side === "buy" ? "text-bull" : "text-bear"}>{o.side.toUpperCase()} {o.size}</span>
                <span className="text-muted-foreground">{o.status}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground mb-1">Trades ({trades.length})</div>
          <div className="space-y-1 max-h-48 overflow-auto no-scrollbar">
            {trades.length === 0 && <div className="text-muted-foreground text-[11px]">No closed trades.</div>}
            {trades.map((t: any) => (
              <div key={t.id} className={`flex justify-between bg-tvbg px-2 py-1 rounded ${t.pnl >= 0 ? "text-bull" : "text-bear"}`}>
                <span>{t.side} {t.size}</span>
                <span>{t.pnl.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
