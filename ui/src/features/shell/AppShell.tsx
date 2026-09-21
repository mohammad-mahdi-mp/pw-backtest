/**
 * App shell (P1-T05) — the §5.2 workspace skeleton: top toolbar (36 px),
 * left drawing bar (36 px, toggleable), chart pane area with 1/2/4 layouts +
 * active-pane ring, right widget bar (280 px, resizable, hideable), bottom
 * dock (140 px min, resizable, hideable), and the status bar (24 px).
 *
 * This card ships the *frame* only: chart panes render EmptyState
 * placeholders until the chart core lands (P1-T07), and dock/tool buttons
 * toast their owning card. Geometry + visibility + layout + active pane all
 * persist via the workspace store (localStorage fallback until P1-T11).
 */

import { useEffect, useRef, type ReactNode } from "react";

import { EmptyState } from "../../components/empty-state/EmptyState";
import { toast } from "../../components/toast/store";
import { navigate } from "../../lib/router";
import {
  DOCK_MIN,
  LAYOUT_PANES,
  useWorkspace,
  type PaneLayout,
} from "./workspace";

// ---------------------------------------------------------------------------
// Small shared bits
// ---------------------------------------------------------------------------

function ToolButton(props: {
  label: string;
  stub: string;
  onClick?: () => void;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <button
      aria-label={props.label}
      title={props.label}
      className="h-7 min-w-7 px-1.5 flex items-center gap-1 rounded text-text-2 hover:bg-bg-elev hover:text-text text-[12px]"
      onClick={() => {
        if (props.onClick) props.onClick();
        else toast.info(`${props.label} → lands in ${props.stub}`);
      }}
    >
      {props.children}
    </button>
  );
}

const Divider = (): React.JSX.Element => <span className="w-px h-5 bg-border mx-1" aria-hidden="true" />;

// ---------------------------------------------------------------------------
// Top toolbar (§5.2 — 36 px)
// ---------------------------------------------------------------------------

const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d", "1w", "1M"] as const;

function TopToolbar(): React.JSX.Element {
  return (
    <header
      data-testid="top-toolbar"
      className="h-9 flex items-center px-2 gap-1 border-b border-border bg-bg select-none"
    >
      <ToolButton label="symbol search" stub="P1-T10">
        <span className="font-semibold text-text">BTCUSDT</span>
        <span className="text-text-3">· 1d · candles</span>
      </ToolButton>
      <Divider />
      <div role="group" aria-label="timeframes" className="flex items-center gap-0.5">
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf}
            aria-label={`timeframe ${tf}`}
            className="h-7 min-w-7 px-1 rounded text-[12px] text-text-2 hover:bg-bg-elev hover:text-text"
            onClick={() => toast.info(`timeframe ${tf} → chart core lands in P1-T07`)}
          >
            {tf}
          </button>
        ))}
      </div>
      <Divider />
      <ToolButton label="indicators" stub="P1-T10">ƒx</ToolButton>
      <ToolButton label="alerts" stub="P8">⏱</ToolButton>
      <ToolButton label="replay" stub="P3">↺</ToolButton>
      <ToolButton label="snapshot" stub="P1-T08">📷</ToolButton>
      <ToolButton label="templates" stub="P1-T11">🖌</ToolButton>
      <span className="flex-1" />
      <LayoutButtons />
      <Divider />
      <ToolButton
        label="settings"
        stub="P1-T11"
        onClick={() => navigate("/dev-board")}
      >
        ⚙
      </ToolButton>
    </header>
  );
}

