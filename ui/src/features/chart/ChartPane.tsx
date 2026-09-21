/**
 * ChartPane (P1-T07 core, P1-T08 interactions) — React wrapper around one
 * ChartController. Loads bars from IPC first and falls back silently to the
 * deterministic fixture provider (the data layer lands in Phase 2; toasts
 * stay off for chart loads so a browser preview doesn't spam errors).
 *
 * P1-T08 adds the §5.4 interaction surface:
 *  - OHLC legend (top-left, crosshair-driven, `SYM TF · O H L C Δ%`),
 *  - data window (bottom-left recent-bars table, context-menu toggle),
 *  - context menu (TF switch, zoom to fit, scale/last-price/data-window
 *    toggles, snapshot, chart-properties stub, hide pane),
 *  - Shift+drag rubber-band time zoom (LWC's own drag is suppressed),
 *  - keyboard hotkeys — the active pane only (arrows, +/−, Ctrl+1…7,
 *    D/W/M, Alt+L, Alt+S),
 *  - Alt+S snapshot: PNG → clipboard + `screenshots/` via IPC.
 *  - 2 px top progress strip while a load is in flight (zero-spinner rule).
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { ContextMenu } from "../../components/menu/ContextMenu";
import type { MenuEntry } from "../../components/menu/MenuList";
import { toast } from "../../components/toast/store";
import { useAppearance } from "../../design/settings";
import { PwIpcError, dataBarsGet, screenshotsSave, type Bar, type Tf } from "../../lib/ipc";
import { useWorkspace } from "../shell/workspace";
import { ChartController, type ChartType } from "./chartController";
import { synthBars } from "./bars";
import {
  chartKeyAction,
  dataWindowRows,
  formatBarTime,
  formatPrice,
  legendSegments,
  registerChartPane,
  TF_ORDER,
  type LegendTone,
} from "./interactions";

export interface LoadedBars {
  bars: Bar[];
  source: "ipc" | "fixture";
}

/**
 * IPC-first bar loading with the fixture fallback. Exported for tests (the
 * controller stays free of async concerns).
 */
export async function loadBars(
  symbol: string,
  tf: Tf,
  fallbackCount: number,
): Promise<LoadedBars> {
  try {
    const r = await dataBarsGet({ symbol, timeframe: tf });
    if ("bars" in r && r.bars.length > 0) return { bars: r.bars, source: "ipc" };
  } catch {
    // typed not_implemented (until P2) or no bridge (plain-browser preview)
  }
  return { bars: synthBars(symbol, tf, fallbackCount), source: "fixture" };
}

const TONE_CLASS: Record<LegendTone, string> = {
  text: "text-text-2",
  up: "text-up",
  down: "text-down",
};

export interface ChartPaneProps {
  symbol: string;
  tf: Tf;
  barCount?: number;
  chartType?: ChartType;
  /** Shell pane index (hotkey routing + registry id). Omit on the dev board. */
  paneIndex?: number;
  /** TF switch (toolbar / +− / Ctrl+1…7 / context menu) — parent owns state. */
  onTfChange?: (tf: Tf) => void;
  /** Fires once after attach — dev-board bench grabs the controller here. */
  onController?: (c: ChartController) => void;
  testid?: string;
}

