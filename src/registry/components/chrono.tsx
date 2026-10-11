"use client";

import { useEffect, useEffectEvent, useId, useImperativeHandle, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type Ref } from "react";
import { createSpring, focusQuietly, springs, type Spring } from "@/design-system";
import { hostTransport, play, type PlayOptions, type SoundName } from "@/lib/sound";

/*
 * A stopwatch and lap timer after a dash-top chronograph, on the night-race
 * line, kept as plain as the cluster it comes from: a black dial on a black
 * plate, fine white ticks, white condensed figures at the quarters, one red
 * seconds hand on a small hub and a small thirty-minute sub-dial with a white
 * hand. Beside or under it the time stands directly on the black in one large
 * figure, its hundredths smaller and dim, and the last lap in one small line
 * beneath. Two dark keys: START and STOP, with a single red dot while the
 * clock runs, and LAP, which is RESET once it has stopped.
 *
 * The clock is a pair of numbers, the milliseconds banked when it last
 * changed and the moment it started counting on from them, so nothing is
 * counted per frame and nothing re-renders. While it runs, one frame loop
 * writes the hands (SVG x1/y1/x2/y2) and the figures straight to the DOM, so
 * the seconds hand sweeps rather than ticks; it stops the frame the clock
 * does, and while the face is off-screen.
 *
 * RESET is the showpiece, a flyback. The hands let go of the time and return
 * to twelve on a stiff spring (stiffness 340, damping 25, ζ 0.68): a crisp
 * attack, one overshoot of about 5% of the travel and a settle in about a
 * third of a second. The seconds hand clicks as it passes each 5 s mark,
 * falling in pitch as it winds back, and goes the short way round. If START
 * lands while the hands are still on their way, the springs chase the live
 * hands instead of snapping to them, and hand over when they've caught up.
 *
 * Tab reaches the two keys. The face and the figures are for the eye: a timer
 * element says where the clock stands whenever it starts or stops, and each
 * change and lap is said once in a polite live region. Under reduced motion
 * the hand ticks once a second, the flyback jumps and nothing starts by itself.
 */

/** What a lap reports: its number, how long it took and where the clock stood. All times in ms. */
export type ChronoLap = { number: number; time: number; total: number };
export type ChronoKey = "start" | "lap";
export type ChronoHandle = { press: (key: ChronoKey) => void };

type ChronoProps = {
  /** Whether the clock is counting. Leave it out to let the keys decide, starting from `defaultRunning`. */
  running?: boolean;
  defaultRunning?: boolean;
  /** Milliseconds on the clock when `running` last changed; it counts on from there while running. */
  elapsed?: number;
  defaultElapsed?: number;
  /** How long each lap took, in ms, oldest first. */
  laps?: readonly number[];
  defaultLaps?: readonly number[];
  /** START or STOP. `elapsed` is where the clock stood when the key went down. */
  onRunningChange?: (running: boolean, elapsed: number) => void;
  onLap?: (lap: ChronoLap) => void;
  /** RESET: the hands fly back and the clock and laps clear. */
  onReset?: () => void;
  label?: string;
  ref?: Ref<ChronoHandle>;
  className?: string;
};

/* The face, in viewBox units. The seconds hand turns on the centre, the minutes hand on its own dial. */
const C = 100;
const SUB = { x: 100, y: 134, r: 16 };
const HAND = 86; // seconds hand: tip
const TAIL = 15; // and the end of its short tail
const MINUTE_HAND = 12;
const SWEEP_MS = 60_000; // one turn of the seconds hand
const DIAL_MS = 1_800_000; // one turn of the minutes hand: thirty minutes

/** The flyback: stiffer than bouncy and damped to ζ 0.68, so it attacks fast, overshoots about 5% once and settles. */
const FLYBACK = { ...springs.bouncy, stiffness: 340, damping: 25 };
const MARK = 30; // degrees between the 5 s marks the flyback clicks past

