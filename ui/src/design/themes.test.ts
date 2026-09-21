/**
 * Theme engine tests (P1-T01 verify): every built-in theme resolves the
 * full §5.1 token set; CSS vars are applied to the document root and change
 * on theme switch; density/font-size mappings match the spec; the LWC
 * options mapping reads the same resolved tokens.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { tokens } from "./tokens";
import { BUILT_IN_THEMES, resolveTheme, themeMeta } from "./themes";
import {
  applyAppearance,
  baseFontSize,
  lwcChartOptions,
  rowHeight,
  themeVars,
} from "./applyTheme";

const REQUIRED_KEYS = Object.keys(tokens.color) as (keyof typeof tokens.color)[];

describe("built-in themes", () => {
  it("Grey resolves exactly to the token defaults", () => {
    const resolved = resolveTheme("grey");
    for (const key of REQUIRED_KEYS) {
      expect(resolved[key]).toBe(tokens.color[key]);
    }
  });

  it("every theme resolves the complete token set (no undefined holes)", () => {
    for (const theme of BUILT_IN_THEMES) {
      const resolved = resolveTheme(theme.id);
      for (const key of REQUIRED_KEYS) {
        expect(resolved[key], `${theme.id}.${key}`).toBeTruthy();
      }
    }
  });

  it("hex tokens are hex, alpha variants are rgba", () => {
    for (const theme of BUILT_IN_THEMES) {
      const resolved = resolveTheme(theme.id);
      expect(resolved.bg).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(resolved.accent).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(resolved.up15).toMatch(/^rgba\(/);
      expect(resolved.down15).toMatch(/^rgba\(/);
    }
  });

  it("unknown theme ids fall back to Grey", () => {
    expect(themeMeta("nope").id).toBe("grey");
    expect(resolveTheme("nope")).toEqual(resolveTheme("grey"));
  });

  it("Black theme darkens the chrome and canvas to true black", () => {
    const black = resolveTheme("black");
    expect(black.bg).toBe("#000000");
    expect(black.bgChartTop).toBe("#000000");
  });

  it("White theme flips the text/background polarity", () => {
    const white = resolveTheme("white");
    expect(white.bg).toBe("#ffffff");
    expect(white.text).toBe("#131722"); // §5.1 light column
  });
});

describe("applyAppearance", () => {
  beforeEach(() => {
    document.documentElement.style.cssText = "";
  });

  it("writes every --pw-* color var onto the document root", () => {
    applyAppearance("grey", "comfortable", "m");
    for (const value of Object.values(themeVars("grey"))) {
      const setVars = document.documentElement.style.cssText;
      expect(setVars).toContain(value);
    }
  });

  it("switching themes changes the applied var values", () => {
    applyAppearance("grey", "comfortable", "m");
    const before = document.documentElement.style.getPropertyValue("--pw-bg");
    applyAppearance("black", "comfortable", "m");
    const after = document.documentElement.style.getPropertyValue("--pw-bg");
    expect(before).toBe("#131722");
    expect(after).toBe("#000000");
  });

  it("sets data attributes for theme, density, and font", () => {
    applyAppearance("blue", "compact", "l");
    const root = document.documentElement;
    expect(root.dataset.theme).toBe("blue");
    expect(root.dataset.density).toBe("compact");
    expect(root.dataset.font).toBe("l");
  });

  it("density mapping is 32 comfortable / 26 compact (§5.1)", () => {
    expect(rowHeight("comfortable")).toBe(32);
    expect(rowHeight("compact")).toBe(26);
    applyAppearance("grey", "compact", "m");
    expect(document.documentElement.style.getPropertyValue("--pw-row-h")).toBe("26px");
  });

  it("font-size mapping is S=12 / M=13 / L=14 (§5.1)", () => {
    expect(baseFontSize("s")).toBe(12);
    expect(baseFontSize("m")).toBe(13);
    expect(baseFontSize("l")).toBe(14);
    applyAppearance("grey", "comfortable", "l");
    expect(document.documentElement.style.getPropertyValue("--pw-font-size")).toBe("14px");
  });
});

describe("lwcChartOptions", () => {
  it("maps chart surfaces from the resolved theme tokens", () => {
    const grey = lwcChartOptions("grey");
    expect(grey.layout.background.color).toBe(tokens.color.bgChartTop);
    expect(grey.layout.textColor).toBe(tokens.color.text2);
    expect(grey.grid.vertLines.color).toBe(tokens.color.grid);
    expect(grey.crosshair.labelBackgroundColor).toBe(tokens.color.crosshair);

    const black = lwcChartOptions("black");
    expect(black.layout.background.color).toBe("#000000");
  });

  it("uses the 13px base size and disables the attribution logo", () => {
    const opts = lwcChartOptions("grey");
    expect(opts.layout.fontSize).toBe(13);
    expect(opts.layout.attributionLogo).toBe(false);
  });
});
