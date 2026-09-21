/**
 * Dev board (P1-T02) — `/dev-board`: renders every primitive × every state
 * × both theme families (Grey dark / White light side by side via scoped
 * CSS vars). Grows with each primitives card (P1-T03, P1-T04 add theirs).
 */

import { useState } from "react";

import { Button } from "../components/button/Button";
import { IconButton } from "../components/icon-button/IconButton";
import { Input } from "../components/input/Input";
import { NumberField } from "../components/number-field/NumberField";
import { Select } from "../components/select/Select";
import { DropdownMenu } from "../components/menu/DropdownMenu";
import { ContextMenu } from "../components/menu/ContextMenu";
import { Dialog } from "../components/dialog/Dialog";
import { FloatingPanel } from "../components/floating-panel/FloatingPanel";
import { Tabs } from "../components/tabs/Tabs";
import { Tooltip } from "../components/tooltip/Tooltip";
import { Switch } from "../components/switch/Switch";
import { Slider } from "../components/slider/Slider";
import { Progress } from "../components/progress/Progress";
import { DataGrid } from "../components/datagrid/DataGrid";
import { Tree, type TreeNodeData } from "../components/tree/Tree";
import { HotkeyRecorder } from "../components/hotkey-recorder/HotkeyRecorder";
import { Badge } from "../components/badge/Badge";
import { EmptyState } from "../components/empty-state/EmptyState";
import { toast } from "../components/toast/store";
import type { MenuEntry } from "../components/menu/MenuList";
import { BUILT_IN_THEMES } from "../design/themes";
import { themeVars, type Density, type FontSize } from "../design/applyTheme";
import { useAppearance } from "../design/settings";
import { navigate } from "../lib/router";

/** Scoped theme surface: the --pw-* vars are re-declared on this div, so
 * everything below renders in that theme regardless of the global setting. */
function ThemeScope({
  themeId,
  title,
  children,
}: {
  themeId: string;
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section
      data-theme-scope={themeId}
      style={themeVars(themeId) as React.CSSProperties}
      className="flex-1 min-w-96 p-4 rounded-lg border border-border bg-bg text-text"
    >
      <h2 className="text-[14px] font-semibold mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 py-1.5 min-h-7" style={{ height: "var(--pw-row-h)" }}>
      <span className="w-40 shrink-0 text-[11px] uppercase tracking-wide text-text-3">{label}</span>
      <div className="flex items-center gap-2 flex-wrap">{children}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="mb-4">
      <h3 className="text-[12px] font-semibold text-text-2 mb-1">{title}</h3>
      <div>{children}</div>
    </div>
  );
}

const GRID_ROWS = Array.from({ length: 50_000 }, (_, i) => ({
  id: `r${i}`,
  symbol: ["BTC/USDT", "EUR/USD", "AAPL", "XAU/USD"][i % 4] as string,
  pnl: (i * 7.3) % 400 - 150,
}));

const TREE_NODES: TreeNodeData[] = [
  { id: "watch", label: "Watchlists", children: [
    { id: "crypto", label: "Crypto", children: [{ id: "btc", label: "BTC/USDT" }, { id: "eth", label: "ETH/USDT" }] },
    { id: "fx", label: "Forex" },
  ]},
  { id: "layouts", label: "Layouts", children: [{ id: "l1", label: "Trading 2×2" }] },
];

const DEMO_MENU: MenuEntry[] = [
  { kind: "item", id: "open", label: "Open symbol…", shortcut: "Ctrl+E", onSelect: () => {} },
  { kind: "item", id: "save", label: "Save layout", shortcut: "Ctrl+S", onSelect: () => {} },
  { kind: "separator", id: "sep-1" },
  { kind: "item", id: "disabled", label: "Unavailable action", disabled: true, onSelect: () => {} },
  { kind: "item", id: "reset", label: "Reset layout…", danger: true, onSelect: () => {} },
];