/** pw-backtest chart pane (one LWC instance per shell pane). */
export function ChartPane(props: ChartPaneProps): React.JSX.Element {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<ChartController | null>(null);
  const onControllerRef = useRef(props.onController);
  onControllerRef.current = props.onController;
  const onTfChangeRef = useRef(props.onTfChange);
  onTfChangeRef.current = props.onTfChange;

  const symbol = props.symbol;
  const tf = props.tf;
  const barCount = props.barCount ?? 1200;
  const symbolRef = useRef(symbol);
  symbolRef.current = symbol;
  const tfRef = useRef(tf);
  tfRef.current = tf;

  const [bars, setBarsState] = useState<Bar[]>([]);
  const [crossIdx, setCrossIdx] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [logScale, setLogScale] = useState(false);
  const [lastPrice, setLastPrice] = useState(true);
  const [dataWindow, setDataWindow] = useState(false);
  const [band, setBand] = useState<{ x0: number; x1: number } | null>(null);
  const bandStart = useRef<{ x0: number; rectLeft: number } | null>(null);
  // Refs so the chart-recreate effect (TF/symbol switch) can re-apply the
  // user's toggles without depending on them (deps would recreate the chart).
  const logScaleRef = useRef(logScale);
  logScaleRef.current = logScale;
  const lastPriceRef = useRef(lastPrice);
  lastPriceRef.current = lastPrice;

  const layout = useWorkspace((s) => s.layout);
  const canHidePane = props.paneIndex !== undefined && layout > 1;

  // — chart lifecycle: one controller per (symbol, tf) — -------------------
  useEffect(() => {
    const controller = new ChartController({ themeId: useAppearance.getState().theme });
    const el = innerRef.current;
    if (!el) return;
    controller.attach(el);
    controllerRef.current = controller;
    onControllerRef.current?.(controller);
    // User toggles survive TF/symbol switches (same component instance).
    controller.setLogScale(logScaleRef.current);
    controller.setLastPriceLine(lastPriceRef.current);

    let cancelled = false;
    setLoading(true);
    void loadBars(symbol, tf, barCount).then(({ bars: loaded }) => {
      if (cancelled) return;
      controller.setBars(loaded);
      setBarsState(loaded);
      setCrossIdx(null);
      setLoading(false);
    });

    const offCrosshair = controller.subscribeCrosshair((i) => setCrossIdx(i));

    const paneId = `pane-${props.paneIndex ?? "dev"}`;
    const offBinding = registerChartPane(paneId, {
      id: paneId,
      controller,
      snapshot: () => void doSnapshotRef.current(),
    });

    return () => {
      cancelled = true;
      offCrosshair();
      offBinding();
      controller.detach();
      controllerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, tf, barCount, props.paneIndex]);

  useEffect(() => {
    controllerRef.current?.setType(props.chartType ?? "candles");
  }, [props.chartType]);

  const themeId = useAppearance((s) => s.theme);
  useEffect(() => {
    controllerRef.current?.setTheme(themeId);
  }, [themeId]);

  // — Alt+S / toolbar 📷: clipboard + IPC save — ---------------------------
  const doSnapshot = useCallback(async (): Promise<void> => {
    const c = controllerRef.current;
    if (!c) return;
    const dataUrl = c.snapshotDataUrl();
    if (!dataUrl) {
      toast.error("snapshot failed — chart not ready");
      return;
    }
    let copied = false;
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        const blob = await (await fetch(dataUrl)).blob();
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        copied = true;
      }
    } catch {
      // webview without async clipboard — the save path below still lands
    }
    const dataBase64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    try {
      const r = await screenshotsSave({ name: `${symbolRef.current} ${tfRef.current}`, dataBase64 });
      toast.success(`snapshot → ${r.path}`);
    } catch (err) {
      if (err instanceof PwIpcError) {
        toast.info(
          copied
            ? "snapshot copied to clipboard (native bridge offline)"
            : "no native bridge — snapshot not saved",
        );
      } else {
        toast.error(`snapshot save failed: ${String(err)}`);
      }
    }
  }, []);
  const doSnapshotRef = useRef(doSnapshot);
  doSnapshotRef.current = doSnapshot;

  // — keyboard hotkeys (active pane only; pure mapping in interactions.ts) —
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const c = controllerRef.current;
      if (!c) return;
      if (props.paneIndex !== undefined && useWorkspace.getState().activePane !== props.paneIndex) return;
      const action = chartKeyAction(e, e.target, tf);
      if (!action) return;
      e.preventDefault();
      switch (action.kind) {
        case "step":
          c.stepBars(action.delta);
          break;
        case "zoom":
          c.zoomCenter(action.factor);
          break;
        case "scale-toggle": {
          const next = !c.getLogScale();
          c.setLogScale(next);
          setLogScale(next);
          break;
        }
        case "snapshot":
          void doSnapshotRef.current();
          break;
        case "tf":
          onTfChangeRef.current?.(action.tf);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props.paneIndex, tf]);

  // — Shift+drag rubber-band time zoom — -----------------------------------
  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      const start = bandStart.current;
      if (!start) return;
      const x1 = e.clientX - start.rectLeft;
      setBand({ x0: start.x0, x1 });
    };
    const onUp = (e: MouseEvent): void => {
      const start = bandStart.current;
      if (!start) return;
      bandStart.current = null;
      setBand(null);
      const x1 = e.clientX - start.rectLeft;
      if (Math.abs(x1 - start.x0) < 3) return; // a click, not a band
      const range = controllerRef.current?.panRangeFromPixels(start.x0, x1);
      if (range) controllerRef.current?.setVisibleRange(range);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const onBandMouseDown = useCallback(
    (e: React.MouseEvent): void => {
      if (!e.shiftKey || e.button !== 0) return;
      const inner = innerRef.current;
      if (!inner) return;
      // Capture phase: stop LWC's own drag before it starts. stopPropagation
      // also eats the section's click-to-activate, so activate explicitly.
      e.preventDefault();
      e.stopPropagation();
      if (props.paneIndex !== undefined) useWorkspace.getState().setActivePane(props.paneIndex);
      const rectLeft = inner.getBoundingClientRect().left;
      bandStart.current = { x0: e.clientX - rectLeft, rectLeft };
      setBand({ x0: e.clientX - rectLeft, x1: e.clientX - rectLeft });
    },
    [props.paneIndex],
  );

  // — context menu entries (built per render — labels mirror live state) —-
  const toggleScale = (): void => {
    const c = controllerRef.current;
    if (!c) return;
    const next = !c.getLogScale();
    c.setLogScale(next);
    setLogScale(next);
  };
  const toggleLastPrice = (): void => {
    const next = !lastPrice;
    setLastPrice(next);
    controllerRef.current?.setLastPriceLine(next);
  };
  const toggleDataWindow = (): void => {
    setDataWindow((v) => !v);
  };
  const hidePane = (): void => {
    const ws = useWorkspace.getState();
    if (ws.layout === 1) return;
    ws.setLayout(ws.layout === 4 ? 2 : 1); // pane sources stay in the store
  };

  const entries: MenuEntry[] = [
    ...TF_ORDER.map((t): MenuEntry => ({
      kind: "item",
      id: `tf-${t}`,
      label: t === tf ? `✓ ${t}` : t,
      onSelect: () => onTfChangeRef.current?.(t),
    })),
    { kind: "separator", id: "sep-tf" },
    {
      kind: "item",
      id: "zoom-fit",
      label: "Zoom to fit",
      onSelect: () => controllerRef.current?.zoomToFit(),
    },
    {
      kind: "item",
      id: "scale",
      label: logScale ? "Normal scale" : "Logarithmic scale",
      shortcut: "Alt+L",
      onSelect: toggleScale,
    },
    {
      kind: "item",
      id: "last-price",
      label: lastPrice ? "Hide last price line" : "Show last price line",
      onSelect: toggleLastPrice,
    },
    {
      kind: "item",
      id: "data-window",
      label: dataWindow ? "Hide data window" : "Show data window",
      onSelect: toggleDataWindow,
    },
    { kind: "separator", id: "sep-actions" },
    {
      kind: "item",
      id: "snapshot",
      label: "Snapshot",
      shortcut: "Alt+S",
      onSelect: () => void doSnapshot(),
    },
    {
      kind: "item",
      id: "chart-properties",
      label: "Chart properties",
      shortcut: "Ctrl+,",
      onSelect: () => toast.info("Chart properties → lands in P1-T11"),
    },
    ...(canHidePane
      ? ([
          { kind: "separator", id: "sep-pane" },
          { kind: "item", id: "hide-pane", label: "Hide pane", danger: true, onSelect: hidePane },
        ] as MenuEntry[])
      : []),
  ];

  // — legend + data window content — ----------------------------------------
  const n = bars.length;
  const shownIdx = n === 0 ? null : (crossIdx ?? n - 1);
  const legendBar = shownIdx === null ? null : bars[shownIdx]!;
  const legendPrev = shownIdx !== null && shownIdx > 0 ? bars[shownIdx - 1]! : null;
  const windowRows = dataWindow ? dataWindowRows(bars, crossIdx) : [];

  return (
    <div
      ref={outerRef}
      data-chart="pane"
      onMouseDownCapture={onBandMouseDown}
      className="relative w-full h-full min-w-0 min-h-0"
    >
      <ContextMenu className="w-full h-full" entries={entries}>
        <div ref={innerRef} className="w-full h-full" data-testid={props.testid ?? "chart-canvas"} />
      </ContextMenu>

      {/* zero-spinner rule: 2 px top strip while a load is in flight */}
      {loading && (
        <div
          data-testid="chart-loading"
          className="absolute top-0 left-0 right-0 h-0.5 bg-accent pointer-events-none"
        />
      )}

      {/* OHLC legend (§5.4) — top-left */}
      {legendBar && (
        <div
          data-testid="chart-legend"
          className="absolute top-1.5 left-2 flex items-center gap-2 text-[11px] pointer-events-none select-none"
        >
          {legendSegments(symbol, tf, legendBar, legendPrev).map((seg, i) => (
            <span key={i} className={TONE_CLASS[seg.tone]}>
              {seg.text}
            </span>
          ))}
        </div>
      )}

      {/* data window — bottom-left, toggle */}
      {windowRows.length > 0 && (
        <div
          data-testid="data-window"
          className="absolute bottom-1.5 left-2 rounded border border-border bg-bg-elev/90 px-2 py-1 text-[10px] tabular-nums pointer-events-none select-none"
        >
          <table>
            <thead>
              <tr className="text-text-3">
                <th className="pr-2 font-normal text-left">time</th>
                <th className="pr-2 font-normal text-right">O</th>
                <th className="pr-2 font-normal text-right">H</th>
                <th className="pr-2 font-normal text-right">L</th>
                <th className="pr-2 font-normal text-right">C</th>
                <th className="font-normal text-right">Vol</th>
              </tr>
            </thead>
            <tbody>
              {windowRows.map((r, i) => (
                <tr key={i} className={r.focused ? "text-text font-semibold" : "text-text-2"}>
                  <td className="pr-2">{formatBarTime(tf, r.time)}</td>
                  <td className="pr-2 text-right">{formatPrice(r.open)}</td>
                  <td className="pr-2 text-right">{formatPrice(r.high)}</td>
                  <td className="pr-2 text-right">{formatPrice(r.low)}</td>
                  <td className="pr-2 text-right">{formatPrice(r.close)}</td>
                  <td className="text-right">{r.volume}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Shift+drag rubber band */}
      {band && (
        <div
          data-testid="rubber-band"
          className="absolute top-0 bottom-0 border-x border-accent bg-accent/10 pointer-events-none"
          style={{
            left: Math.min(band.x0, band.x1),
            width: Math.max(1, Math.abs(band.x1 - band.x0)),
          }}
        />
      )}
    </div>
  );
}
