"use client";

import { useState } from "react";
import { Button } from "@/design-system";

type Curve = { token: string; value: string; use: string };

function points(value: string) {
  const [x1, y1, x2, y2] = value.match(/-?[\d.]+/g)!.map(Number);
  return { x1, y1, x2, y2 };
}

/** Plots each easing curve and races a dot along a track with it. */
export function MotionDemo({ curves, duration = 600 }: { curves: readonly Curve[]; duration?: number }) {
  const [on, setOn] = useState(false);

  return (
    <div className="rounded-xl bg-panel p-4 shadow-[inset_0_0_0_1px_var(--line)] sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-meta text-muted">{duration}ms each, so only the curve differs.</p>
        <Button size="sm" onClick={() => setOn((v) => !v)} aria-pressed={on}>
          {on ? "Reset" : "Play"}
        </Button>
      </div>
      <ul className="flex flex-col gap-4">
        {curves.map((curve) => {
          const { x1, y1, x2, y2 } = points(curve.value);
          const s = 40;
          // y grows downward in SVG; leave headroom for overshoot.
          const path = `M0 ${s} C ${x1 * s} ${s - y1 * s}, ${x2 * s} ${s - y2 * s}, ${s} 0`;
          return (
            <li key={curve.token} className="grid grid-cols-[44px_1fr] items-center gap-4 sm:grid-cols-[44px_180px_1fr]">
              <svg viewBox="-2 -8 44 56" className="size-11 overflow-visible" aria-hidden>
                <rect x="0" y="0" width="40" height="40" fill="none" stroke="var(--line)" />
                <path d={path} fill="none" stroke="var(--ink)" strokeWidth="1.5" />
              </svg>
              <div className="min-w-0">
                <p className="font-mono text-meta text-ink">--{curve.token}</p>
                <p className="text-meta text-muted">{curve.use}</p>
              </div>
              <div className="relative col-span-2 h-6 rounded-full bg-surface [container-type:inline-size] shadow-[inset_0_0_0_1px_var(--line)] sm:col-span-1">
                <span
                  aria-hidden
                  className="absolute left-1 top-1 size-4 rounded-full bg-accent shadow-[0_0_0_1px_rgb(0_0_0/0.08)]"
                  style={{
                    transform: on ? "translateX(calc(100cqw - 1.5rem))" : "none",
                    transition: `transform ${duration}ms ${curve.value}`,
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
