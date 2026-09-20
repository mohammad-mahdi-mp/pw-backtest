import { useState } from "react";
import Editor from "@monaco-editor/react";
import type { Monaco } from "@monaco-editor/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Plus, Save, FlaskConical, FileCode2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui";
import { useLayoutStore } from "@/stores/layout";

const DEFAULT_SCRIPT = `//@version=5
indicator("My Indicator", overlay=true)
len = input.int(14, title="Length")
basis = ta.sma(close, len)
dev = ta.ema(close, len * 2)
plot(basis, color=color.blue)
plot(dev, color=color.orange)
`;

const PY_STRATEGY_SCRIPT = `# Python strategy — same broker engine, plain Python.
# The class must be named Strategy with on_bar(self, ctx).
# ctx: .i .open .high .low .close .volume .close_ago(k)
#      .sma/.ema/.rsi/.atr/.highest/.lowest (full lists — index by ctx.i)
#      .cross_over(a, b) .cross_under(a, b)  (pass full lists)
#      .position_size .equity
#      .buy(qty_pct=100, stop=..., target=...) .sell(...) .close_position()
#      .set_stop(price) .set_target(price) on the open position
class Strategy:
    name = "Py SMA Cross"
    def init(self, ctx):
        self.fast = ctx.sma("close", 10)
        self.slow = ctx.sma("close", 30)

    def on_bar(self, ctx):
        if ctx.i < 30:
            return
        if ctx.cross_over(self.fast, self.slow):
            ctx.buy(qty_pct=100, stop=ctx.close * 0.95, target=ctx.close * 1.10)
        elif ctx.cross_under(self.fast, self.slow):
            ctx.sell(qty_pct=100)
`;

const TEMPLATES = [
  { id: "pine-ind", label: "Pine — Indicator", name: "My Indicator", lang: "pine", src: DEFAULT_SCRIPT },
  { id: "pine-strat", label: "Pine — Strategy", name: "SMA Strategy", lang: "pine", src: `//@version=5
strategy("SMA Crossover", overlay=true, initial_capital=100000, default_qty_type=strategy.percent_of_equity, default_qty_value=100)
fastlen = input.int(9, "Fast")
slowlen = input.int(21, "Slow")
fast = ta.sma(close, fastlen)
slow = ta.sma(close, slowlen)
if ta.crossover(fast, slow)
    strategy.entry("Long", strategy.long)
if ta.crossunder(fast, slow)
    strategy.close("Long")
` },
  { id: "py-strat", label: "Python — Strategy", name: "Py SMA Cross", lang: "python", src: PY_STRATEGY_SCRIPT },
];

type Props = {
  onAddToChart?: (title: string, source: string) => void;
};

