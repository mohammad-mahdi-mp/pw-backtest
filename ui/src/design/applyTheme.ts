/**
 * Theme application: resolved tokens → CSS custom properties on `:root`,
 * plus density/font-size settings, plus the Lightweight-Charts options
 * mapping (P1-T07 consumes it — same single source of truth).
 */

import { tokens } from "./tokens";
import { resolveTheme } from "./themes";

export type Density = "comfortable" | "compact";
export type FontSize = "s" | "m" | "l";

/** CSS variable names for every color token (kebab-cased `--pw-*`). */
const COLOR_VARS: Record<keyof typeof tokens.color, string> = {
  bg: "--pw-bg",
  bgElev: "--pw-bg-elev",
  bgChartTop: "--pw-bg-chart-top",
  bgChartBottom: "--pw-bg-chart-bottom",
  border: "--pw-border",
  text: "--pw-text",
  text2: "--pw-text-2",
  text3: "--pw-text-3",
  accent: "--pw-accent",
  up: "--pw-up",
  down: "--pw-down",
  up15: "--pw-up-15",
  down15: "--pw-down-15",
  grid: "--pw-grid",
  crosshair: "--pw-crosshair",
};

/** Build the full `--pw-*` var map for a theme id. */
export function themeVars(themeId: string): Record<string, string> {
  const colors = resolveTheme(themeId);
  const vars: Record<string, string> = {};
  for (const key of Object.keys(COLOR_VARS) as (keyof typeof tokens.color)[]) {
    vars[COLOR_VARS[key]] = colors[key];
  }
  return vars;
}

/** Row height for the density setting (§5.1: 32 comfortable / 26 compact). */
export function rowHeight(density: Density): number {
  return density === "compact" ? tokens.density.rowCompact : tokens.density.rowComfortable;
}

/** Base font size for the S/M/L setting (§5.1: 12/13/14). */
export function baseFontSize(size: FontSize): number {
  return tokens.typography.fontSizeSetting[size];
}

/**
 * Apply the full appearance (theme + density + font size) to the document
 * root: every `--pw-*` color var, the derived sizing vars, and the
 * `data-theme`/`data-density`/`data-font` attributes used by CSS rules.
 */
export function applyAppearance(themeId: string, density: Density, fontSize: FontSize): void {
  if (typeof document === "undefined") return; // non-DOM test/build context
  const root = document.documentElement;
  for (const [name, value] of Object.entries(themeVars(themeId))) {
    root.style.setProperty(name, value);
  }
  root.style.setProperty("--pw-row-h", `${rowHeight(density)}px`);
  root.style.setProperty("--pw-font-size", `${baseFontSize(fontSize)}px`);
  root.dataset.theme = themeId;
  root.dataset.density = density;
  root.dataset.font = fontSize;
}

/** Lightweight-Charts v5 options derived from the same tokens (§5.1). */
export function lwcChartOptions(themeId: string): {
  layout: {
    background: { color: string };
    textColor: string;
    fontSize: number;
    attributionLogo: false;
  };
  grid: { vertLines: { color: string }; horzLines: { color: string } };
  crosshair: { labelBackgroundColor: string };
} {
  const colors = resolveTheme(themeId);
  return {
    layout: {
      background: { color: colors.bgChartTop },
      textColor: colors.text2,
      fontSize: tokens.typography.size.base,
      attributionLogo: false,
    },
    grid: {
      vertLines: { color: colors.grid },
      horzLines: { color: colors.grid },
    },
    crosshair: { labelBackgroundColor: colors.crosshair },
  };
}
