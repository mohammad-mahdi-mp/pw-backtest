/**
 * Select primitive (P1-T02) — custom listbox form control (TV-style).
 *
 * Keyboard: Enter/Space/ArrowDown open; ArrowUp/Down move the active option
 * (wrap), Home/End jump, Enter selects and closes, Escape closes and
 * restores focus to the trigger, Tab closes; printable-character typeahead
 * jumps to matching labels. The list uses the aria-activedescendant
 * pattern (DOM focus stays on the listbox container).
 */

import { useEffect, useId, useRef, useState } from "react";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  value: string | null;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** Accessible name. */
  label?: string;
  placeholder?: string;
  disabled?: boolean;
}

const itemDomId = (listId: string, value: string): string => `${listId}-opt-${value}`;

/** pw-backtest select primitive. */
export function Select({
  value,
  onChange,
  options,
  label,
  placeholder = "Select…",
  disabled = false,
}: SelectProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [activeValue, setActiveValue] = useState<string | null>(value);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const typeahead = useRef<{ text: string; at: number }>({ text: "", at: 0 });
  const listId = useId();

  const selected = options.find((o) => o.value === value) ?? null;

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

  const openList = (): void => {
    if (disabled || options.length === 0) return;
    setActiveValue(value ?? options[0]?.value ?? null);
    setOpen(true);
    // focus after mount
    queueMicrotask(() => listRef.current?.focus());
  };

  const close = (refocus: boolean): void => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  const commit = (v: string): void => {
    onChange(v);
    close(true);
  };

  const moveActive = (dir: 1 | -1): void => {
    if (options.length === 0) return;
    const pos = options.findIndex((o) => o.value === activeValue);
    const next =
      pos === -1
        ? dir === 1
          ? 0
          : options.length - 1
        : (pos + dir + options.length) % options.length;
    setActiveValue(options[next].value);
  };

  const jumpHomeEnd = (end: boolean): void => {
    const opt = end ? options[options.length - 1] : options[0];
    if (opt) setActiveValue(opt.value);
  };

  const typeaheadJump = (char: string): void => {
    const now = Date.now();
    typeahead.current =
      now - typeahead.current.at < 500
        ? { text: typeahead.current.text + char.toLowerCase(), at: now }
        : { text: char.toLowerCase(), at: now };
    const match = options.find((o) => o.label.toLowerCase().startsWith(typeahead.current.text));
    if (match) setActiveValue(match.value);
  };

  const onListKeyDown = (e: React.KeyboardEvent): void => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        moveActive(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        moveActive(-1);
        break;
      case "Home":
        e.preventDefault();
        jumpHomeEnd(false);
        break;
      case "End":
        e.preventDefault();
        jumpHomeEnd(true);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (activeValue !== null) commit(activeValue);
        break;
      case "Escape":
        e.preventDefault();
        close(true);
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        if (e.key.length === 1) typeaheadJump(e.key);
        break;
    }
  };

  return (
    <div ref={rootRef} className="relative inline-flex flex-col gap-1">
      {label !== undefined && (
        <span className="text-[11px] uppercase tracking-wide text-text-3">{label}</span>
      )}
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        disabled={disabled}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={label}
        onClick={() => (open ? close(true) : openList())}
        onKeyDown={(e) => {
          if ((e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") && !open) {
            e.preventDefault();
            openList();
          }
        }}
        className={
          "inline-flex items-center justify-between gap-2 h-7 min-w-36 px-2 rounded text-[13px] " +
          "bg-bg text-text border border-border transition-colors duration-150 ease-out " +
          "focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent " +
          "disabled:opacity-50 disabled:pointer-events-none"
        }
      >
        <span className={selected ? "" : "text-text-3"}>{selected?.label ?? placeholder}</span>
        <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true" className="text-text-3">
          <path d="M1 2.5 4 5.5 7 2.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </button>
      {open && (
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={label}
          aria-activedescendant={activeValue !== null ? itemDomId(listId, activeValue) : undefined}
          tabIndex={-1}
          onKeyDown={onListKeyDown}
          className={
            "absolute left-0 top-full z-40 mt-1 min-w-full py-1 rounded-md border border-border " +
            "bg-bg-elev shadow-lg focus:outline-none focus-visible:outline focus-visible:outline-1 " +
            "focus-visible:outline-accent"
          }
        >
          {options.map((opt) => {
            const active = opt.value === activeValue;
            const isSelected = opt.value === value;
            return (
              <div
                key={opt.value}
                id={itemDomId(listId, opt.value)}
                role="option"
                aria-selected={isSelected || undefined}
                className={
                  "flex items-center justify-between gap-4 px-3 h-7 text-[13px] cursor-pointer select-none " +
                  "transition-colors duration-150 ease-out " +
                  (active ? "bg-bg " : "") +
                  (isSelected ? "text-accent" : "text-text")
                }
                onMouseEnter={() => setActiveValue(opt.value)}
                onClick={() => commit(opt.value)}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && (
                  <span aria-hidden="true" className="text-accent">
                    ✓
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
