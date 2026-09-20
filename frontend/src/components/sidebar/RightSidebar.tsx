import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Star } from "lucide-react";
import { api } from "@/lib/api";
import { useAppStore } from "@/stores/app";
import { useLayoutStore } from "@/stores/layout";
import { cn } from "@/lib/utils";

const DEFAULTS = [
  { name: "BTC/USDT", market_type: "crypto" },
  { name: "ETH/USDT", market_type: "crypto" },
  { name: "SOL/USDT", market_type: "crypto" },
  { name: "XRP/USDT", market_type: "crypto" },
  { name: "EUR/USD", market_type: "forex" },
  { name: "GBP/USD", market_type: "forex" },
  { name: "USD/JPY", market_type: "forex" },
  { name: "GBP/JPY", market_type: "forex" },
  { name: "XAU/USD", market_type: "forex" },
  { name: "AAPL", market_type: "stock" },
  { name: "TSLA", market_type: "stock" },
  { name: "NVDA", market_type: "stock" },
];

const MARKET_COLOR: Record<string, string> = {
  crypto: "#f0b90b",
  forex: "#2962ff",
  stock: "#26a69a",
};

export function RightSidebar() {
  const symbol = useAppStore((s) => s.symbol);
  const setSymbol = useLayoutStore((s) => s.setActiveSymbol);
  const [q, setQ] = useState("");

  const { data: serverSymbols } = useQuery({
    queryKey: ["symbols"],
    queryFn: api.listSymbols,
    initialData: [],
  });

  const list = useMemo(() => {
    const merged = [...DEFAULTS];
    (serverSymbols || []).forEach((s: any) => {
      if (!merged.find((d) => d.name === s.name)) merged.push({ name: s.name, market_type: s.market_type });
    });
    const query = q.trim().toLowerCase();
    return (query ? merged.filter((s) => s.name.toLowerCase().includes(query)) : merged).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [q, serverSymbols]);

  return (
    <aside className="w-[240px] shrink-0 bg-tvpanel border-l border-tvborder flex flex-col">
      <div className="h-[30px] shrink-0 flex items-center gap-2 px-2 border-b border-tvborder">
        <Search className="w-3.5 h-3.5 text-[#787b86]" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Watchlist"
          className="flex-1 bg-transparent outline-none text-[12px] text-[#d1d4dc] placeholder:text-[#787b86]"
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        {list.map((s) => {
          const active = s.name === symbol;
          return (
            <button
              key={s.name}
              onClick={() => setSymbol(s.name)}
              className={cn(
                "w-full flex items-center gap-2 px-3 h-[30px] text-left hover:bg-[#2a2e39]",
                active && "bg-[#2a2e39]"
              )}
            >
              <Star className={cn("w-3 h-3 shrink-0", active ? "text-[#f0b90b] fill-[#f0b90b]" : "text-[#787b86]")} />
              <span className={cn("text-[12px] font-semibold flex-1", active ? "text-[#d1d4dc]" : "text-[#b2b5be]")}>
                {s.name}
              </span>
              <span
                className="text-[9px] uppercase font-bold tracking-wider"
                style={{ color: MARKET_COLOR[s.market_type] ?? "#787b86" }}
              >
                {s.market_type}
              </span>
            </button>
          );
        })}
      </div>
      <div className="h-[26px] shrink-0 border-t border-tvborder flex items-center px-3 text-[10px] text-[#787b86]">
        {list.length} symbols
      </div>
    </aside>
  );
}
