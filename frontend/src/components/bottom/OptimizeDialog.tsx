import { useEffect, useMemo, useState } from "react";
import { X, SlidersHorizontal, Loader2, AlertCircle, Star, ArrowUpDown } from "lucide-react";
import { api } from "@/lib/api";
import { fmtMoney, fmtNumber, fmtEpoch } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { OptimizeResponse, OptimizeRow, WalkforwardFold } from "@/types";

const METRICS = [
  { id: "net_pnl", label: "Net P&L" },
  { id: "return_pct", label: "Return %" },
  { id: "sharpe", label: "Sharpe" },
  { id: "sortino", label: "Sortino" },
  { id: "profit_factor", label: "Profit Factor" },
  { id: "trades", label: "Trades" },
  { id: "cagr_pct", label: "CAGR %" },
];

const MAX_RUNS = 200;

type NumRange = { kind: "num"; from: number; to: number; step: number; isInt: boolean };
type BoolRange = { kind: "bool"; includeTrue: boolean; includeFalse: boolean };
type Range = NumRange | BoolRange;

type Props = {
  source: string;
  symbol: string;
  timeframe: string;
  cash: number;
  leverage: number;
  onApply: (inputs: Record<string, number | boolean>) => void;
  onClose: () => void;
};

function valuesOf(r: Range): (number | boolean)[] {
  if (r.kind === "bool") {
    const out: (number | boolean)[] = [];
    if (r.includeTrue) out.push(true);
    if (r.includeFalse) out.push(false);
    return out;
  }
  const out: number[] = [];
  const step = r.step > 0 ? r.step : 1;
  for (let v = r.from; v <= r.to + step * 1e-9; v += step) {
    out.push(r.isInt ? Math.round(v) : Math.round(v * 1e6) / 1e6);
    if (out.length > 60) break; // safety
  }
  return out;
}

