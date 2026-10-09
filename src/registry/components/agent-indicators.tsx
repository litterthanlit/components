"use client";

import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { focusQuietly } from "@/design-system";
import { hostTransport, play } from "@/lib/sound";

/*
 * Six ways to say an agent is working, each a small mechanism from the
 * player's hardware, on its own piece of glass or in sockets on the body:
 *
 *   Thinking   two seven-segment figures chase round their outer loop, the
 *              way an appliance says it's busy, each segment fading off with
 *              an LCD's persistence (110ms)
 *   Searching  a tuner seeks across its dial; the needle rides a spring
 *              (k 110 · c 14) to each station, overshoots and settles, and
 *              the lock lamp lights while it holds
 *   Reading    a stereo meter pair takes tokens in bursts, with the readout's
 *              ballistics: bars fall at 26 dB a second, the peak holds 900ms
 *   Reasoning  a dot-matrix strip works through an interference pattern,
 *              ghost dots at 8%
 *   Running    eight step lights: the playhead fires red and each step it
 *              passes latches lit, then the row clears and goes again
 *   Writing    two reels record to tape, packs growing by the square root, so
 *              the take-up reel slows as it fills; at the end they rewind
 *
 * All of them draw from one frame loop straight to the DOM, so React never
 * re-renders for them. Each runs 1.2s ahead before it first paints, so none
 * is ever seen at rest. The loop stops for indicators that are paused or
 * off-screen, and under reduced motion each holds that first frame.
 * AgentIndicator takes the agent's phase and crossfades between them.
 */

export type IndicatorPhase = "thinking" | "searching" | "reading" | "reasoning" | "running" | "writing";

type IndicatorProps = {
  /** Said by screen readers; false hides it, for an indicator inside a labelled control. */
  label?: string | false;
  /** Hold the current frame: the agent is idle, or the host's tape is stopped. */
  paused?: boolean;
  className?: string;
};

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const r2 = (n: number) => Math.round(n * 100) / 100;
/** A detent's pitch, varied a little so repeated ticks never sound identical. */
const detent = () => 0.97 + Math.random() * 0.06;

/** Lettering on the body: tiny tracked capitals, cut in. */
const engraved = "font-semibold uppercase leading-none tracking-[0.12em] [text-shadow:var(--device-engrave)]";

/* --- One frame loop for every indicator on the page ------------------------- */

type Draw = (dt: number) => void;
type Entry = { draw: Draw; seen: boolean; paused: boolean };

const entries = new Set<Entry>();
let raf = 0;
let last = 0;
const AHEAD = 1.2; // s of motion run before the first paint

function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  let live = false;
  for (const e of entries) {
    if (!e.seen || e.paused) continue;
    e.draw(dt);
    live = true;
  }
  raf = live ? requestAnimationFrame(frame) : 0;
}

function wake() {
  if (raf) return;
  last = performance.now();
  raf = requestAnimationFrame(frame);
}

/** Runs a module-level drawer for `ref`'s element on the shared loop. Drawers only see time pass, never the clock. */
function useFrame<T extends Element>(ref: RefObject<T | null>, make: (el: T) => Draw, paused: boolean) {
  const entry = useRef<Entry | null>(null);
  useLayoutEffect(() => {
    const el = ref.current!;
    const draw = make(el);
    for (let t = 0; t < AHEAD; t += 1 / 60) draw(1 / 60);
    const e: Entry = { draw, seen: true, paused: true };
    entry.current = e;
    // Reduced motion: the frame it ran ahead to, held.
    if (reducedMotion()) return;
    entries.add(e);
    const visibility = new IntersectionObserver(([x]) => {
      e.seen = x.isIntersecting;
      if (e.seen) wake();
    });
    visibility.observe(el);
    return () => {
      entries.delete(e);
      visibility.disconnect();
    };
  }, [ref, make]);
  useLayoutEffect(() => {
    const e = entry.current!;
    e.paused = paused;
    if (!paused) wake();
  }, [paused]);
}

/** Writes an attribute only when it changes. */
const attr = (el: Element, name: string, value: string) => {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value);
};

