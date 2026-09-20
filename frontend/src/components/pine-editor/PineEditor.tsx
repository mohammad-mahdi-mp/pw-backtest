import { useEffect, useState } from "react";
import Editor from "@monaco-editor/react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const DEFAULT_SCRIPT = `//@version=5
indicator("My Indicator", overlay=true)
len = input.int(14, title="RSI Length", minval=1)
rsiVal = ta.rsi(close, len)
sma20 = ta.sma(close, 20)
sma50 = ta.sma(close, 50)
plot(sma20, color=color.blue)
plot(sma50, color=color.orange)
`;

type Props = {
  onRun: (source: string) => void;
};

export function PineEditor({ onRun }: Props) {
  const [source, setSource] = useState<string>(DEFAULT_SCRIPT);
  const [scriptId, setScriptId] = useState<number | null>(null);
  const [name, setName] = useState("My Indicator");
  const [diagnostics, setDiagnostics] = useState<string>("");

  const { data: scripts } = useQuery({ queryKey: ["pine-scripts"], queryFn: api.listScripts, initialData: [] });
  const saveMut = useMutation({ mutationFn: api.saveScript });

  useEffect(() => {
    // register Pine language with Monaco (basic highlight)
    const mon: any = (window as any).monaco;
    if (!mon) return;
    if (mon.languages.getLanguages().some((l: any) => l.id === "pine")) return;
    mon.languages.register({ id: "pine" });
    mon.languages.setMonarchTokensProvider("pine", {
      keywords: ["indicator", "strategy", "plot", "if", "else", "for", "var", "varip", "true", "false", "input", "and", "or", "not"],
      tokenizer: {
        root: [
          [/\/\/.*$/, "comment"],
          [/ta\.\w+/, "type.identifier"],
          [/input\.\w+/, "type.identifier"],
          [/color\.\w+/, "predefined"],
          [/"[^"]*"/, "string"],
          [/\b\d+(\.\d+)?\b/, "number"],
          [/[A-Za-z_][A-Za-z0-9_]*/, { cases: { "@keywords": "keyword", "@default": "identifier" } }],
        ],
      },
    });
    mon.editor.defineTheme("pine-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [],
      colors: { "editor.background": "#1e222d" },
    });
  }, []);

  const handleRun = () => {
    api.compileScript(source).then((r) => {
      if (!r.ok) setDiagnostics(r.error); else setDiagnostics(`OK — ${(r.ir?.plots || []).length} plot(s)`);
    });
    onRun(source);
  };

  const handleSave = async () => {
    const r = await saveMut.mutateAsync({ id: scriptId, name, source, kind: "indicator" });
    setScriptId(r.id);
    setDiagnostics(`Saved as "${r.name}" (id ${r.id})`);
  };

  return (
    <Card className="rounded-none border-0 h-full bg-tvpanel flex flex-col">
      <CardHeader className="p-2 flex flex-row items-center gap-2">
        <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground flex-1">Pine Editor</CardTitle>
        <Input value={name} onChange={(e) => setName(e.target.value)} className="w-40 h-7 text-xs" />
        <Button size="sm" variant="secondary" onClick={handleRun}>Run</Button>
        <Button size="sm" onClick={handleSave}>Save</Button>
      </CardHeader>
      <CardContent className="p-0 flex-1 overflow-hidden relative">
        <Editor
          height="100%"
          defaultLanguage="pine"
          theme="pine-dark"
          value={source}
          onChange={(v) => setSource(v || "")}
          options={{ fontSize: 13, minimap: { enabled: false }, scrollBeyondLastLine: false, fontFamily: "JetBrains Mono, monospace" }}
        />
        {diagnostics && (
          <div className="absolute bottom-0 left-0 right-0 bg-tvpanel border-t border-tvborder text-xs px-2 py-1 text-muted-foreground">
            {diagnostics}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