function AllStates(): React.JSX.Element {
  const [text, setText] = useState("BTC/USDT");
  const [badText, setBadText] = useState("oops");
  const [pct, setPct] = useState<number | null>(2.5);
  const [clamped, setClamped] = useState<number | null>(100);
  const [risk, setRisk] = useState<number | null>(1);
  const [symbol, setSymbol] = useState<string | null>("BTC/USDT");
  const [menuLog, setMenuLog] = useState("—");

  return (
    <div>
      <Section title="Button">
        <Row label="accent / default">
          <Button variant="accent">Primary</Button>
          <Button>Default</Button>
        </Row>
        <Row label="ghost / danger">
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
        </Row>
        <Row label="disabled / sizes">
          <Button variant="accent" disabled>
            Disabled
          </Button>
          <Button size="sm">Small</Button>
        </Row>
      </Section>

      <Section title="IconButton">
        <Row label="md / sm / disabled">
          <IconButton aria-label="settings example" title="settings">
            <GearIcon />
          </IconButton>
          <IconButton aria-label="small settings" size="sm">
            <GearIcon />
          </IconButton>
          <IconButton aria-label="disabled settings" disabled>
            <GearIcon />
          </IconButton>
        </Row>
      </Section>

      <Section title="Input">
        <Row label="with value">
          <Input label="Symbol" value={text} onChange={(e) => setText(e.target.value)} hint="plain text" />
        </Row>
        <Row label="error">
          <Input label="Symbol" value={badText} onChange={(e) => setBadText(e.target.value)} error="Unknown symbol" />
        </Row>
        <Row label="disabled">
          <Input label="Symbol" value="locked" disabled />
        </Row>
      </Section>

      <Section title="NumberField">
        <Row label="percent + steppers">
          <NumberField label="Risk" value={pct} onChange={setPct} min={0} max={100} step={0.5} suffix="%" />
        </Row>
        <Row label="clamped at max (ArrowUp)">
          <NumberField label="Clamped" value={clamped} onChange={setClamped} min={0} max={100} />
        </Row>
        <Row label="empty (null)">
          <NumberField label="Empty" value={risk} onChange={setRisk} />
        </Row>
      </Section>

      <Section title="Select">
        <Row label="selected / open + arrows">
          <Select
            label="Symbol"
            value={symbol}
            onChange={setSymbol}
            options={[
              { value: "BTC/USDT", label: "BTC/USDT" },
              { value: "EUR/USD", label: "EUR/USD" },
              { value: "AAPL", label: "AAPL" },
            ]}
          />
          <Select label="Disabled" value={null} onChange={() => {}} options={[]} disabled />
        </Row>
      </Section>

      <Section title="Dialog / FloatingPanel / Tabs (B)">
        <Row label="dialog (trap + esc)">
          <DialogDemo />
        </Row>
        <Row label="floating panel (drag me)">
          <FloatingPanel storageKey="dev-demo" title="Demo panel" initialX={80} initialY={240} onClose={() => {}}>
            <p className="text-[11px] text-text-3">drag the header — position persists across restarts</p>
          </FloatingPanel>
          <span className="text-[11px] text-text-3">→ rendered in place (fixed)</span>
        </Row>
        <Row label="tabs (arrows)">
          <TabsDemo />
        </Row>
      </Section>

      <Section title="Tooltip / Switch / Slider / Progress / Toast (B)">
        <Row label="tooltip (hover, 300ms)">
          <Tooltip label="snapshot the chart to clipboard">
            <Button size="sm">Alt+S</Button>
          </Tooltip>
        </Row>
        <Row label="switch / slider / progress">
          <SwitchDemo />
          <SliderDemo />
          <div className="w-32"><Progress label="download" value={64} /></div>
          <div className="w-32"><Progress label="working" /></div>
        </Row>
        <Row label="toast queue">
          <Button size="sm" onClick={() => toast.info("download started")}>info</Button>
          <Button size="sm" onClick={() => toast.success("layout saved")}>success</Button>
          <Button size="sm" onClick={() => toast.error("provider offline")}>error</Button>
        </Row>
      </Section>

      <Section title="DataGrid (50k virtualized) / Tree / Hotkey / Badge / Empty (C)">
        <Row label="grid (arrows, click, scroll)">
          <GridDemo />
        </Row>
        <Row label="tree (arrows, enter)">
          <TreeDemo />
        </Row>
        <Row label="hotkey recorder (try Ctrl+K)">
          <HotkeyRecorder
            label="hotkey recorder"
            value={null}
            existing={["Ctrl+K", "Ctrl+E"]}
            onChange={(combo, conflict) => toast[conflict ? "error" : "success"](conflict ? `${combo} already in use` : `${combo} assigned`)}
          />
          <Badge kind="up">live</Badge>
          <Badge kind="down">−1.2%</Badge>
          <Badge kind="accent">P1</Badge>
        </Row>
        <Row label="empty state">
          <div className="rounded border border-border">
            <EmptyState title="No alerts yet" hint="Alerts fire on price crosses, indicator values and strategy events." action={{ label: "Create alert", onClick: () => toast.info("alert editor opens in P8") }} />
          </div>
        </Row>
      </Section>

      <Section title="Menus">
        <Row label="dropdown (Enter/arrows/Esc)">
          <DropdownMenu
            trigger={(props) => (
              <Button {...props} variant={props["aria-expanded"] ? "accent" : "default"}>
                Actions ▾
              </Button>
            )}
            entries={DEMO_MENU}
          />
          <span className="text-[11px] text-text-3">last: {menuLog}</span>
        </Row>
        <Row label="context (right-click area)">
          <ContextMenu
            className="h-16 w-56 rounded border border-dashed border-border grid place-items-center text-[11px] text-text-3"
            entries={[
              { kind: "item", id: "c-1", label: "Snapshot", shortcut: "Alt+S", onSelect: () => setMenuLog("snapshot") },
              { kind: "item", id: "c-2", label: "Hide drawings", onSelect: () => setMenuLog("hide-drawings") },
            ]}
          >
            right-click here
          </ContextMenu>
        </Row>
      </Section>
    </div>
  );
}

