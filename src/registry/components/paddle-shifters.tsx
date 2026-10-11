"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { createSpring, focusQuietly, type Spring } from "@/design-system";
import { engine as createEngine, hostTransport, play } from "@/lib/sound";

/*
 * A bounded number stepper after a wheel's pair of shift paddles, on the
 * night-race line: a slim lever on either side, − on the left and + on the right,
 * and between them the gear as one huge white figure on a drum, with a single
 * hairline under it that follows the revs.
 *
 * Each paddle is a slim blade of dark machined metal hung from a pivot near its
 * top, with a fine red edge down its inner side. Pulled, its face sinks 2px onto
 * its base and tilts a few degrees about the pivot, by the CSS `rotate` property
 * inside the key's own overflow-hidden frame, so the lever can swing without
 * spilling; let go and it settles back with one small overshoot. The drum is a
 * column of figures translated by a spring (300, 25) that writes `--pos`, rolling
 * crisply and settling a hair past each gear, and it ticks once for every figure
 * that passes the window, pitched up with the gear. At either end of the range the
 * drum bumps and shakes sideways on a loose spring, and nothing changes.
 *
 * The revs are a second spring, and the one loop that does everything with
 * them: it draws the hairline (white, red near the top) and feeds the engine's
 * voice. A downshift blips it up, as a driver matches revs, with the throttle wide
 * open; an upshift cuts the ignition for 80ms and the revs drop; then they settle
 * to the cruising level of the gear it landed in, throttle half closed, and the
 * engine pops on the lift-off by itself. Everything that moves writes CSS
 * variables or text, never React state.
 *
 * The whole thing is one spinbutton, one tab stop: ← and ↓ shift down, → and ↑
 * shift up, Home and End go to the ends. The paddles are for the pointer. A
 * rehearsal, when given, shifts through a short run on its own until a hand
 * touches it, and never starts under reduced motion. Its engine is silent while
 * the host's tape is paused, until a hand works it.
 */

const DRUM = { stiffness: 300, damping: 25 }; // gears on the drum: ζ ≈ 0.72, so it lands crisply and settles about 4% past
const SHAKE = { stiffness: 420, damping: 14 }; // loose: a small kick at the stop rings out in about 0.4s
const REV = { stiffness: 260, damping: 22 }; // ζ ≈ 0.68: the revs overshoot their mark a little, once
const PULSE = 120; // ms a paddle stays down when it is pulled by a key or by the rehearsal
const REDLINE = 9000; // rpm at the top of the hairline
const RED_FROM = 0.8; // where on the hairline the red begins
const CUT = 80; // ms of ignition cut on an upshift

type Rehearsal = { value: number; at: number };

type PaddleShiftersProps = {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  /** What the drum shows for a value, where it isn't the number itself: { 0: "N" }. */
  labels?: Record<number, string>;
  /** What a screen reader says for a value, where "Gear 3" won't do: { 0: "Neutral" }. */
  names?: Record<number, string>;
  /** Names the value to screen readers. */
  label?: string;
  /** Submits the value with a form. */
  name?: string;
  /** Shifts through these values on its own, each at a time in ms from mount, until a hand touches it. */
  rehearsal?: Rehearsal[];
  className?: string;
};

type Mech = {
  place: (value: number) => void;
  move: (from: number, to: number) => void;
  bounce: (dir: 1 | -1) => void;
  pulse: (dir: 1 | -1) => void;
  /** The engine's level, which follows the host's tape until a hand has worked it. */
  sync: () => void;
};

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Where the revs settle in a gear: the lowest value idles, the rest climb from 30% to 60% of the hairline. */
function cruise(v: number, min: number, max: number) {
  return v <= min ? 0.12 : 0.3 + ((v - min - 1) / Math.max(1, max - min - 1)) * 0.3;
}

/** How hard the throttle is held once the revs have settled. */
const holding = (v: number, min: number) => (v <= min ? 0.12 : 0.3);