function LayoutButtons(): React.JSX.Element {
  const layout = useWorkspace((s) => s.layout);
  const setLayout = useWorkspace((s) => s.setLayout);
  return (
    <div role="group" aria-label="chart layouts" className="flex items-center gap-0.5">
      {([1, 2, 4] as PaneLayout[]).map((n) => (
        <button
          key={n}
          aria-label={`layout ${n}`}
          aria-pressed={layout === n}
          className={
            "h-7 min-w-7 px-1 rounded text-[12px] " +
            (layout === n ? "bg-bg-elev text-text" : "text-text-2 hover:bg-bg-elev")
          }
          onClick={() => setLayout(n)}
        >
          {n === 1 ? "▦" : n === 2 ? "▥" : "⊞"}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drawing bar (left, 36 px, toggleable — Ctrl+Alt+D)
// ---------------------------------------------------------------------------

function DrawingBar(): React.JSX.Element {
  return (
    <aside
      data-testid="drawing-bar"
      aria-label="drawing tools"
      className="w-9 flex flex-col items-center gap-1 py-2 border-r border-border bg-bg"
    >
      {["cursor", "trend", "horizontal", "vertical", "rectangle", "fib", "magnet", "eraser"].map(
        (tool) => (
          <ToolButton key={tool} label={`tool ${tool}`} stub="P1-T09">
            <span aria-hidden="true" className="text-[13px]">
              {TOOL_GLYPHS[tool] ?? "·"}
            </span>
          </ToolButton>
        ),
      )}
    </aside>
  );
}

const TOOL_GLYPHS: Record<string, string> = {
  cursor: "✛",
  trend: "╱",
  horizontal: "─",
  vertical: "│",
  rectangle: "▭",
  fib: "≋",
  magnet: "U",
  eraser: "⌫",
};

// ---------------------------------------------------------------------------
// Chart area — 1/2/4 layouts, click-to-focus, Alt+←/→ cycle (P1-T07 fills it)
// ---------------------------------------------------------------------------

function ChartArea(): React.JSX.Element {
  const layout = useWorkspace((s) => s.layout);
  const activePane = useWorkspace((s) => s.activePane);
  const setActivePane = useWorkspace((s) => s.setActivePane);
  const n = LAYOUT_PANES[layout];

  const grid =
    layout === 1
      ? "grid-cols-1 grid-rows-1"
      : layout === 2
        ? "grid-cols-2 grid-rows-1"
        : "grid-cols-2 grid-rows-2";

  return (
    <div
      data-testid="chart-area"
      className={`grid ${grid} gap-px bg-border flex-1 min-w-0 min-h-0`}
    >
      {Array.from({ length: n }, (_, i) => (
        <section
          key={i}
          data-testid={`pane-${i}`}
          aria-label={`chart pane ${i + 1}`}
          tabIndex={0}
          className={
            "bg-bg min-w-0 min-h-0 flex items-center justify-center outline-none " +
            (activePane === i ? "ring-1 ring-inset ring-accent" : "")
          }
          onMouseDown={() => setActivePane(i)}
        >
          {i === 0 ? (
            <EmptyState
              title="Chart arrives in P1-T07"
              hint="LWC v5 price + indicator panes render here"
            />
          ) : (
            <span className="text-text-3 text-[12px]">pane {i + 1}</span>
          )}
        </section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Resizer handles (same window-tracked mouse pattern as FloatingPanel)
// ---------------------------------------------------------------------------

function VerticalResizer(props: { onDrag: (deltaPx: number) => void; label: string }): React.JSX.Element {
  const start = useRef<number | null>(null);
  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      if (start.current === null || !Number.isFinite(e.clientX)) return;
      props.onDrag(e.clientX - start.current);
      start.current = e.clientX;
    };
    const onUp = (): void => {
      start.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [props]);
  return (
    <div
      role="separator"
      aria-label={props.label}
      aria-orientation="vertical"
      data-testid="resizer-right"
      className="w-1 cursor-col-resize bg-border hover:bg-accent/60"
      onMouseDown={(e) => {
        start.current = e.clientX;
      }}
    />
  );
}

function HorizontalResizer(props: { onDrag: (deltaPx: number) => void; label: string }): React.JSX.Element {
  const start = useRef<number | null>(null);
  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      if (start.current === null || !Number.isFinite(e.clientY)) return;
      props.onDrag(e.clientY - start.current);
      start.current = e.clientY;
    };
    const onUp = (): void => {
      start.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [props]);
  return (
    <div
      role="separator"
      aria-label={props.label}
      aria-orientation="horizontal"
      data-testid="resizer-dock"
      className="h-1 cursor-row-resize bg-border hover:bg-accent/60"
      onMouseDown={(e) => {
        start.current = e.clientY;
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Right widget bar (280 px default, resizable, hideable — Ctrl+Alt+R)
// ---------------------------------------------------------------------------

const RIGHT_TABS = ["watchlists", "screener", "alerts", "objects"] as const;
const DOCK_TABS = ["trade", "strategy", "screener", "journal", "data", "account"] as const;

function TabStrip(props: {
  tabs: readonly string[];
  active: string;
  onSelect: (id: string) => void;
  testid: string;
}): React.JSX.Element {
  return (
    <div role="tablist" aria-label={props.testid} className="flex items-center gap-0.5 px-1 border-b border-border h-8 shrink-0">
      {props.tabs.map((t) => (
        <button
          key={t}
          role="tab"
          aria-selected={props.active === t}
          data-testid={`${props.testid}-tab-${t}`}
          className={
            "h-6 px-2 rounded text-[12px] capitalize " +
            (props.active === t ? "bg-bg-elev text-text" : "text-text-2 hover:bg-bg-elev")
          }
          onClick={() => props.onSelect(t)}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

function RightBar(): React.JSX.Element {
  const width = useWorkspace((s) => s.rightWidth);
  const setRightWidth = useWorkspace((s) => s.setRightWidth);
  const tab = useWorkspace((s) => s.rightTab);
  const setTab = useWorkspace((s) => s.setRightTab);
  return (
    <div className="flex h-full">
      <VerticalResizer label="resize widget bar" onDrag={(d) => setRightWidth(width + d)} />
      <aside
        data-testid="right-bar"
        style={{ width }}
        className="flex flex-col border-l border-border bg-bg min-w-0"
      >
        <TabStrip tabs={RIGHT_TABS} active={tab} onSelect={setTab} testid="right-tabs" />
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <span className="text-text-3 text-[12px] px-4 text-center">
            {tab} — widget lands with its feature card
          </span>
        </div>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bottom dock (140 px min, resizable, hideable — Ctrl+Alt+B)
// ---------------------------------------------------------------------------

function BottomDock(): React.JSX.Element {
  const height = useWorkspace((s) => s.dockHeight);
  const setDockHeight = useWorkspace((s) => s.setDockHeight);
  const tab = useWorkspace((s) => s.bottomTab);
  const setTab = useWorkspace((s) => s.setBottomTab);
  return (
    <section data-testid="bottom-dock" style={{ height }} className="flex flex-col border-t border-border bg-bg shrink-0">
      <HorizontalResizer label="resize bottom dock" onDrag={(d) => setDockHeight(height - d)} />
      <TabStrip tabs={DOCK_TABS} active={tab} onSelect={setTab} testid="dock-tabs" />
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <span className="text-text-3 text-[12px]">{tab} — panel lands with its feature card</span>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Status bar (24 px)
// ---------------------------------------------------------------------------

function StatusBar(): React.JSX.Element {
  const layout = useWorkspace((s) => s.layout);
  const activePane = useWorkspace((s) => s.activePane);
  return (
    <footer
      data-testid="status-bar"
      className="h-6 flex items-center px-2 gap-3 border-t border-border bg-bg text-[11px] text-text-2 select-none shrink-0"
    >
      <span className="flex items-center gap-1" data-testid="feed-status">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-text-3" aria-hidden="true" />
        offline
      </span>
      <span data-testid="layout-indicator">
        layout {layout} · pane {activePane + 1}
      </span>
      <span className="flex-1" />
      <span>UTC</span>
      <button aria-label="open dev board" className="hover:text-text" onClick={() => navigate("/dev-board")}>
        dev board ↗
      </button>
      <span>v0.1.0-dev</span>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Shell — assembly + global hotkeys
// ---------------------------------------------------------------------------

function isTypingTarget(t: EventTarget | null): boolean {
  return (
    t instanceof HTMLElement &&
    (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)
  );
}

/** Global shell hotkeys (§5.2): layout 1/2/4, strip toggles, pane cycling. */
export const SHELL_HOTKEYS =
  "Alt+1/2/4 layouts · Alt+←/→ cycle pane · Ctrl+Alt+R widget bar · Ctrl+Alt+B dock · Ctrl+Alt+D drawing bar";

export function AppShell(): React.JSX.Element {
  const toggleRight = useWorkspace((s) => s.toggleRight);
  const toggleDock = useWorkspace((s) => s.toggleDock);
  const toggleDrawing = useWorkspace((s) => s.toggleDrawing);
  const setLayout = useWorkspace((s) => s.setLayout);
  const cyclePane = useWorkspace((s) => s.cyclePane);
  const rightVisible = useWorkspace((s) => s.rightVisible);
  const dockVisible = useWorkspace((s) => s.dockVisible);
  const drawingVisible = useWorkspace((s) => s.drawingVisible);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (isTypingTarget(e.target)) return;
      if (e.altKey && !e.ctrlKey && (e.key === "1" || e.key === "2" || e.key === "4")) {
        e.preventDefault();
        setLayout(Number(e.key) as PaneLayout);
      } else if (e.altKey && !e.ctrlKey && e.key === "ArrowRight") {
        e.preventDefault();
        cyclePane(1);
      } else if (e.altKey && !e.ctrlKey && e.key === "ArrowLeft") {
        e.preventDefault();
        cyclePane(-1);
      } else if (e.ctrlKey && e.altKey && (e.key === "r" || e.key === "R")) {
        e.preventDefault();
        toggleRight();
      } else if (e.ctrlKey && e.altKey && (e.key === "b" || e.key === "B")) {
        e.preventDefault();
        toggleDock();
      } else if (e.ctrlKey && e.altKey && (e.key === "d" || e.key === "D")) {
        e.preventDefault();
        toggleDrawing();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setLayout, cyclePane, toggleRight, toggleDock, toggleDrawing]);

  return (
    <div data-testid="app-shell" className="h-screen w-screen flex flex-col bg-bg text-text overflow-hidden">
      <TopToolbar />
      <div className="flex flex-1 min-h-0">
        {drawingVisible && <DrawingBar />}
        <div className="flex flex-col flex-1 min-w-0">
          <ChartArea />
          {dockVisible && <BottomDock />}
        </div>
        {rightVisible && <RightBar />}
      </div>
      <StatusBar />
    </div>
  );
}

/** DOCK_MIN re-export keeps the §5.2 minimum asserted in one place (tests). */
export { DOCK_MIN };