/** The module every indicator is built in: 5.6 × 2.6em, so any of them can stand in for another. */
function Module({ label, part, className, children, ref }: { label: string | false; part?: string; className?: string; children: ReactNode; ref: RefObject<HTMLSpanElement | null> }) {
  return (
    <span
      ref={ref}
      data-part={part}
      role={label === false ? undefined : "status"}
      aria-label={label === false ? undefined : label}
      aria-hidden={label === false || undefined}
      className={cx("relative inline-flex h-[2.6em] w-[5.6em] shrink-0 overflow-hidden", className)}
    >
      {children}
    </span>
  );
}

const lcd = "rounded-[0.55em] text-(--device-lcd-ink) [background:var(--device-lcd)] shadow-(--device-lcd-edge)";
const smoked = "rounded-[0.55em] [background:var(--device-window)] shadow-(--device-window-edge)";

/* --- Thinking: seven segments chasing round ------------------------------------ */

/* The figure from One-Time Code: segment centre lines, thickness and a slight italic slant, in viewBox units. */
const T = 6.6;
const GAP = 1;
const X = [5.5, 31];
const Y = [5, 33, 61];
const SLANT = 0.09;
const pt = (x: number, y: number) => `${(x + (Y[2] + T / 2 - y) * SLANT).toFixed(2)},${y.toFixed(2)}`;
const across = (y: number, a: number, b: number) =>
  [pt(a, y), pt(a + T / 2, y - T / 2), pt(b - T / 2, y - T / 2), pt(b, y), pt(b - T / 2, y + T / 2), pt(a + T / 2, y + T / 2)].join(" ");
const down = (x: number, a: number, b: number) =>
  [pt(x, a), pt(x + T / 2, a + T / 2), pt(x + T / 2, b - T / 2), pt(x, b), pt(x - T / 2, b - T / 2), pt(x - T / 2, a + T / 2)].join(" ");
const SEGMENTS = {
  a: across(Y[0], X[0] + GAP, X[1] - GAP),
  b: down(X[1], Y[0] + GAP, Y[1] - GAP),
  c: down(X[1], Y[1] + GAP, Y[2] - GAP),
  d: across(Y[2], X[0] + GAP, X[1] - GAP),
  e: down(X[0], Y[1] + GAP, Y[2] - GAP),
  f: down(X[0], Y[0] + GAP, Y[1] - GAP),
  g: across(Y[1], X[0] + GAP, X[1] - GAP),
};
type Segment = keyof typeof SEGMENTS;

/** The outer loop of "88", clockwise from the top left. */
const LOOP: [figure: number, segment: Segment][] = [
  [0, "a"],
  [1, "a"],
  [1, "b"],
  [1, "c"],
  [1, "d"],
  [0, "d"],
  [0, "e"],
  [0, "f"],
];
const SEG_STEP = 0.085; // s per segment
const PERSIST = 0.11; // s: an LCD segment's fade as it goes off

const chaseSegments = (el: Element): Draw => {
  const lit = [...el.querySelectorAll<SVGPolygonElement>("[data-loop]")].sort((p, q) => Number(p.dataset.loop) - Number(q.dataset.loop));
  const b = lit.map(() => 0);
  let head = 0;
  let t = 0;
  return (dt) => {
    t += dt;
    while (t >= SEG_STEP) {
      t -= SEG_STEP;
      head = (head + 1) % lit.length;
      b[head] = 1;
    }
    const fade = Math.exp(-dt / PERSIST);
    lit.forEach((p, i) => {
      if (i !== head) b[i] *= fade;
      attr(p, "opacity", b[i] < 0.02 ? "0" : b[i].toFixed(2));
    });
  };
};

/** Thinking: two figures chase round their outer loop, each segment fading as it goes off. */
export function Segments({ label = "Thinking", paused = false, className }: IndicatorProps) {
  const ref = useRef<HTMLSpanElement>(null);
  useFrame(ref, chaseSegments, paused);
  return (
    <Module ref={ref} label={label} part="lcd" className={cx(lcd, "items-center justify-center gap-[0.2em]", className)}>
      {[0, 1].map((figure) => (
        <svg key={figure} aria-hidden viewBox="0 0 43 66" className="h-[64%] w-auto [filter:drop-shadow(0_0_0.2em_rgb(255_255_255/0.3))] drawn:[filter:none]!">
          {(Object.keys(SEGMENTS) as Segment[]).map((s) => (
            <polygon key={s} points={SEGMENTS[s]} className="fill-current opacity-[0.1] drawn:fill-(--device-draw-line)! drawn:opacity-50!" />
          ))}
          {LOOP.map(([f, s], i) => f === figure && <polygon key={s} data-loop={i} points={SEGMENTS[s]} opacity="0" className="fill-current drawn:fill-(--device-draw-ink)!" />)}
        </svg>
      ))}
    </Module>
  );
}

