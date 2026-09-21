/**
 * Appearance store persistence tests: the IPC path is a typed stub until
 * P1-T11, so the localStorage fallback must carry the state; unknown stored
 * values fall back to defaults.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/ipc")>();
  return {
    ...actual,
    // plain rejected error (the factory runs before module bindings exist —
    // no PwIpcError construction here; the code matches what the stub throws)
    appSettingsSet: vi.fn().mockRejectedValue(
      Object.assign(new Error("command 'app_settings_set' is declared by the contract but not implemented yet"), {
        name: "PwIpcError",
        code: "not_implemented",
      }),
    ),
  };
});

describe("appearance store persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it("setTheme persists to localStorage when IPC is unavailable", async () => {
    const { useAppearance } = await import("./settings");
    useAppearance.getState().setTheme("black");
    const stored = JSON.parse(localStorage.getItem("pw.appearance") ?? "{}");
    expect(stored.theme).toBe("black");
    expect(useAppearance.getState().theme).toBe("black");
  });

  it("loadAppearance restores saved values", async () => {
    localStorage.setItem(
      "pw.appearance",
      JSON.stringify({ theme: "white", density: "compact", fontSize: "s" }),
    );
    const { loadAppearance } = await import("./settings");
    expect(loadAppearance()).toEqual({ theme: "white", density: "compact", fontSize: "s" });
  });

  it("corrupt or unknown stored values fall back to defaults", async () => {
    localStorage.setItem("pw.appearance", "{not json");
    const { loadAppearance } = await import("./settings");
    expect(loadAppearance()).toEqual({ theme: "grey", density: "comfortable", fontSize: "m" });

    localStorage.setItem(
      "pw.appearance",
      JSON.stringify({ theme: "acid", density: "cozy", fontSize: "xxl" }),
    );
    expect(loadAppearance()).toEqual({ theme: "acid", density: "comfortable", fontSize: "m" });
  });
});
