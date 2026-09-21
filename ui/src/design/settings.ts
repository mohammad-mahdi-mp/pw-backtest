/**
 * Appearance settings store (zustand) with graceful persistence.
 *
 * Persistence contract for P1-T01: settings go through the typed IPC
 * (`app_settings_set` → `config.toml`); that command is a typed stub until
 * P1-T11 wires the file layer, so the store falls back to localStorage.
 * When P1-T11 lands, this file is the only place that changes.
 */

import { create } from "zustand";

import { appSettingsSet, PwIpcError } from "../lib/ipc";
import type { Density, FontSize } from "./applyTheme";

const STORAGE_KEY = "pw.appearance";

export interface AppearanceState {
  theme: string;
  density: Density;
  fontSize: FontSize;
  setTheme: (theme: string) => void;
  setDensity: (density: Density) => void;
  setFontSize: (fontSize: FontSize) => void;
}

/** Best-effort persistence: IPC first (P1-T11 wires config.toml), then
 * localStorage. Never throws — a broken backend must not block the UI. */
export function persistAppearance(state: Pick<AppearanceState, "theme" | "density" | "fontSize">): void {
  void appSettingsSet({ section: "ui", patch: { ...state } }).catch((err: unknown) => {
    if (!(err instanceof PwIpcError)) {
      // Unknown failure — log and keep going; persistence is best-effort.
      console.warn("appearance persistence failed", err);
    }
  });
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage unavailable (private mode) — in-memory only
  }
}

/** Restore last appearance; unknown values fall back to defaults. */
export function loadAppearance(): Pick<AppearanceState, "theme" | "density" | "fontSize"> {
  const fallback = { theme: "grey", density: "comfortable" as Density, fontSize: "m" as FontSize };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const saved = JSON.parse(raw) as Partial<Pick<AppearanceState, "theme" | "density" | "fontSize">>;
    return {
      theme: typeof saved.theme === "string" ? saved.theme : fallback.theme,
      density: saved.density === "compact" ? "compact" : "comfortable",
      fontSize: saved.fontSize === "s" || saved.fontSize === "l" ? saved.fontSize : "m",
    };
  } catch {
    return fallback;
  }
}

/** Global appearance store — ThemeProvider applies it to the DOM. */
export const useAppearance = create<AppearanceState>((set, get) => ({
  ...loadAppearance(),
  setTheme: (theme) => {
    set({ theme });
    persistAppearance(get());
  },
  setDensity: (density) => {
    set({ density });
    persistAppearance(get());
  },
  setFontSize: (fontSize) => {
    set({ fontSize });
    persistAppearance(get());
  },
}));
