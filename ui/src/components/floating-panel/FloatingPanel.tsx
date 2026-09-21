/**
 * FloatingPanel primitive (P1-T03) — draggable non-modal panel whose position
 * persists across restarts (IPC → config layer when wired in P1-T11, with a
 * localStorage fallback now). Drag starts on the header and continues
 * anywhere (window-tracked mouse events — no pointer capture needed).
 */

import { useEffect, useRef, useState, type ReactNode } from "react";

import { appSettingsSet } from "../../lib/ipc";
import { IconButton } from "../icon-button/IconButton";

export interface FloatingPanelProps {
  /** Persistence key (unique per panel instance). */
  storageKey: string;
  title: ReactNode;
  children: ReactNode;
  /** Initial position when nothing is stored. */
  initialX?: number;
  initialY?: number;
  width?: number;
  /** Shows the close button when provided. */
  onClose?: () => void;
}

const LS_PREFIX = "pw.panel.";

/** pw-backtest floating panel primitive. */
export function FloatingPanel({
  storageKey,
  title,
  children,
  initialX = 80,
  initialY = 80,
  width = 280,
  onClose,
}: FloatingPanelProps): React.JSX.Element {
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    try {
      const raw = localStorage.getItem(LS_PREFIX + storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as { x: number; y: number };
        if (Number.isFinite(saved.x) && Number.isFinite(saved.y)) return saved;
      }
    } catch {
      // fall through to defaults
    }
    return { x: initialX, y: initialY };
  });
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef<{ dx: number; dy: number } | null>(null);
  const posRef = useRef(pos);
  posRef.current = pos;
  const moved = useRef(false);

  const persist = (p: { x: number; y: number }): void => {
    try {
      localStorage.setItem(LS_PREFIX + storageKey, JSON.stringify(p));
    } catch {
      // storage unavailable — position is session-only
    }
    void appSettingsSet({ section: "panels", patch: { [storageKey]: p } }).catch(() => {
      // typed not_implemented until P1-T11 — fine
    });
  };

  const onHeaderMouseDown = (e: React.MouseEvent): void => {
    if ((e.target as HTMLElement).closest("button")) return; // buttons don't drag
    moved.current = false;
    dragOffset.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    setDragging(true);
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent): void => {
      const off = dragOffset.current;
      if (!off || !Number.isFinite(e.clientX) || !Number.isFinite(e.clientY)) return;
      moved.current = true;
      setPos({
        x: Math.max(0, e.clientX - off.dx),
        y: Math.max(0, e.clientY - off.dy),
      });
    };
    const onUp = (): void => {
      dragOffset.current = null;
      setDragging(false);
      persist(posRef.current);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging]);

  return (
    <section
      data-floating-panel={storageKey}
      aria-label={typeof title === "string" ? title : undefined}
      style={{ left: pos.x, top: pos.y, width }}
      className="fixed z-50 rounded-md border border-border bg-bg-elev shadow-lg"
    >
      <header
        data-drag-handle="true"
        onMouseDown={onHeaderMouseDown}
        className={
          "flex items-center justify-between h-8 px-2 select-none border-b border-border rounded-t-md bg-bg " +
          (dragging ? "cursor-grabbing" : "cursor-grab")
        }
      >
        <span className="text-[12px] font-semibold text-text-2 px-1">{title}</span>
        {onClose !== undefined && (
          <IconButton aria-label={`close ${typeof title === "string" ? title : "panel"}`} onClick={onClose}>
            <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.4" />
            </svg>
          </IconButton>
        )}
      </header>
      <div className="p-2">{children}</div>
    </section>
  );
}
