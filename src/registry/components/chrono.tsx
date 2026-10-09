"use client";

import { useEffect, useEffectEvent, useImperativeHandle, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type Ref } from "react";
import { createSpring, focusQuietly, springs, type Spring } from "@/design-system";
import { hostTransport, play, type PlayOptions, type SoundName } from "@/lib/sound";

/*
 * A stopwatch and lap timer after a dash-top chronograph: a black face behind
 * glass in a rim bezel, set in a collar. Sixty ticks, a seconds hand with a
 * counterweight, a thirty-minute sub-dial with its own small hand, and under
 * it an LCD with the time to the hundredth and the last lap against the one
 * before. Two keys: START and STOP, and LAP, which is RESET once it has stopped.
 *
 * The clock is a pair of numbers, the milliseconds banked when it last
 * changed and the moment it started counting on from them, so nothing is
 * counted per frame and nothing re-renders. While it runs, one frame loop
 * writes the hands (SVG x1/y1/x2/y2) and the LCD's figures straight to the
 * DOM; it stops the frame the clock does, and while the face is off-screen.
 *
 * RESET is a flyback. The hands let go of the time and return to twelve on
 * springs.bouncy tightened from 12 to 20 damping: at 12 the spring overshoots
 * by 29% of its travel, which on a hand that has come 300° round is a wobble;
 * at 20 (ζ 0.62) it overshoots 8% and settles in about 0.45 s. The seconds
 * hand clicks as it passes each 5 s mark, falling in pitch as it winds back,
 * and goes the short way round. If START lands while the hands are still on
 * their way, the springs chase the live hands instead of snapping to them,
 * and hand over when they've caught up.
 *
 * Tab reaches the two keys. The face and the LCD are for the eye: a timer
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
const SUB = { x: 100, y: 144, r: 20 };
const HAND = 88; // seconds hand: tip
const TAIL = 17; // and the end of its counterweight
const MINUTE_HAND = 17;
const SWEEP_MS = 60_000; // one turn of the seconds hand
const DIAL_MS = 1_800_000; // one turn of the minutes hand: thirty minutes

/** The bouncy spring, tightened to ζ 0.62: about 8% overshoot where 12 damping gives 29%. */
const FLYBACK = { ...springs.bouncy, damping: 20 };
const MARK = 30; // degrees between the 5 s marks the flyback clicks past
const FLASH = 160; // ms the LAP light stays lit

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

const DIAL = ticks(C, C, 60, 94, [88.5, 83, 81], 5, 15);
const REGISTER = ticks(SUB.x, SUB.y, 30, SUB.r - 1.6, [SUB.r - 3.4, SUB.r - 5, SUB.r - 6.5], 5, 10);
const FIGURES = Array.from({ length: 12 }, (_, i) => ({ text: String((i + 1) * 5), ...polar(C, C, (i + 1) * 30, 69.5) }));

