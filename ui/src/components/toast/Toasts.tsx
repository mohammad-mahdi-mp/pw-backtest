/**
 * Toasts renderer (P1-T03) — bottom-right stack; errors announce politely
 * (role=status; use explicit dialogs for blocking errors).
 */

import { useToasts, type ToastKind } from "./store";

const KIND_CLASSES: Record<ToastKind, string> = {
  info: "border-border text-text",
  error: "border-down/60 text-text",
  success: "border-up/60 text-text",
};

/** Global toast stack (mount once, near the app root). */
export function Toasts(): React.JSX.Element | null {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  if (toasts.length === 0) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      data-toast-stack="true"
      className="fixed bottom-3 right-3 z-[80] flex flex-col gap-2 w-72"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          data-toast-kind={t.kind}
          className={
            "flex items-start justify-between gap-2 rounded-md border bg-bg-elev px-3 py-2 shadow-lg " +
            "text-[12px] " +
            KIND_CLASSES[t.kind]
          }
        >
          <span className="break-words">
            {t.kind === "error" && <b className="text-down mr-1">error:</b>}
            {t.kind === "success" && <b className="text-up mr-1">ok:</b>}
            {t.message}
          </span>
          <button
            type="button"
            aria-label="dismiss"
            className="text-text-3 hover:text-text shrink-0"
            onClick={() => dismiss(t.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
