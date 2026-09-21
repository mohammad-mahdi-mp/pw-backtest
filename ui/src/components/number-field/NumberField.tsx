/**
 * NumberField primitive (P1-T02) — numeric entry with steppers, suffix
 * (e.g. `%`), and clamping. Keyboard: ArrowUp/ArrowDown step (Shift = ×10),
 * Enter commits the typed value; invalid input reverts on blur/Enter.
 */

import { forwardRef, useEffect, useId, useState } from "react";

import { IconButton } from "../icon-button/IconButton";

export interface NumberFieldProps {
  /** Current value; `null` = empty field. */
  value: number | null;
  /** Called with the clamped parsed value on commit (Enter/blur/steppers). */
  onChange: (value: number | null) => void;
  /** Minimum (inclusive) clamp. */
  min?: number;
  /** Maximum (inclusive) clamp. */
  max?: number;
  /** Step size for steppers/arrow keys (default 1). */
  step?: number;
  /** Unit suffix rendered inside the field (e.g. `%`). */
  suffix?: string;
  /** Accessible label (the visible label is optional). */
  label?: string;
  disabled?: boolean;
}

const clamp = (v: number, min?: number, max?: number): number =>
  Math.min(Math.max(v, min ?? -Infinity), max ?? Infinity);

/** Decimal places implied by the step (step 0.01 → 2). */
function stepDecimals(step: number): number {
  const s = String(step);
  const dot = s.indexOf(".");
  return dot === -1 ? 0 : s.length - dot - 1;
}

/** pw-backtest numeric field primitive. */
export const NumberField = forwardRef<HTMLInputElement, NumberFieldProps>(function NumberField(
  { value, onChange, min, max, step = 1, suffix, label, disabled = false },
  ref,
) {
  const autoId = useId();
  const decimals = stepDecimals(step);
  const [text, setText] = useState(value === null ? "" : value.toFixed(decimals));

  // External value changes (including our own commits) refresh the text box.
  useEffect(() => {
    setText(value === null ? "" : value.toFixed(decimals));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, decimals]);

  const commit = (raw: string): void => {
    const trimmed = raw.trim();
    if (trimmed === "") {
      onChange(null);
      return;
    }
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      onChange(clamp(parsed, min, max));
    } else {
      // invalid input → revert to the last committed value
      setText(value === null ? "" : value.toFixed(decimals));
    }
  };

  const stepBy = (direction: 1 | -1, mult: number): void => {
    const base = value ?? 0;
    onChange(clamp(base + direction * step * mult, min, max));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (disabled) return;
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      stepBy(e.key === "ArrowUp" ? 1 : -1, e.shiftKey ? 10 : 1);
    } else if (e.key === "Enter") {
      commit(text);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      {label !== undefined && (
        <label htmlFor={autoId} className="text-[11px] uppercase tracking-wide text-text-3">
          {label}
        </label>
      )}
      <div
        className={
          "flex items-stretch h-7 rounded border border-border bg-bg overflow-hidden " +
          "focus-within:border-accent transition-colors duration-150 ease-out" +
          (disabled ? " opacity-50 pointer-events-none" : "")
        }
      >
        <input
          ref={ref}
          id={autoId}
          role="spinbutton"
          aria-label={label}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value ?? undefined}
          inputMode="decimal"
          disabled={disabled}
          className="w-full min-w-0 px-2 text-[13px] bg-transparent text-text focus:outline-none"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => commit(text)}
          onKeyDown={onKeyDown}
        />
        {suffix !== undefined && (
          <span className="self-center pr-1 text-[12px] text-text-3 select-none">{suffix}</span>
        )}
        <div className="flex flex-col w-6 border-l border-border">
          <IconButton
            aria-label="increase"
            size="sm"
            className="rounded-none h-3.5 w-6"
            tabIndex={-1}
            onClick={() => stepBy(1, 1)}
          >
            <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
              <path d="M1 5.5 4 2.5 7 5.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
            </svg>
          </IconButton>
          <IconButton
            aria-label="decrease"
            size="sm"
            className="rounded-none h-3.5 w-6"
            tabIndex={-1}
            onClick={() => stepBy(-1, 1)}
          >
            <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
              <path d="M1 2.5 4 5.5 7 2.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
            </svg>
          </IconButton>
        </div>
      </div>
    </div>
  );
});