/* --- Searching: a tuner seeking across its dial -------------------------------- */

const TICKS = Array.from({ length: 21 }, (_, i) => ({ x: r2(6 + i * 2.2), major: i % 5 === 0 }));
const STATIONS = [0.12, 0.31, 0.5, 0.69, 0.88];
const SEEK = 0.5; // dial widths a second while it seeks
const DWELL = 0.7; // s it holds a station
const NEEDLE = { k: 110, c: 14 }; // a little under critical: it overshoots and settles

const seekStations = (el: Element): Draw => {
  const needle = el.querySelector("[data-needle]")!;
  const lamp = el.querySelector("[data-lamp]")!;
  let x = 0.02;
  let v = 0;
  let target = x;
  let at = 0;
  let dir = 1;
  let dwell = 0;
  let lock = 0;
  return (dt) => {
    const station = STATIONS[at];
    if (dwell > 0) {
      dwell -= dt;
      if (dwell <= 0) {
        if (at + dir < 0 || at + dir >= STATIONS.length) dir = -dir;
        at += dir;
      }
    } else {
      const step = SEEK * dt;
      target = Math.abs(station - target) <= step ? station : target + Math.sign(station - target) * step;
      if (target === station) dwell = DWELL;
    }
    // The needle on its spring, in fixed steps so it's stable at any frame rate.
    for (let left = dt; left > 0; left -= 1 / 240) {
      const h = Math.min(left, 1 / 240);
      v += (NEEDLE.k * (target - x) - NEEDLE.c * v) * h;
      x += v * h;
    }
    const near = dwell > 0 ? Math.max(0, 1 - Math.abs(x - station) / 0.02) : 0;
    lock += (near - lock) * (1 - Math.exp(-dt / 0.06));
    attr(needle, "transform", `translate(${(6 + x * 44).toFixed(2)} 0)`);
    attr(lamp, "opacity", (0.12 + 0.88 * lock).toFixed(2));
  };
};

/** Searching: a tuner seeks from station to station; the lamp lights while it holds one. */
export function Tuner({ label = "Searching", paused = false, className }: IndicatorProps) {
  const ref = useRef<HTMLSpanElement>(null);
  useFrame(ref, seekStations, paused);
  return (
    <Module ref={ref} label={label} part="window" className={cx(smoked, className)}>
      <svg aria-hidden viewBox="0 0 56 26" className="absolute inset-0 size-full">
        {TICKS.map(({ x, major }) => (
          <line key={x} x1={x} x2={x} y1={major ? 17.5 : 19.5} y2={22} strokeWidth={0.5} className="stroke-white/35 drawn:stroke-(--device-draw-ink)!" />
        ))}
        <line x1={6} x2={50} y1={22} y2={22} strokeWidth={0.4} className="stroke-white/20 drawn:stroke-(--device-draw-line)!" />
        <circle data-lamp cx={50.5} cy={5.5} r={1.4} opacity="0.12" className="fill-(--device-lcd-ink) [filter:drop-shadow(0_0_1.2px_rgb(255_255_255/0.8))] drawn:fill-(--device-draw-ink)! drawn:[filter:none]!" />
        <g data-needle>
          <line x1={0} x2={0} y1={3.5} y2={23.5} strokeWidth={0.9} strokeLinecap="round" className="stroke-(--device-rec) [filter:drop-shadow(0_0_1px_var(--device-rec))] drawn:stroke-(--device-draw-ink)! drawn:[filter:none]!" />
        </g>
      </svg>
      <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit] [background:var(--screen-glass)]" />
    </Module>
  );
}

/* --- Reading: a stereo meter pair taking tokens in ------------------------------ */

/** The readout's scale, evenly spaced as on a recorder: the top end gets the room. */
const SCALE: [number, number][] = [
  [-60, 0],
  [-40, 0.2],
  [-20, 0.4],
  [-12, 0.6],
  [-6, 0.8],
  [0, 1],
];
function toScale(db: number) {
  if (db <= SCALE[0][0]) return 0;
  for (let i = 1; i < SCALE.length; i++) {
    const [d1, f1] = SCALE[i];
    const [d0, f0] = SCALE[i - 1];
    if (db <= d1) return f0 + ((db - d0) / (d1 - d0)) * (f1 - f0);
  }
  return 1;
}
const FALL = 26; // dB a second the bar drops
const HOLD = 0.9; // s the peak mark waits before it falls
const PEAK_FALL = 12; // dB a second

