/**
 * Progress primitive (P1-T03) — §5.1 "progresshair": a 2px bar. Determinate
 * (aria-valuenow) or indeterminate (animated sweep, progressbar semantics
 * without a value).
 */

export interface ProgressProps {
  /** 0..100; omit for indeterminate. */
  value?: number;
  /** Accessible name (e.g. "downloading BTC/USDT"). */
  label: string;
}

/** pw-backtest progress hairline. */
export function Progress({ value, label }: ProgressProps): React.JSX.Element {
  const indeterminate = value === undefined;
  const clamped = indeterminate ? undefined : Math.min(100, Math.max(0, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={indeterminate ? undefined : 0}
      aria-valuemax={indeterminate ? undefined : 100}
      aria-valuenow={clamped}
      className="h-0.5 w-full rounded-full bg-border overflow-hidden"
    >
      {indeterminate ? (
        <div className="h-full w-1/3 bg-accent animate-[pw-indeterminate_1.2s_ease-in-out_infinite]" />
      ) : (
        <div
          className="h-full bg-accent transition-[width] duration-150 ease-out"
          style={{ width: `${clamped ?? 0}%` }}
        />
      )}
    </div>
  );
}
