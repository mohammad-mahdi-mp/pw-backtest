import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createChart, ColorType } from "lightweight-charts";
import type { IChartApi, Time, AreaData } from "lightweight-charts";
import { api } from "@/lib/api";
import { useAppStore } from "@/stores/app";
import { useUIStore } from "@/stores/ui";
import { fmtMoney, fmtNumber, fmtEpoch } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Play, History, FlaskConical, AlertCircle } from "lucide-react";
import type { BacktestResult, CurvePoint } from "@/types";

const DEFAULT_STRATEGY = `//@version=5
strategy("SMA Crossover", overlay=true, initial_capital=100000, default_qty_type=strategy.percent_of_equity, default_qty_value=20)
fast = ta.sma(close, 9)
slow = ta.sma(close, 21)
if ta.crossover(fast, slow)
    strategy.entry("Long", strategy.long)
if ta.crossunder(fast, slow)
    strategy.close("Long")
`;

function ResultChart({
  data,
  kind,
}: {
  data: CurvePoint[];
  kind: "equity" | "drawdown";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const isEq = kind === "equity";
    const chart = createChart(ref.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#131722" },
        textColor: "#787b86",
        fontSize: 10,
        fontFamily: "Trebuchet MS, sans-serif",
      },
      grid: { vertLines: { color: "#1e222d" }, horzLines: { color: "#1e222d" } },
      rightPriceScale: { borderColor: "#2a2e39" },
      timeScale: { borderColor: "#2a2e39", timeVisible: false },
      handleScroll: false,
      handleScale: false,
      width: ref.current.clientWidth,
      height: ref.current.clientHeight,
    });
    chartRef.current = chart;
    const series = chart.addAreaSeries({
      lineColor: isEq ? "#26a69a" : "#ef5350",
      topColor: isEq ? "rgba(38,166,154,0.25)" : "rgba(239,83,80,0.25)",
      bottomColor: "rgba(19,23,34,0.01)",
      lineWidth: 2,
      priceLineVisible: false,
    });
    series.setData(
      data.map((d) => ({ time: d.time as Time, value: kind === "equity" ? d.value : d.value })) as AreaData<Time>[]
    );
    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (ref.current && chartRef.current) {
        chartRef.current.applyOptions({ width: ref.current.clientWidth, height: ref.current.clientHeight });
      }
    });
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [data, kind]);

  return <div ref={ref} className="w-full h-full" />;
}

