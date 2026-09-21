/**
 * P1-T06 tests — IPC runtime: guardedCall retry/toast policy and the event
 * bus incl. native bridge forwarding.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

import { useToasts } from "../components/toast/store";
import { PwIpcError } from "./ipc";
import {
  bindEventBridge,
  ensureNativeEvent,
  eventBus,
  guardedCall,
} from "./ipcRuntime";

// --- mocks for the native side ---------------------------------------------

type ListenFn = (event: string, handler: (ev: { payload: unknown }) => void) => Promise<() => void>;

const listenMock = vi.fn<ListenFn>(async (_event, _handler) => () => {});

vi.mock("@tauri-apps/api/event", () => ({
  listen: (...args: Parameters<ListenFn>) => listenMock(...args),
}));

function errorToasts(): string[] {
  return useToasts
    .getState()
    .toasts.filter((t) => t.kind === "error")
    .map((t) => t.message);
}

beforeEach(() => {
  useToasts.setState({ toasts: [] });
  listenMock.mockClear();
  eventBus.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

// --- guardedCall ------------------------------------------------------------

describe("guardedCall", () => {
  it("passes through success without toasts", async () => {
    const result = await guardedCall("load bars", async () => 42);
    expect(result).toBe(42);
    expect(errorToasts()).toEqual([]);
  });

  it("does not retry permanent failures and toasts once", async () => {
    const op = vi.fn(async () => {
      throw new PwIpcError("not_implemented", "nope");
    });
    await expect(guardedCall("load bars", op)).rejects.toThrow("nope");
    expect(op).toHaveBeenCalledTimes(1);
    expect(errorToasts()).toEqual(["load bars: nope"]);
  });

  it("retries exactly once on transient failures and recovers", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const op = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error("request timed out");
      return "ok";
    });
    const promise = guardedCall("load bars", op);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    await expect(promise).resolves.toBe("ok");
    expect(op).toHaveBeenCalledTimes(2);
    expect(errorToasts()).toEqual([]);
  });

  it("toasts + rethrows after the single retry also fails", async () => {
    vi.useFakeTimers();
    const op = vi.fn(async () => {
      throw new PwIpcError("command_failed", "connection reset by peer");
    });
    const promise = guardedCall("download", op);
    // Attach the rejection handler BEFORE advancing timers — otherwise the
    // rejection lands unhandled between timer ticks (CI-order-sensitive).
    const expectation = expect(promise).rejects.toThrow("connection reset by peer");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300).catch(() => undefined);
    });
    await expectation;
    expect(op).toHaveBeenCalledTimes(2);
    expect(errorToasts()).toEqual(["download: connection reset by peer"]);
  });
});

// --- event bus --------------------------------------------------------------

describe("eventBus", () => {
  it("fans out per topic and unsubscribes cleanly", () => {
    const seen: unknown[] = [];
    const off = eventBus.on("feed:status", (p) => seen.push(p));
    eventBus.dispatch("feed:status", { state: "live" });
    off();
    eventBus.dispatch("feed:status", { state: "offline" });
    expect(seen).toEqual([{ state: "live" }]);
  });

  it("handler errors do not break sibling handlers", () => {
    const boom = vi.fn(() => {
      throw new Error("handler bug");
    });
    const good = vi.fn();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    eventBus.on("bridge:status", boom);
    eventBus.on("bridge:status", good);
    eventBus.dispatch("bridge:status", { state: "running" });
    expect(boom).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

// --- native bridge forwarding ----------------------------------------------

describe("event bridge", () => {
  it("binds static §1.4 events to the tauri listen API", async () => {
    await bindEventBridge();
    const bound = listenMock.mock.calls.map((c) => c[0]);
    expect(bound).toContain("feed:status");
    expect(bound).toContain("bridge:status");
  });

  it("ensureNativeEvent forwards payloads into the bus", async () => {
    const seen: unknown[] = [];
    eventBus.on("bars:loaded:p0", (p) => seen.push(p));
    await ensureNativeEvent("bars:loaded:p0");
    const handler = listenMock.mock.calls.find((c) => c[0] === "bars:loaded:p0")?.[1];
    expect(handler).toBeDefined();
    handler!({ payload: { symbol: "BTCUSDT", count: 10 } });
    expect(seen).toEqual([{ symbol: "BTCUSDT", count: 10 }]);
  });
});

// --- smoke: toasts render (runtime ↔ primitive integration) -----------------

describe("guardedCall ↔ toast integration", () => {
  it("surfaced failures are visible through the mounted <Toasts/>", async () => {
    const { Toasts } = await import("../components/toast/Toasts");
    render(<Toasts />);
    await act(async () => {
      await guardedCall("reload", async () => {
        throw new PwIpcError("bridge_unavailable", "bridge down");
      }).catch(() => undefined);
    });
    expect(screen.getByRole("status").textContent).toContain("reload: bridge down");
  });
});
