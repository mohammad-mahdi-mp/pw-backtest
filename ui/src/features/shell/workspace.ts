/**
 * Workspace layout store (P1-T05) — owns the §5.2 shell geometry: right
 * widget bar (280 px default, resizable, hideable), bottom dock (140 px min,
 * resizable, hideable), drawing bar visibility, pane layouts 1/2/4 with the
 * active pane, and the active tab of each docked strip.
 *
 * Persistence: IPC `app_settings_set({ section: "workspace" })` first, with a
 * `localStorage["pw.workspace"]` fallback that is authoritative until the
 * config layer lands (P1-T11) — identical policy to the appearance store.
 */

import { create } from "zustand";

import { appSettingsSet, type Tf } from "../../lib/ipc";
import { isTf } from "../chart/interactions";

export type PaneLayout = 1 | 2 | 4;

/**
 * Per-pane chart source (P1-T08): symbol + timeframe. Always 4 entries —
 * panes beyond the current layout keep their source so "hide pane" and
 * layout switches are lossless. Symbol *search* lands in P1-T10; until then
 * the symbol is set programmatically / via the store.
 */
export interface PaneSource {
  symbol: string;
  tf: Tf;
}

export interface WorkspaceState {
  /** Right widget bar width in px (200–480). */
  rightWidth: number;
  rightVisible: boolean;
  /** Bottom dock height in px (140–420). */
  dockHeight: number;
  dockVisible: boolean;
  drawingVisible: boolean;
  layout: PaneLayout;
  /** Index of the focused pane (0-based, follows click / Alt+arrows). */
  activePane: number;
  bottomTab: string;
  rightTab: string;
  /** Symbol + timeframe of each of the 4 chart slots. */
  panes: PaneSource[];
  setRightWidth: (px: number) => void;
  setDockHeight: (px: number) => void;
  toggleRight: () => void;
  toggleDock: () => void;
  toggleDrawing: () => void;
  setLayout: (n: PaneLayout) => void;
  setActivePane: (i: number) => void;
  /** Alt+←/→ — cycles the active pane within the current layout. */
  cyclePane: (dir: 1 | -1) => void;
  setBottomTab: (id: string) => void;
  setRightTab: (id: string) => void;
  /** Replaces the symbol/TF of one chart slot (P1-T08 TF switching). */
  setPaneSource: (index: number, source: PaneSource) => void;
  /** Test/dev hook — restores defaults and clears persistence. */
  reset: () => void;
}

export const RIGHT_MIN = 200;
export const RIGHT_MAX = 480;
export const DOCK_MIN = 140;
export const DOCK_MAX = 420;
export const LAYOUT_PANES: Record<PaneLayout, number> = { 1: 1, 2: 2, 4: 4 };

const LS_KEY = "pw.workspace";
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** The four chart slots (P1-T08); the fixture symbol until P1-T10/P2. */
const PANE_SLOTS = 4;
function defaultPanes(): PaneSource[] {
  return Array.from({ length: PANE_SLOTS }, (): PaneSource => ({ symbol: "BTCUSDT", tf: "1d" }));
}

const defaults = {
  rightWidth: 280,
  rightVisible: true,
  dockHeight: 200,
  dockVisible: true,
  drawingVisible: true,
  layout: 1 as PaneLayout,
  activePane: 0,
  bottomTab: "trade",
  rightTab: "watchlists",
  panes: defaultPanes(),
};

/** Validates a persisted pane slot; unknown TFs fall back to 1d. */
function sanitizePaneSource(raw: unknown): PaneSource {
  const fallback = { symbol: "BTCUSDT", tf: "1d" as Tf };
  if (typeof raw !== "object" || raw === null) return fallback;
  const r = raw as Partial<PaneSource>;
  const symbol = typeof r.symbol === "string" && r.symbol.length > 0 ? r.symbol : fallback.symbol;
  const tf = isTf(r.tf) ? r.tf : fallback.tf;
  return { symbol, tf };
}

type Persistable = Pick<
  WorkspaceState,
  | "rightWidth"
  | "rightVisible"
  | "dockHeight"
  | "dockVisible"
  | "drawingVisible"
  | "layout"
  | "activePane"
  | "bottomTab"
  | "rightTab"
  | "panes"
>;

function persist(s: Persistable): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch {
    // storage unavailable — layout is session-only
  }
  void appSettingsSet({ section: "workspace", patch: { ...s } }).catch(() => {
    // typed not_implemented until P1-T11 — the fallback above is authoritative
  });
}

