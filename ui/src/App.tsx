import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/** Mirror of the Rust `HelloInfo` payload (contract: ui/src/lib/ipc.ts, P0-T06). */
interface HelloInfo {
  message: string;
  version: string;
  configDir: string;
  configLoaded: boolean;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; info: HelloInfo }
  | { kind: "bridge-missing" }
  | { kind: "error"; message: string };

/**
 * Phase-0 placeholder page: proves the Tauri IPC bridge by rendering the
 * `app_hello` payload. Replaced by the real shell in Phase 1 (P1-T05).
 */
export default function App() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    invoke<HelloInfo>("app_hello")
      .then((info) => {
        if (!cancelled) setState({ kind: "ready", info });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = String(err);
        // No Tauri internals ⇒ we are in a plain browser (vite preview).
        if (/window\.__TAURI|Cannot.*tauri|not.*defined/i.test(msg)) {
          setState({ kind: "bridge-missing" });
        } else {
          setState({ kind: "error", message: msg });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="boot">
      <div className="card">
        <h1>pw-backtest</h1>
        <p className="sub">native shell — phase 0 scaffold</p>
        {state.kind === "loading" && <p className="muted">connecting to shell…</p>}
        {state.kind === "ready" && (
          <dl>
            <dt>shell</dt>
            <dd className="ok">{state.info.message}</dd>
            <dt>version</dt>
            <dd>{state.info.version}</dd>
            <dt>config dir</dt>
            <dd className="mono">{state.info.configDir}</dd>
            <dt>config.toml</dt>
            <dd>{state.info.configLoaded ? "loaded" : "defaults (no file yet)"}</dd>
          </dl>
        )}
        {state.kind === "bridge-missing" && (
          <p className="muted">
            Tauri bridge unavailable — this page is running in a plain browser.
            Launch with <code>pnpm --dir ui tauri dev</code>.
          </p>
        )}
        {state.kind === "error" && <p className="err">{state.message}</p>}
      </div>
    </main>
  );
}
