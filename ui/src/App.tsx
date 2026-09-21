import { useEffect, useState } from "react";
import { appHello, PwIpcError, type HelloInfo } from "./lib/ipc";
import { bindEventBridge } from "./lib/ipcRuntime";
import { useAppearance } from "./design/settings";
import { BUILT_IN_THEMES } from "./design/themes";
import type { Density, FontSize } from "./design/applyTheme";
import { useHashRoute, navigate } from "./lib/router";
import { AppShell } from "./features/shell/AppShell";
import { hydrateFromStorage } from "./features/shell/workspace";
import DevBoard from "./dev-board/DevBoard";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; info: HelloInfo }
  | { kind: "bridge-missing" }
  | { kind: "error"; message: string };

/** Dev appearance switcher — replaced by real Settings in P1-T11. */
function AppearanceSwitcher(): React.JSX.Element {
  const theme = useAppearance((s) => s.theme);
  const density = useAppearance((s) => s.density);
  const fontSize = useAppearance((s) => s.fontSize);
  const setTheme = useAppearance((s) => s.setTheme);
  const setDensity = useAppearance((s) => s.setDensity);
  const setFontSize = useAppearance((s) => s.setFontSize);

  return (
    <div className="switcher">
      <label htmlFor="sw-theme">theme</label>
      <select id="sw-theme" value={theme} onChange={(e) => setTheme(e.target.value)}>
        {BUILT_IN_THEMES.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <label htmlFor="sw-density">density</label>
      <select
        id="sw-density"
        value={density}
        onChange={(e) => setDensity(e.target.value as Density)}
      >
        <option value="comfortable">Comfortable</option>
        <option value="compact">Compact</option>
      </select>
      <label htmlFor="sw-font">font</label>
      <select
        id="sw-font"
        value={fontSize}
        onChange={(e) => setFontSize(e.target.value as FontSize)}
      >
        <option value="s">S</option>
        <option value="m">M</option>
        <option value="l">L</option>
      </select>
    </div>
  );
}

/** Phase-0 boot page: IPC bridge smoke test (real shell arrives in P1-T05). */
function BootPage(): React.JSX.Element {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    appHello()
      .then((info) => {
        if (!cancelled) setState({ kind: "ready", info });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof PwIpcError && err.code === "bridge_unavailable") {
          setState({ kind: "bridge-missing" });
        } else {
          setState({ kind: "error", message: String(err) });
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
        <AppearanceSwitcher />
        <div className="switcher">
          <button className="mono" style={{ background: "none", border: "none", cursor: "pointer" }} onClick={() => navigate("/dev-board")}>
            → dev board (/dev-board)
          </button>
        </div>
      </div>
    </main>
  );
}

/** Route table: `/` app shell · `/boot` IPC smoke · `/dev-board` gallery. */
export default function App(): React.JSX.Element {
  const route = useHashRoute();

  useEffect(() => {
    // Workspace geometry from the persisted config + native event forwarding.
    hydrateFromStorage();
    void bindEventBridge();
  }, []);

  if (route.startsWith("/dev-board")) return <DevBoard />;
  if (route.startsWith("/boot")) return <BootPage />;
  return <AppShell />;
}