export function PaddleShifters({ value, onChange, min, max, labels, names, label = "Gear", name, rehearsal, className }: PaddleShiftersProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const spinRef = useRef<HTMLDivElement>(null);
  const drumRef = useRef<HTMLDivElement>(null);
  const paddles = useRef<(HTMLButtonElement | null)[]>([null, null]);
  const mech = useRef<Mech | null>(null);
  const seen = useRef<number | null>(null); // the value the mechanism last moved to
  const current = useRef(value); // the value, ahead of the render that confirms a shift
  const pointerShift = useRef(false); // the shift came from a paddle under the finger, which is already down
  const touched = useRef(false); // a hand has worked it: it may sound even while the host is paused
  const [said, setSaid] = useState("");
  // Props the mechanism and the handlers read when they fire, rather than when they were made.
  const props = useRef({ onChange, min, max, labels, names, label, rehearsal });
  useLayoutEffect(() => {
    props.current = { onChange, min, max, labels, names, label, rehearsal };
  });

  const describe = (v: number) => names?.[v] ?? `${label} ${labels?.[v] ?? v}`;

  // The mechanism: three springs, the hairline, the engine, and the clicks that go with them.
  useLayoutEffect(() => {
    const root = rootRef.current!;
    const drum = drumRef.current!;
    const hairline = root.querySelector<HTMLElement>("[data-rev]")!;
    const pulses: (ReturnType<typeof setTimeout> | undefined)[] = [];
    let settle: ReturnType<typeof setTimeout> | undefined;
    let cutting: ReturnType<typeof setTimeout> | undefined;
    let raf = 0;
    let shown = -1;
    let load = 0.3; // how hard the throttle is held, as the engine hears it
    // Its own sounds follow the host's tape; a hand always sounds.
    const audible = () => touched.current || hostTransport(root) === "play";

    const voice = createEngine({ redline: REDLINE });
    const level = () => voice.level(audible() ? 1 : 0);
    level();
    const watch = setInterval(level, 250); // the host's tape can be paused with nothing moving

    // One click for every figure that passes the window, higher for higher gears.
    const pos: Spring = createSpring(0, DRUM, (p) => {
      drum.style.setProperty("--pos", p.toFixed(3));
      const { min, max } = props.current;
      const idx = Math.min(max - min, Math.max(0, Math.round(p)));
      if (idx !== shown) {
        if (shown !== -1 && audible()) play("tick", { gain: 0.45, pitch: 0.9 + (idx / Math.max(1, max - min)) * 0.25 });
        shown = idx;
      }
    });
    const shake = createSpring(0, SHAKE, (x) => drum.style.setProperty("--shake", x.toFixed(3)));
    // The one loop for the revs: the hairline and the engine's pitch both follow this spring.
    const rev = createSpring(0, REV, (r) => {
      const at = Math.min(1, Math.max(0, r));
      hairline.style.setProperty("--rev", at.toFixed(4));
      voice.set(at * REDLINE, load);
    });
    const hold = (v: number) => {
      load = holding(v, props.current.min);
      voice.set(Math.min(1, Math.max(0, rev.value)) * REDLINE, load);
    };

    mech.current = {
      // First layout: the drum is at the gear and the engine starts, blipping up to a cruise.
      place(v) {
        const { min, max } = props.current;
        pos.jump(v - min);
        if (reduced()) {
          load = holding(v, min);
          return rev.jump(cruise(v, min, max));
        }
        load = 1;
        rev.jump(0);
        raf = requestAnimationFrame(() => {
          rev.set(Math.min(1, cruise(v, min, max) + 0.3));
          settle = setTimeout(() => {
            hold(v);
            rev.set(cruise(v, min, max));
          }, 380);
        });
      },
      // A shift: the drum travels. Up, the ignition cuts and the revs fall away; down, the throttle blips and they climb. Then they settle.
      move(from, to) {
        const { min, max } = props.current;
        clearTimeout(settle);
        clearTimeout(cutting);
        const c = cruise(to, min, max);
        const up = to > from;
        if (up) {
          voice.cut(true);
          cutting = setTimeout(() => voice.cut(false), CUT);
        } else voice.cut(false);
        level();
        if (reduced()) {
          pos.jump(to - min);
          load = holding(to, min);
          return rev.jump(c);
        }
        pos.set(to - min);
        load = up ? 0.6 : 1;
        rev.set(up ? Math.max(0.05, c - 0.2) : Math.min(1, c + 0.5));
        settle = setTimeout(
          () => {
            hold(to);
            rev.set(c);
          },
          up ? 230 : 180,
        );
      },
      // The end of the range: the drum is kicked sideways and rings out.
      bounce(dir) {
        if (reduced()) return;
        shake.jump(dir);
        shake.set(0);
      },
      // A paddle pulled by something other than a finger on it.
      pulse(dir) {
        const k = dir > 0 ? 1 : 0;
        const el = paddles.current[k];
        if (!el) return;
        clearTimeout(pulses[k]);
        el.dataset.pressed = "";
        if (audible()) play("press", { gain: 0.5, pitch: 1 + 0.05 * dir });
        pulses[k] = setTimeout(() => {
          delete el.dataset.pressed;
          if (audible()) play("release", { gain: 0.45, pitch: 1 + 0.05 * dir });
        }, PULSE);
      },
      sync: level,
    };

    return () => {
      mech.current = null;
      seen.current = null; // a remount places the drum again
      cancelAnimationFrame(raf);
      clearTimeout(settle);
      clearTimeout(cutting);
      clearInterval(watch);
      pulses.forEach(clearTimeout);
      pos.stop();
      shake.stop();
      rev.stop();
      voice.stop();
    };
  }, []);

  // A new value: the first lands where it is, the rest travel on the mechanism.
  useLayoutEffect(() => {
    const prev = seen.current;
    seen.current = value;
    current.current = value;
    if (prev === null) mech.current?.place(value);
    else if (prev !== value) {
      mech.current?.move(prev, value);
      if (!pointerShift.current) mech.current?.pulse(value > prev ? 1 : -1);
    }
    pointerShift.current = false;
  }, [value]);

  // The rehearsal: shift through its run from ~400ms, unless the viewer prefers less motion or the host's tape is stopped.
  useEffect(() => {
    const script = props.current.rehearsal;
    if (!script?.length || reduced() || hostTransport(rootRef.current) === "stop") return;
    const ids = script.map(({ value: to, at }) =>
      setTimeout(() => {
        if (!touched.current) props.current.onChange(to);
      }, at),
    );
    return () => ids.forEach(clearTimeout);
  }, []);

  /** Shifts to `to`, a step in direction `dir`; at the ends nothing changes, but the drum bumps. */
  function go(to: number, dir: 1 | -1, via: "pointer" | "key") {
    const target = Math.min(max, Math.max(min, to));
    if (target === current.current) {
      play("bump", { gain: 0.6, pitch: dir > 0 ? 1.05 : 0.95 });
      mech.current?.bounce(dir);
      if (via === "key") mech.current?.pulse(dir);
      return;
    }
    current.current = target;
    pointerShift.current = via === "pointer";
    setSaid(describe(target));
    onChange(target);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") go(current.current - 1, -1, "key");
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") go(current.current + 1, 1, "key");
    else if (e.key === "Home") go(min, -1, "key");
    else if (e.key === "End") go(max, 1, "key");
    else return;
    e.preventDefault();
  }

  function pull(e: PointerEvent<HTMLButtonElement>, dir: 1 | -1) {
    if (e.button !== 0) return;
    e.preventDefault();
    focusQuietly(spinRef.current);
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.dataset.pressed = "";
    play("press", { gain: 0.7, pitch: 1 + 0.05 * dir });
    go(current.current + dir, dir, "pointer");
  }

  function letGo(e: PointerEvent<HTMLButtonElement>, dir: 1 | -1) {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    delete e.currentTarget.dataset.pressed;
    play("release", { gain: 0.6, pitch: 1 + 0.05 * dir });
  }

  const touch = () => {
    touched.current = true;
    mech.current?.sync();
  };

  const figures = Array.from({ length: max - min + 1 }, (_, i) => labels?.[min + i] ?? String(min + i));

  return (
    <div ref={rootRef} onPointerDownCapture={touch} onKeyDownCapture={touch} className={cx("@container w-full max-w-[600px] select-none", className)}>
      <div data-part="plate" className="relative animate-enter overflow-hidden rounded-[0.9em] p-[1.4em] text-[clamp(11px,3.2cqw,18px)] [background:var(--race-body)] shadow-[var(--race-edge),var(--race-shadow)]">
        {/* A paddle either side of the gear. */}
        <div className="grid h-[14.5em] grid-cols-[3.4em_minmax(0,1fr)_3.4em] items-center gap-[1.8em]">
          {([-1, 1] as const).map((dir) => (
            <button
              key={dir}
              ref={(el) => {
                paddles.current[dir > 0 ? 1 : 0] = el;
              }}
              type="button"
              tabIndex={-1}
              aria-label={dir > 0 ? "Shift up" : "Shift down"}
              onPointerDown={(e) => pull(e, dir)}
              onPointerUp={(e) => letGo(e, dir)}
              onPointerCancel={(e) => letGo(e, dir)}
              onClick={(e) => e.detail === 0 && go(current.current + dir, dir, "key")}
              data-part="key"
              style={
                {
                  "--s": -dir,
                  // A slim blade: square shoulders and a swept tip on the inner side at the bottom.
                  "--r": dir < 0 ? "0.3em 0.3em 2.6em 0.3em / 0.3em 0.3em 4.5em 0.3em" : "0.3em 0.3em 0.3em 2.6em / 0.3em 0.3em 0.3em 4.5em",
                } as CSSProperties
              }
              className={cx(
                "group/key relative h-full touch-manipulation overflow-hidden rounded-[0.3em] px-[0.3em] pb-[0.4em] pt-[0.2em] outline-offset-2",
                dir < 0 ? "col-start-1" : "col-start-3",
              )}
            >
              {/* The lever: it hangs from its pivot, leans out 2° at rest and swings 3° the other way when pulled, then settles back with a small overshoot. */}
              <span
                className={cx(
                  "relative block size-full origin-[calc(50%+var(--s)*0.7em)_0.95em] rounded-[var(--r)] border-(--race-red) text-(--race-dim) [background:var(--race-metal)] shadow-(--race-key-shadow) [rotate:calc(var(--s)*2deg)] transition-[translate,rotate,box-shadow,color] duration-[260ms] ease-[cubic-bezier(0.3,1.35,0.5,1)] motion-reduce:duration-0",
                  dir < 0 ? "border-r" : "border-l",
                  "group-active/key:translate-y-[2px] group-active/key:text-(--race-ink) group-active/key:[rotate:calc(var(--s)*-3deg)] group-active/key:shadow-(--race-key-shadow-pressed) group-active/key:duration-75 group-active/key:ease-out group-data-pressed/key:translate-y-[2px] group-data-pressed/key:text-(--race-ink) group-data-pressed/key:[rotate:calc(var(--s)*-3deg)] group-data-pressed/key:shadow-(--race-key-shadow-pressed) group-data-pressed/key:duration-75 group-data-pressed/key:ease-out",
                )}
              >
                {/* The sign: engraved near the pivot, white while the lever is pulled. */}
                <span aria-hidden className="absolute inset-x-0 top-[2.4em] text-center text-[1.7em] font-medium leading-none">
                  {dir > 0 ? "+" : "−"}
                </span>
              </span>
            </button>
          ))}

          {/* Between the paddles, the spinbutton: the gear on its drum and the hairline under it. The paddles are its siblings, for the pointer. */}
          <div
            ref={spinRef}
            role="spinbutton"
            tabIndex={0}
            aria-label={label}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={value}
            aria-valuetext={describe(value)}
            onKeyDown={onKeyDown}
            onPointerDown={(e) => e.button === 0 && focusQuietly(e.currentTarget)}
            className="col-start-2 row-start-1 flex min-w-0 flex-col items-center justify-center gap-[2em] self-stretch rounded-[0.5em] text-(--race-ink) outline-offset-2"
          >
            {/* The drum: one figure per gear in a column, translated by the spring's --pos. */}
            <div ref={drumRef} aria-hidden data-part="drum" className="relative h-[1.08em] w-full shrink-0 overflow-hidden text-[6.4em]">
              <div className="flex flex-col will-change-transform [translate:calc(var(--shake,0)*0.03em)_calc(var(--pos,0)*-1.08em)]">
                {figures.map((f, i) => (
                  <span
                    key={i}
                    className="grid h-[1.08em] place-items-center pr-[0.06em] text-center font-[family-name:var(--font-race)] font-medium leading-none tabular-nums text-(--race-ink)"
                  >
                    {f}
                  </span>
                ))}
              </div>
            </div>

            {/* The hairline: white, red near the top, drawn by the rev spring's --rev. */}
            <div aria-hidden data-part="light" data-rev className="relative h-[2px] w-[60%] bg-(--race-faint)">
              <span className="absolute inset-y-0 left-0 origin-left bg-(--race-ink)" style={{ width: `${RED_FROM * 100}%`, transform: `scaleX(clamp(0, var(--rev, 0) / ${RED_FROM}, 1))` }} />
              <span className="absolute inset-y-0 origin-left bg-(--race-red)" style={{ left: `${RED_FROM * 100}%`, right: 0, transform: `scaleX(clamp(0, (var(--rev, 0) - ${RED_FROM}) / ${1 - RED_FROM}, 1))` }} />
            </div>
          </div>
        </div>
      </div>

      {name && <input type="hidden" name={name} value={value} />}
      <p role="status" aria-live="polite" className="sr-only">
        {said}
      </p>
    </div>
  );
}

/* --- Demo: a sports car's shift paddles ------------------------------------ */

const LABELS = { 0: "N" };
const NAMES = { 0: "Neutral" };
// First to fourth in 400ms steps, then two downshifts that blip the revs, then rest.
const REHEARSAL = [
  { value: 2, at: 400 },
  { value: 3, at: 800 },
  { value: 4, at: 1200 },
  { value: 3, at: 2000 },
  { value: 2, at: 2600 },
];

export default function Demo() {
  const [gear, setGear] = useState(1);
  return <PaddleShifters value={gear} onChange={setGear} min={0} max={7} labels={LABELS} names={NAMES} name="gear" rehearsal={REHEARSAL} />;
}