const meterTokens = (el: Element): Draw => {
  const rows = [...el.querySelectorAll<HTMLElement>("[data-meter]")];
  const shown = [-60, -60];
  const peak = [-60, -60];
  const held = [0, 0];
  let burst = 0;
  let gap = 0;
  let next = 0;
  return (dt) => {
    // Tokens arrive in bursts, a chunk every 40 to 110ms, with pauses between.
    if (burst > 0) {
      burst -= dt;
      next -= dt;
      if (next <= 0) {
        next = 0.04 + Math.random() * 0.07;
        const level = -17 + Math.random() * 13;
        for (let c = 0; c < 2; c++) shown[c] = Math.max(shown[c], level - c * Math.random() * 3);
      }
      if (burst <= 0) gap = 0.15 + Math.random() * 0.5;
    } else {
      gap -= dt;
      if (gap <= 0) burst = 0.5 + Math.random() * 1.1;
    }
    for (let c = 0; c < 2; c++) {
      shown[c] = Math.max(-60, shown[c] - FALL * dt);
      if (shown[c] >= peak[c]) {
        peak[c] = shown[c];
        held[c] = 0;
      } else if ((held[c] += dt) > HOLD) peak[c] = Math.max(shown[c], peak[c] - PEAK_FALL * dt);
      rows[c].style.setProperty("--l", toScale(shown[c]).toFixed(3));
      rows[c].style.setProperty("--pk", toScale(peak[c]).toFixed(3));
    }
  };
};

/** Reading: a stereo meter pair takes the tokens in, with the readout's ballistics. */
export function Meters({ label = "Reading", paused = false, className }: IndicatorProps) {
  const ref = useRef<HTMLSpanElement>(null);
  useFrame(ref, meterTokens, paused);
  return (
    <Module ref={ref} label={label} part="lcd" className={cx(lcd, "flex-col justify-center gap-[0.45em] px-[0.65em]", className)}>
      {[0, 1].map((c) => (
        <span key={c} data-meter aria-hidden className="relative h-[0.48em]">
          {/* Drawn: the track a hairline, the lit bar its ticks in ink, the peak mark a line of ink. */}
          <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/15 drawn:bg-(--device-draw-line)!" />
          <span className="meter-ticks absolute inset-0 [clip-path:inset(0_calc(100%_-_var(--l,0)_*_100%)_0_0)] drawn:[background:repeating-linear-gradient(90deg,var(--device-draw-ink)_0_1px,transparent_1px_3px)]!" />
          <span className="absolute -inset-y-[12%] left-[calc(var(--pk,0)_*_100%_-_1px)] w-[2px] rounded-[1px] bg-current drawn:bg-(--device-draw-ink)!" />
        </span>
      ))}
    </Module>
  );
}

/* --- Reasoning: a dot matrix working through a pattern -------------------------- */

const COLS = 11;
const ROWS = 5;
const DOTS = Array.from({ length: COLS * ROWS }, (_, i) => ({ x: (i % COLS) * 5 + 2.5, y: Math.floor(i / COLS) * 5 + 2.5 }));

const interfere = (el: Element): Draw => {
  const dots = [...el.querySelectorAll<SVGCircleElement>("[data-dot]")];
  const b = dots.map(() => 0);
  let t = 0;
  return (dt) => {
    t += dt;
    // Four waves: two drifting across, one diagonal and a ring from a wandering centre.
    const cx0 = 5 + 3.2 * Math.sin(t * 0.45);
    const cy0 = 2 + 1.4 * Math.cos(t * 0.6);
    const ease = 1 - Math.exp(-dt / 0.08);
    dots.forEach((dot, i) => {
      const x = i % COLS;
      const y = Math.floor(i / COLS);
      const v = Math.sin(x * 0.55 + t * 1.3) + Math.sin(y * 0.9 - t * 0.9) + Math.sin(x * 0.35 + y * 0.6 + t * 0.7) + Math.sin(Math.hypot(x - cx0, (y - cy0) * 1.3) * 1.1 - t * 2.1);
      b[i] += (Math.min(1, Math.max(0, (v - 0.9) / 1.2)) - b[i]) * ease;
      attr(dot, "opacity", b[i] < 0.03 ? "0" : b[i].toFixed(2));
    });
  };
};

