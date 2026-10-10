"use client";

import { useEffect, useEffectEvent, useId, useImperativeHandle, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type Ref } from "react";
import { createSpring, focusQuietly, springs, type Spring } from "@/design-system";
import { hostTransport, play, type PlayOptions, type SoundName } from "@/lib/sound";

/*
 * A stopwatch and lap timer after a dash-top chronograph, on the night-race
 * line: pitch-black glass lit from within. Sixty ticks, a yellow marker at
 * twelve, a yellow seconds hand that glows and drags a light trail behind it,
 * a counterweight, a thirty-minute sub-dial with a red hand, and beside or
 * under it an LCD with the time to the hundredth in huge condensed figures and
 * the last lap against the one before, green when it was faster and red when
 * slower. Two keys with a lit strip: START and STOP, and LAP, which is RESET
 * once it has stopped.
 *
 * The trail is four ghost hands behind the real one, written in the same
 * frame as the hand: a fixed few degrees apart while the clock runs, and
 * lagging the spring by a few frames on the flyback, so a fast hand smears
 * and a slow one hardly shows. Reduced motion draws none.
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
const SUB = { x: 100, y: 138, r: 19 };
const HAND = 86; // seconds hand: tip
const TAIL = 17; // and the end of its counterweight
const MINUTE_HAND = 15;
const GHOSTS = [0.3, 0.19, 0.11, 0.05]; // the trail's hands, nearest first: their opacities
const TRAIL = 2.6; // degrees between them while the clock runs
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

const DIAL = ticks(C, C, 60, 90.5, [85.5, 80, 77.5], 5, 15);
const REGISTER = ticks(SUB.x, SUB.y, 30, SUB.r - 1.4, [SUB.r - 3.2, SUB.r - 4.8, SUB.r - 6.2], 5, 10);
const FIGURES = Array.from({ length: 12 }, (_, i) => ({ text: String((i + 1) * 5), ...polar(C, C, (i + 1) * 30, 66.5) }));

/** The hands at a pair of angles: each a line from one point to another. */
function hands(sec: number, min: number) {
  return {
    hand: [polar(C, C, sec, -TAIL), polar(C, C, sec, HAND)],
    weight: [polar(C, C, sec, -7), polar(C, C, sec, -TAIL)],
    minute: [polar(SUB.x, SUB.y, min, -5), polar(SUB.x, SUB.y, min, MINUTE_HAND)],
  };
}
const REST = hands(0, 0);
const clamp = (v: number, limit: number) => Math.max(-limit, Math.min(limit, v));

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
  "group-active/key:translate-y-[2px] group-active/key:shadow-(--race-key-shadow-pressed) group-active/key:duration-75 group-data-pressed/key:translate-y-[2px] group-data-pressed/key:shadow-(--race-key-shadow-pressed) group-data-pressed/key:duration-75";

