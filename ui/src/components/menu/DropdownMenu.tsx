/**
 * DropdownMenu (P1-T02) — trigger-anchored menu. Keyboard: the trigger opens
 * with Enter/Space/ArrowDown (native button semantics + our handler), the
 * popup itself is keyboard-driven via MenuList, Escape closes and restores
 * focus to the trigger, click-outside closes.
 */

import { useEffect, useId, useRef, useState, type ReactElement } from "react";

import { MenuList, type MenuEntry, type MenuItemEntry } from "./MenuList";

/** Props handed to the trigger render-prop. The ref is a callback accepting
 * any element so triggers can be Button, IconButton, or a custom node. */
export interface TriggerProps {
  onClick: (e: React.MouseEvent) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  "aria-haspopup": "menu";
  "aria-expanded": boolean;
  "aria-controls": string | undefined;
  ref: (el: HTMLElement | null) => void;
}

export interface DropdownMenuProps {
  /** Render-prop producing the trigger element (receives open props). */
  trigger: (props: TriggerProps) => ReactElement;
  entries: MenuEntry[];
  /** Initial active item index when opening (default: first selectable). */
  initialIndex?: number;
  disabled?: boolean;
}

/** pw-backtest dropdown menu primitive. */
export function DropdownMenu({ trigger, entries, initialIndex = -1, disabled = false }: DropdownMenuProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerEl = useRef<HTMLElement | null>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent): void => {
      if (rootRef.current && e.target instanceof Node && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const openMenu = (focusFirst: boolean): void => {
    if (disabled || entries.length === 0) return;
    setActiveIndex(focusFirst ? firstSelectable(entries, initialIndex) : initialIndex);
    setOpen(true);
  };

  const close = (refocus: boolean): void => {
    setOpen(false);
    if (refocus) triggerEl.current?.focus();
  };

  return (
    <div ref={rootRef} className="relative inline-block">
      {trigger({
        onClick: () => (open ? close(true) : openMenu(true)),
        onKeyDown: (e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            openMenu(true);
          }
        },
        "aria-haspopup": "menu",
        "aria-expanded": open,
        "aria-controls": open ? menuId : undefined,
        ref: (el: HTMLElement | null) => {
          triggerEl.current = el;
        },
      })}
      {open && (
        <div id={menuId} className="absolute left-0 top-full z-40 mt-1">
          <MenuList
            entries={entries}
            labelledBy={menuId}
            activeIndex={activeIndex}
            onActiveChange={setActiveIndex}
            onSelect={(entry: MenuItemEntry) => {
              close(true); // refocus the trigger on selection, too
              entry.onSelect();
            }}
            onEscape={() => close(true)}
          />
        </div>
      )}
    </div>
  );
}

/** First selectable entry index (or the provided fallback). */
export function firstSelectable(entries: MenuEntry[], fallback: number): number {
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.kind === "item" && !e.disabled) return i;
  }
  return fallback;
}