/** Re-applies a stored workspace snapshot (used on boot and in tests). */
export function hydrateWorkspace(raw: string | null): void {
  if (!raw) return;
  try {
    const saved = JSON.parse(raw) as Partial<Persistable>;
    const s = useWorkspace.getState();
    if (typeof saved.rightWidth === "number") s.setRightWidth(saved.rightWidth);
    if (typeof saved.dockHeight === "number") s.setDockHeight(saved.dockHeight);
    if (typeof saved.rightVisible === "boolean" && saved.rightVisible !== s.rightVisible)
      s.toggleRight();
    if (typeof saved.dockVisible === "boolean" && saved.dockVisible !== s.dockVisible)
      s.toggleDock();
    if (typeof saved.drawingVisible === "boolean" && saved.drawingVisible !== s.drawingVisible)
      s.toggleDrawing();
    if (saved.layout === 1 || saved.layout === 2 || saved.layout === 4) s.setLayout(saved.layout);
    if (typeof saved.activePane === "number") s.setActivePane(saved.activePane);
    if (typeof saved.bottomTab === "string") s.setBottomTab(saved.bottomTab);
    if (typeof saved.rightTab === "string") s.setRightTab(saved.rightTab);
    if (Array.isArray(saved.panes)) {
      for (let i = 0; i < PANE_SLOTS; i++) {
        if (saved.panes[i] !== undefined) s.setPaneSource(i, sanitizePaneSource(saved.panes[i]));
      }
    }
  } catch {
    // corrupt snapshot — keep defaults
  }
}

/** Loads the persisted layout from the localStorage fallback (boot time). */
export function hydrateFromStorage(): void {
  try {
    hydrateWorkspace(localStorage.getItem(LS_KEY));
  } catch {
    // no storage — defaults
  }
}

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  ...defaults,
  setRightWidth: (px) => {
    const rightWidth = clamp(Math.round(px), RIGHT_MIN, RIGHT_MAX);
    if (rightWidth === get().rightWidth) return;
    set({ rightWidth });
    persist({ ...snapshot(get()) });
  },
  setDockHeight: (px) => {
    const dockHeight = clamp(Math.round(px), DOCK_MIN, DOCK_MAX);
    if (dockHeight === get().dockHeight) return;
    set({ dockHeight });
    persist({ ...snapshot(get()) });
  },
  toggleRight: () => {
    set({ rightVisible: !get().rightVisible });
    persist({ ...snapshot(get()) });
  },
  toggleDock: () => {
    set({ dockVisible: !get().dockVisible });
    persist({ ...snapshot(get()) });
  },
  toggleDrawing: () => {
    set({ drawingVisible: !get().drawingVisible });
    persist({ ...snapshot(get()) });
  },
  setLayout: (n) => {
    if (n === get().layout) return;
    set({ layout: n, activePane: 0 });
    persist({ ...snapshot(get()) });
  },
  setActivePane: (i) => {
    const n = LAYOUT_PANES[get().layout];
    const activePane = clamp(i, 0, n - 1);
    if (activePane === get().activePane) return;
    set({ activePane });
    persist({ ...snapshot(get()) });
  },
  cyclePane: (dir) => {
    const n = LAYOUT_PANES[get().layout];
    const activePane = (get().activePane + dir + n) % n;
    set({ activePane });
    persist({ ...snapshot(get()) });
  },
  setBottomTab: (id) => {
    if (id === get().bottomTab) return;
    set({ bottomTab: id });
    persist({ ...snapshot(get()) });
  },
  setRightTab: (id) => {
    if (id === get().rightTab) return;
    set({ rightTab: id });
    persist({ ...snapshot(get()) });
  },
  setPaneSource: (index, source) => {
    if (index < 0 || index >= PANE_SLOTS) return;
    const panes = get().panes.map((p, i) => (i === index ? source : p));
    set({ panes });
    persist({ ...snapshot(get()) });
  },
  reset: () => {
    set({ ...defaults, panes: defaultPanes() });
    try {
      localStorage.removeItem(LS_KEY);
    } catch {
      // ignore
    }
  },
}));

function snapshot(s: WorkspaceState): Persistable {
  return {
    rightWidth: s.rightWidth,
    rightVisible: s.rightVisible,
    dockHeight: s.dockHeight,
    dockVisible: s.dockVisible,
    drawingVisible: s.drawingVisible,
    layout: s.layout,
    activePane: s.activePane,
    bottomTab: s.bottomTab,
    rightTab: s.rightTab,
    panes: s.panes,
  };
}