/** Reasoning: a dot-matrix strip works through an interference pattern behind its bezel. */
export function Matrix({ label = "Reasoning", paused = false, className }: IndicatorProps) {
  const ref = useRef<HTMLSpanElement>(null);
  useFrame(ref, interfere, paused);
  return (
    <Module
      ref={ref}
      label={label}
      part="bezel"
      className={cx(
        "rounded-[0.6em] bg-(--device-rim) p-[0.16em] shadow-[0_1px_0_rgb(255_255_255/0.7),inset_0_1px_2px_rgb(0_0_0/0.6)] dark:shadow-[0_1px_0_rgb(255_255_255/0.06),inset_0_1px_2px_rgb(0_0_0/0.6)]",
        className,
      )}
    >
      <span data-part="lcd" className={cx(lcd, "grid size-full place-items-center rounded-[0.45em] px-[0.3em]")}>
        <svg aria-hidden viewBox={`0 0 ${COLS * 5} ${ROWS * 5}`} className="h-[82%] w-auto [filter:drop-shadow(0_0_0.15em_rgb(255_255_255/0.35))] drawn:[filter:none]!">
          {DOTS.map(({ x, y }, i) => (
            <circle key={i} cx={x} cy={y} r={1.55} className="fill-white/[0.08] drawn:fill-transparent! drawn:stroke-(--device-draw-line)! drawn:[stroke-width:0.4px]!" />
          ))}
          {DOTS.map(({ x, y }, i) => (
            <circle key={i} data-dot cx={x} cy={y} r={1.55} opacity="0" className="fill-current drawn:fill-(--device-draw-ink)!" />
          ))}
        </svg>
      </span>
    </Module>
  );
}

/* --- Running: step lights with a playhead ------------------------------------- */

const STEPS = 8;
const STEP_TIME = 0.16; // s per step
const STEP_HOLD = 0.4; // s the full row stays lit
const STEP_REST = 0.25; // s dark before it goes again

const runSteps = (el: Element): Draw => {
  const lights = [...el.querySelectorAll<HTMLElement>("[data-step]")];
  const show = (i: number, s: "off" | "set" | "fire") => {
    if (lights[i].dataset.step !== s) lights[i].dataset.step = s;
  };
  let t = 0;
  let at = -1;
  let stage: "run" | "hold" | "rest" = "run";
  return (dt) => {
    t += dt;
    if (stage === "run" && t >= STEP_TIME) {
      t -= STEP_TIME;
      if (at >= 0) show(at, "set");
      at++;
      if (at < STEPS) show(at, "fire");
      else {
        stage = "hold";
        t = 0;
      }
    } else if (stage === "hold" && t >= STEP_HOLD) {
      stage = "rest";
      t = 0;
      lights.forEach((_, i) => show(i, "off"));
    } else if (stage === "rest" && t >= STEP_REST) {
      stage = "run";
      t = 0;
      at = -1;
    }
  };
};

/** Running: the playhead fires along eight step lights, and each step it passes latches lit. */
export function Chase({ label = "Running", paused = false, className }: IndicatorProps) {
  const ref = useRef<HTMLSpanElement>(null);
  useFrame(ref, runSteps, paused);
  return (
    <Module ref={ref} label={label} className={cx("items-center justify-center gap-[0.12em]", className)}>
      {Array.from({ length: STEPS }, (_, i) => (
        <span key={i} data-part="well" className="grid size-[0.56em] shrink-0 place-items-center rounded-full bg-black/[0.05] shadow-(--device-recess) dark:bg-black/40">
          <span
            data-step="off"
            data-part="light"
            className="size-[0.3em] rounded-full bg-(--device-meter-off) transition-[background-color,box-shadow] duration-(--duration-exit) data-[step=fire]:bg-(--device-rec) data-[step=fire]:shadow-[0_0_0.4em_var(--device-rec)] data-[step=fire]:duration-0 data-[step=set]:bg-(--device-meter-on) data-[step=set]:duration-0 drawn:data-[step=set]:bg-(--device-draw-ink)! drawn:data-[step=fire]:bg-(--device-rec)!"
          />
        </span>
      ))}
    </Module>
  );
}

/* --- Writing: two reels recording to tape -------------------------------------- */

