import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useAppStore } from "@/stores/app";

export function Watchlist() {
  const { data: symbols } = useQuery({ queryKey: ["symbols"], queryFn: api.listSymbols, initialData: [] });
  const { symbol: active, setSymbol } = useAppStore();

  const defaults = [
    { name: "BTC/USDT", market_type: "crypto", provider: "ccxt" },
    { name: "ETH/USDT", market_type: "crypto", provider: "ccxt" },
    { name: "EUR/USD", market_type: "forex", provider: "oanda" },
    { name: "GBP/JPY", market_type: "forex", provider: "oanda" },
    { name: "AAPL", market_type: "stock", provider: "yahoo" },
    { name: "TSLA", market_type: "stock", provider: "yahoo" },
  ];

  const list = symbols && symbols.length ? symbols : defaults;

  return (
    <Card className="rounded-none border-t-0 border-l-0 h-full bg-tvpanel">
      <CardHeader className="p-2">
        <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Watchlist</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="text-sm">
          {list.map((s: any) => (
            <li
              key={s.name}
              onClick={() => setSymbol(s.name)}
              className={`px-3 py-1.5 cursor-pointer flex justify-between hover:bg-tvbg ${
                active === s.name ? "bg-tvbg border-l-2 border-primary" : ""
              }`}
            >
              <span>{s.name}</span>
              <span className="text-[10px] text-muted-foreground uppercase">{s.market_type}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
