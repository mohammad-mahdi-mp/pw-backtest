/**
 * Input primitive (P1-T02) — labeled text field with error/hint states.
 * Native <input> typing/keyboard semantics; focus ring via CSS.
 */

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  /** Visible label (click-to-focus, wired via htmlFor). */
  label?: ReactNode;
  /** Muted helper line under the field. */
  hint?: ReactNode;
  /** Error message — turns the border/message red and sets aria-invalid. */
  error?: ReactNode;
}

/** pw-backtest text input primitive. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, className = "", "aria-label": ariaLabel, ...rest },
  ref,
) {
  const autoId = useId();
  const id = rest.name ?? autoId;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  return (
    <div className="flex flex-col gap-1">
      {label !== undefined && (
        <label htmlFor={id} className="text-[11px] uppercase tracking-wide text-text-3">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={id}
        aria-label={ariaLabel}
        aria-invalid={error !== undefined || undefined}
        aria-describedby={error !== undefined ? errorId : hint !== undefined ? hintId : undefined}
        className={
          [
            "h-7 px-2 rounded text-[13px] bg-bg text-text placeholder:text-text-3",
            "border transition-colors duration-150 ease-out",
            error !== undefined ? "border-down" : "border-border",
            "focus:outline-none focus-visible:border-accent focus:border-accent",
            "disabled:opacity-50",
            className,
          ]
            .filter(Boolean)
            .join(" ")
        }
        {...rest}
      />
      {error !== undefined ? (
        <span id={errorId} role="alert" className="text-[11px] text-down">
          {error}
        </span>
      ) : hint !== undefined ? (
        <span id={hintId} className="text-[11px] text-text-3">
          {hint}
        </span>
      ) : null}
    </div>
  );
});
