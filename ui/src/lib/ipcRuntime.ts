/**
 * IPC runtime (P1-T06) — the operational layer above the frozen contract in
 * `ipc.ts`:
 *
 * - `guardedCall(label, op)` — runs a command operation, retries **once** on
 *   transient failures (timeouts / connection resets), and on final failure
 *   surfaces a toast + `console.error` (the log link lands with P2 logging).
 * - `eventBus` — in-app pub/sub keyed by the frozen §1.4 event names.
 *   Feature code subscribes with `eventBus.on(EVENT.feedStatus, handler)`;
 *   `bindEventBridge()` forwards native Tauri events into the same bus once
 *   per app start. In a plain browser (dev preview) the bridge is absent and
 *   the bus still works for local dispatch (`dispatchEvent`).
 */

import { PwIpcError } from "./ipc";
import { toast } from "../components/toast/store";

// ---------------------------------------------------------------------------
// Transient-failure policy
// ---------------------------------------------------------------------------

/** Matches transient IPC failures eligible for the single retry. */
const TRANSIENT =
  /(timeout|timed out|temporar|unreachable|econnreset|connection reset|econnaborted|reconnect|503)/i;

const RETRY_DELAY_MS = 250;

/**
 * Runs `op`, retrying once on transient errors, then surfaces the failure
 * (toast + console) and rethrows. `label` names the operation in user-facing
 * copy, e.g. `guardedCall("load bars", () => dataBarsGet(q))`.
 */
export async function guardedCall<T>(label: string, op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (first) {
    const msg = first instanceof Error ? first.message : String(first);
    const transient = first instanceof PwIpcError ? TRANSIENT.test(msg) : TRANSIENT.test(msg);
    if (transient) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      try {
        return await op();
      } catch (second) {
        reportFailure(label, second);
        throw second;
      }
    }
    reportFailure(label, first);
    throw first;
  }
}

function reportFailure(label: string, err: unknown): void {
  const code = err instanceof PwIpcError ? `[${err.code}] ` : "";
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`pw: ${label} failed → ${code}${msg}`, err);
  toast.error(`${label}: ${msg}`);
}

// ---------------------------------------------------------------------------
// Event bus (§1.4 → per-topic fan-out)
// ---------------------------------------------------------------------------

type Handler = (payload: unknown) => void;

class EventBus {
  private topics = new Map<string, Set<Handler>>();

  /** Subscribes to a topic; returns an unsubscribe function. */
  on(topic: string, handler: Handler): () => void {
    let set = this.topics.get(topic);
    if (!set) {
      set = new Set();
      this.topics.set(topic, set);
    }
    set.add(handler);
    return () => {
      set?.delete(handler);
    };
  }

  /** Dispatches a payload to every handler of the topic. */
  dispatch(topic: string, payload: unknown): void {
    const set = this.topics.get(topic);
    if (!set) return;
    for (const h of [...set]) {
      try {
        h(payload);
      } catch (err) {
        console.error(`pw: handler for '${topic}' threw`, err);
      }
    }
  }

  /** Test hook — clears all subscriptions. */
  clear(): void {
    this.topics.clear();
  }
}

export const eventBus = new EventBus();

/**
 * Forwards native Tauri events into the bus. Resolves to `false` when there
 * is no Tauri runtime (plain-browser dev preview) — the bus keeps working for
 * local dispatch. Idempotent; later calls are no-ops. Suffix-carrying §1.4
 * families bind lazily via {@link ensureNativeEvent} when features subscribe.
 */
let bridgeBound = false;

export async function bindEventBridge(): Promise<boolean> {
  if (bridgeBound) return true;
  try {
    const tauri = await import("@tauri-apps/api/event");
    const { EVENT } = await import("./ipc");
    await tauri.listen(EVENT.feedStatus, (ev) => eventBus.dispatch(EVENT.feedStatus, ev.payload));
    await tauri.listen(EVENT.bridgeStatus, (ev) =>
      eventBus.dispatch(EVENT.bridgeStatus, ev.payload),
    );
    bridgeBound = true;
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensures a native listener exists for `topic` before subscribing on the bus
 * (used by features that subscribe to suffix-carrying §1.4 events). Safe to
 * call repeatedly.
 */
const nativeBound = new Set<string>();
export async function ensureNativeEvent(topic: string): Promise<void> {
  if (nativeBound.has(topic)) return;
  try {
    const tauri = await import("@tauri-apps/api/event");
    await tauri.listen(topic, (ev) => eventBus.dispatch(topic, ev.payload));
    nativeBound.add(topic);
  } catch {
    // no native runtime — local dispatch only
  }
}
