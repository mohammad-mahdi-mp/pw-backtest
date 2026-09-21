/**
 * Toast store (P1-T03) — bottom-right queue with auto-dismiss and explicit
 * dismissal. API: `toast.info/error/success(message)`.
 */

import { create } from "zustand";

export type ToastKind = "info" | "error" | "success";

export interface ToastEntry {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastState {
  toasts: ToastEntry[];
  dismiss: (id: number) => void;
  push: (kind: ToastKind, message: string) => void;
}

let nextId = 1;
const AUTO_DISMISS_MS = 4000;

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  push: (kind, message) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, kind, message }] }));
    window.setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, AUTO_DISMISS_MS);
  },
}));

/** Imperative toast API for command paths (`toast.error("download failed")`). */
export const toast = {
  info: (message: string): void => useToasts.getState().push("info", message),
  success: (message: string): void => useToasts.getState().push("success", message),
  error: (message: string): void => useToasts.getState().push("error", message),
};
