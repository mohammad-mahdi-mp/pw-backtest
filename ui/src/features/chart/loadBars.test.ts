/**
 * P1-T07 — loadBars: IPC-first with the deterministic fixture fallback
 * (data layer lands in P2; the browser preview runs on fixtures).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { PwIpcError } from "../../lib/ipc";

vi.mock("../../lib/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/ipc")>();
  return { ...actual, dataBarsGet: vi.fn() };
});

import { dataBarsGet } from "../../lib/ipc";
import { loadBars } from "./ChartPane";
import { synthBars } from "./bars";

const mockGet = vi.mocked(dataBarsGet);

beforeEach(() => {
  mockGet.mockReset();
});

describe("loadBars", () => {
  it("uses IPC bars when the command answers", async () => {
    const ipcBars = synthBars("ETHUSDT", "1h", 42);
    mockGet.mockResolvedValue({ bars: ipcBars });
    const r = await loadBars("ETHUSDT", "1h", 100);
    expect(r.source).toBe("ipc");
    expect(r.bars).toHaveLength(42);
  });

  it("falls back to the fixture on not_implemented (pre-P2)", async () => {
    mockGet.mockRejectedValue(new PwIpcError("not_implemented", "data layer lands in P2"));
    const r = await loadBars("BTCUSDT", "1d", 321);
    expect(r.source).toBe("fixture");
    expect(r.bars).toEqual(synthBars("BTCUSDT", "1d", 321));
  });

  it("falls back to the fixture when no bridge exists (browser preview)", async () => {
    mockGet.mockRejectedValue(new PwIpcError("bridge_unavailable", "no tauri"));
    const r = await loadBars("BTCUSDT", "1d", 10);
    expect(r.source).toBe("fixture");
    expect(r.bars).toHaveLength(10);
  });

  it("falls back when IPC answers with an empty/odd payload", async () => {
    mockGet.mockResolvedValue({ bars: [] });
    const r = await loadBars("AAPL", "1h", 7);
    expect(r.source).toBe("fixture");
    expect(r.bars).toHaveLength(7);
  });
});
