/**
 * Primitives C tests (P1-T04): DataGrid virtualization + keyboard,
 * Tree expand/collapse/roving, HotkeyRecorder capture + conflicts,
 * EmptyState semantics.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { DataGrid } from "./datagrid/DataGrid";
import { Tree, type TreeNodeData } from "./tree/Tree";
import { HotkeyRecorder } from "./hotkey-recorder/HotkeyRecorder";
import { EmptyState } from "./empty-state/EmptyState";

const ROWS_50K = Array.from({ length: 50_000 }, (_, i) => ({
  id: `r${i}`,
  symbol: ["BTC/USDT", "EUR/USD", "AAPL", "XAU/USD"][i % 4] as string,
  pnl: (i * 7.3) % 400 - 150,
}));

describe("DataGrid", () => {
  it("virtualizes 50k rows — only the visible window is in the DOM", () => {
    render(
      <DataGrid
        label="g"
        rows={ROWS_50K}
        height={160}
        rowKey={(r) => r.id}
        columns={[
          { key: "id", header: "Id", width: 80 },
          { key: "symbol", header: "Symbol", width: 110 },
        ]}
      />,
    );
    const grid = screen.getByRole("grid");
    expect(grid.getAttribute("aria-rowcount")).toBe("50000");
    const renderedRows = grid.querySelectorAll("[role=row]");
    // header + visible window (160/32 + overscan 2×6) — far below 50k
    expect(renderedRows.length).toBeLessThan(40);
    expect(renderedRows.length).toBeGreaterThan(5);
    // first row rendered, deep row not
    expect(screen.queryByText("r0")).not.toBeNull();
    expect(screen.queryByText("r49999")).toBeNull();
  });

  it("scrolling to the bottom renders the tail rows", () => {
    render(
      <DataGrid
        label="g"
        rows={ROWS_50K}
        height={160}
        rowKey={(r) => r.id}
        columns={[{ key: "id", header: "Id" }]}
      />,
    );
    const scroller = screen.getByTestId("grid-scroll") as HTMLDivElement;
    scroller.scrollTop = 50_000 * 32; // clamp to max by the browser; jsdom stores it
    fireEvent.scroll(scroller);
    expect(screen.getByText("r49999")).toBeTruthy();
  });

  it("keyboard roving moves aria-activedescendant; Enter activates; click selects", () => {
    const onActivate = vi.fn();
    function Harness(): React.JSX.Element {
      const [sel, setSel] = useState<string | null>(null);
      return (
        <DataGrid
          label="g"
          rows={ROWS_50K}
          height={160}
          rowKey={(r) => r.id}
          selectedKey={sel}
          onSelect={(r) => setSel(r.id)}
          onActivate={onActivate}
          columns={[{ key: "id", header: "Id" }]}
        />
      );
    }
    render(<Harness />);
    const grid = screen.getByRole("grid");
    expect(grid.getAttribute("aria-activedescendant")).toContain("r0");
    fireEvent.keyDown(grid, { key: "ArrowDown" });
    expect(grid.getAttribute("aria-activedescendant")).toContain("r1");
    fireEvent.keyDown(grid, { key: "Enter" });
    expect(onActivate).toHaveBeenCalledWith(ROWS_50K[1]);

    const row1 = screen.getByText("r1").closest("[role=row]") as HTMLElement;
    fireEvent.click(row1);
    expect(row1.getAttribute("aria-selected")).toBe("true");
  });
});

const TREE_NODES: TreeNodeData[] = [
  {
    id: "watch",
    label: "Watchlists",
    children: [
      { id: "crypto", label: "Crypto", children: [{ id: "btc", label: "BTC" }] },
      { id: "fx", label: "Forex" },
    ],
  },
];

describe("Tree", () => {
  it("renders expanded by default; roving + Enter selects", async () => {
    const onSelect = vi.fn();
    render(<Tree label="t" nodes={TREE_NODES} onSelect={onSelect} />);
    const tree = screen.getByRole("tree", { name: "t" });
    const btc = tree.querySelector('[data-tree-id="btc"]') as HTMLElement;
    expect(btc).toBeTruthy();
    expect(btc.getAttribute("aria-level")).toBe("3");

    // active starts at the root; ArrowDown ×2 → btc; Enter selects
    fireEvent.keyDown(tree, { key: "ArrowDown" });
    fireEvent.keyDown(tree, { key: "ArrowDown" });
    fireEvent.keyDown(tree, { key: "Enter" });
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith("btc"));
  });

  it("ArrowLeft collapses, ArrowRight re-expands (aria-expanded)", () => {
    render(<Tree label="t" nodes={TREE_NODES} />);
    const tree = screen.getByRole("tree", { name: "t" });
    const watch = tree.querySelector('[data-tree-id="watch"]') as HTMLElement;
    expect(watch.getAttribute("aria-expanded")).toBe("true");

    // active is root; Left collapses it
    fireEvent.keyDown(tree, { key: "ArrowLeft" });
    expect(watch.getAttribute("aria-expanded")).toBe("false");
    expect(tree.querySelector('[data-tree-id="crypto"]')).toBeNull();

    // Right re-expands; children are back
    fireEvent.keyDown(tree, { key: "ArrowRight" });
    expect(watch.getAttribute("aria-expanded")).toBe("true");
    expect(tree.querySelector('[data-tree-id="crypto"]')).toBeTruthy();
  });

  it("click selects (aria-selected)", () => {
    function Harness(): React.JSX.Element {
      const [sel, setSel] = useState<string | null>(null);
      return <Tree label="t" nodes={TREE_NODES} selectedId={sel} onSelect={setSel} />;
    }
    render(<Harness />);
    const tree = screen.getByRole("tree", { name: "t" });
    const fx = tree.querySelector('[data-tree-id="fx"]') as HTMLElement;
    fireEvent.click(fx);
    expect(fx.getAttribute("aria-selected")).toBe("true");
  });
});

describe("HotkeyRecorder", () => {
  it("records a combo with modifiers and reports no conflict", () => {
    const onChange = vi.fn();
    render(<HotkeyRecorder label="hk" value={null} existing={[]} onChange={onChange} />);
    const btn = screen.getByRole("button", { name: "hk" });
    fireEvent.click(btn);
    expect(btn.getAttribute("data-recording")).toBe("true");
    fireEvent.keyDown(btn, { key: "k", ctrlKey: true });
    expect(onChange).toHaveBeenCalledWith("Ctrl+K", false);
    expect(btn.getAttribute("data-recording")).toBeNull();
    expect(btn.textContent).toBe("not set"); // value prop unchanged (controlled)
  });

  it("Escape cancels recording", () => {
    const onChange = vi.fn();
    render(<HotkeyRecorder label="hk" value={null} onChange={onChange} />);
    const btn = screen.getByRole("button", { name: "hk" });
    fireEvent.click(btn);
    fireEvent.keyDown(btn, { key: "Escape" });
    expect(btn.getAttribute("data-recording")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("pure modifiers are ignored; conflicts are flagged", () => {
    const onChange = vi.fn();
    render(<HotkeyRecorder label="hk" value={null} existing={["Ctrl+K"]} onChange={onChange} />);
    const btn = screen.getByRole("button", { name: "hk" });
    fireEvent.click(btn);
    fireEvent.keyDown(btn, { key: "Control" });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(btn, { key: "k", ctrlKey: true });
    expect(onChange).toHaveBeenCalledWith("Ctrl+K", true);
    expect(screen.getByText("already in use")).toBeTruthy();
  });
});

describe("EmptyState", () => {
  it("renders title, hint, and an actionable button", () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        title="No alerts yet"
        hint="Create one to get notified."
        action={{ label: "Create alert", onClick }}
      />,
    );
    expect(screen.getByText("No alerts yet")).toBeTruthy();
    expect(screen.getByText("Create one to get notified.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Create alert" }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
