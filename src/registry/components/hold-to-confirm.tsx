"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

type HoldToConfirmProps = {
  onConfirm: () => void;
  children: ReactNode;
  /** Hold duration in ms. */
  duration?: number;
  className?: string;
};

/**
 * A destructive action that asks for intent: press and hold (pointer, Space or
 * Enter) until the fill completes. Releasing early rewinds the fill quickly.
 * The fill is a clip-path on a duplicate label so text stays legible on both
 * the empty and filled halves.
 */
export function HoldToConfirm({ onConfirm, children, duration = 1200, className = "" }: HoldToConfirmProps) {
  const [holding, setHolding] = useState(false);
  const hintId = useId();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function start() {
    if (holding) return;
    setHolding(true);
    timer.current = setTimeout(() => {
      setHolding(false);
      onConfirm();
    }, duration);
  }

  function cancel() {
    clearTimeout(timer.current);
    setHolding(false);
  }

  const fill = {
    clipPath: holding ? "inset(0 0 0 0)" : "inset(0 100% 0 0)",
    transition: `clip-path ${holding ? duration : 200}ms ${holding ? "linear" : "var(--ease-out)"}`,
  };

  return (
    <button
      type="button"
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) {
          e.preventDefault();
          start();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === " " || e.key === "Enter") cancel();
      }}
      onContextMenu={(e) => e.preventDefault()}
      aria-describedby={hintId}
      className={`relative h-10 select-none overflow-hidden rounded-full bg-surface px-5 text-body font-medium text-ink shadow-sm transition-transform duration-(--duration-exit) ease-out [-webkit-touch-callout:none] active:scale-[0.97] ${className}`}
    >
      <span className="inline-flex items-center gap-2">{children}</span>
      <span
        aria-hidden
        className="absolute inset-0 flex items-center justify-center gap-2 bg-danger text-canvas"
        style={fill}
      >
        {children}
      </span>
      <span id={hintId} className="sr-only">
        Press and hold to confirm
      </span>
    </button>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-4" fill="none">
      <path
        d="M2.5 4h11M6 4V2.75c0-.41.34-.75.75-.75h2.5c.41 0 .75.34.75.75V4m2 0-.6 8.4a1.5 1.5 0 0 1-1.5 1.35H6.1a1.5 1.5 0 0 1-1.5-1.35L4 4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Demo() {
  const [deleted, setDeleted] = useState(false);

  useEffect(() => {
    if (!deleted) return;
    const id = setTimeout(() => setDeleted(false), 2200);
    return () => clearTimeout(id);
  }, [deleted]);

  return (
    <div className="flex flex-col items-center gap-4">
      {deleted ? (
        <p role="status" className="flex h-10 animate-enter items-center gap-2 text-body font-medium text-ink">
          <span aria-hidden className="size-1.5 rounded-full bg-accent" />
          Project deleted
        </p>
      ) : (
        <HoldToConfirm onConfirm={() => setDeleted(true)}>
          <TrashIcon />
          Hold to delete
        </HoldToConfirm>
      )}
      <p className="text-meta text-muted">Press and hold</p>
    </div>
  );
}
