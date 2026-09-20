import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Download, FileSpreadsheet, Loader2, AlertCircle, CheckCircle2, CalendarRange } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type Props = {
  symbol: string;
  timeframe: string;
  onClose: () => void;
};

const TIMEFRAMES = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"];

function fmtBytes(n: number): string {
  if (n > 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024).toFixed(0)} KB`;
}

export function DataManagerDialog({ symbol, timeframe, onClose }: Props) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"download" | "csv">("download");

  // ---- download tab ----
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [dlSymbol, setDlSymbol] = useState(symbol);
  const [dlTf, setDlTf] = useState(timeframe);
  const [dlMsg, setDlMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const backfillMut = useMutation({ mutationFn: api.backfill });

  const handleDownload = async () => {
    setDlMsg(null);
    try {
      const provider = dlSymbol.includes("/") ? "ccxt" : "yahoo";
      const r = await backfillMut.mutateAsync({
        symbol: dlSymbol,
        timeframe: dlTf,
        provider,
        ...(provider === "ccxt" ? { exchange: "binance" } : {}),
        ...(from ? { start: new Date(from).toISOString() } : {}),
        ...(to ? { end: new Date(to).toISOString() } : {}),
      });
      setDlMsg({ ok: true, text: `✓ Downloaded ${r.downloaded} candles for ${r.symbol} ${r.timeframe}` });
      qc.invalidateQueries({ queryKey: ["bars"] });
    } catch (e: any) {
      const m = (e?.message || "").match(/"detail":"([^"]+)"/);
      setDlMsg({ ok: false, text: m ? m[1] : e?.message || "Download failed" });
    }
  };

  // ---- csv tab ----
  const [file, setFile] = useState<File | null>(null);
  const [csvSymbol, setCsvSymbol] = useState(symbol);
  const [csvTf, setCsvTf] = useState(timeframe);
  const [csvMsg, setCsvMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [csvMeta, setCsvMeta] = useState<any>(null);
  const [importing, setImporting] = useState(false);

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    setCsvMsg(null);
    setCsvMeta(null);
    try {
      const r = await api.importCsv(file, csvSymbol, csvTf);
      setCsvMeta(r.meta);
      setCsvMsg({
        ok: true,
        text: `✓ Imported ${r.saved} bars → ${r.symbol} ${r.timeframe}`,
      });
      qc.invalidateQueries({ queryKey: ["bars"] });
    } catch (e: any) {
      setCsvMsg({ ok: false, text: e?.message || "Import failed" });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative w-[640px] max-w-[94vw] max-h-[90vh] bg-tvpanel border border-tvborder rounded-lg shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-tvborder shrink-0">
          <CalendarRange className="w-4 h-4 text-primary" />
          <span className="text-[14px] font-bold text-[#d1d4dc]">Data Manager</span>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#2a2e39]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex border-b border-tvborder shrink-0">
          {([
            { id: "download", label: "Download history", icon: Download },
            { id: "csv", label: "Import CSV", icon: FileSpreadsheet },
          ] as const).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-semibold border-b-2 -mb-px",
                tab === t.id ? "border-primary text-[#d1d4dc]" : "border-transparent text-[#787b86] hover:text-[#d1d4dc]"
              )}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-4 overflow-y-auto">
          {tab === "download" ? (
            <>
              <div className="text-[11px] text-[#787b86] leading-relaxed mb-3">
                Fetch historical OHLCV from public providers — Binance (crypto) or Yahoo (stocks &amp; FX).
                Optional date range; without it the most recent history is fetched.
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <label className="flex flex-col gap-1 text-[11px] text-[#787b86]">
                  Symbol
                  <input
                    value={dlSymbol}
                    onChange={(e) => setDlSymbol(e.target.value.toUpperCase())}
                    className="h-8 bg-[#131722] border border-tvborder rounded px-2 text-[12px] text-[#d1d4dc] font-mono outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[11px] text-[#787b86]">
                  Timeframe
                  <select
                    value={dlTf}
                    onChange={(e) => setDlTf(e.target.value)}
                    className="h-8 bg-[#131722] border border-tvborder rounded px-2 text-[12px] text-[#d1d4dc] outline-none"
                  >
                    {TIMEFRAMES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-[11px] text-[#787b86]">
                  From (optional)
                  <input
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    className="h-8 bg-[#131722] border border-tvborder rounded px-2 text-[12px] text-[#d1d4dc] outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[11px] text-[#787b86]">
                  To (optional)
                  <input
                    type="date"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    className="h-8 bg-[#131722] border border-tvborder rounded px-2 text-[12px] text-[#d1d4dc] outline-none"
                  />
                </label>
              </div>
              <button
                onClick={handleDownload}
                disabled={backfillMut.isPending}
                className="h-8 px-4 rounded bg-primary text-white text-[12px] font-bold hover:bg-primary/85 disabled:opacity-50 flex items-center gap-1.5"
              >
                {backfillMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                {backfillMut.isPending ? "Downloading…" : "Download"}
              </button>
              {dlMsg && (
                <div className={cn("mt-3 text-[11px] flex items-start gap-1.5 rounded p-2 border",
                  dlMsg.ok ? "text-bull bg-bull/10 border-bull/30" : "text-bear bg-bear/10 border-bear/30")}>
                  {dlMsg.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
                  <span>{dlMsg.text}</span>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="text-[11px] text-[#787b86] leading-relaxed mb-3">
                Import OHLCV CSV files — MT4/MT5 exports, TradingView exports, or any file with a
                time/open/high/low/close[/volume] header. Timestamps in unix seconds/ms, ISO 8601 or
                MT4 “2026.01.02 09:30” format are auto-detected.
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <label className="flex flex-col gap-1 text-[11px] text-[#787b86]">
                  Save as symbol
                  <input
                    value={csvSymbol}
                    onChange={(e) => setCsvSymbol(e.target.value.toUpperCase())}
                    className="h-8 bg-[#131722] border border-tvborder rounded px-2 text-[12px] text-[#d1d4dc] font-mono outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[11px] text-[#787b86]">
                  Timeframe
                  <select
                    value={csvTf}
                    onChange={(e) => setCsvTf(e.target.value)}
                    className="h-8 bg-[#131722] border border-tvborder rounded px-2 text-[12px] text-[#d1d4dc] outline-none"
                  >
                    {TIMEFRAMES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label className="col-span-2 flex flex-col gap-1 text-[11px] text-[#787b86]">
                  CSV file
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(e) => {
                      setFile(e.target.files?.[0] ?? null);
                      setCsvMsg(null);
                      setCsvMeta(null);
                    }}
                    className="h-8 text-[12px] text-[#d1d4dc] file:mr-3 file:h-8 file:px-3 file:rounded file:border-0 file:bg-[#2a2e39] file:text-[#d1d4dc] file:text-[12px] file:cursor-pointer bg-[#131722] border border-tvborder rounded overflow-hidden"
                  />
                  {file && (
                    <span className="text-[10px] text-[#787b86]">
                      {file.name} · {fmtBytes(file.size)}
                    </span>
                  )}
                </label>
              </div>
              <button
                onClick={handleImport}
                disabled={!file || importing}
                className="h-8 px-4 rounded bg-primary text-white text-[12px] font-bold hover:bg-primary/85 disabled:opacity-50 flex items-center gap-1.5"
              >
                {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
                {importing ? "Importing…" : "Import"}
              </button>
              {csvMsg && (
                <div className={cn("mt-3 text-[11px] flex items-start gap-1.5 rounded p-2 border",
                  csvMsg.ok ? "text-bull bg-bull/10 border-bull/30" : "text-bear bg-bear/10 border-bear/30")}>
                  {csvMsg.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
                  <span>{csvMsg.text}</span>
                </div>
              )}
              {csvMeta && (
                <div className="mt-2 bg-[#131722] border border-tvborder rounded p-2.5 text-[10px] text-[#787b86] font-mono leading-relaxed">
                  <div>
                    rows: <span className="text-[#d1d4dc]">{csvMeta.rows}</span> · skipped: {csvMeta.skipped} ·
                    delimiter: {csvMeta.delimiter === "\t" ? "TAB" : csvMeta.delimiter} · header: {String(csvMeta.header)}
                  </div>
                  <div>
                    range: <span className="text-[#d1d4dc]">{csvMeta.start}</span> → <span className="text-[#d1d4dc]">{csvMeta.end}</span>
                  </div>
                  <div className="truncate">
                    columns:{" "}
                    {Object.entries(csvMeta.columns as Record<string, string>)
                      .map(([k, v]) => `${k}←${v}`)
                      .join(", ")}
                  </div>
                  {csvMeta.suspect_ohlc_rows > 0 && (
                    <div className="text-[#f0b90b] mt-1">
                      ⚠ {csvMeta.suspect_ohlc_rows} rows where high/low don’t bracket open/close — check the column mapping
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