/** A point on the face. Rounded, so the server's and the browser's trigonometry agree when it hydrates. */
const polar = (cx: number, cy: number, deg: number, r: number) => {
  const a = (deg * Math.PI) / 180;
  return { x: Math.round((cx + r * Math.sin(a)) * 100) / 100, y: Math.round((cy - r * Math.cos(a)) * 100) / 100 };
};
type Point = ReturnType<typeof polar>;

const dash = (a: Point, b: Point) => `M${a.x} ${a.y}L${b.x} ${b.y}`;

/** Ticks round a dial as three paths: every tick, every 5th and every 15th stronger. */
function ticks(cx: number, cy: number, count: number, outer: number, inner: [number, number, number], strong: number, strongest: number) {
  const out = { minor: "", major: "", quarter: "" };
  for (let i = 0; i < count; i++) {
    const deg = (i * 360) / count;
    const kind = i % strongest === 0 ? "quarter" : i % strong === 0 ? "major" : "minor";
    out[kind] += dash(polar(cx, cy, deg, outer), polar(cx, cy, deg, inner[kind === "minor" ? 0 : kind === "major" ? 1 : 2]));
  }
  return out;
}

const DIAL = ticks(C, C, 60, 92, [86.5, 82, 78], 5, 15);
const REGISTER = ticks(SUB.x, SUB.y, 30, SUB.r, [SUB.r - 2, SUB.r - 3.4, SUB.r - 4.6], 5, 30);
/** Figures at the quarters only: fewer is calmer. */
const FIGURES = [
  { text: "60", ...polar(C, C, 0, 64) },
  { text: "15", ...polar(C, C, 90, 64) },
  { text: "30", ...polar(C, C, 180, 62) },
  { text: "45", ...polar(C, C, 270, 64) },
];

/** The hands at a pair of angles: each a line from one point to another. */
function hands(sec: number, min: number) {
  return {
    hand: [polar(C, C, sec, -TAIL), polar(C, C, sec, HAND)],
    minute: [polar(SUB.x, SUB.y, min, -5), polar(SUB.x, SUB.y, min, MINUTE_HAND)],
  };
}
const REST = hands(0, 0);

const secondsAngle = (ms: number) => ((ms % SWEEP_MS) / SWEEP_MS) * 360;
const minutesAngle = (ms: number) => ((ms % DIAL_MS) / DIAL_MS) * 360;

function write(line: SVGLineElement, [a, b]: Point[]) {
  line.setAttribute("x1", a.x.toFixed(2));
  line.setAttribute("y1", a.y.toFixed(2));
  line.setAttribute("x2", b.x.toFixed(2));
  line.setAttribute("y2", b.y.toFixed(2));
}

/** The clock's cells: a figure each for minutes, seconds and hundredths, with the two separators between. */
const CELLS = ["d", "d", ":", "d", "d", ".", "d", "d"] as const;

/** Writes the clock as minutes, seconds and hundredths, a digit to a cell, touching only the cells that change. */
function paintClock(el: HTMLElement, ms: number) {
  const h = Math.floor(ms / 10);
  const text = [Math.floor(h / 6000) % 100, Math.floor(h / 100) % 60, h % 100].map((n) => String(n).padStart(2, "0")).join("");
  for (let i = 0, d = 0; i < CELLS.length; i++) {
    if (CELLS[i] !== "d") continue;
    const node = el.children[i];
    if (node && node.textContent !== text[d]) node.textContent = text[d];
    d++;
  }
}

/** A time to the hundredth: 12.84 s, or 1 min 04.12 s. Rounded as a whole so a delta always agrees with the two times it compares. */
const hundredths = (ms: number) => Math.round(ms / 10);
function span(h: number) {
  const m = Math.floor(h / 6000);
  const s = ((h % 6000) / 100).toFixed(2);
  return m ? `${m} min ${s.padStart(5, "0")} s` : `${s} s`;
}

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Controlled when the prop is given, otherwise the component keeps the value itself. */
function useControllable<T>(controlled: T | undefined, initial: T) {
  const [own, setOwn] = useState(initial);
  return [controlled === undefined ? own : controlled, setOwn] as const;
}

