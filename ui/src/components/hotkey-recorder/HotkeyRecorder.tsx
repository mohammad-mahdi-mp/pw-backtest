/**
 * HotkeyRecorder primitive (P1-T04) — click to record the next key combo;
 * Esc cancels; pure modifier presses are ignored; conflicts against the
 * `existing` list are detected and reported through onChange + inline hint.
 * Blur cancels recording.
 */

import { useRef, useState } from "react";

import { Badge } from "../badge/Badge";

export interface HotkeyRecorderProps {
  /** Current combo, e.g. "Ctrl+K" (null = unset). */
  value: string | null;
  /** Combos already in use (conflict detection). */
  existing?: string[];
  onChange: (combo: string, conflict: boolean) => void;
  /** Accessible name. */
  label: string;
}

const MODIFIERS = ["Control", "Alt", "Shift", "Meta"] as const;

function comboFrom(e: React.KeyboardEvent): string | null {
  if (MODIFIERS.includes(e.key as (typeof MODIFIERS)[number])) return null;
  const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (e.metaKey) parts.push("Meta");
  parts.push(key);
  return parts.join("+");
}

/** pw-backtest hotkey recorder. */
export function HotkeyRecorder({
  value,
  existing = [],
  onChange,
  label,
}: HotkeyRecorderProps): React.JSX.Element {
  const [recording, setRecording] = useState(false);
  const [conflict, setConflict] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  const finish = (): void => {
    setRecording(false);
    btnRef.current?.focus();
  };

  return (
    <div className="flex items-center gap-2">
      <button
        ref={btnRef}
        type="button"
        aria-label={label}
        data-recording={recording || undefined}
        onClick={() => {
          setConflict(false);
          setRecording(true);
        }}
        onBlur={() => setRecording(false)}
        onKeyDown={(e) => {
          if (!recording) return;
          e.preventDefault();
          if (e.key === "Escape") {
            finish();
            return;
          }
          const combo = comboFrom(e);
          if (combo === null) return; // pure modifier — wait for the full combo
          setConflict(existing.includes(combo));
          onChange(combo, existing.includes(combo));
          finish();
        }}
        className={
          "inline-flex items-center h-7 min-w-28 justify-center px-2 rounded text-[12px] font-mono " +
          "transition-colors duration-150 ease-out focus-visible:outline focus-visible:outline-1 " +
          "focus-visible:outline-accent " +
          (recording
            ? "bg-accent text-white border border-transparent"
            : "bg-bg text-text border border-border hover:bg-bg-elev")
        }
      >
        {recording ? "press keys…" : (value ?? "not set")}
      </button>
      {conflict && <Badge kind="down">already in use</Badge>}
    </div>
  );
}
