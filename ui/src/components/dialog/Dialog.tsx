/**
 * Dialog primitive (P1-T03) — modal overlay + panel with focus trap,
 * Escape-to-close, focus restore to the opener, and aria-modal semantics.
 */

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { IconButton } from "../icon-button/IconButton";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** Dialog title (accessible name + header text). */
  title: ReactNode;
  children: ReactNode;
  /** Optional footer row (action buttons). */
  footer?: ReactNode;
  /** Panel width in px (default 420). */
  width?: number;
}

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** pw-backtest modal dialog primitive. */
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  width = 420,
}: DialogProps): React.JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement as HTMLElement | null;

    queueMicrotask(() => {
      const auto =
        panelRef.current?.querySelector<HTMLElement>("[data-autofocus]") ??
        panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      (auto ?? panelRef.current)?.focus();
    });

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      // focus trap: cycle within the panel
      const focusables = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
      ).filter((el) => !el.hasAttribute("disabled"));
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panelRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      openerRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/50"
      data-dialog-overlay="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        tabIndex={-1}
        style={{ width }}
        className="rounded-lg border border-border bg-bg-elev shadow-xl focus:outline-none"
      >
        <header className="flex items-center justify-between h-11 px-4 border-b border-border">
          <h2 className="text-[14px] font-semibold">{title}</h2>
          <IconButton aria-label="close dialog" onClick={onClose}>
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.4" />
            </svg>
          </IconButton>
        </header>
        <div className="p-4">{children}</div>
        {footer !== undefined && (
          <footer className="flex items-center justify-end gap-2 px-4 h-12 border-t border-border">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
