import { useState } from "react";
import Editor from "@monaco-editor/react";
import type { Monaco } from "@monaco-editor/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Plus, Save, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui";

const DEFAULT_SCRIPT = `//@version=5
indicator("My Indicator", overlay=true)
len = input.int(14, title="Length")
basis = ta.sma(close, len)
dev = ta.ema(close, len * 2)
plot(basis, color=color.blue)
plot(dev, color=color.orange)
`;

type Props = {
  onAddToChart?: (title: string, source: string) => void;
};

export function PineEditor({ onAddToChart }: Props) {
  const [source, setSource] = useState(DEFAULT_SCRIPT);
  const [scriptId, setScriptId] = useState<number | null>(null);
  const [name, setName] = useState("My Indicator");
  const [diag, setDiag] = useState("");
  const addIndicator = useUIStore((s) => s.addIndicator);

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
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-6 w-44 bg-[#131722] border border-tvborder rounded px-2 text-[12px] text-[#d1d4dc] outline-none"
        />
        <button
          onClick={handleAddToChart}
          className="flex items-center gap-1 h-6 px-2 rounded bg-primary/20 text-primary text-[12px] font-semibold hover:bg-primary/30"
        >
          <Plus className="w-3.5 h-3.5" /> Add to chart
        </button>
        <button
          onClick={() => {
            useUIStore.getState().setBacktestRequest({ source, name, key: Date.now() });
            useUIStore.getState().setBottomTab("backtest");
          }}
          className="flex items-center gap-1 h-6 px-2 rounded text-[12px] text-[#d1d4dc] hover:bg-[#2a2e39] font-semibold"
          title="Backtest this script (requires a strategy() declaration)"
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
          defaultLanguage="pine"
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
