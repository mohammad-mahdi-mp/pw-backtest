import { useEffect, useState } from "react";
import { appHello, PwIpcError, type HelloInfo } from "./lib/ipc";
import { useAppearance } from "./design/settings";
import { BUILT_IN_THEMES } from "./design/themes";
import type { Density, FontSize } from "./design/applyTheme";

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

/**
 * Phase-0 placeholder page: proves the Tauri IPC bridge by rendering the
 * `app_hello` payload (via the typed contract layer). Replaced by the real
 * shell in Phase 1 (P1-T05); the theme switcher demonstrates P1-T01 live.
 */
export default function App() {
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
      </div>
    </main>
  );
}
