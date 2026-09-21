/**
 * Built-in theme registry (NATIVE_PLAN.md §5.1).
 *
 * Every theme overrides a subset of the Grey (default) color tokens from
 * `tokens.ts`; the resolver in `applyTheme.ts` produces the full token set.
 * User-saved themes (db `themes`, IPC) join this registry in P1-T11 — the
 * resolution/persistence machinery is built now so they plug in unchanged.
 */

import { tokens } from "./tokens";

/** Color-token shape with widened (string) values — theme overrides carry
 * different hexes than the Grey defaults, so the literal types of the
 * `as const` token table must not leak into the override type. */
type ColorTokens = Record<keyof typeof tokens.color, string>;

/** A complete resolved color set (every §5.1 token present). */
export type ResolvedColors = ColorTokens;

export interface Theme {
  /** Stable id persisted in settings (`grey` | `black` | `blue` | `white`). */
  id: string;
  /** Display name. */
  name: string;
  /** Dark canvas assumption (affects future chart defaults). */
  dark: boolean;
  /** Overrides over `tokens.color` — unset keys inherit Grey values. */
  colors: Partial<ColorTokens>;
}

export const BUILT_IN_THEMES: readonly Theme[] = [
  {
    id: "grey",
    name: "Grey",
    dark: true,
    colors: {}, // pure defaults
  },
  {
    id: "black",
    name: "Black (OLED)",
    dark: true,
    colors: {
      bg: "#000000",
      bgElev: "#0f0f0f",
      bgChartTop: "#000000",
      bgChartBottom: "#000000",
      border: "#222222",
      grid: "#161616",
    },
  },
  {
    id: "blue",
    name: "Blue",
    dark: true,
    colors: {
      bg: "#17203a",
      bgElev: "#1f2b4d",
      bgChartTop: "#17203a",
      bgChartBottom: "#131a30",
      border: "#2c3a5e",
      text: "#d6dcf0",
      text2: "#a9b3d0",
      text3: "#6f7c9e",
      grid: "#1f2b4d",
    },
  },
  {
    id: "white",
    name: "White",
    dark: false,
    colors: {
      bg: "#ffffff",
      bgElev: "#f0f3fa",
      bgChartTop: "#ffffff",
      bgChartBottom: "#f5f7fb",
      border: "#e0e3eb",
      text: "#131722",
      text2: "#50535e",
      grid: "#f0f3fa",
    },
  },
] as const;

/** Resolve a theme id to the full color token set (unknown ids → Grey). */
export function resolveTheme(themeId: string): ResolvedColors {
  const theme = BUILT_IN_THEMES.find((t) => t.id === themeId) ?? BUILT_IN_THEMES[0];
  return { ...tokens.color, ...theme.colors };
}

/** Theme metadata lookup (unknown ids → Grey). */
export function themeMeta(themeId: string): Theme {
  return BUILT_IN_THEMES.find((t) => t.id === themeId) ?? BUILT_IN_THEMES[0];
}
