/**
 * Menu core (P1-T02) — shared item model, rendering, and keyboard
 * navigation for DropdownMenu and ContextMenu.
 *
 * Keyboard contract: ArrowUp/Down move the active item (wrapping, skipping
 * separators and disabled items), Home/End jump, Enter/Space activate,
 * Escape requests close via `onEscape`. The list container holds DOM focus
 * (tabIndex -1) and exposes the active item through `aria-activedescendant`.
 */

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

export interface MenuItemEntry {
  kind: "item";
  /** Stable id (also the DOM element id suffix). */
  id: string;
  label: ReactNode;
  /** Right-aligned shortcut hint (e.g. "Ctrl+K"). */
  shortcut?: string;
  /** Destructive item (red text, §5.1 down token). */
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

export interface MenuSeparator {
  kind: "separator";
  id: string;
}

export type MenuEntry = MenuItemEntry | MenuSeparator;

/** Indices of entries that keyboard navigation may land on. */
export function selectableIndices(entries: MenuEntry[]): number[] {
  return entries
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.kind === "item" && !e.disabled)
    .map(({ i }) => i);
}

export interface MenuListProps {
  entries: MenuEntry[];
  /** Accessible name source (aria-labelledby pointing at the trigger). */
  labelledBy?: string;
  activeIndex: number;
  onActiveChange: (index: number) => void;
  onSelect: (entry: MenuItemEntry) => void;
  onEscape: () => void;
  /** Auto-focus the list on mount (menu open). */
  autoFocus?: boolean;
  className?: string;
  style?: CSSProperties;
}

/** The focusable menu surface (keyboard + a11y live here). */
export function MenuList({
  entries,
  labelledBy,
  activeIndex,
  onActiveChange,
  onSelect,
  onEscape,
  autoFocus = true,
  className = "",
  style,
}: MenuListProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const indices = selectableIndices(entries);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const move = (dir: 1 | -1): void => {
    if (indices.length === 0) return;
    const pos = indices.indexOf(activeIndex);
    const next =
      pos === -1
        ? dir === 1
          ? indices[0]
          : indices[indices.length - 1]
        : indices[(pos + dir + indices.length) % indices.length];
    onActiveChange(next);
  };

  const jump = (index: number): void => {
    if (index !== -1) onActiveChange(index);
  };

  const activate = (index: number): void => {
    const entry = entries[index];
    if (entry && entry.kind === "item" && !entry.disabled) onSelect(entry);
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
      case "Home":
        e.preventDefault();
        jump(indices[0] ?? -1);
        break;
      case "End":
        e.preventDefault();
        jump(indices[indices.length - 1] ?? -1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        activate(activeIndex);
        break;
      case "Escape":
        e.preventDefault();
        onEscape();
        break;
      default:
        break;
    }
  };

  const base =
    "min-w-44 py-1 rounded-md border border-border bg-bg-elev shadow-lg " +
    "focus:outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent";

  return (
    <div
      ref={ref}
      role="menu"
      aria-labelledby={labelledBy}
      aria-activedescendant={entries[activeIndex] && entries[activeIndex].kind === "item" ? menuItemId(entries[activeIndex].id) : undefined}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className={[base, className].filter(Boolean).join(" ")}
      style={style}
    >
      {entries.map((entry, index) => {
        if (entry.kind === "separator") {
          return <div key={entry.id} role="separator" className="my-1 h-px bg-border" />;
        }
        const active = index === activeIndex;
        return (
          <div
            key={entry.id}
            id={menuItemId(entry.id)}
            role="menuitem"
            aria-disabled={entry.disabled || undefined}
            className={
              "flex items-center justify-between gap-4 px-3 h-7 text-[13px] cursor-pointer select-none " +
              "transition-colors duration-150 ease-out " +
              (entry.disabled
                ? "text-text-3 opacity-60 cursor-default"
                : entry.danger
                  ? "text-down"
                  : "text-text") +
              (active && !entry.disabled ? " bg-bg" : "")
            }
            onMouseEnter={() => {
              if (!entry.disabled) onActiveChange(index);
            }}
            onClick={() => activate(index)}
          >
            <span className="truncate">{entry.label}</span>
            {entry.shortcut !== undefined && (
              <span className="text-[11px] text-text-3 tabular-nums">{entry.shortcut}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** DOM id for a menu item (stable, prefixed to avoid collisions). */
export function menuItemId(id: string): string {
  return `pw-menu-${id}`;
}
