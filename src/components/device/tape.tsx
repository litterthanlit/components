"use client";

import { useMemo, useRef, useState, type PointerEvent } from "react";
import { cn } from "@/design-system";
import { focusQuietly, useBoxSize } from "./hooks";

type Take = { slug: string; title: string };

type TapeProps = {
  takes: Take[];
  /** The tape is a slider over the takes, like the dial. */
  slider: { label: string; now: number; max: number; text: string };
  hint: string;
  /** A press or drag along the tape: position from 0 to 1. */
  onScrub: (position: number) => void;
  /** The press let go (commit) or was taken away. */
  onScrubEnd: (commit: boolean) => void;
  className?: string;
};

const BAR_PITCH = 8; // px between bars: sparse enough to read as a line, not a texture

/** A small, seedable PRNG (mulberry32), so every take draws the same waveform on every visit. */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * A take's signature: two or three bursts of energy over a low floor, with
 * per-bar jitter, as speech or music looks on a recorder. Resolution
 * independent: `t` runs 0 to 1 across the take.
 */
function envelope(slug: string) {
  const rand = random(hash(slug));
  const bursts = Array.from({ length: 2 + Math.floor(rand() * 3) }, () => ({ at: 0.08 + rand() * 0.84, width: 0.04 + rand() * 0.1, gain: 0.6 + rand() * 0.4 }));
  const floor = 0.1 + rand() * 0.08;
  return (t: number, jitter: number) => {
    let e = floor;
    for (const b of bursts) e = Math.max(e, b.gain * Math.exp(-(((t - b.at) / b.width) ** 2)));
    // Fade in and out at the cut, so takes read as separate.
    const edge = Math.min(1, t * 12, (1 - t) * 12);
    // Speech-like texture: most bars well under the envelope, a few reaching it.
    return Math.max(0.06, e * edge * (0.25 + 0.75 * jitter ** 1.6));
  };
}

/**
 * The tape: every study laid end to end as a take, its waveform printed in a
 * slim strip under the screen, as on a field recorder. Bars behind the red
 * playhead are inked in; the ones ahead wait faintly. The device writes the
 * playhead's position as `--p` (0 to 1) on an ancestor, so it moves without
 * re-rendering. Press or drag anywhere along it to scrub.
 */
export function Tape({ takes, slider, hint, onScrub, onScrubEnd, className }: TapeProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const waveRef = useRef<HTMLDivElement>(null);
  const size = useBoxSize(waveRef);
  const drag = useRef<number | null>(null);
  const [hover, setHover] = useState<{ x: number; take: number } | null>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const n = takes.length;

  const path = useMemo(() => {
    if (!size || size.w < 1) return "";
    const { w, h } = size;
    const span = w / n;
    const per = Math.max(3, Math.floor(span / BAR_PITCH));
    const mid = h / 2;
    let d = "";
    takes.forEach((take, i) => {
      const amp = envelope(take.slug);
      const jitter = random(hash(`${take.slug}:bars`));
      for (let j = 0; j < per; j++) {
        const x = (i + (j + 0.5) / per) * span;
        const half = Math.max(0.75, amp(j / per, jitter()) * (mid - 1));
        d += `M${x.toFixed(2)} ${(mid - half).toFixed(2)}V${(mid + half).toFixed(2)}`;
      }
    });
    return d;
  }, [size, takes, n]);

  function place(e: PointerEvent) {
    const r = trackRef.current!.getBoundingClientRect();
    const f = Math.min(0.99999, Math.max(0, (e.clientX - r.left) / r.width));
    return { f, x: f * r.width, take: Math.min(n - 1, Math.floor(f * n)) };
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    focusQuietly(e.currentTarget);
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = e.pointerId;
    setScrubbing(true);
    const p = place(e);
    setHover({ x: p.x, take: p.take });
    onScrub(p.f);
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const p = place(e);
    if (drag.current === e.pointerId) onScrub(p.f);
    else if (e.pointerType !== "mouse") return;
    setHover((h) => (h && Math.abs(h.x - p.x) < 0.5 ? h : { x: p.x, take: p.take }));
  }

  function end(e: PointerEvent<HTMLDivElement>, commit: boolean) {
    if (drag.current !== e.pointerId) return;
    drag.current = null;
    setScrubbing(false);
    if (e.pointerType !== "mouse") setHover(null);
    onScrubEnd(commit);
  }

  const tip = hover ?? null;

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={slider.label}
      aria-describedby={hint}
      aria-orientation="horizontal"
      aria-valuemin={1}
      aria-valuemax={slider.max}
      aria-valuenow={slider.now}
      aria-valuetext={slider.text}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => end(e, true)}
      onPointerCancel={(e) => end(e, false)}
      onLostPointerCapture={(e) => end(e, false)}
      onPointerLeave={(e) => drag.current === null && e.pointerType === "mouse" && setHover(null)}
      className={cn("group/tape relative cursor-ew-resize touch-none select-none outline-offset-[-3px] [--tape-inset:clamp(18px,4.5vw,72px)]", className)}
    >
      {/* The baseline runs the full width, as printed on the body. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-black/[0.06] dark:bg-white/[0.06]" />

      <div ref={trackRef} className="absolute inset-y-0 left-[var(--tape-inset)] right-[var(--tape-inset)]">
        {/* Waveform: the whole tape faint, then again in ink up to the playhead. */}
        <div ref={waveRef} aria-hidden className="absolute inset-x-0 inset-y-[22%]">
          {size && (
            <>
              <svg viewBox={`0 0 ${size.w} ${size.h}`} className="absolute inset-0 size-full overflow-visible text-ink opacity-[0.12]">
                <path d={path} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
              </svg>
              <svg
                viewBox={`0 0 ${size.w} ${size.h}`}
                className="absolute inset-0 size-full overflow-visible text-ink [clip-path:inset(-2px_calc(100%_-_var(--p,0)_*_100%)_-2px_-2px)]"
              >
                <path d={path} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
              </svg>
            </>
          )}
          {/* The take under the pointer lifts a little. */}
          {tip && (
            <div
              className="pointer-events-none absolute inset-y-[-10%] rounded-[3px] bg-ink/[0.045]"
              style={{ left: `${(tip.take / n) * 100}%`, width: `${100 / n}%` }}
            />
          )}
        </div>

        {/* The playhead. */}
        <div aria-hidden className="pointer-events-none absolute inset-y-0 left-[calc(var(--p,0)_*_100%)] w-0">
          <div className={cn("absolute inset-y-0 -left-px w-[1.5px] bg-(--device-rec) transition-shadow duration-(--duration-exit)", scrubbing && "shadow-[0_0_0_2px_color-mix(in_oklab,var(--device-rec)_22%,transparent)]")} />
          <div className="absolute -left-[3px] top-[3px] size-[5px] rounded-full bg-(--device-rec)" />
        </div>

        {/* Which take is where. */}
        {tip && (
          <div
            aria-hidden
            className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 -translate-y-full animate-enter whitespace-nowrap rounded-full bg-surface/90 px-2.5 py-1 text-[11px] font-medium leading-none text-ink shadow-md backdrop-blur-md"
            style={{ left: Math.min(Math.max(tip.x, 60), (size?.w ?? 0) - 60) }}
          >
            <span className="mr-1.5 tabular-nums text-muted">{String(tip.take + 1).padStart(2, "0")}</span>
            {takes[tip.take].title}
          </div>
        )}
      </div>
    </div>
  );
}
