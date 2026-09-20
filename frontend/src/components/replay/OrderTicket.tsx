import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppStore } from "@/stores/app";
import { api } from "@/lib/api";
import { useMutation } from "@tanstack/react-query";

export function OrderTicket() {
  const { sessionId } = useAppStore();
  const [size, setSize] = useState(0.1);
  const [sl, setSl] = useState<string>("");
  const [tp, setTp] = useState<string>("");

  const placeMut = useMutation({
    mutationFn: (side: "buy" | "sell") =>
      api.placeOrder(sessionId!, {
        side,
        type: "market",
        size,
        stop_loss: sl ? parseFloat(sl) : null,
        take_profit: tp ? parseFloat(tp) : null,
      }),
  });

  return (
    <Card className="rounded-none border-r-0 border-t-0 bg-tvpanel">
      <CardHeader className="p-2">
        <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Order</CardTitle>
      </CardHeader>
      <CardContent className="p-2 space-y-2 text-xs">
        <div>
          <label className="text-muted-foreground">Size (lot)</label>
          <Input type="number" value={size} step={0.01} onChange={(e) => setSize(parseFloat(e.target.value) || 0)} className="h-7" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-muted-foreground">SL</label>
            <Input value={sl} onChange={(e) => setSl(e.target.value)} className="h-7" placeholder="price" />
          </div>
          <div>
            <label className="text-muted-foreground">TP</label>
            <Input value={tp} onChange={(e) => setTp(e.target.value)} className="h-7" placeholder="price" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 pt-1">
          <Button variant="bull" size="sm" disabled={!sessionId} onClick={() => placeMut.mutate("buy")}>BUY</Button>
          <Button variant="bear" size="sm" disabled={!sessionId} onClick={() => placeMut.mutate("sell")}>SELL</Button>
        </div>
        {placeMut.isSuccess && <div className="text-bull text-[11px]">Order placed ✓</div>}
        {placeMut.isError && <div className="text-bear text-[11px]">{(placeMut.error as Error).message}</div>}
      </CardContent>
    </Card>
  );
}
