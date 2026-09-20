import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
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
  { name: "MSFT", market_type: "stock" },
  { name: "NVDA", market_type: "stock" },
];

const MARKET_LABEL: Record<string, string> = {
  crypto: "Crypto",
  forex: "Forex",
  stock: "Stock",
};

export function SymbolSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const symbol = useAppStore((s) => s.symbol);
  const setActiveSymbol = useLayoutStore((s) => s.setActiveSymbol);
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: serverSymbols } = useQuery({
    queryKey: ["symbols"],
    queryFn: api.listSymbols,
    initialData: [],
    enabled: open,
  });

  const list = useMemo(() => {
    const merged = [...DEFAULTS];
    (serverSymbols || []).forEach((s: any) => {
      if (!merged.find((d) => d.name === s.name)) merged.push({ name: s.name, market_type: s.market_type });
    });
    const query = q.trim().toLowerCase();
    const filtered = query ? merged.filter((s) => s.name.toLowerCase().includes(query)) : merged;
    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }, [q, serverSymbols]);

  useEffect(() => {
    if (open) {
      setQ("");
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  if (!open) return null;

  const select = (name: string) => {
    setActiveSymbol(name);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative w-[480px] max-w-[92vw] bg-tvpanel border border-tvborder rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-tvborder">
          <Search className="w-4 h-4 text-[#787b86]" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && list.length) select(list[0].name);
              if (e.key === "Escape") onClose();
            }}
            placeholder="Search symbol…"
            className="flex-1 bg-transparent outline-none text-sm text-[#d1d4dc] placeholder:text-[#787b86]"
          />
          <button onClick={onClose} className="text-[#787b86] hover:text-[#d1d4dc]">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="max-h-[380px] overflow-y-auto py-1">
          {list.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-[#787b86]">
              No matches. Type a symbol (e.g. BTC/USDT, EUR/USD, AAPL) and use “Load Data”.
            </div>
          )}
          {list.map((s) => (
            <button
              key={s.name}
              onClick={() => select(s.name)}
              className={cn(
                "w-full flex items-center justify-between px-4 py-2 text-sm hover:bg-[#2a2e39]",
                s.name === symbol && "bg-[#2a2e39]"
              )}
            >
              <span className="font-semibold text-[#d1d4dc]">{s.name}</span>
              <span className="text-[11px] text-[#787b86] uppercase tracking-wide">
                {MARKET_LABEL[s.market_type] ?? s.market_type}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
