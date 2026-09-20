import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(p: number, digits = 5) {
  return p.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatTime(t: number) {
  return new Date(t * 1000).toISOString().replace("T", " ").slice(0, 19);
}
