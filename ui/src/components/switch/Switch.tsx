/**
 * Switch primitive (P1-T03) — binary toggle (role=switch). Click/Space/Enter
 * toggle (native button semantics).
 */

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Accessible name (required — the control has no visible text). */
  label: string;
  disabled?: boolean;
}

/** pw-backtest switch primitive. */
export function Switch({ checked, onChange, label, disabled = false }: SwitchProps): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={
        "relative inline-flex items-center h-4 w-7 rounded-full transition-colors duration-150 ease-out " +
        "focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent " +
        "disabled:opacity-50 disabled:pointer-events-none " +
        (checked ? "bg-accent" : "bg-border")
      }
    >
      <span
        aria-hidden="true"
        className={
          "absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform duration-150 ease-out " +
          (checked ? "translate-x-3.5" : "translate-x-0.5")
        }
      />
    </button>
  );
}