/** The hands at a pair of angles: each a line from one point to another. */
function hands(sec: number, min: number) {
  return {
    hand: [polar(C, C, sec, -TAIL), polar(C, C, sec, HAND)],
    weight: [polar(C, C, sec, -7), polar(C, C, sec, -TAIL)],
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

/** Writes the clock as minutes, seconds and hundredths, touching only the fields that change. */
function paintClock(el: HTMLElement, ms: number) {
  const h = Math.floor(ms / 10);
  const parts = [Math.floor(h / 6000) % 100, Math.floor(h / 100) % 60, h % 100];
  for (let i = 0; i < 3; i++) {
    const node = el.children[i * 2];
    const text = String(parts[i]).padStart(2, "0");
    if (node && node.textContent !== text) node.textContent = text;
  }
}

/** A time to the hundredth: 12.84 s, or 1 min 04.12 s. Rounded as a whole so a delta always agrees with the two times it compares. */
const hundredths = (ms: number) => Math.round(ms / 10);
function span(h: number) {
  const m = Math.floor(h / 6000);
  const s = ((h % 6000) / 100).toFixed(2);
  return m ? `${m} min ${s.padStart(5, "0")} s` : `${s} s`;
}
const signed = (h: number) => `${h < 0 ? "−" : "+"}${(Math.abs(h) / 100).toFixed(2)} s`;

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Controlled when the prop is given, otherwise the component keeps the value itself. */
function useControllable<T>(controlled: T | undefined, initial: T) {
  const [own, setOwn] = useState(initial);
  return [controlled === undefined ? own : controlled, setOwn] as const;
}

/** A key's face sinks onto its base under the hand, or while `data-pressed` (the ghost). */
const sink =
  "group-active/key:translate-y-[2px] group-active/key:shadow-(--device-key-shadow-pressed) group-active/key:duration-75 group-data-pressed/key:translate-y-[2px] group-data-pressed/key:shadow-(--device-key-shadow-pressed) group-data-pressed/key:duration-75";

type KeyProps = {
  id: ChronoKey;
  label: string;
  /** The key's light: lit while the clock runs. LAP lights it for a moment per lap, from outside. */
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
      className={cx("group/key min-w-0 touch-manipulation rounded-[0.7em] outline-offset-2", disabled && "cursor-default")}
    >
      <span
        className={cx(
          "relative grid h-[2.7em] place-items-center rounded-[0.7em] text-(--device-key-ink) [background:var(--device-key-face)] shadow-(--device-key-shadow) transition-[transform,box-shadow] duration-(--duration-exit) ease-out",
          !disabled && sink,
        )}
      >
        <span
          aria-hidden
          data-part="light"
          data-light={id}
          data-on={lit || undefined}
          className="absolute inset-x-[30%] top-[0.45em] h-[0.24em] rounded-full bg-(--device-meter-off) transition-[background-color,box-shadow] duration-(--duration-exit) data-on:bg-(--device-rec) data-on:shadow-[0_0_0.45em_var(--device-rec)] data-on:duration-0"
        />
        <span
          data-part="lettering"
          className={cx("mt-[0.5em] text-[0.8em] font-medium uppercase leading-none tracking-[0.03em] [text-shadow:var(--device-engrave)]", disabled && "text-(--device-label-quiet)")}
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
    const [handEl, weightEl, minuteEl] = [line("hand"), line("weight"), line("minute")];
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
      write(weightEl, h.weight);
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
      if (!fly) place(secondsAngle(hand(ms)), minutesAngle(hand(ms)));
      else if (since) chase(ms);
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
    const light = rootRef.current?.querySelector<HTMLElement>('[data-light="lap"]');
    if (light) {
      light.dataset.on = "";
      timers.current.push(setTimeout(() => delete light.dataset.on, FLASH));
    }
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
  const before = laps.length > 1 ? hundredths(laps[laps.length - 2]) : null;
  const unit = "ml-[0.1em] mr-[0.45em] text-[0.3em] font-normal text-(--device-lcd-dim)";

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={label}
      onPointerDownCapture={() => (touched.current = true)}
      onKeyDownCapture={() => (touched.current = true)}
      className={cx("flex flex-col gap-[0.75em]", className)}
    >
      {/* The collar, the bezel in it and the black face in that. The hands are drawn by the frame loop. */}
      <div aria-hidden data-part="collar" className="mx-auto size-[16.2em] rounded-full bg-black/[0.035] p-[0.4em] shadow-(--device-recess) dark:bg-black/30">
        <div data-part="bezel" className="size-full rounded-full bg-(--device-rim) p-[0.35em] shadow-[var(--device-rim-edge),0_2px_5px_rgb(0_0_0/0.3)]">
          <div data-part="face" className="relative size-full rounded-full [background:var(--device-window)] shadow-(--device-window-edge)">
            <svg viewBox="0 0 200 200" className="block size-full font-sans">
              <path d={DIAL.minor} fill="none" stroke="var(--device-lcd-dim)" strokeWidth="0.9" />
              <path d={DIAL.major} fill="none" stroke="var(--device-lcd-ink)" strokeWidth="1.6" />
              <path d={DIAL.quarter} fill="none" stroke="var(--device-lcd-ink)" strokeWidth="2.6" />
              {FIGURES.map((f) => (
                <text key={f.text} x={f.x} y={f.y} textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="500" fill="var(--device-lcd-ink)">
                  {f.text}
                </text>
              ))}

              {/* The minutes sub-dial: thirty minutes round. */}
              <circle cx={SUB.x} cy={SUB.y} r={SUB.r + 2.2} fill="rgb(0 0 0 / 0.35)" stroke="rgb(255 255 255 / 0.12)" strokeWidth="0.6" />
              <circle cx={SUB.x} cy={SUB.y} r={SUB.r} fill="rgb(255 255 255 / 0.07)" />
              <path d={REGISTER.minor} fill="none" stroke="var(--device-lcd-dim)" strokeWidth="0.6" />
              <path d={REGISTER.major} fill="none" stroke="var(--device-lcd-ink)" strokeWidth="1" />
              <path d={REGISTER.quarter} fill="none" stroke="var(--device-lcd-ink)" strokeWidth="1.4" />
              <line data-minute x1={REST.minute[0].x} y1={REST.minute[0].y} x2={REST.minute[1].x} y2={REST.minute[1].y} stroke="var(--device-lcd-ink)" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx={SUB.x} cy={SUB.y} r="2.4" fill="var(--device-lcd-ink)" />
              <circle cx={SUB.x} cy={SUB.y} r="0.8" fill="var(--device-rim)" />

              {/* The seconds hand: a thin blade, a counterweight on its tail and the pivot's cap over both. */}
              <line data-hand x1={REST.hand[0].x} y1={REST.hand[0].y} x2={REST.hand[1].x} y2={REST.hand[1].y} stroke="var(--device-rec)" strokeWidth="1.5" strokeLinecap="round" />
              <line data-weight x1={REST.weight[0].x} y1={REST.weight[0].y} x2={REST.weight[1].x} y2={REST.weight[1].y} stroke="var(--device-rec)" strokeWidth="4.6" />
              <circle cx={C} cy={C} r="5.6" fill="var(--device-rec)" />
              <circle cx={C} cy={C} r="1.9" fill="var(--device-rim)" />
            </svg>
            {/* Glass over the face: a sheen where the light catches it. */}
            <div aria-hidden data-part="glass" className="pointer-events-none absolute inset-0 rounded-[inherit] [background:var(--screen-glass)]" />
          </div>
        </div>
      </div>

      {/* The readout: time to the hundredth, the state, and the last lap against the one before. */}
      <div data-part="well" className="rounded-[1.05em] bg-(--device-well) p-[0.35em] shadow-(--device-recess)">
        <div aria-hidden data-part="lcd" className="flex flex-col gap-[0.45em] rounded-[0.7em] px-[0.8em] py-[0.6em] text-(--device-lcd-ink) [background:var(--device-lcd)] shadow-(--device-lcd-edge)">
          <div className="flex items-start justify-between gap-[0.6em]">
            <p ref={clockRef} className="flex items-baseline whitespace-nowrap text-[2.1em] font-light leading-none tracking-[-0.03em] tabular-nums">
              <span>00</span>
              <span className={unit}>M</span>
              <span>00</span>
              <span className={unit}>S</span>
              <span>00</span>
            </p>
            <span data-part="chip" className="inline-flex shrink-0 items-center gap-[0.35em] rounded-[0.4em] bg-white px-[0.42em] py-[0.24em] text-black">
              <span
                className={
                  running
                    ? "size-[0.55em] animate-pulse rounded-full bg-(--device-rec) motion-reduce:animate-none"
                    : clean
                      ? "size-[0.55em] rounded-full bg-black"
                      : "size-[0.5em] rounded-[1px] bg-current"
                }
              />
              <span className="text-[0.58em] font-semibold uppercase leading-none tracking-[0.02em]">{running ? "Running" : clean ? "Ready" : "Stopped"}</span>
            </span>
          </div>
          <p key={laps.length} className="flex h-[1.3em] animate-enter items-baseline gap-[0.7em] whitespace-nowrap text-[0.86em] leading-[1.3] tracking-[-0.01em] tabular-nums">
            {last === null ? (
              <span className="text-(--device-lcd-dim)">No laps</span>
            ) : (
              <>
                <span className="text-(--device-lcd-dim)">Lap {laps.length}</span>
                <span>{span(last)}</span>
                {before !== null && <span className="text-(--device-lcd-dim)">{signed(last - before)}</span>}
              </>
            )}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-[0.55em]">
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
    <div ref={rootRef} onPointerDownCapture={takeOver} onKeyDownCapture={takeOver} className="@container w-full max-w-[360px] select-none">
      <div data-part="plate" className="relative isolate animate-enter overflow-hidden rounded-[1.25em] p-[0.9em] text-[clamp(11px,4cqw,14px)] [background:var(--device-body)] shadow-[var(--device-body-edge),0_1px_2px_rgb(0_0_0/0.06),0_16px_32px_-18px_rgb(0_0_0/0.3)]">
        <div aria-hidden className="device-grain pointer-events-none absolute inset-0 -z-10 rounded-[inherit]" />
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
