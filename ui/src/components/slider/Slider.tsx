/**
 * Slider primitive (P1-T03) — styled native range input (keyboard semantics
 * are the platform's: arrows step, Home/End, PageUp/Down). Optional value
 * bubble.
 */

export interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  label: string;
  /** Renders the current value at the right (formatted via `format`). */
  showValue?: boolean;
  format?: (value: number) => string;
  disabled?: boolean;
}

/** pw-backtest slider primitive. */
export function Slider({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  showValue = false,
  format = (v) => String(v),
  disabled = false,
}: SliderProps): React.JSX.Element {
  return (
    <div className="inline-flex items-center gap-2">
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-32 h-1 rounded-full appearance-none bg-border accent-accent cursor-pointer disabled:opacity-50 focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
      />
      {showValue && (
        <span className="text-[11px] text-text-2 tabular-nums w-10 text-right">{format(value)}</span>
      )}
    </div>
  );
}