export function OptimizeDialog({ source, symbol, timeframe, cash, leverage, onApply, onClose }: Props) {
  const [inputs, setInputs] = useState<{ name: string; default: unknown }[] | null>(null);
  const [ranges, setRanges] = useState<Record<string, Range>>({});
  const [metric, setMetric] = useState("net_pnl");
  const [mode, setMode] = useState<"grid" | "walkforward">("grid");
  const [trainBars, setTrainBars] = useState(500);
  const [testBars, setTestBars] = useState(150);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Extract<OptimizeResponse, { ok: true }> | null>(null);
  const [sortKey, setSortKey] = useState<string>("");

  // detect the script's declared inputs
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const r = await api.compileScript(source);
        if (dead) return;
        const ir = r.ir;
        const declared: { name: string; default: unknown }[] = (ir?.inputs ?? []).map((i: any) => ({
          name: i.name as string,
          default: i.default,
        }));
        setInputs(declared);
        const init: Record<string, Range> = {};
        for (const d of declared) {
          if (typeof d.default === "number") {
            const isInt = Number.isInteger(d.default);
            const step = isInt ? 1 : Math.max(0.05, Math.round(Math.abs(d.default / 4) * 100) / 100);
            init[d.name] = {
              kind: "num",
              from: d.default,
              to: d.default + 4 * step,
              step,
              isInt,
            };
          } else if (typeof d.default === "boolean") {
            init[d.name] = {
              kind: "bool",
              includeTrue: d.default === true,
              includeFalse: d.default === false,
            };
          }
        }
        setRanges(init);
        if (!declared.length) setError("This strategy declares no inputs — nothing to optimize. Add input.int() / input.float() declarations in the Pine editor.");
      } catch (e: any) {
        if (!dead) setError(e?.message || "Failed to compile strategy");
      }
    })();
    return () => {
      dead = true;
    };
  }, [source]);

  const numericInputs = useMemo(
    () => (inputs ?? []).filter((i) => typeof i.default === "number" || typeof i.default === "boolean"),
    [inputs]
  );

  const grid = useMemo(() => {
    const g: Record<string, (number | boolean)[]> = {};
    for (const [k, r] of Object.entries(ranges)) {
      const vs = valuesOf(r);
      if (vs.length) g[k] = vs;
    }
    return g;
  }, [ranges]);

  const totalRuns = useMemo(
    () => Object.values(grid).reduce((acc, vs) => acc * vs.length, 1),
    [grid]
  );

  const run = async () => {
    setRunning(true);
    setError("");
    setResult(null);
    try {
      const r = await api.optimizeBacktest({
        source, symbol, timeframe, cash, leverage,
        grid, metric, mode,
        ...(mode === "walkforward" ? { train_bars: trainBars, test_bars: testBars } : {}),
      });
      if (!r.ok) {
        setError(r.error);
      } else {
        setResult(r);
        setSortKey(metric);
      }
    } catch (e: any) {
      const m = (e?.message || "").match(/"detail":"([^"]+)"/);
      setError(m ? m[1] : e?.message || "Optimization failed");
    } finally {
      setRunning(false);
    }
  };

  const paramNames = useMemo(
    () => (result?.rows?.length ? Object.keys((result.rows[0] as OptimizeRow | WalkforwardFold).params) : []),
    [result]
  );

  const sortedGridRows = useMemo(() => {
    if (!result || result.mode !== "grid") return [];
    const rows = [...result.rows];
    if (sortKey) {
      rows.sort((a, b) => {
        const av = (a as any)[sortKey];
        const bv = (b as any)[sortKey];
        const an = typeof av === "number" ? av : -Infinity;
        const bn = typeof bv === "number" ? bv : -Infinity;
        return bn - an;
      });
    }
    return rows;
  }, [result, sortKey]);

  const wf = result?.mode === "walkforward" ? result : null;
  const gridRes = result?.mode === "grid" ? result : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative w-[860px] max-w-[95vw] max-h-[90vh] bg-tvpanel border border-tvborder rounded-lg shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-tvborder shrink-0">
          <SlidersHorizontal className="w-4 h-4 text-primary" />
          <span className="text-[14px] font-bold text-[#d1d4dc]">Strategy Optimizer</span>
          <span className="text-[11px] text-[#787b86]">{symbol} · {timeframe}</span>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#2a2e39]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!result && (
          <div className="p-3 overflow-y-auto">
            {inputs === null && !error && (
              <div className="flex items-center gap-2 text-[12px] text-[#787b86] py-4 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" /> Compiling strategy…
              </div>
            )}
            {error && (
              <div className="flex items-start gap-1.5 text-[11px] text-bear bg-bear/10 border border-bear/30 rounded p-2 mb-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {numericInputs.length > 0 && (
              <>
                <div className="text-[10px] text-[#787b86] uppercase tracking-wide mb-1.5">
                  Input ranges — the grid sweeps every combination
                </div>
                <div className="flex flex-col gap-1.5 mb-3">
                  {numericInputs.map((inp) => {
                    const r = ranges[inp.name];
                    if (!r) return null;
                    if (r.kind === "bool") {
                      return (
                        <div key={inp.name} className="flex items-center gap-3 bg-[#131722] border border-tvborder rounded px-2.5 py-1.5">
                          <span className="text-[12px] font-mono text-[#d1d4dc] w-28 truncate">{inp.name}</span>
                          <span className="text-[10px] text-[#787b86]">bool — values to test:</span>
                          {([true, false] as const).map((v) => (
                            <label key={String(v)} className="flex items-center gap-1 text-[11px] text-[#d1d4dc] cursor-pointer">
                              <input
                                type="checkbox"
                                checked={v ? r.includeTrue : r.includeFalse}
                                onChange={(e) =>
                                  setRanges((s) => ({
                                    ...s,
                                    [inp.name]: { ...r, [v ? "includeTrue" : "includeFalse"]: e.target.checked },
                                  }))
                                }
                                className="accent-[#2962ff]"
                              />
                              {String(v)}
                            </label>
                          ))}
                        </div>
                      );
                    }
                    const count = valuesOf(r).length;
                    return (
                      <div key={inp.name} className="flex items-center gap-2 bg-[#131722] border border-tvborder rounded px-2.5 py-1.5">
                        <span className="text-[12px] font-mono text-[#d1d4dc] w-28 truncate" title={inp.name}>{inp.name}</span>
                        {(["from", "to", "step"] as const).map((f) => (
                          <label key={f} className="flex items-center gap-1 text-[10px] text-[#787b86]">
                            {f}
                            <input
                              type="number"
                              step={r.isInt ? 1 : 0.05}
                              value={r[f]}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value) || 0;
                                setRanges((s) => ({ ...s, [inp.name]: { ...r, [f]: v } }));
                              }}
                              className="h-6 w-16 bg-[#1e222d] border border-tvborder rounded px-1 text-[11px] text-[#d1d4dc] font-mono outline-none"
                            />
                          </label>
                        ))}
                        <span className="text-[10px] text-[#787b86] ml-auto">{count} values</span>
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <div className="flex rounded overflow-hidden border border-tvborder h-7">
                    {(["grid", "walkforward"] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setMode(m)}
                        className={cn(
                          "px-2.5 text-[11px] font-semibold",
                          mode === m ? "bg-primary text-white" : "bg-[#1e222d] text-[#787b86] hover:text-[#d1d4dc]"
                        )}
                      >
                        {m === "grid" ? "Grid Sweep" : "Walk-Forward"}
                      </button>
                    ))}
                  </div>

                  <label className="flex items-center gap-1 text-[11px] text-[#787b86]">
                    Rank by
                    <select
                      value={metric}
                      onChange={(e) => setMetric(e.target.value)}
                      className="h-7 bg-[#1e222d] border border-tvborder rounded px-1.5 text-[11px] text-[#d1d4dc] outline-none"
                    >
                      {METRICS.map((m) => (
                        <option key={m.id} value={m.id}>{m.label}</option>
                      ))}
                    </select>
                  </label>

                  {mode === "walkforward" && (
                    <>
                      <label className="flex items-center gap-1 text-[11px] text-[#787b86]">
                        Train bars
                        <input
                          type="number"
                          value={trainBars}
                          min={50}
                          onChange={(e) => setTrainBars(parseInt(e.target.value) || 50)}
                          className="h-7 w-20 bg-[#1e222d] border border-tvborder rounded px-1.5 text-[11px] text-[#d1d4dc] font-mono outline-none"
                        />
                      </label>
                      <label className="flex items-center gap-1 text-[11px] text-[#787b86]">
                        Test bars
                        <input
                          type="number"
                          value={testBars}
                          min={10}
                          onChange={(e) => setTestBars(parseInt(e.target.value) || 10)}
                          className="h-7 w-20 bg-[#1e222d] border border-tvborder rounded px-1.5 text-[11px] text-[#d1d4dc] font-mono outline-none"
                        />
                      </label>
                    </>
                  )}

                  <span
                    className={cn(
                      "text-[11px] font-mono px-2 py-0.5 rounded border",
                      totalRuns > MAX_RUNS
                        ? "text-bear border-bear/40 bg-bear/10"
                        : "text-[#d1d4dc] border-tvborder bg-[#131722]"
                    )}
                  >
                    {totalRuns} run{totalRuns === 1 ? "" : "s"}
                    {mode === "walkforward" ? " × folds" : ""}
                  </span>

                  <button
                    onClick={run}
                    disabled={running || totalRuns === 0 || totalRuns > MAX_RUNS}
                    className="ml-auto h-8 px-4 rounded bg-primary text-white text-[12px] font-bold hover:bg-primary/85 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <SlidersHorizontal className="w-3.5 h-3.5" />}
                    {running ? "Optimizing…" : mode === "grid" ? "Run Sweep" : "Run Walk-Forward"}
                  </button>
                </div>

                {mode === "walkforward" && (
                  <div className="text-[10px] text-[#787b86] leading-relaxed">
                    Each fold re-fits the best parameter combo on a train window, then trades it out-of-sample on the
                    following test window — the stitched OOS equity curve reveals whether edge survives after costs.
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {result && (
          <div className="flex flex-col min-h-0 flex-1">
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-tvborder text-[11px] text-[#787b86] shrink-0">
              <span>
                {result.mode === "grid"
                  ? `${result.runs} combinations · ranked by ${METRICS.find((m) => m.id === result.metric)?.label ?? result.metric}`
                  : `${result.folds} folds · OOS performance`}
              </span>
              <div className="flex-1" />
              <button
                onClick={() => setResult(null)}
                className="h-6 px-2 rounded text-[11px] text-[#d1d4dc] bg-[#2a2e39] hover:bg-[#363a45]"
              >
                ← Back to settings
              </button>
            </div>

            {gridRes && (
              <div className="flex-1 min-h-0 overflow-y-auto">
                <table className="w-full text-[11px]">
                  <thead className="sticky top-0 bg-tvpanel z-10">
                    <tr className="text-[#787b86] text-left">
                      <th className="px-2 py-1.5 font-normal w-6" />
                      {paramNames.map((p) => (
                        <th key={p} className="px-2 py-1.5 font-normal font-mono">{p}</th>
                      ))}
                      {(["net_pnl", "return_pct", "max_drawdown_pct", "sharpe", "profit_factor", "trades", "win_rate"] as const).map((k) => (
                        <th
                          key={k}
                          onClick={() => setSortKey(k)}
                          className="px-2 py-1.5 font-normal cursor-pointer hover:text-[#d1d4dc] whitespace-nowrap"
                        >
                          <span className="inline-flex items-center gap-0.5">
                            {k === "net_pnl" ? "Net P&L" : k === "return_pct" ? "Return %" : k === "max_drawdown_pct" ? "Max DD %" : k === "win_rate" ? "Win %" : k.replace(/_/g, " ").replace("profit factor", "PF")}
                            <ArrowUpDown className="w-2.5 h-2.5" />
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedGridRows.map((row, i) => (
                      <tr
                        key={i}
                        onClick={() => onApply(row.params as Record<string, number | boolean>)}
                        className={cn(
                          "border-t border-tvborder/50 cursor-pointer hover:bg-[#2a2e39]/60",
                          i === 0 && sortKey === metric && "bg-primary/10"
                        )}
                        title="Click to run the backtest with these inputs"
                      >
                        <td className="px-2 py-1">
                          {row === gridRes.best ? <Star className="w-3 h-3 text-[#f0b90b] fill-[#f0b90b]" /> : <span className="text-[#787b86]">{i + 1}</span>}
                        </td>
                        {paramNames.map((p) => (
                          <td key={p} className="px-2 py-1 font-mono text-[#d1d4dc]">{String(row.params[p])}</td>
                        ))}
                        <td className={cn("px-2 py-1 font-mono font-semibold", row.net_pnl >= 0 ? "text-bull" : "text-bear")}>
                          {row.net_pnl >= 0 ? "+" : ""}{fmtMoney(row.net_pnl)}
                        </td>
                        <td className={cn("px-2 py-1 font-mono", row.return_pct >= 0 ? "text-bull" : "text-bear")}>
                          {fmtNumber(row.return_pct, 2)}%
                        </td>
                        <td className="px-2 py-1 font-mono text-bear">{fmtNumber(row.max_drawdown_pct, 2)}%</td>
                        <td className="px-2 py-1 font-mono text-[#d1d4dc]">{fmtNumber(row.sharpe, 2)}</td>
                        <td className="px-2 py-1 font-mono text-[#d1d4dc]">
                          {row.profit_factor == null ? "—" : fmtNumber(row.profit_factor, 2)}
                        </td>
                        <td className="px-2 py-1 font-mono text-[#d1d4dc]">{row.trades}</td>
                        <td className="px-2 py-1 font-mono text-[#d1d4dc]">{fmtNumber(row.win_rate, 1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-3 py-2 text-[10px] text-[#787b86]">
                  Click any row to apply those inputs and re-run the backtest. ★ = best by selected metric.
                </div>
              </div>
            )}

            {wf && (
              <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-3">
                <div className="grid grid-cols-4 gap-1.5 shrink-0">
                  {[
                    { label: "OOS Net P&L", value: fmtMoney(wf.summary.net_pnl), good: wf.summary.net_pnl >= 0 },
                    { label: "OOS Return", value: `${fmtNumber(wf.summary.return_pct, 2)}%`, good: wf.summary.return_pct >= 0 },
                    { label: "Max DD", value: `${fmtNumber(wf.summary.max_drawdown_pct, 2)}%`, good: false },
                    { label: "Trades", value: String(wf.summary.trades), good: true },
                    { label: "Win Rate", value: `${fmtNumber(wf.summary.win_rate, 1)}%`, good: wf.summary.win_rate >= 50 },
                    {
                      label: "Profit Factor",
                      value: wf.summary.profit_factor == null ? "—" : fmtNumber(wf.summary.profit_factor, 2),
                      good: (wf.summary.profit_factor ?? 0) >= 1,
                    },
                    { label: "Final Equity", value: fmtMoney(wf.summary.final_equity), good: wf.summary.final_equity >= wf.summary.initial_capital },
                    { label: "Folds", value: String(wf.folds), good: true },
                  ].map((c) => (
                    <div key={c.label} className="bg-[#131722] border border-tvborder rounded p-2">
                      <div className="text-[9px] text-[#787b86] uppercase tracking-wide">{c.label}</div>
                      <div className={cn("text-[13px] font-bold font-mono mt-0.5", c.good ? "text-bull" : "text-bear")}>
                        {c.value}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="min-h-0">
                  <div className="text-[10px] text-[#787b86] uppercase tracking-wide mb-1">
                    Per-fold: parameters re-fitted on train, tested out-of-sample — click a row to apply
                  </div>
                  <table className="w-full text-[11px]">
                    <thead className="sticky top-0 bg-tvpanel">
                      <tr className="text-[#787b86] text-left">
                        <th className="px-2 py-1 font-normal">#</th>
                        {paramNames.map((p) => (
                          <th key={p} className="px-2 py-1 font-normal font-mono">{p}</th>
                        ))}
                        <th className="px-2 py-1 font-normal">Train {wf.metric}</th>
                        <th className="px-2 py-1 font-normal">Train window</th>
                        <th className="px-2 py-1 font-normal">Test P&L</th>
                        <th className="px-2 py-1 font-normal">Test window</th>
                      </tr>
                    </thead>
                    <tbody>
                      {wf.rows.map((f, i) => (
                        <tr
                          key={i}
                          onClick={() => onApply(f.params as Record<string, number | boolean>)}
                          className="border-t border-tvborder/50 cursor-pointer hover:bg-[#2a2e39]/60"
                          title="Click to run the backtest with these inputs"
                        >
                          <td className="px-2 py-1 text-[#787b86]">{i + 1}</td>
                          {paramNames.map((p) => (
                            <td key={p} className="px-2 py-1 font-mono text-[#d1d4dc]">{String(f.params[p])}</td>
                          ))}
                          <td className={cn("px-2 py-1 font-mono", f.train.metric >= 0 ? "text-bull" : "text-bear")}>
                            {fmtNumber(f.train.metric, 0)}
                          </td>
                          <td className="px-2 py-1 text-[#787b86] whitespace-nowrap">
                            {fmtEpoch(f.train.start, false)} → {fmtEpoch(f.train.end, false)}
                          </td>
                          <td className={cn("px-2 py-1 font-mono font-semibold", (f.test?.net_pnl ?? 0) >= 0 ? "text-bull" : "text-bear")}>
                            {f.test ? fmtMoney(f.test.net_pnl) : "—"}
                          </td>
                          <td className="px-2 py-1 text-[#787b86] whitespace-nowrap">
                            {f.test ? `${fmtEpoch(f.test.start, false)} → ${fmtEpoch(f.test.end, false)}` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="text-[10px] text-[#787b86] leading-relaxed shrink-0">
                  All metrics above are out-of-sample: each fold's parameters were chosen only from data before its
                  test window. {wf.oos_trades.length} OOS trades stitched across {wf.folds} folds.
                </div>
              </div>
            )}
          </div>
        )}

        {result === null && error === "" && inputs !== null && numericInputs.length === 0 && (
          <div className="px-3 pb-3 text-[11px] text-[#787b86]">
            Only numeric and boolean inputs can be optimized. Declare them with{" "}
            <code className="text-[#d1d4dc] bg-[#2a2e39] px-1 rounded">input.int()</code> /{" "}
            <code className="text-[#d1d4dc] bg-[#2a2e39] px-1 rounded">input.float()</code> in the Pine editor.
          </div>
        )}
      </div>
    </div>
  );
}
