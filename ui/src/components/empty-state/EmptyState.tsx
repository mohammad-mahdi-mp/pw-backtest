/**
 * EmptyState primitive (P1-T04) — 16px header per §5.1, optional hint and
 * primary action. Used by every panel before data exists.
 */

export interface EmptyStateProps {
  title: string;
  hint?: string;
  action?: { label: string; onClick: () => void };
}

/** pw-backtest empty state. */
export function EmptyState({ title, hint, action }: EmptyStateProps): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 py-10 text-center" data-empty-state="true">
      <h3 className="text-[16px] font-semibold text-text-2">{title}</h3>
      {hint !== undefined && <p className="text-[12px] text-text-3 max-w-72">{hint}</p>}
      {action !== undefined && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-2 h-7 px-3 rounded text-[13px] font-medium bg-accent text-white hover:brightness-110 transition-[filter] duration-150 ease-out focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
