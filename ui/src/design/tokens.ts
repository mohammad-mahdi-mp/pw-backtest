/**
 * Design tokens — frozen contract (EXECUTION_PLAN.md §1.6).
 *
 * Single source of truth for every color, size, and motion value in the UI
 * (NATIVE_PLAN.md §5.1). Components must read these — zero raw hex outside
 * this file and the generated theme layer. Any new token is a `contract:`
 * task that updates §1.6 and this file together.
 *
 * The default values describe the "Grey" theme (TradingView dark default).
 * Theme variants (Black/Blue/White + saved themes) swap these values at the
 * CSS-var layer in the Phase-1 theme engine (P1-T01).
 */

export const tokens = {
  color: {
    /** Toolbars, panels, dialogs. */
    bg: "#131722",
    /** Hover surfaces, dock, menus. */
    bgElev: "#1e222d",
    /** Chart canvas gradient top. */
    bgChartTop: "#131722",
    /** Chart canvas gradient bottom. */
    bgChartBottom: "#10141d",
    /** 1px separators. */
    border: "#2a2e39",
    /** Primary text. */
    text: "#d1d4dc",
    /** Secondary text. */
    text2: "#b2b5be",
    /** Muted/meta text. */
    text3: "#787b86",
    /** Primary buttons, links, active states, focus ring. */
    accent: "#2962ff",
    /** Bullish candles, positive P&L. */
    up: "#089981",
    /** Bearish candles, negative P&L. */
    down: "#f23645",
    /** 15% alpha of `up` — volume bars, heat cells. */
    up15: "rgba(8, 153, 129, 0.15)",
    /** 15% alpha of `down` — volume bars, heat cells. */
    down15: "rgba(242, 54, 69, 0.15)",
    /** Chart gridlines. */
    grid: "#1e222d",
    /** Crosshair lines and price/date tags. */
    crosshair: "#758696",
  },
  typography: {
    family: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
    weights: {
      regular: 400,
      medium: 500,
      semibold: 600,
    },
    /** px scale: 11 status/meta · 12 dense grid · 13 default · 14 dialog titles · 16 empty-state headers. */
    size: {
      meta: 11,
      dense: 12,
      base: 13,
      title: 14,
      emptyState: 16,
    },
    /** Prices and all numeric columns render tabular. */
    tabularNums: true,
    /** User font-size setting: S=12 / M=13 / L=14 base. */
    fontSizeSetting: {
      s: 12,
      m: 13,
      l: 14,
    },
  },
  radius: {
    /** Inputs, buttons, chips. */
    input: 4,
    /** Dialogs and floating cards. */
    dialog: 8,
  },
  motion: {
    /** Transition duration range (ms) — no springs, ease-out only. */
    minMs: 120,
    maxMs: 160,
    easing: "ease-out",
  },
  icon: {
    set: "lucide",
    size: 16,
    strokeWidth: 1.5,
  },
  density: {
    /** Row height px: comfortable / compact (grids, watchlist, dock tabs). */
    rowComfortable: 32,
    rowCompact: 26,
  },
} as const;

export type Tokens = typeof tokens;

/** Convenience alias for the color tokens (most-referenced group). */
export const colors = tokens.color;