export function PineEditor({ onAddToChart }: Props) {
  const [source, setSource] = useState(DEFAULT_SCRIPT);
  const [scriptId, setScriptId] = useState<number | null>(null);
  const [name, setName] = useState("My Indicator");
  const [diag, setDiag] = useState("");
  const [tplOpen, setTplOpen] = useState(false);
  const [lang, setLang] = useState<"pine" | "python">("pine");
  const addIndicator = useLayoutStore((s) => s.addActiveIndicator);

  const isPython = lang === "python" || (source.includes("class Strategy") && !source.includes("//@version"));

  const qc = useQueryClient();
  const saveMut = useMutation({
    mutationFn: api.saveScript,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pine-scripts"] }),
  });

  const registerLanguage = (monaco: Monaco) => {    if (monaco.languages.getLanguages().some((l) => l.id === "pine")) return;
    monaco.languages.register({ id: "pine" });
    monaco.languages.setMonarchTokensProvider("pine", {
      keywords: [
        "indicator", "strategy", "plot", "plotshape", "if", "else", "for", "while",
        "var", "varip", "true", "false", "na", "input", "and", "or", "not", "series",
        "simple", "float", "int", "bool", "color", "string", "line", "label",
      ],
      tokenizer: {
        root: [
          [/\/\/.*$/, "comment"],
          [/\/\/@version\=\d+/, "annotation"],
          [/"[^"]*"/, "string"],
          [/\b(ta|math|str|color|input|strategy)\b/, "keyword"],
          [/\b\d+(\.\d+)?\b/, "number"],
          [/[#][0-9a-fA-F]{6}/, "number"],
          [/[A-Za-z_][A-Za-z0-9_]*/, { cases: { "@keywords": "keyword", "@default": "identifier" } }],
        ],
      },
    });
  };

  const handleAddToChart = async () => {
    try {
      const r = await api.compileScript(source);
      if (!r.ok) {
        setDiag(`✗ ${r.error}`);
        return;
      }
      setDiag(`✓ compiled — ${(r.ir?.plots || []).length} plot(s), overlay=${r.ir?.overlay}. Added to chart.`);
      if (onAddToChart) {
        onAddToChart(name, source);
      } else {
        addIndicator({
          id: `ind-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          title: name,
          source,
          overlay: !!r.ir?.overlay,
        });
      }
    } catch (e: any) {
      setDiag(`✗ ${e?.message ?? "compile failed"}`);
    }
  };

  const handleSave = async () => {
    const r = await saveMut.mutateAsync({ id: scriptId, name, source, kind: "indicator" });
    setScriptId(r.id);
    setDiag(`Saved "${r.name}" (#${r.id})`);
  };

  return (
    <div className="w-full h-full flex flex-col min-h-0">
      {/* toolbar */}
      <div className="h-[30px] shrink-0 flex items-center gap-2 px-2 border-b border-tvborder">
        <div className="relative">
          <button
            onClick={() => setTplOpen((v) => !v)}
            className="flex items-center gap-1 h-6 px-2 rounded text-[12px] text-[#d1d4dc] hover:bg-[#2a2e39]"
            title="Load a template"
          >
            <FileCode2 className="w-3.5 h-3.5 text-[#787b86]" /> Templates
            <ChevronDown className="w-3 h-3 text-[#787b86]" />
          </button>
          {tplOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setTplOpen(false)} />
              <div className="absolute top-7 left-0 z-40 bg-tvpanel border border-tvborder rounded shadow-xl py-1 w-52">
                {TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setSource(t.src);
                      setName(t.name);
                      setLang(t.lang as "pine" | "python");
                      setScriptId(null);
                      setTplOpen(false);
                      setDiag(`Loaded template: ${t.label}`);
                    }}
                    className="w-full text-left px-3 py-1.5 text-[12px] text-[#d1d4dc] hover:bg-[#2a2e39]"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-6 w-44 bg-[#131722] border border-tvborder rounded px-2 text-[12px] text-[#d1d4dc] outline-none"
        />
        <button
          onClick={handleAddToChart}
          disabled={isPython}
          className="flex items-center gap-1 h-6 px-2 rounded bg-primary/20 text-primary text-[12px] font-semibold hover:bg-primary/30 disabled:opacity-40"
          title={isPython ? "Chart indicators are Pine-only" : "Compile & add to chart"}
        >
          <Plus className="w-3.5 h-3.5" /> Add to chart
        </button>
        <button
          onClick={() => {
            useUIStore.getState().setBacktestRequest({ source, name, key: Date.now() });
            useUIStore.getState().setBottomTab("backtest");
          }}
          className="flex items-center gap-1 h-6 px-2 rounded text-[12px] text-[#d1d4dc] hover:bg-[#2a2e39] font-semibold"
          title="Backtest this script (Pine strategy() or Python Strategy class)"
        >
          <FlaskConical className="w-3.5 h-3.5 text-primary" /> Backtest
        </button>
        <button
          onClick={handleSave}
          className="flex items-center gap-1 h-6 px-2 rounded text-[12px] text-[#d1d4dc] hover:bg-[#2a2e39]"
        >
          <Save className="w-3.5 h-3.5" /> Save
        </button>
        <div className="flex-1" />
        {diag && (
          <span
            className={cn(
              "text-[11px] max-w-[420px] truncate",
              diag.startsWith("✓") ? "text-bull" : "text-bear"
            )}
          >
            {diag}
          </span>
        )}
      </div>

      {/* editor */}
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          language={isPython ? "python" : "pine"}
          theme="vs-dark"
          value={source}
          onChange={(v) => setSource(v || "")}
          beforeMount={registerLanguage}
          options={{
            fontSize: 13,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontFamily: "JetBrains Mono, Fira Code, monospace",
            lineNumbersMinChars: 3,
            padding: { top: 6 },
          }}
        />
      </div>
    </div>
  );
}
