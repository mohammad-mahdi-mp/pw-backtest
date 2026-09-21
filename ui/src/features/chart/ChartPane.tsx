/**
 * ChartPane (P1-T07) — React wrapper around one ChartController. Loads bars
 * from IPC first and falls back silently to the deterministic fixture
 * provider (the data layer lands in Phase 2; toasts stay off for chart
 * loads so a browser preview doesn't spam errors).
 */

import { useEffect, useRef } from "react";

import { dataBarsGet, type Bar, type Tf } from "../../lib/ipc";
import { useAppearance } from "../../design/settings";
import { synthBars } from "./bars";
import { ChartController, type ChartType } from "./chartController";

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

export interface ChartPaneProps {
  symbol: string;
  tf: Tf;
  barCount?: number;
  chartType?: ChartType;
  /** Fires once after attach — dev-board bench grabs the controller here. */
  onController?: (c: ChartController) => void;
  testid?: string;
}

/** pw-backtest chart pane (one LWC instance per shell pane). */
export function ChartPane(props: ChartPaneProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<ChartController | null>(null);
  const onControllerRef = useRef(props.onController);
  onControllerRef.current = props.onController;

  const symbol = props.symbol;
  const tf = props.tf;
  const barCount = props.barCount ?? 1200;

  useEffect(() => {
    const controller = new ChartController({ themeId: useAppearance.getState().theme });
    const el = containerRef.current;
    if (!el) return;
    controller.attach(el);
    controllerRef.current = controller;
    onControllerRef.current?.(controller);
    let cancelled = false;
    void loadBars(symbol, tf, barCount).then(({ bars }) => {
      if (!cancelled) controller.setBars(bars);
    });
    return () => {
      cancelled = true;
      controller.detach();
      controllerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, tf, barCount]);

  useEffect(() => {
    controllerRef.current?.setType(props.chartType ?? "candles");
  }, [props.chartType]);

  const themeId = useAppearance((s) => s.theme);
  useEffect(() => {
    controllerRef.current?.setTheme(themeId);
  }, [themeId]);

  return (
    <div
      ref={containerRef}
      data-testid={props.testid ?? "chart-canvas"}
      className="w-full h-full min-w-0 min-h-0"
    />
  );
}
