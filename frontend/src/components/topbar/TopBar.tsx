import { useState, useEffect } from "react";
import {
  CandlestickChart,
  ChevronDown,
  FunctionSquare,
  Bell,
  History,
  Radio,
  Camera,
  Settings,
  Maximize2,
  Minimize2,
  PanelRight,
  PanelBottom,
  BarChart3,
  Plus,
} from "lucide-react";
import { useAppStore } from "@/stores/app";
import { useUIStore, type ChartType } from "@/stores/ui";
import { SymbolSearch } from "@/components/topbar/SymbolSearch";
import { IndicatorsDialog } from "@/components/topbar/IndicatorsDialog";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const QUICK_TFS = ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"];
const ALL_TFS = ["1m", "3m", "5m", "15m", "30m", "45m", "1h", "2h", "3h", "4h", "1d", "1w", "1mo"];

const CHART_TYPES: { id: ChartType; label: string }[] = [
  { id: "candles", label: "Candles" },
  { id: "bars", label: "Bars" },
  { id: "line", label: "Line" },
  { id: "area", label: "Area" },
  { id: "heikin", label: "Heikin Ashi" },
];

type Props = {
  replayActive: boolean;
  onToggleReplay: () => void;
  paperActive: boolean;
  onTogglePaper: () => void;
};

