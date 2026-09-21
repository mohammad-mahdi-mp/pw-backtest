/**
 * Badge/Chip primitive (P1-T04) — small status labels in §5.1 colors.
 */

export interface BadgeProps {
  kind?: "up" | "down" | "accent" | "neutral";
  children: React.ReactNode;
}

const KINDS = {
  up: "text-up bg-up/10",
  down: "text-down bg-down/10",
  accent: "text-accent bg-accent/10",
  neutral: "text-text-2 bg-bg-elev",
} as const;

/** pw-backtest badge. */
export function Badge({ kind = "neutral", children }: BadgeProps): React.JSX.Element {
  return (
    <span
      className={`inline-flex items-center h-5 px-1.5 rounded text-[10px] font-semibold ${KINDS[kind]}`}
    >
      {children}
    </span>
  );
}