export function BacktestPanel() {
  const { symbol, timeframe } = useAppStore();
  const { backtestRequest } = useUIStore();
  const [cash, setCash] = useState(100000);
  const [leverage, setLeverage] = useState(100);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState("");
  const [histOpen, setHistOpen] = useState(false);

  const { data: runs } = useQuery({
    queryKey: ["backtest-runs"],
    queryFn: api.listBacktestRuns,
  });

  const source = backtestRequest?.source ?? DEFAULT_STRATEGY;
  const stratName = backtestRequest?.name ?? "Sample: SMA Crossover";

  const run = useCallback(async () => {
    setRunning(true);
    setError("");
    try {
      const r = await api.runBacktest({ source, symbol, timeframe, cash, leverage });
      if (!r.ok) {
        setError((r as any).error || "Backtest failed");
        setResult(null);
      } else {
        setResult(r as BacktestResult);
      }
    } catch (e: any) {
      const m = (e?.message || "").match(/"detail":"([^"]+)"/);
      setError(m ? m[1] : e?.message || "Backtest failed");
    } finally {
      setRunning(false);
    }
  }, [source, symbol, timeframe, cash, leverage]);

  // auto-run when a new request arrives from the Pine editor
  const reqKey = backtestRequest?.key ?? 0;
  useEffect(() => {
    if (reqKey) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reqKey]);

  const m = result?.metrics;

  const cards = m
    ? [
        { label: "Net P&L", value: fmtMoney(m.net_pnl), good: m.net_pnl >= 0 },
        { label: "Return", value: `${m.return_pct >= 0 ? "+" : ""}${fmtNumber(m.return_pct, 2)}%`, good: m.return_pct >= 0 },
        { label: "Max DD", value: `${fmtNumber(m.max_drawdown_pct, 2)}%`, good: false },
        { label: "Sharpe", value: fmtNumber(m.sharpe, 2), good: m.sharpe >= 1 },
        { label: "Sortino", value: fmtNumber(m.sortino, 2), good: m.sortino >= 1 },
        { label: "CAGR", value: `${fmtNumber(m.cagr_pct, 2)}%`, good: m.cagr_pct >= 0 },
        { label: "Win Rate", value: `${fmtNumber(m.win_rate, 1)}%`, good: m.win_rate >= 50 },
        { label: "Profit Factor", value: m.profit_factor == null ? "—" : fmtNumber(m.profit_factor, 2), good: (m.profit_factor ?? 0) >= 1 },
        { label: "Trades", value: String(m.trades), good: true },
        { label: "Expectancy", value: fmtMoney(m.expectancy), good: m.expectancy >= 0 },
        { label: "Best / Worst", value: `${fmtMoney(m.best_trade)} / ${fmtMoney(m.worst_trade)}`, good: true },
        { label: "Streak W/L", value: `${m.max_consecutive_wins} / ${m.max_consecutive_losses}`, good: true },
      ]
    : [];

  return (
    <div className="w-full h-full flex min-h-0">
      {/* left: config + metrics */}
      <div className="w-[300px] shrink-0 border-r border-tvborder flex flex-col min-h-0">
        <div className="p-2.5 border-b border-tvborder flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#d1d4dc]">
            <FlaskConical className="w-3.5 h-3.5 text-primary" />
            <span className="truncate">{stratName}</span>
          </div>
          <div className="text-[10px] text-[#787b86]">
            {symbol} · {timeframe} {backtestRequest ? "" : "· (sample strategy — write your own in Pine Editor)"}
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <label className="flex flex-col gap-1">
              <span className="text-[#787b86]">Capital ($)</span>
              <input
                type="number"
                value={cash}
                onChange={(e) => setCash(parseFloat(e.target.value) || 0)}
                className="h-7 bg-[#131722] border border-tvborder rounded px-1.5 text-[#d1d4dc] outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[#787b86]">Leverage</span>
              <input
                type="number"
                value={leverage}
                onChange={(e) => setLeverage(parseInt(e.target.value) || 1)}
                className="h-7 bg-[#131722] border border-tvborder rounded px-1.5 text-[#d1d4dc] outline-none"
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button
              onClick={run}
              disabled={running}
              className="flex-1 h-8 rounded bg-primary text-white text-[12px] font-bold hover:bg-primary/85 disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5" /> {running ? "Running…" : "Run Backtest"}
            </button>
            <div className="relative">
              <button
                onClick={() => setHistOpen((v) => !v)}
                className="h-8 w-8 rounded bg-[#2a2e39] text-[#d1d4dc] hover:bg-[#363a45] flex items-center justify-center"
                title="History"
              >
                <History className="w-4 h-4" />
              </button>
              {histOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setHistOpen(false)} />
                  <div className="absolute bottom-9 right-0 z-40 w-72 bg-tvpanel border border-tvborder rounded-lg shadow-2xl max-h-72 overflow-y-auto">
                    {(runs ?? []).length === 0 && (
                      <div className="px-3 py-3 text-[11px] text-[#787b86]">No saved runs yet.</div>
                    )}
                    {(runs ?? []).map((r) => (
                      <button
                        key={r.id}
                        onClick={async () => {
                          setHistOpen(false);
                          try {
                            const full = await api.getBacktestRun(r.id);
                            setResult(full);
                          } catch {
                            /* ignore */
                          }
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-[#2a2e39] border-b border-tvborder/50"
                      >
                        <div className="text-[11px] font-semibold text-[#d1d4dc] truncate">
                          {r.name} · {r.symbol} {r.timeframe}
                        </div>
                        <div className="flex justify-between text-[10px] mt-0.5">
                          <span className={cn((r.net_pnl ?? 0) >= 0 ? "text-bull" : "text-bear")}>
                            {fmtMoney(r.net_pnl ?? 0)}
                          </span>
                          <span className="text-[#787b86]">
                            {r.trades ?? 0} trades · {fmtNumber(r.win_rate ?? 0, 0)}% wr
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
          {error && (
            <div className="flex items-start gap-1.5 text-[11px] text-bear bg-bear/10 border border-bear/30 rounded p-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* metrics */}
        <div className="flex-1 overflow-y-auto p-2 grid grid-cols-2 gap-1.5 content-start">
          {cards.map((c) => (
            <div key={c.label} className="bg-[#131722] border border-tvborder rounded p-1.5">
              <div className="text-[9px] text-[#787b86] uppercase tracking-wide">{c.label}</div>
              <div
                className={cn("text-[13px] font-bold font-mono mt-0.5", c.good ? "text-bull" : "text-bear")}
              >
                {c.value}
              </div>
            </div>
          ))}
          {!m && (
            <div className="col-span-2 text-[11px] text-[#787b86] p-2 leading-relaxed">
              Press <span className="text-primary font-semibold">Run Backtest</span> to simulate the strategy
              bar-by-bar with the same broker engine used in Replay (spread, slippage & commissions applied).
              Strategies are written in the Pine Editor — declare them with{" "}
              <code className="text-[#d1d4dc] bg-[#2a2e39] px-1 rounded">strategy()</code> and use{" "}
              <code className="text-[#d1d4dc] bg-[#2a2e39] px-1 rounded">strategy.entry / close / exit</code>.
            </div>
          )}
        </div>
      </div>

      {/* right: curves + trades */}
      <div className="flex-1 min-w-0 flex flex-col min-h-0">
        {result ? (
          <>
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 min-h-0 relative border-b border-tvborder">
                <div className="absolute top-1 left-2 z-10 text-[10px] text-[#787b86] uppercase tracking-wide">
                  Equity · {fmtMoney(result.metrics.final_equity)}{" "}
                  {result.metrics.has_open_position && (
                    <span className="text-[#f0b90b]">· position open at end</span>
                  )}
                </div>
                <ResultChart data={result.equity_curve} kind="equity" />
              </div>
              <div className="h-[70px] shrink-0 relative">
                <div className="absolute top-1 left-2 z-10 text-[10px] text-[#787b86] uppercase tracking-wide">
                  Drawdown
                </div>
                <ResultChart data={result.drawdown_curve} kind="drawdown" />
              </div>
            </div>
            <div className="h-[110px] shrink-0 overflow-y-auto border-t border-tvborder">
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 bg-tvpanel">
                  <tr className="text-[#787b86] text-left">
                    <th className="px-2 py-1 font-normal">#</th>
                    <th className="px-2 py-1 font-normal">Side</th>
                    <th className="px-2 py-1 font-normal">Size</th>
                    <th className="px-2 py-1 font-normal">Entry</th>
                    <th className="px-2 py-1 font-normal">Exit</th>
                    <th className="px-2 py-1 font-normal">Opened</th>
                    <th className="px-2 py-1 font-normal">Closed</th>
                    <th className="px-2 py-1 font-normal">Exit reason</th>
                    <th className="px-2 py-1 font-normal">P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {result.trades.map((t, i) => (
                    <tr key={i} className="border-t border-tvborder/50">
                      <td className="px-2 py-1 text-[#787b86]">{i + 1}</td>
                      <td className={cn("px-2 py-1 font-semibold", t.side === "long" ? "text-bull" : "text-bear")}>
                        {t.side.toUpperCase()}
                      </td>
                      <td className="px-2 py-1 text-[#d1d4dc]">{fmtNumber(t.size, 3)}</td>
                      <td className="px-2 py-1 text-[#d1d4dc] font-mono">{t.entry_price.toFixed(2)}</td>
                      <td className="px-2 py-1 text-[#d1d4dc] font-mono">{t.exit_price.toFixed(2)}</td>
                      <td className="px-2 py-1 text-[#787b86]">{fmtEpoch(new Date(t.entry_time).getTime() / 1000, false)}</td>
                      <td className="px-2 py-1 text-[#787b86]">{fmtEpoch(new Date(t.exit_time).getTime() / 1000, false)}</td>
                      <td className="px-2 py-1">
                        <span
                          className={cn(
                            "text-[10px] px-1.5 rounded",
                            t.reason === "stop" && "bg-bear/15 text-bear",
                            t.reason === "target" && "bg-bull/15 text-bull",
                            t.reason === "signal" && "bg-[#2a2e39] text-[#787b86]"
                          )}
                        >
                          {t.reason}
                        </span>
                      </td>
                      <td className={cn("px-2 py-1 font-mono font-semibold", t.pnl >= 0 ? "text-bull" : "text-bear")}>
                        {t.pnl >= 0 ? "+" : ""}${fmtNumber(t.pnl, 2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-[12px] text-[#787b86]">
            Run a backtest to see equity curve, drawdown and the trade list.
          </div>
        )}
      </div>
    </div>
  );
}
