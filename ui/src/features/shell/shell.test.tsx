/**
 * P1-T05 tests — §5.2 shell frame: regions present, resizers, hide hotkeys,
 * layouts 1/2/4, active-pane ring, dock/right tab strips, and restart
 * persistence through the localStorage fallback.
 */

import { describe, expect, it, beforeEach, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

// The shell mounts real LWC charts per pane — jsdom has no canvas.
vi.mock("../chart/ChartPane", () => ({
  ChartPane: (): React.JSX.Element => <div data-testid="chart-canvas" />,
}));

import { AppShell } from "./AppShell";
import { hydrateWorkspace, useWorkspace } from "./workspace";

const LS_KEY = "pw.workspace";

const DEFAULT_PANES = [
  { symbol: "BTCUSDT", tf: "1d" },
  { symbol: "BTCUSDT", tf: "1d" },
  { symbol: "BTCUSDT", tf: "1d" },
  { symbol: "BTCUSDT", tf: "1d" },
] as const;

function resetStore(): void {
  // Fresh-process defaults (zustand module state survives between tests).
  useWorkspace.setState({
    rightWidth: 280,
    rightVisible: true,
    dockHeight: 200,
    dockVisible: true,
    drawingVisible: true,
    layout: 1,
    activePane: 0,
    bottomTab: "trade",
    rightTab: "watchlists",
    panes: [...DEFAULT_PANES],
  });
  localStorage.removeItem(LS_KEY);
}

beforeEach(resetStore);

describe("shell frame", () => {
  it("renders all §5.2 regions", () => {
    render(<AppShell />);
    expect(screen.getByTestId("top-toolbar")).not.toBeNull();
    expect(screen.getByTestId("drawing-bar")).not.toBeNull();
    expect(screen.getByTestId("chart-area")).not.toBeNull();
    expect(screen.getByTestId("right-bar")).not.toBeNull();
    expect(screen.getByTestId("bottom-dock")).not.toBeNull();
    expect(screen.getByTestId("status-bar")).not.toBeNull();
    expect(screen.getByTestId("pane-0")).not.toBeNull();
  });

  it("right bar default width is 280 and resizes via the drag handle", () => {
    render(<AppShell />);
    const bar = screen.getByTestId("right-bar");
    expect(bar.style.width).toBe("280px");
    const resizer = screen.getByTestId("resizer-right");
    fireEvent.mouseDown(resizer, { clientX: 500 });
    fireEvent.mouseMove(window, { clientX: 540 });
    fireEvent.mouseUp(window, { clientX: 540 });
    expect(bar.style.width).toBe("320px");
  });

  it("dock resizes and clamps at the 140 px §5.2 minimum", () => {
    render(<AppShell />);
    const dock = screen.getByTestId("bottom-dock");
    const resizer = screen.getByTestId("resizer-dock");
    // The handle sits on the dock's top edge: dragging up grows the dock.
    fireEvent.mouseDown(resizer, { clientY: 400 });
    fireEvent.mouseMove(window, { clientY: 370 }); // up 30 → 230
    fireEvent.mouseUp(window, { clientY: 370 });
    expect(dock.style.height).toBe("230px");
    fireEvent.mouseDown(resizer, { clientY: 370 });
    fireEvent.mouseMove(window, { clientY: 700 }); // down 330 → clamped
    fireEvent.mouseUp(window, { clientY: 700 });
    expect(dock.style.height).toBe("140px");
  });

  it("hide hotkeys toggle right bar / dock / drawing bar", () => {
    render(<AppShell />);
    fireEvent.keyDown(window, { key: "r", ctrlKey: true, altKey: true });
    expect(screen.queryByTestId("right-bar")).toBeNull();
    fireEvent.keyDown(window, { key: "r", ctrlKey: true, altKey: true });
    expect(screen.getByTestId("right-bar")).not.toBeNull();

    fireEvent.keyDown(window, { key: "b", ctrlKey: true, altKey: true });
    expect(screen.queryByTestId("bottom-dock")).toBeNull();
    fireEvent.keyDown(window, { key: "b", ctrlKey: true, altKey: true });
    expect(screen.getByTestId("bottom-dock")).not.toBeNull();

    fireEvent.keyDown(window, { key: "d", ctrlKey: true, altKey: true });
    expect(screen.queryByTestId("drawing-bar")).toBeNull();
    fireEvent.keyDown(window, { key: "d", ctrlKey: true, altKey: true });
    expect(screen.getByTestId("drawing-bar")).not.toBeNull();
  });

  it("layouts 1/2/4 switch pane counts via buttons and Alt+1/2/4", () => {
    render(<AppShell />);
    expect(screen.getByTestId("pane-0")).not.toBeNull();
    expect(screen.queryByTestId("pane-1")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "layout 2" }));
    expect(screen.getByTestId("pane-1")).not.toBeNull();

    fireEvent.keyDown(window, { key: "4", altKey: true });
    expect(screen.getByTestId("pane-3")).not.toBeNull();

    fireEvent.keyDown(window, { key: "1", altKey: true });
    expect(screen.queryByTestId("pane-1")).toBeNull();
  });

  it("active pane ring follows click and Alt+arrows cycle", () => {
    render(<AppShell />);
    fireEvent.click(screen.getByRole("button", { name: "layout 2" }));
    expect(screen.getByTestId("pane-0").className).toContain("ring-accent");
    fireEvent.mouseDown(screen.getByTestId("pane-1"));
    expect(screen.getByTestId("pane-1").className).toContain("ring-accent");
    expect(screen.getByTestId("pane-0").className).not.toContain("ring-accent");

    fireEvent.keyDown(window, { key: "ArrowRight", altKey: true }); // wraps 1 → 0
    expect(screen.getByTestId("pane-0").className).toContain("ring-accent");
    fireEvent.keyDown(window, { key: "ArrowLeft", altKey: true }); // 0 → 1
    expect(screen.getByTestId("pane-1").className).toContain("ring-accent");
  });

  it("dock and widget tab strips switch the active tab", () => {
    render(<AppShell />);
    fireEvent.click(screen.getByTestId("dock-tabs-tab-journal"));
    expect(screen.getByTestId("dock-tabs-tab-journal").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("dock-tabs-tab-trade").getAttribute("aria-selected")).toBe("false");
    fireEvent.click(screen.getByTestId("right-tabs-tab-alerts"));
    expect(screen.getByTestId("right-tabs-tab-alerts").getAttribute("aria-selected")).toBe("true");
  });

  it("layout geometry persists across a restart (store reset + hydrate)", () => {
    const first = render(<AppShell />);
    fireEvent.mouseDown(screen.getByTestId("resizer-right"), { clientX: 500 });
    fireEvent.mouseMove(window, { clientX: 560 }); // → 340
    fireEvent.mouseUp(window, { clientX: 560 });
    fireEvent.click(screen.getByRole("button", { name: "layout 4" }));
    first.unmount();

    const saved = localStorage.getItem(LS_KEY);
    expect(saved).not.toBeNull();

    // Simulate a fresh process: default store state, persisted config intact.
    resetStoreStateOnly();
    hydrateWorkspace(saved);
    render(<AppShell />);
    expect(screen.getByTestId("right-bar").style.width).toBe("340px");
    expect(screen.getByTestId("pane-3")).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// P1-T08 — per-pane symbol/TF + live toolbar
// ---------------------------------------------------------------------------

describe("P1-T08 pane sources", () => {
  beforeEach(resetStore);

  it("toolbar TF buttons switch the active pane's timeframe", () => {
    render(<AppShell />);
    const tf1h = screen.getByRole("button", { name: "timeframe 1h" });
    expect(tf1h.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(tf1h);
    expect(screen.getByRole("button", { name: "timeframe 1h" }).getAttribute("aria-pressed")).toBe("true");
    expect(useWorkspace.getState().panes[0]).toEqual({ symbol: "BTCUSDT", tf: "1h" });
    // the symbol chip mirrors the active pane
    expect(screen.getByTestId("top-toolbar").textContent).toContain("BTCUSDT");
    expect(screen.getByTestId("top-toolbar").textContent).toContain("1h");
  });

  it("each pane keeps its own symbol/TF (layout 2)", () => {
    render(<AppShell />);
    fireEvent.click(screen.getByRole("button", { name: "layout 2" }));
    fireEvent.mouseDown(screen.getByTestId("pane-1")); // focus pane 2
    fireEvent.click(screen.getByRole("button", { name: "timeframe 4h" }));
    const panes = useWorkspace.getState().panes;
    expect(panes[0]).toEqual({ symbol: "BTCUSDT", tf: "1d" });
    expect(panes[1]).toEqual({ symbol: "BTCUSDT", tf: "4h" });
  });

  it("per-pane symbol/TF persists across a restart", () => {
    const first = render(<AppShell />);
    useWorkspace.getState().setPaneSource(2, { symbol: "ETHUSDT", tf: "1w" });
    first.unmount();
    const saved = localStorage.getItem(LS_KEY);
    expect(saved).not.toBeNull();

    resetStoreStateOnly();
    hydrateWorkspace(saved);
    render(<AppShell />);
    expect(useWorkspace.getState().panes[2]).toEqual({ symbol: "ETHUSDT", tf: "1w" });
    expect(useWorkspace.getState().panes[0]).toEqual({ symbol: "BTCUSDT", tf: "1d" });
  });

  it("hydrate rejects a corrupt pane slot (falls back to defaults)", () => {
    const saved = {
      rightWidth: 280,
      rightVisible: true,
      dockHeight: 200,
      dockVisible: true,
      drawingVisible: true,
      layout: 1,
      activePane: 0,
      bottomTab: "trade",
      rightTab: "watchlists",
      panes: [{ symbol: "BTCUSDT", tf: "9x" }, "oops", null, { symbol: "ETHUSDT", tf: "1h" }],
    };
    hydrateWorkspace(JSON.stringify(saved));
    const panes = useWorkspace.getState().panes;
    expect(panes[0]).toEqual({ symbol: "BTCUSDT", tf: "1d" }); // bad tf → default
    expect(panes[1]).toEqual({ symbol: "BTCUSDT", tf: "1d" }); // garbage → default
    expect(panes[2]).toEqual({ symbol: "BTCUSDT", tf: "1d" }); // null → default
    expect(panes[3]).toEqual({ symbol: "ETHUSDT", tf: "1h" }); // valid → kept
  });
});

function resetStoreStateOnly(): void {
  useWorkspace.setState({
    rightWidth: 280,
    rightVisible: true,
    dockHeight: 200,
    dockVisible: true,
    drawingVisible: true,
    layout: 1,
    activePane: 0,
    bottomTab: "trade",
    rightTab: "watchlists",
    panes: [...DEFAULT_PANES],
  });
}
