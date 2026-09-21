/**
 * Tooltip primitive (P1-T03) — hover/focus tooltip with a 300 ms show delay;
 * Escape hides. Renders above the anchor, centered.
 */

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export interface TooltipProps {
  /** Tooltip text (also the accessible description). */
  label: string;
  children: ReactNode;
  /** Show delay ms (default 300). */
  delayMs?: number;
}

/** pw-backtest tooltip primitive. */
export function Tooltip({ label, children, delayMs = 300 }: TooltipProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);
  const id = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const show = (): void => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(true), delayMs);
  };

  const hide = (): void => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    setOpen(false);
  };

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      aria-describedby={open ? id : undefined}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          id={id}
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 rounded border border-border bg-bg-elev text-[11px] text-text whitespace-nowrap shadow-lg z-[70]"
        >
          {label}
        </span>
      )}
    </span>
  );
}
