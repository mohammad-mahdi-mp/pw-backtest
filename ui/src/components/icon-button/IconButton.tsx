/**
 * IconButton primitive (P1-T02) — square ghost button for toolbars.
 * `aria-label` is mandatory (icon-only control).
 */

import { forwardRef, type ButtonHTMLAttributes } from "react";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name — required because the control renders no text. */
  "aria-label": string;
  /** sm = 24px square, md = 28px square. */
  size?: "sm" | "md";
}

const SIZES = {
  sm: "h-6 w-6 rounded",
  md: "h-7 w-7 rounded",
} as const;

/** pw-backtest icon button primitive. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton({ size = "md", className = "", type = "button", ...rest }, ref) {
    const classes = [
      "inline-flex items-center justify-center",
      "bg-transparent text-text-2 hover:bg-bg-elev hover:text-text",
      "border border-transparent",
      "transition-colors duration-150 ease-out",
      "focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent",
      "disabled:opacity-50 disabled:pointer-events-none",
      SIZES[size],
      className,
    ]
      .filter(Boolean)
      .join(" ");
    return <button ref={ref} type={type} className={classes} {...rest} />;
  },
);