/** A key's face sinks onto its base under the hand, or while `data-pressed` (the ghost). */
const sink =
  "group-active/key:translate-y-[2px] group-active/key:shadow-(--race-key-shadow-pressed) group-active/key:duration-75 group-data-pressed/key:translate-y-[2px] group-data-pressed/key:shadow-(--race-key-shadow-pressed) group-data-pressed/key:duration-75";

type KeyProps = {
  id: ChronoKey;
  label: string;
  /** START carries a single red dot, lit while the clock runs. Leave it out for no dot. */
  lit?: boolean;
  disabled?: boolean;
  onAct: () => void;
  /** The key goes down, or comes back up: the caller plays its sound. */
  onTouch: (down: boolean) => void;
};

function Key({ id, label, lit, disabled, onAct, onTouch }: KeyProps) {
  const down = useRef(false);
  const press = () => {
    if (down.current || disabled) return;
    down.current = true;
    onTouch(true);
  };
  const lift = () => {
    if (!down.current) return;
    down.current = false;
    onTouch(false);
  };
  const isKey = (e: KeyboardEvent) => e.key === " " || e.key === "Enter";
  return (
    <button
      type="button"
      data-key={id}
      data-sound="off"
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onPointerDown={(e: PointerEvent<HTMLButtonElement>) => {
        if (e.button !== 0 || disabled) return;
        focusQuietly(e.currentTarget);
        press();
      }}
      onPointerUp={lift}
      onPointerLeave={lift}
      onPointerCancel={lift}
      onKeyDown={(e) => isKey(e) && !e.repeat && press()}
      onKeyUp={(e) => isKey(e) && lift()}
      onClick={() => !disabled && onAct()}
      data-part="key"
      className={cx("group/key min-w-0 touch-manipulation rounded-[0.4em] outline-offset-2", disabled && "cursor-default")}
    >
      <span
        className={cx(
          "relative grid h-[2.7em] place-items-center rounded-[0.4em] text-(--race-ink) [background:var(--race-key-face)] shadow-(--race-key-shadow) transition-[transform,box-shadow] duration-(--duration-exit) ease-out",
          !disabled && sink,
        )}
      >
        {lit !== undefined && (
          <span
            aria-hidden
            data-part="light"
            data-on={lit || undefined}
            className="absolute top-[calc(50%-0.2em)] left-[1em] size-[0.4em] rounded-full bg-(--race-led-off) transition-[background-color,box-shadow] duration-(--duration-exit) data-on:bg-(--race-red) data-on:shadow-(--race-glow-red) data-on:duration-0"
          />
        )}
        <span
          data-part="lettering"
          className={cx("text-[0.78em] font-semibold uppercase leading-none tracking-[0.16em]", disabled && "text-(--race-faint)")}
        >
          {label}
        </span>
      </span>
    </button>
  );
}

type Engine = { go: (running: boolean) => void; seek: (ms: number) => void; reset: () => void; read: () => number };