function DialogDemo(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="accent" onClick={() => setOpen(true)}>
        open dialog
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Confirm order"
        footer={
          <>
            <Button size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" variant="accent" data-autofocus onClick={() => { toast.success("order placed"); setOpen(false); }}>
              Place
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-text-2">
          Buy 0.10 BTC/USDT at market — Tab cycles inside this dialog, Esc closes,
          focus returns to the opener.
        </p>
      </Dialog>
    </>
  );
}

function TabsDemo(): React.JSX.Element {
  const [active, setActive] = useState("orders");
  return (
    <div className="w-64">
      <Tabs
        label="demo tabs"
        tabs={[
          { id: "positions", label: "Positions" },
          { id: "orders", label: "Orders" },
          { id: "trades", label: "Trades", badge: "12" },
        ]}
        active={active}
        onChange={setActive}
      />
      <p className="text-[12px] text-text-3 pt-2">active: {active}</p>
    </div>
  );
}

function SwitchDemo(): React.JSX.Element {
  const [on, setOn] = useState(true);
  return (
    <div className="flex items-center gap-2">
      <Switch label="trailing stop" checked={on} onChange={setOn} />
      <span className="text-[11px] text-text-3">{on ? "on" : "off"}</span>
    </div>
  );
}

function SliderDemo(): React.JSX.Element {
  const [v, setV] = useState(30);
  return <Slider label="replay speed" value={v} onChange={setV} min={1} max={100} showValue format={(x) => `${x}%`} />;
}

function GridDemo(): React.JSX.Element {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <DataGrid
      label="demo grid"
      rows={GRID_ROWS}
      height={160}
      rowKey={(r) => r.id}
      selectedKey={selected}
      onSelect={(r) => setSelected(r.id)}
      onActivate={(r) => toast.info(`activate ${r.symbol}`)}
      columns={[
        { key: "symbol", header: "Symbol", width: 110 },
        {
          key: "pnl",
          header: "P&L",
          width: 90,
          align: "right",
          render: (r) => (
            <span className={(r.pnl >= 0 ? "text-up" : "text-down") + " tabular-nums"}>
              {r.pnl >= 0 ? "+" : ""}
              {r.pnl.toFixed(2)}
            </span>
          ),
        },
      ]}
    />
  );
}

function TreeDemo(): React.JSX.Element {
  const [sel, setSel] = useState<string | null>(null);
  return (
    <div className="w-56">
      <Tree label="demo tree" nodes={TREE_NODES} selectedId={sel} onSelect={setSel} />
    </div>
  );
}

function GearIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}

/** The `/dev-board` route — component gallery over live themes. */
export default function DevBoard(): React.JSX.Element {
  const theme = useAppearance((s) => s.theme);
  const setTheme = useAppearance((s) => s.setTheme);
  const density = useAppearance((s) => s.density);
  const setDensity = useAppearance((s) => s.setDensity);
  const fontSize = useAppearance((s) => s.fontSize);
  const setFontSize = useAppearance((s) => s.setFontSize);

  return (
    <main className="min-h-screen p-4 bg-bg text-text">
      <header className="flex items-center gap-3 mb-4">
        <h1 className="text-[16px] font-semibold">pw-backtest — dev board</h1>
        <span className="text-[11px] text-text-3">primitives × states × themes</span>
        <div className="flex-1" />
        <Select
          label="Global theme"
          value={theme}
          onChange={setTheme}
          options={BUILT_IN_THEMES.map((t) => ({ value: t.id, label: t.name }))}
        />
        <Select
          label="Density"
          value={density}
          onChange={(v) => setDensity(v as Density)}
          options={[
            { value: "comfortable", label: "Comfortable" },
            { value: "compact", label: "Compact" },
          ]}
        />
        <Select
          label="Font"
          value={fontSize}
          onChange={(v) => setFontSize(v as FontSize)}
          options={[
            { value: "s", label: "S" },
            { value: "m", label: "M" },
            { value: "l", label: "L" },
          ]}
        />
        <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
          ← boot page
        </Button>
      </header>

      <div className="flex gap-4 flex-wrap items-stretch">
        <ThemeScope themeId="grey" title="Grey (dark default)">
          <AllStates />
        </ThemeScope>
        <ThemeScope themeId="white" title="White (light)">
          <AllStates />
        </ThemeScope>
      </div>
    </main>
  );
}
