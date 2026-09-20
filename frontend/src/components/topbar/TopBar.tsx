import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Activity, Settings, Database, Download } from "lucide-react";
import { useAppStore } from "@/stores/app";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useState } from "react";

const TIMEFRAMES = ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"];

export function TopBar() {
  const { symbol, setSymbol, timeframe, setTimeframe } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const backfillMut = useMutation({ mutationFn: api.backfill });

  const handleBackfill = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const provider = symbol.includes("/") ? "ccxt" : "yahoo";
      const exchange = provider === "ccxt" ? "binance" : undefined;
      const r = await backfillMut.mutateAsync({ symbol, timeframe, provider, exchange });
      setMessage({ ok: true, text: `Downloaded ${r.downloaded} candles for ${symbol} ${timeframe}` });
      setTimeout(() => window.location.reload(), 600);
    } catch (e: any) {
      const detail = e?.message || "";
      const m = detail.match(/"detail":"([^"]+)"/);
      setMessage({ ok: false, text: m ? m[1] : `Failed: ${detail.slice(0, 120)}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-tvpanel border-b border-tvborder">
      <div className="flex items-center gap-2 pr-3 border-r border-tvborder">
        <Activity className="w-5 h-5 text-primary" />
        <span className="font-semibold tracking-wide">pw-backtest</span>
      </div>
      <div className="flex items-center gap-2">
        <Input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          className="w-36 h-8"
          placeholder="Symbol"
        />
        <Select value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
          {TIMEFRAMES.map((tf) => (
            <option key={tf} value={tf}>{tf}</option>
          ))}
        </Select>
        <Button size="sm" variant="secondary" onClick={handleBackfill} disabled={loading}>
          <Download className="w-4 h-4" /> {loading ? "Loading…" : "Load Data"}
        </Button>
        {message && (
          <span className={`text-xs ${message.ok ? "text-bull" : "text-bear"} max-w-md truncate`}>
            {message.text}
          </span>
        )}
      </div>
      <div className="flex-1" />
      <Button size="sm" variant="ghost"><Database className="w-4 h-4" /></Button>
      <Button size="sm" variant="ghost"><Settings className="w-4 h-4" /></Button>
    </div>
  );
}