export function Chrono({
  running: runningProp,
  defaultRunning = false,
  elapsed: elapsedProp,
  defaultElapsed = 0,
  laps: lapsProp,
  defaultLaps = [],
  onRunningChange,
  onLap,
  onReset,
  label = "Stopwatch",
  ref,
  className,
}: ChronoProps) {
  const [running, setRunning] = useControllable(runningProp, defaultRunning);
  const [elapsed, setElapsed] = useControllable(elapsedProp, defaultElapsed);
  const [laps, setLaps] = useControllable<readonly number[]>(lapsProp, defaultLaps);
  const [said, setSaid] = useState({ n: 0, text: "" });
  const rootRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<HTMLParagraphElement>(null);
  const timerRef = useRef<HTMLParagraphElement>(null);
  const engine = useRef<Engine | null>(null);
  const touched = useRef(false); // a hand has worked it: it sounds even while the host is paused
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  /** Sounds it makes by itself follow the host's transport; the hand's always play. */
  function sound(name: SoundName, options?: PlayOptions) {
    if (touched.current || hostTransport(rootRef.current) === "play") play(name, options);
  }

  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  // The clock and the hands: one frame loop that runs only while the clock does.
  useLayoutEffect(() => {
    const root = rootRef.current!;
    const clock = clockRef.current!;
    const timer = timerRef.current!;
    const line = (name: string) => root.querySelector<SVGLineElement>(`[data-${name}]`)!;
    const [handEl, minuteEl] = [line("hand"), line("minute")];
    const reduced = reducedMotion();
    const ring = (name: SoundName, options?: PlayOptions) => {
      if (touched.current || hostTransport(root) === "play") play(name, options);
    };

    let banked = 0; // ms on the clock when it last changed
    let since = 0; // when it began counting on from there, or 0 while it holds
    let raf = 0;
    let seen = true;
    let fly = false; // the hands are on their springs, not on the time
    let curSec = 0;
    let curMin = 0;
    let secTarget = 0;
    let minTarget = 0;
    let secDone = true;
    let minDone = true;
    let mark = 0;

    const read = (now: number) => banked + (since ? Math.max(0, now - since) : 0);
    // Under reduced motion the hand ticks once a second, as a quartz one does.
    const hand = (ms: number) => (reduced ? Math.floor(ms / 1000) * 1000 : ms);
    const place = (sec: number, min: number) => {
      const h = hands(sec, min);
      write(handEl, h.hand);
      write(minuteEl, h.minute);
    };
    const describe = () => {
      timer.textContent = since ? "Running" : banked > 0 ? `Stopped at ${span(hundredths(banked))}` : "Ready";
    };

    const endFly = () => {
      fly = false;
      sec.stop();
      min.stop();
    };
    // Both hands home and the clock holding: hand them back to the time.
    const settle = () => {
      if (!fly || since || !secDone || !minDone) return;
      fly = false;
      place(secondsAngle(hand(banked)), minutesAngle(hand(banked)));
    };
    // Hands still on their way when the clock starts chase the live hands, by the short way round, and hand over once caught up.
    const chase = (ms: number) => {
      const s = secondsAngle(hand(ms));
      const m = minutesAngle(hand(ms));
      secTarget = s + 360 * Math.round((sec.value - s) / 360);
      minTarget = m + 360 * Math.round((min.value - m) / 360);
      sec.set(secTarget);
      min.set(minTarget);
      // A spring chasing a moving target trails it by v·c/k: about half a degree at 6°/s.
      if (Math.abs(sec.value - secTarget) < 1 && Math.abs(min.value - minTarget) < 1) {
        endFly();
        place(s, m);
      }
    };

    const sec: Spring = createSpring(0, FLYBACK, (v) => {
      curSec = v;
      if (fly) {
        place(v, curMin);
        // A click for each 5 s mark the hand passes, each a little lower on the way back.
        const at = Math.floor(v / MARK);
        if (at !== mark) {
          mark = at;
          if (!since) ring("tick", { gain: 0.5, pitch: 0.9 + (((at % 12) + 12) % 12) * 0.022 });
        }
      }
      secDone = v === secTarget;
      settle();
    });
    const min: Spring = createSpring(0, FLYBACK, (v) => {
      curMin = v;
      if (fly) place(curSec, v);
      minDone = v === minTarget;
      settle();
    });

    const draw = (now: number) => {
      const ms = read(now);
      paintClock(clock, ms);
      if (!fly) {
        place(secondsAngle(hand(ms)), minutesAngle(hand(ms)));
      } else if (since) chase(ms);
    };
    const frame = (now: number) => {
      draw(now);
      raf = since && seen ? requestAnimationFrame(frame) : 0;
    };
    const wake = () => {
      if (!raf && since && seen) raf = requestAnimationFrame(frame);
    };
    const visibility = new IntersectionObserver(([entry]) => {
      seen = entry.isIntersecting;
      if (seen) {
        draw(performance.now());
        wake();
      } else {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    });
    visibility.observe(root);

    /** The flyback: the hands let go of the time and spring home. */
    const flyback = () => {
      const ms = read(performance.now());
      const s = secondsAngle(ms);
      const m = minutesAngle(ms);
      banked = 0;
      since = 0;
      paintClock(clock, 0);
      describe();
      if (reduced || (s < 0.5 && m < 0.5)) {
        if (fly) endFly();
        place(0, 0);
        return;
      }
      // Past half a turn the short way home is on, through twelve: 360 is twelve too.
      secTarget = s > 180 ? 360 : 0;
      minTarget = m > 180 ? 360 : 0;
      secDone = minDone = false;
      mark = Math.floor(s / MARK);
      fly = true;
      sec.jump(s);
      min.jump(m);
      sec.set(secTarget);
      min.set(minTarget);
    };

    engine.current = {
      read: () => read(performance.now()),
      go(run) {
        const now = performance.now();
        if (run && !since) since = now;
        else if (!run && since) {
          banked += now - since;
          since = 0;
        }
        draw(now);
        describe();
        wake();
      },
      seek(ms) {
        if (!since && ms === banked) return;
        // Something outside cleared the clock: the hands fly back all the same.
        if (ms === 0 && !since && banked > 0) return flyback();
        const now = performance.now();
        banked = ms;
        if (since) since = now;
        if (fly && ms !== 0) endFly();
        draw(now);
        describe();
      },
      reset: flyback,
    };
    draw(performance.now());
    return () => {
      cancelAnimationFrame(raf);
      visibility.disconnect();
      sec.stop();
      min.stop();
    };
  }, []);

  useLayoutEffect(() => {
    engine.current!.go(running);
  }, [running]);
  // After the state's effect, so a restored time lands on the clock it set up.
  useLayoutEffect(() => {
    engine.current!.seek(elapsed);
  }, [elapsed]);

  useEffect(() => {
    const pending = timers;
    return () => pending.current.forEach(clearTimeout);
  }, []);

  /* --- Keys --------------------------------------------------------------- */

  const stopped = !running;
  const clean = stopped && elapsed === 0 && laps.length === 0;

  function toggle() {
    const now = Math.round(engine.current!.read());
    const next = !running;
    setRunning(next);
    if (!next) setElapsed(now);
    say(next ? "Running" : `Stopped at ${span(hundredths(now))}`);
    sound(next ? "start" : "stop", { gain: 0.8 });
    onRunningChange?.(next, now);
  }

  function lap() {
    const total = Math.round(engine.current!.read());
    const time = Math.max(0, total - laps.reduce((a, b) => a + b, 0));
    const number = laps.length + 1;
    setLaps([...laps, time]);
    say(`Lap ${number}, ${span(hundredths(time))}`);
    sound("select", { gain: 0.6, pitch: 1 + Math.min(number, 8) * 0.015 });
    onLap?.({ number, time, total });
  }

  function reset() {
    engine.current!.reset();
    setElapsed(0);
    setLaps([]);
    say("Reset");
    sound("back", { gain: 0.6 });
    onReset?.();
  }

  const act = (key: ChronoKey) => {
    if (key === "start") toggle();
    else if (running) lap();
    else if (!clean) reset();
  };

  /** A key goes down or comes back up under a hand. */
  const touch = (down: boolean) => play(down ? "press" : "release", { gain: down ? 0.7 : 0.6 });

  useImperativeHandle(ref, () => ({
    press(key) {
      if (key === "lap" && clean) return;
      const el = rootRef.current?.querySelector(`[data-key="${key}"]`);
      el?.toggleAttribute("data-pressed", true);
      sound("press", { gain: 0.7 });
      timers.current.push(
        setTimeout(() => act(key), 80),
        setTimeout(() => {
          el?.toggleAttribute("data-pressed", false);
          sound("release", { gain: 0.6 });
        }, 150),
      );
    },
  }));

  /* --- Render ------------------------------------------------------------- */

  const last = laps.length ? hundredths(laps[laps.length - 1]) : null;
  const cells = (digit: string) => CELLS.map((c, i) => (c === "d" ? <span key={i} className="w-[0.5em] text-center">{digit}</span> : <span key={i} className="mx-[0.01em]">{c}</span>));
  const halo = useId().replace(/\W/g, "");

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={label}
      onPointerDownCapture={() => (touched.current = true)}
      onKeyDownCapture={() => (touched.current = true)}
      className={cx("flex flex-col gap-[1em] @[34rem]:grid @[34rem]:grid-cols-[16.2em_minmax(0,1fr)] @[34rem]:items-center @[34rem]:gap-x-[1.4em]", className)}
    >
      {/* A black dial: ticks, four figures, a sub-dial and one red hand. The hands are drawn by the frame loop. */}
      <div aria-hidden data-part="face" className="mx-auto size-[14.4em] @[34rem]:row-span-2 @[34rem]:size-[16.2em] rounded-full bg-(--race-well) shadow-[inset_0_0_0_1px_var(--race-faint)]">
        <svg viewBox="0 0 200 200" className="block size-full font-sans">
          {/* A faint halo for the seconds hand alone. A fixed region, since a hand's own box has no width. */}
          <defs>
            <filter id={halo} filterUnits="userSpaceOnUse" x="0" y="0" width="200" height="200">
              <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="bloom" />
              <feComponentTransfer in="bloom" result="soft">
                <feFuncA type="linear" slope="0.45" />
              </feComponentTransfer>
              <feMerge>
                <feMergeNode in="soft" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <path d={DIAL.minor} fill="none" stroke="var(--race-dim)" strokeWidth="0.9" />
          <path d={DIAL.major} fill="none" stroke="var(--race-ink)" strokeWidth="1.6" />
          <path d={DIAL.quarter} fill="none" stroke="var(--race-ink)" strokeWidth="2.4" />
          <g className="font-[family-name:var(--font-race)] font-bold italic [font-stretch:62%]" fontSize="19" fill="var(--race-ink)" textAnchor="middle" dominantBaseline="central">
            {FIGURES.map((f) => (
              <text key={f.text} x={f.x} y={f.y}>
                {f.text}
              </text>
            ))}
          </g>

          {/* The minutes sub-dial: thirty minutes round, a tick every five, with a white hand. */}
          <path d={REGISTER.major} fill="none" stroke="var(--race-dim)" strokeWidth="1" />
          <path d={REGISTER.quarter} fill="none" stroke="var(--race-ink)" strokeWidth="1.6" />
          <line data-minute x1={REST.minute[0].x} y1={REST.minute[0].y} x2={REST.minute[1].x} y2={REST.minute[1].y} stroke="var(--race-ink)" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx={SUB.x} cy={SUB.y} r="2.2" fill="var(--race-ink)" />

          {/* The seconds hand: one red blade with a short tail, and a small hub. */}
          <g filter={`url(#${halo})`}>
            <line data-hand x1={REST.hand[0].x} y1={REST.hand[0].y} x2={REST.hand[1].x} y2={REST.hand[1].y} stroke="var(--race-red)" strokeWidth="1.7" strokeLinecap="round" />
            <circle cx={C} cy={C} r="4.2" fill="var(--race-red)" />
          </g>
          <circle cx={C} cy={C} r="1.5" fill="var(--race-well)" />
        </svg>
      </div>

      {/* The readout: the time, large, directly on the plate with its hundredths small and dim, and the last lap beneath. */}
      <div aria-hidden className="flex flex-col gap-[0.6em] text-(--race-ink) @[34rem]:col-start-2">
        <div className="font-[family-name:var(--font-race)] text-[6em] font-bold leading-[0.9] italic tabular-nums [font-stretch:62%] @[34rem]:text-[6.4em]">
          <p ref={clockRef} className="flex items-baseline whitespace-nowrap [&>:nth-child(3)]:text-(--race-dim) [&>:nth-child(n+6)]:text-(--race-dim) [&>:nth-child(n+6)]:text-[0.5em]">
            {cells("0")}
          </p>
        </div>
        <p key={laps.length} className="h-[1.3em] animate-enter whitespace-nowrap text-[0.78em] leading-[1.3] tabular-nums text-(--race-dim)">
          {last === null ? "No laps" : `Lap ${laps.length} · ${span(last)}`}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-[0.6em] @[34rem]:col-start-2">
        <Key id="start" label={running ? "Stop" : "Start"} lit={running} onAct={() => act("start")} onTouch={touch} />
        <Key id="lap" label={running ? "Lap" : "Reset"} disabled={clean} onAct={() => act("lap")} onTouch={touch} />
      </div>

      {/* Where the clock stands when it starts or stops (not per frame), and each change said once. */}
      <p ref={timerRef} role="timer" className="sr-only">
        Ready
      </p>
      <div role="status" className="sr-only">
        <p key={said.n}>{said.text}</p>
      </div>
    </div>
  );
}

