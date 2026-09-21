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

import { appSettingsSet } from "../../lib/ipc";

export type PaneLayout = 1 | 2 | 4;

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
};

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
  reset: () => {
    set({ ...defaults });
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
  };
}
