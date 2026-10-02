"use client";

import { useRef, type CSSProperties, type PointerEvent, type ReactNode } from "react";

type SpotlightCardProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

/**
 * A surface whose border and fill pick up a soft light that follows the
 * pointer. Position is written to CSS variables on the element directly,
 * so moving the mouse never triggers a React re-render.
 */
export function SpotlightCard({ children, className = "", style }: SpotlightCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  function handleMove(event: PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // Account for any ancestor scale/zoom so the light sits under the pointer.
    const scale = rect.width / el.offsetWidth || 1;
    el.style.setProperty("--x", `${(event.clientX - rect.left) / scale}px`);
    el.style.setProperty("--y", `${(event.clientY - rect.top) / scale}px`);
  }

  return (
    <div
      ref={ref}
      onPointerMove={handleMove}
      style={style}
      className={`group/spot relative isolate overflow-hidden rounded-xl bg-line p-px shadow-sm [--x:50%] [--y:-40%] ${className}`}
    >
      {/* Border light: sits under a 1px inset surface, so only the edge glows. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity duration-(--duration-exit) ease-out group-hover/spot:opacity-100 group-hover/spot:duration-(--duration-enter)"
        style={{
          background:
            "radial-gradient(240px circle at var(--x) var(--y), var(--accent-strong), transparent 70%)",
        }}
      />
      <div className="relative h-full rounded-[11px] bg-surface">
        {/* Fill light */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[11px] opacity-0 transition-opacity duration-500 group-hover/spot:opacity-100"
          style={{
            background:
              "radial-gradient(360px circle at var(--x) var(--y), color-mix(in oklab, var(--accent) 16%, transparent), transparent 60%)",
          }}
        />
        <div className="relative">{children}</div>
      </div>
    </div>
  );
}

const items = [
  {
    title: "Edge functions",
    body: "Run logic close to every user, with cold starts measured in single milliseconds.",
    stat: "12ms",
    label: "p50 latency",
  },
  {
    title: "Instant rollbacks",
    body: "Every deploy is immutable. Step back to any previous build in one click.",
    stat: "0.4s",
    label: "to restore",
  },
];

export default function Demo() {
  return (
    <div className="grid w-full max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
      {items.map((item, i) => (
        <SpotlightCard key={item.title} className="animate-enter" style={{ animationDelay: `calc(${i} * var(--stagger))` }}>
          <article className="flex h-full flex-col gap-6 p-5">
            <div className="flex items-center gap-2">
              <span aria-hidden className="size-1.5 rounded-full bg-accent" />
              <h3 className="text-body font-medium text-ink">{item.title}</h3>
            </div>
            <p className="text-body text-muted">{item.body}</p>
            <p className="mt-auto flex items-baseline gap-2 border-t border-line pt-4">
              <span className="font-mono text-title tracking-tight tabular-nums text-ink">{item.stat}</span>
              <span className="text-meta text-muted">{item.label}</span>
            </p>
          </article>
        </SpotlightCard>
      ))}
    </div>
  );
}