type KeyProps = {
  id: ChronoKey;
  label: string;
  /** The key's LED: lit yellow while the clock runs. LAP lights it white for a moment per lap, from outside. */
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
        <span
          aria-hidden
          data-part="light"
          data-light={id}
          data-on={lit || undefined}
          className={cx(
            "absolute inset-x-[22%] top-[0.42em] h-[0.2em] rounded-full bg-(--race-led-off) transition-[background-color,box-shadow] duration-(--duration-exit) data-on:duration-0",
            id === "start" ? "data-on:bg-(--race-yellow) data-on:shadow-(--race-glow-yellow)" : "data-on:bg-(--race-ink) data-on:shadow-(--race-glow-yellow)",
          )}
        />
        <span
          data-part="lettering"
          className={cx("mt-[0.5em] text-[0.8em] font-semibold uppercase leading-none tracking-[0.14em]", disabled && "text-(--race-dim)")}
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
    const trailEl = root.querySelector<SVGGElement>("[data-trail]")!;
    const ghosts = [...root.querySelectorAll<SVGLineElement>("[data-ghost]")];
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
    let lag = TRAIL; // degrees between the ghost hands: fixed while the clock runs, the spring's last stride on the flyback
    let prev = 0;

    const read = (now: number) => banked + (since ? Math.max(0, now - since) : 0);
    // Under reduced motion the hand ticks once a second, as a quartz one does.
    const hand = (ms: number) => (reduced ? Math.floor(ms / 1000) * 1000 : ms);
    const place = (sec: number, min: number) => {
      const h = hands(sec, min);
      write(handEl, h.hand);
      write(weightEl, h.weight);
      write(minuteEl, h.minute);
    };
    // The light trail: ghost hands behind the real one, each dimmer. None under reduced motion.
    const shade = (sec: number, show: boolean) => {
      if (reduced) return;
      trailEl.setAttribute("opacity", show ? "1" : "0");
      if (!show) return;
      ghosts.forEach((g, i) => write(g, [polar(C, C, sec - lag * (i + 1), 9), polar(C, C, sec - lag * (i + 1), HAND)]));
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
      shade(0, false);
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
        lag = lag * 0.4 + clamp((v - prev) * 1.2, 11) * 0.6;
        prev = v;
        place(v, curMin);
        shade(v, true);
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
        const s = secondsAngle(hand(ms));
        place(s, minutesAngle(hand(ms)));
        lag = TRAIL;
        shade(s, since > 0);
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
      prev = s;
      lag = 0;
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
  const cells = (digit: string) => CELLS.map((c, i) => (c === "d" ? <span key={i} className="w-[0.5em] text-center">{digit}</span> : <span key={i} className="mx-[0.01em]">{c}</span>));
  const glow = useId().replace(/\W/g, "");

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={label}
      onPointerDownCapture={() => (touched.current = true)}
      onKeyDownCapture={() => (touched.current = true)}
      className={cx("flex flex-col gap-[0.75em] @[34rem]:grid @[34rem]:grid-cols-[16.2em_minmax(0,1fr)] @[34rem]:items-center @[34rem]:gap-x-[1em]", className)}
    >
      {/* The collar, the bezel in it and the black glass in that. The hands are drawn by the frame loop. */}
      <div aria-hidden data-part="collar" className="mx-auto size-[14.8em] @[34rem]:row-span-2 @[34rem]:size-[16.2em] rounded-full bg-(--race-well) p-[0.35em] shadow-(--race-recess)">
        <div data-part="bezel" className="size-full rounded-full p-[0.3em] [background:var(--race-metal)] shadow-[var(--race-edge),0_2px_6px_rgb(0_0_0/0.7)]">
          <div data-part="face" className="relative size-full rounded-full [background:var(--race-glass)] shadow-[inset_0_0_0_1px_var(--race-faint),inset_0_3px_10px_rgb(0_0_0/0.9)]">
            <svg viewBox="0 0 200 200" className="block size-full font-sans">
              {/* Bloom for what is lit: the hands and the marker. A fixed region, since a hand's own box has no width. */}
              <defs>
                <filter id={glow} filterUnits="userSpaceOnUse" x="0" y="0" width="200" height="200">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="2.2" result="bloom" />
                  <feMerge>
                    <feMergeNode in="bloom" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <circle cx={C} cy={C} r="97.6" fill="none" stroke="var(--race-yellow)" strokeOpacity="0.55" strokeWidth="0.7" />
              <path d={DIAL.minor} fill="none" stroke="var(--race-faint)" strokeWidth="1" />
              <path d={DIAL.major} fill="none" stroke="var(--race-dim)" strokeWidth="1.7" />
              <path d={DIAL.quarter} fill="none" stroke="var(--race-ink)" strokeWidth="2.8" />
              <path d="M95.6 1.2H104.4L100 9.6Z" fill="var(--race-yellow)" filter={`url(#${glow})`} />
              <g className="font-[family-name:var(--font-race)] font-bold italic [font-stretch:62%]" fontSize="16" fill="var(--race-ink)" textAnchor="middle" dominantBaseline="central">
                {FIGURES.map((f) => (
                  <text key={f.text} x={f.x} y={f.y}>
                    {f.text}
                  </text>
                ))}
              </g>

              {/* The minutes sub-dial: thirty minutes round, with a red hand. */}
              <circle cx={SUB.x} cy={SUB.y} r={SUB.r + 2.2} fill="var(--race-well)" stroke="var(--race-faint)" strokeWidth="0.8" />
              <path d={REGISTER.minor} fill="none" stroke="var(--race-faint)" strokeWidth="0.7" />
              <path d={REGISTER.major} fill="none" stroke="var(--race-dim)" strokeWidth="1.1" />
              <path d={REGISTER.quarter} fill="none" stroke="var(--race-ink)" strokeWidth="1.6" />
              <g filter={`url(#${glow})`}>
                <line data-minute x1={REST.minute[0].x} y1={REST.minute[0].y} x2={REST.minute[1].x} y2={REST.minute[1].y} stroke="var(--race-red)" strokeWidth="1.8" strokeLinecap="round" />
                <circle cx={SUB.x} cy={SUB.y} r="2.6" fill="var(--race-red)" />
              </g>
              <circle cx={SUB.x} cy={SUB.y} r="0.9" fill="var(--race-well)" />

              {/* The light trail: ghost hands behind the seconds hand, each dimmer, laid by the frame loop. */}
              <g data-trail opacity="0">
                {GHOSTS.map((o, i) => (
                  <line key={i} data-ghost x1={REST.hand[0].x} y1={REST.hand[0].y} x2={REST.hand[1].x} y2={REST.hand[1].y} stroke="var(--race-yellow)" strokeOpacity={o} strokeWidth="2.6" strokeLinecap="round" />
                ))}
              </g>

              {/* The seconds hand: a lit blade, a counterweight on its tail and the pivot's cap over both. */}
              <g filter={`url(#${glow})`}>
                <line data-hand x1={REST.hand[0].x} y1={REST.hand[0].y} x2={REST.hand[1].x} y2={REST.hand[1].y} stroke="var(--race-yellow)" strokeWidth="1.6" strokeLinecap="round" />
                <line data-weight x1={REST.weight[0].x} y1={REST.weight[0].y} x2={REST.weight[1].x} y2={REST.weight[1].y} stroke="var(--race-yellow)" strokeWidth="4.8" />
                <circle cx={C} cy={C} r="5.6" fill="var(--race-yellow)" />
              </g>
              <circle cx={C} cy={C} r="2" fill="var(--race-well)" />
            </svg>
            {/* Scanlines over the glass. */}
            <div aria-hidden data-part="glass" className="pointer-events-none absolute inset-0 rounded-[inherit] [background:var(--race-scanlines)]" />
          </div>
        </div>
      </div>

      {/* The readout: the state and the last lap against the one before, and the time to the hundredth, huge. */}
      <div data-part="well" className="@[34rem]:col-start-2 rounded-[0.6em] bg-(--race-well) p-[0.3em] shadow-(--race-recess)">
        <div
          aria-hidden
          data-part="lcd"
          className="relative flex flex-col gap-[0.35em] rounded-[0.4em] py-[0.55em] pr-[0.8em] pl-[1em] text-(--race-ink) [background:var(--race-glass)] shadow-[inset_0.18em_0_0_var(--race-yellow),inset_0_0_0_1px_var(--race-faint)]"
        >
          <div className="flex items-center justify-between gap-[0.6em]">
            <span data-part="chip" className={cx("inline-flex shrink-0 items-center gap-[0.4em] rounded-[0.25em] bg-(--race-yellow) px-[0.5em] py-[0.28em] text-(--race-yellow-ink)", running && "shadow-(--race-glow-yellow)")}>
              <span
                className={
                  running
                    ? "size-[0.5em] animate-pulse rounded-full bg-current motion-reduce:animate-none"
                    : clean
                      ? "size-[0.5em] rounded-full border-[0.12em] border-current"
                      : "size-[0.45em] rounded-[1px] bg-current"
                }
              />
              <span className="text-[0.6em] font-bold uppercase leading-none tracking-[0.14em]">{running ? "Running" : clean ? "Ready" : "Stopped"}</span>
            </span>
            <p key={laps.length} className="flex h-[1.3em] min-w-0 animate-enter items-baseline gap-[0.6em] whitespace-nowrap text-[0.8em] leading-[1.3] tabular-nums">
              {last === null ? (
                <span className="text-(--race-dim)">No laps</span>
              ) : (
                <>
                  <span className="text-(--race-dim)">Lap {laps.length}</span>
                  <span>{span(last)}</span>
                  {before !== null && (
                    <span className={cx("font-semibold", last < before ? "text-(--race-green)" : last > before ? "text-(--race-red)" : "text-(--race-dim)")}>{signed(last - before)}</span>
                  )}
                </>
              )}
            </p>
          </div>
          <div className="font-[family-name:var(--font-race)] text-[5.4em] font-bold leading-[0.88] italic tabular-nums [font-stretch:62%] @[34rem]:text-[6em]">
            <p ref={clockRef} className="flex items-baseline whitespace-nowrap [text-shadow:var(--race-glow-white)] [&>:nth-child(3)]:text-(--race-dim) [&>:nth-child(6)]:text-(--race-dim) [&>:nth-child(n+7)]:text-(--race-yellow) [&>:nth-child(n+7)]:[text-shadow:var(--race-glow-yellow)]">
              {cells("0")}
            </p>
          </div>
          <span aria-hidden data-part="glass" className="pointer-events-none absolute inset-0 rounded-[inherit] [background:var(--race-scanlines)]" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-[0.55em] @[34rem]:col-start-2">
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
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 rounded-[inherit] [background:var(--race-weave)]" />
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
