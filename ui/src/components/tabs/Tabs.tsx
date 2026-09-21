/**
 * Tabs primitive (P1-T03) — WAI-ARIA tabs: ArrowLeft/Right roving with
 * auto-activation, Home/End, tabpanel wiring via aria-controls.
 */

import { useId, useRef } from "react";

export interface TabItem {
  id: string;
  label: string;
  /** Optional right-aligned badge content (e.g. count). */
  badge?: string;
}

export interface TabsProps {
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
  /** Accessible label for the tablist. */
  label?: string;
}

/** pw-backtest tabs primitive. */
export function Tabs({ tabs, active, onChange, label }: TabsProps): React.JSX.Element {
  const baseId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  const focusTab = (id: string): void => {
    queueMicrotask(() => tabRefs.current.get(id)?.focus());
  };

  const move = (dir: 1 | -1): void => {
    const pos = tabs.findIndex((t) => t.id === active);
    const next = tabs[(pos + dir + tabs.length) % tabs.length];
    if (next) {
      onChange(next.id);
      focusTab(next.id);
    }
  };

  return (
    <div>
      <div
        ref={listRef}
        role="tablist"
        aria-label={label}
        className="flex items-stretch gap-0 border-b border-border"
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") {
            e.preventDefault();
            move(1);
          } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            move(-1);
          } else if (e.key === "Home") {
            e.preventDefault();
            if (tabs[0]) {
              onChange(tabs[0].id);
              focusTab(tabs[0].id);
            }
          } else if (e.key === "End") {
            e.preventDefault();
            const last = tabs[tabs.length - 1];
            if (last) {
              onChange(last.id);
              focusTab(last.id);
            }
          }
        }}
      >
        {tabs.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                if (el) tabRefs.current.set(tab.id, el);
                else tabRefs.current.delete(tab.id);
              }}
              id={`${baseId}-tab-${tab.id}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(tab.id)}
              className={
                "relative flex items-center gap-1.5 h-8 px-3 text-[13px] select-none " +
                "transition-colors duration-150 ease-out focus-visible:outline focus-visible:outline-1 " +
                "focus-visible:outline-accent focus-visible:-outline-offset-2 " +
                (selected ? "text-text" : "text-text-3 hover:text-text-2")
              }
            >
              {tab.label}
              {tab.badge !== undefined && (
                <span className="text-[10px] text-text-3 tabular-nums">{tab.badge}</span>
              )}
              {selected && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-accent" />}
            </button>
          );
        })}
      </div>
      <div
        id={`${baseId}-panel-${active}`}
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-${active}`}
        className="pt-2"
      >
        {/* panel content is rendered by the caller next to <Tabs> using the same active id */}
      </div>
    </div>
  );
}