const REEL = { l: 15, r: 41, y: 11.5, hub: 3, full: 8.5 };
const RECORD = 1 / 9; // of the tape a second
const REWIND = 3.5 * RECORD;
const SPIN = 268; // turns tape speed into a reel's angular speed: ω = SPIN · rate / r
const SPOKES = [0, 120, 240].map((a) => {
  const rad = (a * Math.PI) / 180;
  return { x: r2(Math.sin(rad) * 2.6), y: r2(-Math.cos(rad) * 2.6) };
});
/** A pack's radius: its area grows with the tape on it, so the radius goes by the square root. */
const pack = (p: number) => Math.sqrt(REEL.hub ** 2 + p * (REEL.full ** 2 - REEL.hub ** 2));

const recordTape = (el: Element): Draw => {
  const [packL, packR] = el.querySelectorAll("[data-pack]");
  const [hubL, hubR] = el.querySelectorAll("[data-hub]");
  const tape = el.querySelector("[data-tape]")!;
  const rec = el.querySelector("[data-rec]")!;
  let p = 0.08;
  let dir = 1;
  let aL = 0;
  let aR = 0;
  return (dt) => {
    const rate = dir > 0 ? RECORD : -REWIND;
    p += rate * dt;
    if (p >= 1) {
      p = 1;
      dir = -1;
    } else if (p <= 0) {
      p = 0;
      dir = 1;
    }
    const rl = pack(1 - p);
    const rr = pack(p);
    // Both reels turn the way the tape runs; the fuller one turns slower.
    aL += ((SPIN * rate) / rl) * dt;
    aR += ((SPIN * rate) / rr) * dt;
    attr(packL, "r", rl.toFixed(2));
    attr(packR, "r", rr.toFixed(2));
    attr(hubL, "transform", `rotate(${(((aL * 180) / Math.PI) % 360).toFixed(1)} ${REEL.l} ${REEL.y})`);
    attr(hubR, "transform", `rotate(${(((aR * 180) / Math.PI) % 360).toFixed(1)} ${REEL.r} ${REEL.y})`);
    attr(tape, "d", `M${(REEL.l + rl * 0.35).toFixed(2)} ${(REEL.y + rl * 0.94).toFixed(2)}L23 23.2L33 23.2L${(REEL.r - rr * 0.35).toFixed(2)} ${(REEL.y + rr * 0.94).toFixed(2)}`);
    attr(rec, "opacity", dir > 0 ? "1" : "0.15");
  };
};

/** Writing: two reels record to tape behind smoked glass, and rewind when it runs out. */
export function Reels({ label = "Writing", paused = false, className }: IndicatorProps) {
  const ref = useRef<HTMLSpanElement>(null);
  useFrame(ref, recordTape, paused);
  return (
    <Module ref={ref} label={label} part="window" className={cx(smoked, className)}>
      <svg aria-hidden viewBox="0 0 56 26" className="absolute inset-0 size-full">
        {[REEL.l, REEL.r].map((x) => (
          <g key={x}>
            {/* Drawn: the flange a hairline, the pack's edge in ink (its radius is the tape on the reel), the hub over it. */}
            <circle cx={x} cy={REEL.y} r={9.4} strokeWidth={0.5} className="fill-white/[0.03] stroke-white/15 drawn:fill-transparent! drawn:stroke-(--device-draw-line)!" />
            <circle data-pack cx={x} cy={REEL.y} r={REEL.hub} strokeWidth={0.4} className="fill-white/[0.13] stroke-white/10 drawn:fill-transparent! drawn:stroke-(--device-draw-ink)!" />
            <circle cx={x} cy={REEL.y} r={2.9} strokeWidth={0.5} className="fill-[#141415] stroke-white/30 drawn:fill-(--canvas)! drawn:stroke-(--device-draw-ink)!" />
            <g data-hub>
              {SPOKES.map((s) => (
                <line key={`${s.x},${s.y}`} x1={x} y1={REEL.y} x2={x + s.x} y2={REEL.y + s.y} strokeWidth={0.7} strokeLinecap="round" className="stroke-white/55 drawn:stroke-(--device-draw-ink)!" />
              ))}
            </g>
          </g>
        ))}
        <path data-tape fill="none" strokeWidth={0.5} className="stroke-white/30 drawn:stroke-(--device-draw-ink)!" />
        <rect x={26.5} y={22.4} width={3} height={2} rx={0.4} className="fill-white/25 drawn:fill-(--device-draw-ink)!" />
        <circle data-rec cx={51.8} cy={4.2} r={1.1} className="fill-(--device-rec) [filter:drop-shadow(0_0_1px_var(--device-rec))] drawn:[filter:none]!" />
      </svg>
      <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit] [background:var(--screen-glass)]" />
    </Module>
  );
}

