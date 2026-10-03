"use client";

import { useEffect, useState, type ReactNode } from "react";

/*
 * Four ways to say "the agent is working". Each is CSS-driven (the keyframes
 * live in the design system's tokens: shimmer, wave, hop) except the braille
 * spinner, which steps through glyphs like a terminal. All of them hold
 * still under prefers-reduced-motion, and each carries a text label for
 * screen readers.
 */

/** A light sweeping across muted text: "Thinking", "Searching the web". */
export function ShimmerText({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`animate-shimmer bg-clip-text text-transparent motion-reduce:animate-none motion-reduce:text-muted ${className}`}
      style={{
        backgroundImage:
          "linear-gradient(90deg, var(--muted) 0%, var(--muted) 40%, var(--ink) 50%, var(--muted) 60%, var(--muted) 100%)",
        backgroundSize: "200% 100%",
      }}
    >
      {children}
    </span>
  );
}

/** A 3×3 grid of pixels with a diagonal wave, a nod to the dither cards. */
export function DotGrid({ label = "Working", size = 4, className = "" }: { label?: string; size?: number; className?: string }) {
  return (
    <span role="status" aria-label={label} className={`inline-grid grid-cols-3 gap-[3px] ${className}`}>
      {Array.from({ length: 9 }, (_, i) => {
        const row = Math.floor(i / 3);
        const col = i % 3;
        return (
          <span
            key={i}
            aria-hidden
            className="animate-wave rounded-[1px] bg-ink motion-reduce:animate-none motion-reduce:opacity-60"
            style={{ width: size, height: size, animationDelay: `${(row + col) * 110}ms` }}
          />
        );
      })}
    </span>
  );
}

const BRAILLE = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/** The terminal spinner, stepping through braille glyphs at 80ms. */
export function BrailleSpinner({ label = "Working", className = "" }: { label?: string; className?: string }) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % BRAILLE.length), 80);
    return () => clearInterval(id);
  }, []);

  return (
    <span role="status" aria-label={label} className={`inline-block w-[1ch] font-mono text-accent-strong ${className}`}>
      <span aria-hidden>{BRAILLE[frame]}</span>
    </span>
  );
}

/** Three dots hopping in turn: the classic "typing" indicator. */
export function ThinkingDots({ label = "Thinking", className = "" }: { label?: string; className?: string }) {
  return (
    <span role="status" aria-label={label} className={`inline-flex items-center gap-1 ${className}`}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          aria-hidden
          className="size-1.5 animate-hop rounded-full bg-ink motion-reduce:animate-none motion-reduce:opacity-60"
          style={{ animationDelay: `${i * 140}ms` }}
        />
      ))}
    </span>
  );
}

/** Elapsed seconds, for "Thinking · 4s". */
export function useElapsed(running = true) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!running) return;
    const start = Date.now();
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 250);
    return () => clearInterval(id);
  }, [running]);
  return seconds;
}

// The demo sizes itself to its container, not the viewport, so it fits
// half-width gallery cards and the 4:3 stage on phones without clipping.
function Tile({ name, children, index }: { name: string; children: ReactNode; index: number }) {
  return (
    <figure
      className="flex animate-enter flex-col overflow-hidden rounded-xl bg-surface shadow-md"
      style={{ animationDelay: `calc(${index} * var(--stagger))` }}
    >
      <div className="flex h-14 items-center justify-center px-4 @md:h-20">{children}</div>
      <figcaption className="border-t border-line px-3 py-1.5 font-mono text-meta text-muted @md:py-2">{name}</figcaption>
    </figure>
  );
}

export default function Demo() {
  const seconds = useElapsed();

  return (
    <div className="@container w-full max-w-xl">
      <div className="grid grid-cols-2 gap-2 @md:gap-3">
        <Tile name="ShimmerText" index={0}>
          <span className="text-body font-medium">
            <ShimmerText>Thinking</ShimmerText>
            <span className="ml-2 font-mono text-meta tabular-nums text-muted">{seconds}s</span>
          </span>
        </Tile>
        <Tile name="DotGrid" index={1}>
          <span className="flex items-center gap-2.5 text-body text-muted">
            <DotGrid label="Searching" />
            Searching
          </span>
        </Tile>
        <Tile name="BrailleSpinner" index={2}>
          <span className="flex items-center gap-2 font-mono text-[13px] text-ink">
            <BrailleSpinner label="Running tests" />
            npm test
          </span>
        </Tile>
        <Tile name="ThinkingDots" index={3}>
          <span className="flex items-center gap-2 rounded-full bg-panel px-3 py-2">
            <ThinkingDots />
          </span>
        </Tile>
      </div>
    </div>
  );
}
