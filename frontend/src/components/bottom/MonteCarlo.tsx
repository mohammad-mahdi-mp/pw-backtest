import { useMemo, useRef, useState } from "react";
import { X, Dices } from "lucide-react";
import { fmtMoney, fmtNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { BacktestTrade } from "@/types";

type Props = {
  trades: BacktestTrade[];
  initial: number;
  onClose: () => void;
};

type MCResult = {
  finals: number[];
  medianFinal: number;
  p5Final: number;
  p95Final: number;
  probLoss: number;
  medianDD: number;
  p95DD: number;
  bestFinal: number;
  worstFinal: number;
};

function simulate(pnls: number[], initial: number, runs = 2000): MCResult | null {
  const n = pnls.length;
  if (n < 2) return null;
  const finals: number[] = [];
  const dds: number[] = [];
  for (let r = 0; r < runs; r++) {
    let eq = initial;
    let peak = initial;
    let dd = 0;
    for (let i = 0; i < n; i++) {
      eq += pnls[(Math.random() * n) | 0];
      if (eq > peak) peak = eq;
      const d = (eq / peak - 1) * 100;
      if (d < dd) dd = d;
    }
    finals.push(eq);
    dds.push(dd);
  }
  finals.sort((a, b) => a - b);
  dds.sort((a, b) => a - b);
  const q = (arr: number[], p: number) =>
    arr[Math.min(arr.length - 1, Math.max(0, Math.round(p * (arr.length - 1))))];
  return {
    finals,
    medianFinal: q(finals, 0.5),
    p5Final: q(finals, 0.05),
    p95Final: q(finals, 0.95),
    probLoss: (finals.filter((f) => f < initial).length / finals.length) * 100,
    medianDD: q(dds, 0.5),
    p95DD: q(dds, 0.95),
    bestFinal: finals[finals.length - 1],
    worstFinal: finals[0],
  };
}

function Histogram({ finals, initial }: { finals: number[]; initial: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawn = useRef(false);

  useMemo(() => {
    drawn.current = false;
  }, [finals]);

  const draw = () => {
    const canvas = ref.current;
    if (!canvas || drawn.current) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const BINS = 40;
    const lo = Math.min(initial, finals[0]);
    const hi = Math.max(initial, finals[finals.length - 1]);
    const step = (hi - lo) / BINS || 1;
    const bins = new Array(BINS).fill(0);
    for (const f of finals) {
      const b = Math.min(BINS - 1, Math.max(0, Math.floor((f - lo) / step)));
      bins[b]++;
    }
    const maxC = Math.max(...bins);
    const padL = 8;
    const padB = 16;
    const bw = (w - padL * 2) / BINS;
    for (let i = 0; i < BINS; i++) {
      const x = padL + i * bw;
      const bh = ((h - padB) * bins[i]) / maxC;
      const binMid = lo + (i + 0.5) * step;
      ctx.fillStyle = binMid >= initial ? "rgba(38,166,154,0.75)" : "rgba(239,83,80,0.75)";
      ctx.fillRect(x + 0.5, h - padB - bh, Math.max(1, bw - 1.5), bh);
    }
    // initial capital marker
    if (initial >= lo && initial <= hi) {
      const x = padL + ((initial - lo) / (hi - lo || 1)) * (w - padL * 2);
      ctx.strokeStyle = "#d1d4dc";
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h - padB);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#787b86";
      ctx.font = "10px Trebuchet MS, sans-serif";
      ctx.fillText("initial", x + 3, 10);
    }
    drawn.current = true;
  };

  // draw after mount
  requestAnimationFrame(draw);

  return <canvas ref={ref} className="w-full h-[150px] block" />;
}

export function MonteCarlo({ trades, initial, onClose }: Props) {
  const [seed, setSeed] = useState(0);
  const mc = useMemo(() => {
    const pnls = trades.map((t) => t.pnl);
    return simulate(pnls, initial, 2000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trades, initial, seed]);

  if (!mc) return null;
  const stats = [
    { label: "Median Final", value: fmtMoney(mc.medianFinal), good: mc.medianFinal >= initial },
    { label: "5th – 95th pct", value: `${fmtNumber(mc.p5Final, 0)} – ${fmtNumber(mc.p95Final, 0)}`, good: true },
    { label: "P(end < initial)", value: `${fmtNumber(mc.probLoss, 1)}%`, good: mc.probLoss < 50 },
    { label: "Median Max DD", value: `${fmtNumber(mc.medianDD, 1)}%`, good: false },
    { label: "95th pct Max DD", value: `${fmtNumber(mc.p95DD, 1)}%`, good: false },
    { label: "Best / Worst path", value: `${fmtNumber(mc.bestFinal, 0)} / ${fmtNumber(mc.worstFinal, 0)}`, good: true },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative w-[560px] max-w-[94vw] bg-tvpanel border border-tvborder rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-tvborder">
          <Dices className="w-4 h-4 text-primary" />
          <span className="text-[14px] font-bold text-[#d1d4dc]">Monte Carlo</span>
          <span className="text-[11px] text-[#787b86]">
            {trades.length} trades resampled × 2000 · bootstrap
          </span>
          <div className="flex-1" />
          <button
            onClick={() => setSeed((s) => s + 1)}
            className="h-6 px-2 rounded text-[11px] text-[#d1d4dc] bg-[#2a2e39] hover:bg-[#363a45]"
          >
            Reshuffle
          </button>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#2a2e39]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3">
          <Histogram finals={mc.finals} initial={initial} />
          <div className="grid grid-cols-3 gap-1.5 mt-3">
            {stats.map((s) => (
              <div key={s.label} className="bg-[#131722] border border-tvborder rounded p-2">
                <div className="text-[9px] text-[#787b86] uppercase tracking-wide">{s.label}</div>
                <div
                  className={cn(
                    "text-[13px] font-bold font-mono mt-0.5",
                    s.good ? "text-bull" : "text-bear"
                  )}
                >
                  {s.value}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 text-[10px] text-[#787b86] leading-relaxed">
            Each path redraws the trade P&amp;L sequence with replacement — shows the range of
            outcomes your trade distribution could have produced in a different order.
          </div>
        </div>
      </div>
    </div>
  );
}
