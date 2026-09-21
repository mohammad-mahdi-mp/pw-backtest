/**
 * P0-T05 spike — scripted rendering benchmark for Lightweight Charts v5 on
 * WebKitGTK (Tauri v2). 100k seeded candles + volume pane; phases: warmup →
 * pan → zoom; per-frame RAF timing; 1 Hz RSS sampling from the host process.
 *
 * CI mode (SPIKE_AUTORUN=1): runs immediately, writes the report via
 * `spike_finish` and exits. Manual mode: live overlay + Start button.
 */

import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";

interface SpikeConfig {
  autorun: boolean;
  durationS: number;
}
interface SpikeStats {
  rssKb: number;
}

type InvokeFn = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

async function loadInvoke(): Promise<InvokeFn | null> {
  try {
    const core = await import("@tauri-apps/api/core");
    return core.invoke as InvokeFn;
  } catch {
    return null; // plain browser (vite dev outside Tauri)
  }
}

// --- seeded data -----------------------------------------------------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeBars(count: number): {
  candles: CandlestickData<UTCTimestamp>[];
  volumes: HistogramData<UTCTimestamp>[];
} {
  const rnd = mulberry32(20260921);
  const candles: CandlestickData<UTCTimestamp>[] = [];
  const volumes: HistogramData<UTCTimestamp>[] = [];
  let price = 60_000;
  const t0 = 1_600_000_000 as UTCTimestamp;
  for (let i = 0; i < count; i++) {
    const open = price;
    const drift = (rnd() - 0.5) * 260;
    const close = Math.max(1000, open + drift);
    const high = Math.max(open, close) + rnd() * 120;
    const low = Math.min(open, close) - rnd() * 120;
    const volume = 10 + rnd() * 990;
    const time = (t0 + i * 60) as UTCTimestamp;
    candles.push({ time, open, high, low, close });
    volumes.push({
      time,
      value: volume,
      color: close >= open ? "rgba(8,153,129,0.5)" : "rgba(242,54,69,0.5)",
    });
    price = close;
  }
  return { candles, volumes };
}

// --- benchmark -------------------------------------------------------------
interface Sample {
  phase: string;
  tMs: number;
}