export function TopBar({ replayActive, onToggleReplay, paperActive, onTogglePaper }: Props) {
  const { symbol, setSymbol, timeframe, setTimeframe } = useAppStore();
  const {
    chartType,
    setChartType,
    showVolume,
    toggleVolume,
    rightSidebarOpen,
    toggleRightSidebar,
    bottomPanelOpen,
    toggleBottomPanel,
    setBottomTab,
  } = useUIStore();

  const [symbolOpen, setSymbolOpen] = useState(false);
  const [indOpen, setIndOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [tfOpen, setTfOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const backfillMut = useMutation({ mutationFn: api.backfill });

  useEffect(() => {
    const h = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen();
  };

  const handleBackfill = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const provider = symbol.includes("/") ? "ccxt" : "yahoo";
      const exchange = provider === "ccxt" ? "binance" : undefined;
      const r = await backfillMut.mutateAsync({ symbol, timeframe, provider, exchange });
      setMsg({ ok: true, text: `+${r.downloaded} candles` });
    } catch (e: any) {
      const m = (e?.message || "").match(/"detail":"([^"]+)"/);
      setMsg({ ok: false, text: m ? m[1] : "Download failed" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="h-[38px] shrink-0 flex items-center gap-1 px-2 bg-tvbg border-b border-tvborder">
        {/* Logo */}
        <div className="flex items-center gap-1.5 pr-2 mr-1">
          <div className="w-[22px] h-[22px] rounded bg-primary flex items-center justify-center">
            <span className="text-[11px] font-black text-white">p</span>
          </div>
          <span className="text-[13px] font-bold tracking-wide hidden sm:inline">pw-backtest</span>
        </div>

        {/* Symbol button */}
        <button
          onClick={() => setSymbolOpen(true)}
          className="flex items-center gap-1.5 h-7 px-2 rounded hover:bg-[#2a2e39] transition-colors"
          title="Symbol search (any symbol)"
        >
          <span className="text-[15px] font-bold text-[#d1d4dc]">{symbol}</span>
          <ChevronDown className="w-3.5 h-3.5 text-[#787b86]" />
        </button>
        <button
          onClick={() => setSymbolOpen(true)}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#2a2e39] text-[#787b86]"
          title="Add symbol to watchlist"
        >
          <Plus className="w-4 h-4" />
        </button>

        <div className="w-px h-5 bg-tvborder mx-1" />

        {/* Timeframes */}
        <div className="flex items-center">
          {QUICK_TFS.map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={cn(
                "h-7 min-w-[28px] px-1.5 rounded text-[13px] font-semibold transition-colors",
                timeframe === tf ? "bg-[#2a2e39] text-[#d1d4dc]" : "text-[#787b86] hover:bg-[#2a2e39]"
              )}
            >
              {tfLabel(tf)}
            </button>
          ))}
          <div className="relative">
            <button
              onClick={() => setTfOpen((v) => !v)}
              className="w-7 h-7 flex items-center justify-center rounded text-[#787b86] hover:bg-[#2a2e39]"
              title="More timeframes"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
            {tfOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setTfOpen(false)} />
                <div className="absolute top-8 left-0 z-40 bg-tvpanel border border-tvborder rounded shadow-xl py-1 w-24">
                  {ALL_TFS.map((tf) => (
                    <button
                      key={tf}
                      onClick={() => {
                        setTimeframe(tf);
                        setTfOpen(false);
                      }}
                      className={cn(
                        "w-full text-left px-3 py-1.5 text-[13px] hover:bg-[#2a2e39]",
                        timeframe === tf ? "text-primary font-semibold" : "text-[#d1d4dc]"
                      )}
                    >
                      {tfLabel(tf)} <span className="text-[#787b86] text-[11px]">({tf})</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="w-px h-5 bg-tvborder mx-1" />

        {/* Chart type */}
        <div className="relative">
          <button
            onClick={() => setTypeOpen((v) => !v)}
            className="w-7 h-7 flex items-center justify-center rounded text-[#787b86] hover:bg-[#2a2e39]"
            title="Chart style"
          >
            <CandlestickChart className="w-4 h-4" />
          </button>
          {typeOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setTypeOpen(false)} />
              <div className="absolute top-8 left-0 z-40 bg-tvpanel border border-tvborder rounded shadow-xl py-1 w-40">
                {CHART_TYPES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setChartType(t.id);
                      setTypeOpen(false);
                    }}
                    className={cn(
                      "w-full text-left px-3 py-1.5 text-[13px] hover:bg-[#2a2e39]",
                      chartType === t.id ? "text-primary font-semibold" : "text-[#d1d4dc]"
                    )}
                  >
                    {t.label}
                  </button>
                ))}
                <div className="h-px bg-tvborder my-1" />
                <button
                  onClick={toggleVolume}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-[13px] text-[#d1d4dc] hover:bg-[#2a2e39]"
                >
                  <span className="flex items-center gap-2">
                    <BarChart3 className="w-3.5 h-3.5" /> Volume
                  </span>
                  <span className={cn("text-[10px] px-1.5 rounded", showVolume ? "bg-primary/25 text-primary" : "text-[#787b86]")}>
                    {showVolume ? "ON" : "OFF"}
                  </span>
                </button>
              </div>
            </>
          )}
        </div>

        {/* Indicators */}
        <button
          onClick={() => setIndOpen(true)}
          className="flex items-center gap-1.5 h-7 px-2 rounded text-[13px] text-[#d1d4dc] hover:bg-[#2a2e39]"
          title="Indicators"
        >
          <FunctionSquare className="w-4 h-4 text-[#787b86]" />
          Indicators
        </button>

        {/* Load data (our custom, needed for downloads) */}
        <button
          onClick={handleBackfill}
          disabled={loading}
          className="flex items-center gap-1.5 h-7 px-2 rounded text-[13px] text-[#d1d4dc] hover:bg-[#2a2e39] disabled:opacity-50"
          title="Download historical data from provider"
        >
          <Camera className={cn("w-4 h-4 text-[#787b86]", loading && "animate-pulse")} />
          {loading ? "Loading…" : "Load Data"}
        </button>
        {msg && (
          <span className={cn("text-[11px] max-w-[260px] truncate", msg.ok ? "text-bull" : "text-bear")}>
            {msg.text}
          </span>
        )}

        <div className="flex-1" />

        {/* Alert (placeholder) */}
        <button
          className="w-7 h-7 flex items-center justify-center rounded text-[#787b86] hover:bg-[#2a2e39] opacity-50"
          title="Alerts (coming soon)"
        >
          <Bell className="w-4 h-4" />
        </button>

        {/* Replay */}
        <button
          onClick={onToggleReplay}
          className={cn(
            "flex items-center gap-1.5 h-7 px-2 rounded text-[13px] font-semibold transition-colors",
            replayActive ? "bg-primary text-white" : "text-[#d1d4dc] hover:bg-[#2a2e39]"
          )}
          title="Bar Replay"
        >
          <History className="w-4 h-4" />
          <span className="hidden sm:inline">Replay</span>
        </button>

        {/* Paper trading */}
        <button
          onClick={onTogglePaper}
          className={cn(
            "flex items-center gap-1.5 h-7 px-2 rounded text-[13px] font-semibold transition-colors",
            paperActive
              ? "bg-bull text-[#131722]"
              : "text-[#d1d4dc] hover:bg-[#2a2e39]"
          )}
          title="Paper trading — live prices, simulated fills"
        >
          <Radio className="w-4 h-4" />
          <span className="hidden sm:inline">Paper</span>
        </button>

        <div className="w-px h-5 bg-tvborder mx-1" />

        {/* Right-side panel toggles */}
        <button
          onClick={() => toggleBottomPanel()}
          className={cn(
            "w-7 h-7 flex items-center justify-center rounded hover:bg-[#2a2e39]",
            bottomPanelOpen ? "text-primary" : "text-[#787b86]"
          )}
          title="Toggle bottom panel"
        >
          <PanelBottom className="w-4 h-4" />
        </button>
        <button
          onClick={toggleRightSidebar}
          className={cn(
            "w-7 h-7 flex items-center justify-center rounded hover:bg-[#2a2e39]",
            rightSidebarOpen ? "text-primary" : "text-[#787b86]"
          )}
          title="Toggle watchlist"
        >
          <PanelRight className="w-4 h-4" />
        </button>
        <button
          className="w-7 h-7 flex items-center justify-center rounded text-[#787b86] hover:bg-[#2a2e39] opacity-50"
          title="Settings (coming soon)"
        >
          <Settings className="w-4 h-4" />
        </button>
        <button
          onClick={toggleFullscreen}
          className="w-7 h-7 flex items-center justify-center rounded text-[#787b86] hover:bg-[#2a2e39]"
          title="Fullscreen"
        >
          {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>

      <SymbolSearch open={symbolOpen} onClose={() => setSymbolOpen(false)} />
      <IndicatorsDialog open={indOpen} onClose={() => setIndOpen(false)} />
    </>
  );
}

function tfLabel(tf: string): string {
  const m: Record<string, string> = {
    "1m": "1m", "3m": "3m", "5m": "5m", "15m": "15m", "30m": "30m", "45m": "45m",
    "1h": "1h", "2h": "2h", "3h": "3h", "4h": "4h", "1d": "D", "1w": "W", "1mo": "M",
  };
  return m[tf] ?? tf;
}
