"use client";

import { useEffect, useRef, useState } from "react";
import { Button, createSpring, springs, type Spring } from "@/design-system";

const presets = Object.entries(springs) as [keyof typeof springs, (typeof springs)[keyof typeof springs]][];
const STAGGER_MS = 50;

/**
 * Each preset drives a dot across a track. Rows start one stagger step apart,
 * and pressing again mid-flight reverses without a jump: the spring keeps
 * its velocity, which a duration-based transition can't do.
 */
export function SpringDemo() {
  const [on, setOn] = useState(false);
  const dots = useRef<(HTMLSpanElement | null)[]>([]);
  const tracks = useRef<(HTMLDivElement | null)[]>([]);
  const driven = useRef<Spring[]>([]);

  useEffect(() => {
    driven.current = presets.map(([, config], i) =>
      createSpring(0, config, (v) => {
        const dot = dots.current[i];
        const track = tracks.current[i];
        if (dot && track) dot.style.transform = `translateX(${v * (track.clientWidth - dot.offsetWidth - 8)}px)`;
      }),
    );
    return () => driven.current.forEach((s) => s.stop());
  }, []);

  function toggle() {
    const next = !on;
    setOn(next);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    driven.current.forEach((spring, i) => {
      if (reduced) return spring.jump(next ? 1 : 0);
      setTimeout(() => spring.set(next ? 1 : 0), i * STAGGER_MS);
    });
  }

  return (
    <div className="rounded-xl bg-panel p-4 shadow-[inset_0_0_0_1px_var(--line)] sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-meta text-muted">Press twice quickly: springs reverse without a jump.</p>
        <Button size="sm" onClick={toggle} aria-pressed={on}>
          {on ? "Back" : "Play"}
        </Button>
      </div>
      <ul className="flex flex-col gap-4">
        {presets.map(([name, config], i) => (
          <li key={name} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[180px_1fr] sm:gap-4">
            <div className="min-w-0">
              <p className="font-mono text-meta text-ink">springs.{name}</p>
              <p className="font-mono text-meta text-muted">
                k {config.stiffness} · c {config.damping}
              </p>
            </div>
            <div ref={(el) => void (tracks.current[i] = el)} className="relative h-6 rounded-full bg-surface shadow-[inset_0_0_0_1px_var(--line)]">
              <span
                ref={(el) => void (dots.current[i] = el)}
                aria-hidden
                className="absolute left-1 top-1 size-4 rounded-full bg-accent shadow-[0_0_0_1px_rgb(0_0_0/0.08)] will-change-transform"
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