async function main(): Promise<void> {
  const overlay = document.getElementById("overlay") as HTMLDivElement;
  const invoke = await loadInvoke();

  const cfg: SpikeConfig = invoke
    ? await invoke<SpikeConfig>("spike_config")
    : { autorun: false, durationS: 20 };

  const chart: IChartApi = createChart(document.getElementById("chart") as HTMLElement, {
    autoSize: true,
    layout: {
      background: { color: "#131722" },
      textColor: "#d1d4dc",
      panes: { separatorColor: "#2a2e39", separatorHoverColor: "#2962ff" },
    },
    grid: {
      vertLines: { color: "#1e222d" },
      horzLines: { color: "#1e222d" },
    },
    crosshair: { mode: 0 },
  });

  const BAR_COUNT = 100_000;
  const { candles, volumes } = makeBars(BAR_COUNT);
  const candleSeries = chart.addSeries(CandlestickSeries, {});
  candleSeries.setData(candles);
  const volumeSeries = chart.addSeries(HistogramSeries, { priceScaleId: "" }, 1);
  volumeSeries.setData(volumes);
  volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
  chart.timeScale().setVisibleLogicalRange({ from: BAR_COUNT - 1500, to: BAR_COUNT });

  // --- measurement loop ---
  const samples: Sample[] = [];
  const rss: number[] = [];
  let running = cfg.autorun;
  let phase = "warmup";
  let phaseStart = 0;
  let startWall = 0;
  let raf = 0;

  const tick = (nowMs: number): void => {
    if (startWall === 0) startWall = nowMs;
    if (running) samples.push({ phase, tMs: nowMs });

    const elapsed = (nowMs - startWall) / 1000;
    if (running && phase === "warmup" && nowMs - phaseStart >= 2000) {
      phase = "pan";
      phaseStart = nowMs;
    } else if (running && phase === "pan" && nowMs - phaseStart >= cfg.durationS * 1000) {
      phase = "zoom";
      phaseStart = nowMs;
    } else if (running && phase === "zoom" && nowMs - phaseStart >= cfg.durationS * 1000) {
      phase = "done";
      running = false;
      void finish();
      return;
    }

    const ts = chart.timeScale();
    const range = ts.getVisibleLogicalRange();
    if (running && range) {
      if (phase === "pan") {
        const width = range.to - range.from;
        const from = (((range.from - 1420 + 17) % (BAR_COUNT - 1500)) + (BAR_COUNT - 1500)) % (BAR_COUNT - 1500);
        ts.setVisibleLogicalRange({ from, to: from + width });
      } else if (phase === "zoom") {
        const center = (range.from + range.to) / 2;
        const width = Math.min(20_000, Math.max(60, (range.to - range.from) * 0.97));
        ts.setVisibleLogicalRange({ from: center - width / 2, to: center + width / 2 });
      }
    }

    overlay.textContent =
      `phase ${running ? phase : "idle/done"}  ${elapsed.toFixed(1)}s\n` +
      `frames ${samples.length}  fps ${(fpsLastSecond(nowMs)).toFixed(1)}\n` +
      `rss ${(rss.at(-1) ?? 0) / 1024 | 0} MiB` +
      (running ? "" : "\nreport written");
    raf = requestAnimationFrame(tick);
  };

  const recent: number[] = [];
  const fpsLastSecond = (nowMs: number): number => {
    recent.push(nowMs);
    while (recent.length && nowMs - recent[0] > 1000) recent.shift();
    return recent.length;
  };

  const rssTimer = window.setInterval(() => {
    if (!invoke) return;
    void invoke<SpikeStats>("spike_stats").then((s) => {
      rss.push(s.rssKb);
      if (rss.length > 600) rss.shift();
    });
  }, 1000);

  const finish = async (): Promise<void> => {
    window.clearInterval(rssTimer);
    cancelAnimationFrame(raf);
    const byPhase: Record<string, number> = {};
    for (let i = 1; i < samples.length; i++) {
      const dt = samples[i].tMs - samples[i - 1].tMs;
      if (samples[i].phase === samples[i - 1].phase) {
        byPhase[samples[i].phase] = (byPhase[samples[i].phase] ?? 0) + dt;
      }
    }
    const span = (p: string): number => byPhase[p] ?? 0;
    const framesIn = (p: string): number => samples.filter((s) => s.phase === p).length;
    const report = {
      agent: invoke ? (cfg.autorun ? "ci-xvfb" : "manual") : "browser",
      userAgent: navigator.userAgent,
      barCount: BAR_COUNT,
      durationS: cfg.durationS,
      framesTotal: samples.length,
      fpsPan: span("pan") > 0 ? (framesIn("pan") / span("pan")) * 1000 : 0,
      fpsZoom: span("zoom") > 0 ? (framesIn("zoom") / span("zoom")) * 1000 : 0,
      rssKbMin: Math.min(...(rss.length ? rss : [0])),
      rssKbMax: Math.max(...(rss.length ? rss : [0])),
      rssKbLast: rss.at(-1) ?? 0,
      webviewFlags: { dmabufDisabled: true },
      note: "CI/xvfb numbers are software-rendering (llvmpipe) — lower bound only; owner hardware run is authoritative (docs/spikes/lwc-webkitgtk.md)",
    };
    overlay.textContent = JSON.stringify(report, null, 1);
    if (invoke) {
      await invoke("spike_finish", { report: JSON.stringify(report, null, 1), exitAfter: cfg.autorun });
    }
  };

  if (!cfg.autorun) {
    const btn = document.createElement("button");
    btn.textContent = "start benchmark";
    btn.addEventListener("click", () => {
      samples.length = 0;
      running = true;
      phase = "warmup";
      phaseStart = performance.now();
      startWall = 0;
      btn.remove();
    });
    overlay.appendChild(btn);
  } else {
    phaseStart = performance.now();
  }

  raf = requestAnimationFrame(tick);
}

void main();
