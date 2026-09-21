/**
 * ContextMenu (P1-T02) — opens at the pointer position on right-click over
 * the wrapped area. Closes on selection, Escape (refocus is not applicable),
 * any click, scroll, or resize.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";

import { MenuList, type MenuEntry, type MenuItemEntry } from "./MenuList";
import { firstSelectable } from "./DropdownMenu";

export interface ContextMenuProps {
  children: ReactNode;
  entries: MenuEntry[];
  /** Extra className for the wrapper. */
  className?: string;
}

interface OpenState {
  x: number;
  y: number;
}

/** pw-backtest context menu primitive. */
export function ContextMenu({ children, entries, className = "" }: ContextMenuProps): React.JSX.Element {
  const [open, setOpen] = useState<OpenState | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  const close = useCallback(() => setOpen(null), []);

  useEffect(() => {
    if (!open) return;
    const onAnyClick = (): void => close();
    const onScrollOrResize = (): void => close();
    document.addEventListener("click", onAnyClick);
    document.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("click", onAnyClick);
      document.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, close]);

  const onContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault();
    setActiveIndex(firstSelectable(entries, -1));
    setOpen({ x: e.clientX, y: e.clientY });
  };

  return (
    <div className={className} onContextMenu={onContextMenu} data-contextmenu="true">
      {children}
      {open !== null && (
        <div className="fixed z-50" style={{ left: open.x, top: open.y }} data-contextmenu-popup="true">
          <MenuList
            entries={entries}
            activeIndex={activeIndex}
            onActiveChange={setActiveIndex}
            onSelect={(entry: MenuItemEntry) => {
              close();
              entry.onSelect();
            }}
            onEscape={close}
          />
        </div>
      )}
    </div>
  );
}
