/**
 * Button primitive (P1-T02) — §5.1 shape/motion/tokens.
 *
 * Keyboard semantics are the native <button> contract (Enter activates on
 * keydown, Space on keyup); this component only owns variants, sizes, and
 * the focus-visible ring (1px accent).
 */

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

export type ButtonVariant = "accent" | "default" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual weight (§5.1: accent = primary, default = elevated, ghost = bare). */
  variant?: ButtonVariant;
  /** sm = 24px control, md = 28px control. */
  size?: ButtonSize;
  /** Stretched content (e.g. full-width form rows). */
  block?: boolean;
  children: ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  accent: "bg-accent text-white hover:brightness-110 border-transparent",
  default: "bg-bg-elev text-text hover:bg-bg border-border",
  ghost: "bg-transparent text-text-2 hover:bg-bg-elev hover:text-text border-transparent",
  danger: "bg-transparent text-down hover:bg-down/15 border-transparent",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "h-6 px-2 text-[12px] gap-1 rounded",
  md: "h-7 px-3 text-[13px] gap-1.5 rounded",
};

/** pw-backtest button primitive. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "default", size = "md", block = false, className = "", type = "button", children, ...rest },
  ref,
) {
  const classes = [
    "inline-flex items-center justify-center font-medium select-none",
    "transition-colors duration-150 ease-out",
    "focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent",
    "disabled:opacity-50 disabled:pointer-events-none",
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    block ? "w-full" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button ref={ref} type={type} className={classes} {...rest}>
      {children}
    </button>
  );
});