/* --- Demo: a lap timer on the dash, and a ghost at the keys ------------------ */

export default function Demo() {
  const [clock, setClock] = useState({ running: false, elapsed: 0 });
  const [laps, setLaps] = useState<number[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const chrono = useRef<ChronoHandle>(null);
  const live = useRef(false); // the ghost is at the keys
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const touched = useRef(false); // a real hand has been here: the ghost doesn't come back

  /** Any real input takes over from the ghost, for good. The clock goes on running. */
  function takeOver() {
    touched.current = true;
    live.current = false;
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }

  // The ghost starts the clock and takes a lap, then lets it run. A stopped tape holds it until PLAY.
  // Under reduced motion it never comes.
  const arm = useEffectEvent(() => {
    if (reducedMotion() || touched.current || live.current || hostTransport(rootRef.current) === "stop") return;
    live.current = true;
    chrono.current?.press("start");
    timers.current.push(setTimeout(() => live.current && chrono.current?.press("lap"), 2200));
  });
  useEffect(() => {
    const root = rootRef.current;
    const id = setTimeout(arm, 400);
    const host = root?.closest("[data-transport]");
    const observer = new MutationObserver(() => hostTransport(root) === "play" && arm());
    if (host) observer.observe(host, { attributes: true, attributeFilter: ["data-transport"] });
    const pending = timers;
    return () => {
      clearTimeout(id);
      observer.disconnect();
      pending.current.forEach(clearTimeout);
      live.current = false;
    };
  }, []);

  return (
    <div ref={rootRef} onPointerDownCapture={takeOver} onKeyDownCapture={takeOver} className="@container w-full max-w-[640px] select-none">
      <div data-part="plate" className="relative isolate animate-enter overflow-hidden rounded-[0.9em] p-[0.9em] text-[clamp(11px,4cqw,14px)] [background:var(--race-body)] shadow-[var(--race-edge),var(--race-shadow)]">
        <Chrono
          ref={chrono}
          running={clock.running}
          elapsed={clock.elapsed}
          laps={laps}
          onRunningChange={(running, elapsed) => setClock({ running, elapsed })}
          onLap={({ time }) => setLaps((l) => [...l, time])}
          onReset={() => {
            setClock({ running: false, elapsed: 0 });
            setLaps([]);
          }}
        />
      </div>
    </div>
  );
}
