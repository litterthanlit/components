"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Toast = { id: number; title: string; body: string };

const VISIBLE = 3;
const GAP = 10;
const PEEK = 12;
const DURATION = 4500;

/**
 * Stacked notifications that fan out on hover or focus. Collapsed, older
 * toasts tuck behind the newest one and scale down; expanded, they lay out
 * with real heights. Timers pause while the stack is expanded so nothing
 * disappears while someone is reading it.
 */
export function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [heights, setHeights] = useState<Record<number, number>>({});

  const measure = useCallback((id: number, el: HTMLDivElement | null) => {
    if (!el) return;
    const h = el.offsetHeight;
    setHeights((prev) => (prev[id] === h ? prev : { ...prev, [id]: h }));
  }, []);

  // Newest first.
  const ordered = [...toasts].reverse();
  const frontHeight = ordered[0] ? (heights[ordered[0].id] ?? 64) : 0;
  const expandedHeight = ordered
    .slice(0, VISIBLE)
    .reduce((sum, t, i) => sum + (heights[t.id] ?? 64) + (i ? GAP : 0), 0);
  const collapsedHeight = frontHeight + PEEK * Math.max(0, Math.min(ordered.length, VISIBLE) - 1);

  return (
    <section
      aria-label="Notifications"
      onPointerEnter={() => setExpanded(true)}
      onPointerLeave={() => setExpanded(false)}
      onFocus={() => setExpanded(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setExpanded(false);
      }}
      className="relative w-full max-w-[340px]"
    >
      <ol
        role="status"
        aria-live="polite"
        className="relative transition-[height] duration-(--duration-move) ease-out"
        style={{ height: expanded ? expandedHeight : collapsedHeight }}
      >
        {ordered.map((toast, index) => {
          const offset = ordered.slice(0, index).reduce((sum, t) => sum + (heights[t.id] ?? 64) + GAP, 0);
          const hidden = index >= VISIBLE;
          const y = expanded ? offset : index * PEEK;
          const scale = expanded ? 1 : 1 - index * 0.05;
          return (
            <ToastItem
              key={toast.id}
              toast={toast}
              paused={expanded}
              onDismiss={onDismiss}
              measureRef={(el) => measure(toast.id, el)}
              style={{
                transform: `translateY(${y}px) scale(${scale})`,
                opacity: hidden ? 0 : 1,
                zIndex: toasts.length - index,
                pointerEvents: hidden ? "none" : "auto",
                height: expanded || index === 0 ? heights[toast.id] : frontHeight,
              }}
            />
          );
        })}
      </ol>
    </section>
  );
}

function ToastItem({
  toast,
  paused,
  onDismiss,
  measureRef,
  style,
}: {
  toast: Toast;
  paused: boolean;
  onDismiss: (id: number) => void;
  measureRef: (el: HTMLDivElement | null) => void;
  style: React.CSSProperties;
}) {
  const [mounted, setMounted] = useState(false);
  const remaining = useRef(DURATION);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (paused) return;
    const start = Date.now();
    const id = setTimeout(() => onDismiss(toast.id), remaining.current);
    return () => {
      clearTimeout(id);
      remaining.current -= Date.now() - start;
    };
  }, [paused, onDismiss, toast.id]);

  return (
    <li
      style={{
        ...style,
        transform: mounted ? style.transform : "translateY(-24px) scale(0.96)",
        opacity: mounted ? style.opacity : 0,
      }}
      className="absolute inset-x-0 top-0 origin-top overflow-hidden rounded-xl bg-surface shadow-lg transition-[transform,opacity,height] duration-(--duration-move) ease-out"
    >
      {/* Measured at natural height; the <li> may be clipped shorter while collapsed. */}
      <div ref={measureRef} className="flex items-start gap-3 p-3.5">
        <span aria-hidden className="mt-[7px] size-1.5 shrink-0 rounded-full bg-accent shadow-[0_0_0_1px_rgb(0_0_0/0.06)]" />
        <div className="min-w-0 flex-1">
          <p className="flex items-baseline justify-between gap-2">
            <span className="truncate text-body font-medium text-ink">{toast.title}</span>
            <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.04em] text-subtle">now</span>
          </p>
          <p className="text-meta text-muted">{toast.body}</p>
        </div>
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          aria-label={`Dismiss: ${toast.title}`}
          className="-m-1 rounded-sm p-1 text-muted transition-colors duration-(--duration-exit) hover:bg-panel hover:text-ink hover:duration-(--duration-enter)"
        >
          <svg aria-hidden viewBox="0 0 16 16" className="size-3.5" fill="none">
            <path d="m4 4 8 8m0-8-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </li>
  );
}

const samples = [
  { title: "Deployment ready", body: "main@4f2a1c is live on production." },
  { title: "Invite accepted", body: "Ada joined the Design workspace." },
  { title: "Export complete", body: "board-final.png · 2.4 MB" },
  { title: "Comment added", body: "“Love the easing on this one.”" },
];

export default function Demo() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(0);

  const add = useCallback(() => {
    const sample = samples[next.current % samples.length];
    setToasts((t) => [...t, { id: next.current++, ...sample }]);
  }, []);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  // Seed a couple so the stack is visible in thumbnails and captures.
  useEffect(() => {
    const a = setTimeout(add, 300);
    const b = setTimeout(add, 700);
    const c = setTimeout(add, 1100);
    return () => [a, b, c].forEach(clearTimeout);
  }, [add]);

  return (
    <div className="flex h-72 w-full max-w-[340px] flex-col items-center gap-6">
      <button
        type="button"
        onClick={add}
        className="h-9 shrink-0 rounded-md bg-surface px-3.5 text-body font-medium text-ink shadow-sm transition-transform duration-(--duration-exit) ease-out active:scale-[0.97]"
      >
        Send notification
      </button>
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