/* --- AgentIndicator: one indicator that follows the agent's phase --------------- */

export const indicators: Record<IndicatorPhase, { name: string; label: string; Indicator: ComponentType<IndicatorProps> }> = {
  thinking: { name: "Segments", label: "Thinking", Indicator: Segments },
  searching: { name: "Tuner", label: "Searching", Indicator: Tuner },
  reading: { name: "Meters", label: "Reading", Indicator: Meters },
  reasoning: { name: "Matrix", label: "Reasoning", Indicator: Matrix },
  running: { name: "Chase", label: "Running", Indicator: Chase },
  writing: { name: "Reels", label: "Writing", Indicator: Reels },
};

/**
 * Pass the agent's phase; the indicator crossfades to the matching one, which
 * comes in already moving. Screen readers hear the label (or the phase) when it changes.
 */
export function AgentIndicator({ phase, label, paused = false, className }: Omit<IndicatorProps, "label"> & { phase: IndicatorPhase; label?: string }) {
  const [shown, setShown] = useState(phase);
  const [leaving, setLeaving] = useState<IndicatorPhase | null>(null);

  // Swap during render rather than in an effect, so the new indicator never lags a frame.
  if (phase !== shown) {
    setLeaving(shown);
    setShown(phase);
  }

  useEffect(() => {
    if (!leaving) return;
    const id = setTimeout(() => setLeaving(null), 150);
    return () => clearTimeout(id);
  }, [leaving]);

  const { Indicator } = indicators[shown];
  const Leaving = leaving ? indicators[leaving].Indicator : null;

  return (
    <span role="status" className={cx("inline-grid shrink-0", className)}>
      <span className="sr-only">{label ?? indicators[shown].label}</span>
      {Leaving && (
        <span key={`out-${leaving}`} aria-hidden className="col-start-1 row-start-1 flex" style={{ animation: "enter var(--duration-exit) var(--ease-out) reverse both" }}>
          <Leaving label={false} paused={paused} />
        </span>
      )}
      <span key={shown} aria-hidden className="col-start-1 row-start-1 flex animate-enter">
        <Indicator label={false} paused={paused} />
      </span>
    </span>
  );
}

/* --- Demo: the six on a plate, and the one in use above them ------------------- */

const ORDER: IndicatorPhase[] = ["thinking", "searching", "reading", "reasoning", "running", "writing"];
const LINES: Record<IndicatorPhase, string> = {
  thinking: "Thinking it through",
  searching: "Searching 12 sources",
  reading: "Reading take_04.wav",
  reasoning: "Weighing 3 takes",
  running: "Running 8 steps",
  writing: "Writing session notes",
};
const CYCLE = 2400; // ms each phase is in use before the next
const TILE_COLS = 3;

