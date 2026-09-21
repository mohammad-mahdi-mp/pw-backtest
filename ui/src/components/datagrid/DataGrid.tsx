/**
 * DataGrid primitive (P1-T04) — virtualized rows (windowed rendering over a
 * fixed-height viewport), density-aware row height, keyboard roving
 * (aria-activedescendant), click/Enter selection & activation.
 *
 * 50k rows stay flat: only the visible window (+ overscan) hits the DOM.
 */

import { useMemo, useRef, useState } from "react";

import { rowHeight } from "../../design/applyTheme";
import { useAppearance } from "../../design/settings";

export interface GridColumn<T> {
  key: string;
  header: string;
  /** Column width in px (default: flexible). */
  width?: number;
  align?: "left" | "right";
  render?: (row: T, index: number) => React.ReactNode;
}

export interface DataGridProps<T> {
  rows: T[];
  columns: GridColumn<T>[];
  rowKey: (row: T) => string;
  selectedKey?: string | null;
  onSelect?: (row: T) => void;
  /** Enter / double-click activation. */
  onActivate?: (row: T) => void;
  /** Viewport height in px (default 320). */
  height?: number;
  /** Accessible name. */
  label?: string;
}

const OVERSCAN = 6;

/** pw-backtest virtualized data grid. */
export function DataGrid<T>({
  rows,
  columns,
  rowKey,
  selectedKey = null,
  onSelect,
  onActivate,
  height = 320,
  label = "data grid",
}: DataGridProps<T>): React.JSX.Element {
  const density = useAppearance((s) => s.density);
  const rowH = rowHeight(density);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);

  const total = rows.length;
  const first = Math.max(0, Math.floor(scrollTop / rowH) - OVERSCAN);
  const visibleCount = Math.ceil(height / rowH) + OVERSCAN * 2;
  const last = Math.min(total, first + visibleCount);
  const window_ = useMemo(() => rows.slice(first, last), [rows, first, last]);

  const domId = (index: number): string =>
    `pw-grid-row-${index < total ? rowKey(rows[index]) : index}`.replace(/[^a-zA-Z0-9_-]/g, "_");

  const ensureVisible = (index: number): void => {
    const el = scrollRef.current;
    if (!el) return;
    const top = index * rowH;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + rowH > el.scrollTop + height) el.scrollTop = top + rowH - height;
  };

  const move = (delta: number): void => {
    const next = Math.min(total - 1, Math.max(0, activeIndex + delta));
    setActiveIndex(next);
    ensureVisible(next);
  };

  const onKeyDown = (e: React.KeyboardEvent): void => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        move(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        move(-1);
        break;
      case "PageDown":
        e.preventDefault();
        move(Math.ceil(height / rowH));
        break;
      case "PageUp":
        e.preventDefault();
        move(-Math.ceil(height / rowH));
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(0);
        ensureVisible(0);
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(total - 1);
        ensureVisible(total - 1);
        break;
      case "Enter":
        e.preventDefault();
        if (rows[activeIndex] !== undefined) onActivate?.(rows[activeIndex]);
        break;
      default:
        break;
    }
  };

  return (
    <div
      role="grid"
      aria-label={label}
      aria-rowcount={total}
      aria-activedescendant={total > 0 ? domId(activeIndex) : undefined}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="rounded border border-border bg-bg focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent overflow-hidden"
    >
      {/* header */}
      <div role="row" aria-rowindex={1} className="flex h-7 bg-bg-elev border-b border-border select-none">
        {columns.map((c) => (
          <div
            key={c.key}
            role="columnheader"
            aria-colindex={columns.indexOf(c) + 1}
            style={c.width !== undefined ? { width: c.width } : undefined}
            className={
              "flex items-center px-2 text-[11px] uppercase tracking-wide text-text-3 " +
              (c.align === "right" ? "justify-end" : "")
            }
          >
            {c.header}
          </div>
        ))}
      </div>
      {/* virtual body */}
      <div
        ref={scrollRef}
        data-testid="grid-scroll"
        style={{ height }}
        className="overflow-y-auto"
        onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
      >
        <div style={{ height: total * rowH, position: "relative" }}>
          <div style={{ transform: `translateY(${first * rowH}px)` }}>
            {window_.map((row, offset) => {
              const index = first + offset;
              const key = rowKey(row);
              const selected = key === selectedKey;
              return (
                <div
                  key={key}
                  id={domId(index)}
                  role="row"
                  aria-rowindex={index + 2}
                  aria-selected={selected || undefined}
                  style={{ height: rowH }}
                  onClick={() => onSelect?.(row)}
                  onDoubleClick={() => onActivate?.(row)}
                  className={
                    "flex items-center cursor-default select-none transition-colors duration-150 ease-out " +
                    (selected
                      ? "bg-accent/15"
                      : index === activeIndex
                        ? "bg-bg-elev"
                        : "hover:bg-bg-elev")
                  }
                >
                  {columns.map((c) => (
                    <div
                      key={c.key}
                      role="gridcell"
                      style={c.width !== undefined ? { width: c.width } : undefined}
                      className={
                        "flex items-center px-2 text-[12px] text-text truncate " +
                        (c.align === "right" ? "justify-end tabular-nums" : "")
                      }
                    >
                      {c.render !== undefined ? c.render(row, index) : String((row as Record<string, unknown>)[c.key] ?? "")}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