export default function Demo() {
  const [at, setAt] = useState(0);
  const [cycling, setCycling] = useState(false);
  const [paused, setPaused] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const touched = useRef(false); // a hand has been here: the cycle doesn't come back
  const phase = ORDER[at];

  /** Any real input takes over from the cycle, for good, and wakes everything. */
  function takeOver() {
    touched.current = true;
    setCycling(false);
    setPaused(false);
  }

  function choose(i: number) {
    setAt(i);
  }

  // Power up: everything runs and the phases cycle, unless the host's tape is stopped; then follow its PLAY.
  // Under reduced motion each indicator holds a still frame and nothing cycles.
  const powerUp = useEffectEvent(() => {
    if (touched.current || hostTransport(rootRef.current) === "stop") return;
    setPaused(false);
    if (!reducedMotion()) setCycling(true);
  });
  useEffect(() => {
    const root = rootRef.current;
    const start = requestAnimationFrame(powerUp);
    const host = root?.closest("[data-transport]");
    const observer = new MutationObserver(() => hostTransport(root) === "play" && powerUp());
    if (host) observer.observe(host, { attributes: true, attributeFilter: ["data-transport"] });
    return () => {
      cancelAnimationFrame(start);
      observer.disconnect();
    };
  }, []);

  // The cycle: the next phase every 2.4s, a quiet detent while the host's tape plays.
  useEffect(() => {
    if (!cycling) return;
    const root = rootRef.current;
    const id = setTimeout(() => {
      setAt((i) => (i + 1) % ORDER.length);
      if (hostTransport(root) === "play") play("tick", { gain: 0.35, pitch: detent() });
    }, CYCLE);
    return () => clearTimeout(id);
  }, [cycling, at]);

  /** The tiles are one radio group: arrows move across and down the grid. */
  function onTileKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, ArrowDown: i + TILE_COLS, ArrowUp: i - TILE_COLS, Home: 0, End: ORDER.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    if (next < 0 || next >= ORDER.length || next === i) return play("bump", { gain: 0.6 });
    play("tick", { pitch: detent() });
    choose(next);
    rootRef.current?.querySelector<HTMLElement>(`[data-tile="${next}"]`)?.focus();
  }

  const focusOnPress = (e: PointerEvent<HTMLElement>) => {
    if (e.button === 0) focusQuietly(e.currentTarget);
  };

  return (
    <div ref={rootRef} onPointerDownCapture={takeOver} onKeyDownCapture={takeOver} onFocusCapture={takeOver} className="@container w-full max-w-[440px] select-none">
      <div data-part="plate" className="relative isolate animate-enter overflow-hidden rounded-[1.25em] p-[0.9em] text-[clamp(11px,4cqw,14px)] [background:var(--device-body)] shadow-[var(--device-body-edge),0_1px_2px_rgb(0_0_0/0.06),0_16px_32px_-18px_rgb(0_0_0/0.3)] @[26rem]:p-[1.1em]">
        <div aria-hidden className="device-grain pointer-events-none absolute inset-0 -z-10 rounded-[inherit]" />

        {/* In use: the indicator beside the line it stands for, as an agent would show it. */}
        <div data-part="well" className="flex items-stretch gap-[0.45em] rounded-[1.05em] bg-(--device-well) p-[0.4em] shadow-(--device-recess)">
          <AgentIndicator phase={phase} label={LINES[phase]} paused={paused} />
          <div aria-hidden data-part="lcd" className={cx(lcd, "flex min-w-0 flex-1 flex-col justify-between overflow-hidden px-[0.7em] pb-[0.5em] pt-[0.45em]")}>
            <span className="flex items-center text-[0.62em] tabular-nums text-(--device-lcd-dim) drawn:opacity-60">
              {indicators[phase].name}
              <span className="ml-auto">
                {at + 1}/{ORDER.length}
              </span>
            </span>
            <span key={phase} className="animate-enter truncate text-[0.92em] leading-none tracking-[-0.01em]">
              {LINES[phase]}
            </span>
          </div>
        </div>

        {/* All six: pick one to put it in use. */}
        <div role="radiogroup" aria-label="Indicator" className="mt-[0.8em] grid grid-cols-3 gap-x-[0.5em] gap-y-[0.7em]">
          {ORDER.map((p, i) => {
            const { Indicator, label } = indicators[p];
            const on = i === at;
            return (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={label}
                tabIndex={on ? 0 : -1}
                data-tile={i}
                data-sound="soft"
                onPointerDown={focusOnPress}
                onClick={() => choose(i)}
                onKeyDown={(e) => onTileKey(e, i)}
                className="group/tile flex min-w-0 flex-col items-center gap-[0.55em] rounded-[1.05em] outline-offset-2"
              >
                <span data-part="well" className="grid w-full place-items-center rounded-[1.05em] bg-(--device-well) p-[0.4em] shadow-(--device-recess) transition-transform duration-(--duration-exit) ease-out group-active/tile:translate-y-px group-active/tile:duration-75">
                  <Indicator label={false} paused={paused} />
                </span>
                <span className="flex max-w-full items-center gap-[0.4em]">
                  <span aria-hidden data-part="light" className={cx("size-[0.36em] shrink-0 rounded-full transition-[background-color] duration-(--duration-exit)", on ? "bg-(--device-meter-on) duration-0 drawn:bg-(--device-draw-ink)!" : "bg-(--device-meter-off)")} />
                  <span data-part="lettering" className={cx(engraved, "truncate text-[0.58em] transition-colors duration-(--duration-exit)", on ? "text-(--device-label)" : "text-(--device-label-quiet)")}>{label}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
