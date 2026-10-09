"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { createSpring, focusQuietly, type Spring } from "@/design-system";
import { hostTransport, play } from "@/lib/sound";

/*
 * A bounded number stepper after a wheel's pair of shift paddles: a lever on
 * either side, − on the left and + on the right, and between them a small LCD
 * with the gear on a drum, a chip above it and a thin rev bar under it.
 *
 * Each paddle is a key hung from a pivot near its top. Pulled, its face sinks
 * 2px onto its base and tilts a few degrees about the pivot, by the CSS
 * `rotate` property inside the key's own overflow-hidden frame, so the lever
 * can swing without spilling. The drum is a column of figures translated by a
 * spring (150 to 200, 21: the tape counter's) that writes `--pos`, and it
 * ticks once for every figure that passes the window, pitched up with the gear.
 * At either end of the range the drum bumps and shakes sideways on a loose
 * spring, and nothing changes.
 *
 * The rev bar is a second spring. A downshift blips it up, as a driver matches
 * revs, and an upshift drops it; then it settles to the cruising level of the
 * gear it landed in. Its tip is a red zone that lights as the bar enters it.
 * Everything that moves writes CSS variables, never React state.
 *
 * The whole thing is one spinbutton, one tab stop: ← and ↓ shift down, → and ↑
 * shift up, Home and End go to the ends. The paddles are for the pointer. A
 * rehearsal, when given, shifts through a short run on its own until a hand
 * touches it, and never starts under reduced motion.
 */

const DRUM = { stiffness: 170, damping: 21 }; // gears on the drum: a little under critical, so it lands without overshoot
const SHAKE = { stiffness: 520, damping: 9 }; // loose: a kick at the stop rings out in about 0.4s
const REV = { stiffness: 230, damping: 17 }; // a touch under critical, so the bar overshoots its mark a little
const PULSE = 120; // ms a paddle stays down when it is pulled by a key or by the rehearsal

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
  /** Names the value on the chip and to screen readers. */
  label?: string;
  /** Submits the value with a form. */
  name?: string;
  /** Shifts through these values on its own, each at a time in ms from mount, until a hand touches it. */
  rehearsal?: Rehearsal[];
  className?: string;
};

type Engine = {
  place: (value: number) => void;
  move: (from: number, to: number) => void;
  bounce: (dir: 1 | -1) => void;
  pulse: (dir: 1 | -1) => void;
};

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Where the rev bar settles in a gear: the lowest value idles, the rest climb from 30% to 60%. */
function cruise(v: number, min: number, max: number) {
  return v <= min ? 0.14 : 0.3 + ((v - min - 1) / Math.max(1, max - min - 1)) * 0.3;
}

export function PaddleShifters({ value, onChange, min, max, labels, names, label = "Gear", name, rehearsal, className }: PaddleShiftersProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const spinRef = useRef<HTMLDivElement>(null);
  const drumRef = useRef<HTMLDivElement>(null);
  const paddles = useRef<(HTMLButtonElement | null)[]>([null, null]);
  const engine = useRef<Engine | null>(null);
  const seen = useRef<number | null>(null); // the value the mechanism last moved to
  const current = useRef(value); // the value, ahead of the render that confirms a shift
  const pointerShift = useRef(false); // the shift came from a paddle under the finger, which is already down
  const touched = useRef(false); // a hand has worked it: it may sound even while the host is paused
  const [said, setSaid] = useState("");
  // Props the engine and the handlers read when they fire, rather than when they were made.
  const props = useRef({ onChange, min, max, labels, names, label, rehearsal });
  useLayoutEffect(() => {
    props.current = { onChange, min, max, labels, names, label, rehearsal };
  });

  const describe = (v: number) => names?.[v] ?? `${label} ${labels?.[v] ?? v}`;

  // The mechanism: three springs, and the clicks that go with them.
  useLayoutEffect(() => {
    const root = rootRef.current!;
    const drum = drumRef.current!;
    const pulses: (ReturnType<typeof setTimeout> | undefined)[] = [];
    let settle: ReturnType<typeof setTimeout> | undefined;
    let raf = 0;
    let shown = -1;
    // Its own sounds follow the host's tape; a hand always sounds.
    const audible = () => touched.current || hostTransport(root) === "play";

    // One click for every figure that passes the window, higher for higher gears.
    const pos: Spring = createSpring(0, DRUM, (p) => {
      drum.style.setProperty("--pos", p.toFixed(3));
      const { min, max } = props.current;
      const idx = Math.min(max - min, Math.max(0, Math.round(p)));
      if (idx !== shown) {
        if (shown !== -1 && audible()) play("tick", { gain: 0.55, pitch: 0.9 + (idx / Math.max(1, max - min)) * 0.25 });
        shown = idx;
      }
    });
    const shake = createSpring(0, SHAKE, (x) => drum.style.setProperty("--shake", x.toFixed(3)));
    const rev = createSpring(0, REV, (r) => root.style.setProperty("--rev", r.toFixed(3)));

    engine.current = {
      // First layout: the drum is at the gear and the engine starts, blipping up to a cruise.
      place(v) {
        const { min, max } = props.current;
        pos.jump(v - min);
        if (reduced()) return rev.jump(cruise(v, min, max));
        rev.jump(0);
        raf = requestAnimationFrame(() => {
          rev.set(Math.min(1, cruise(v, min, max) + 0.3));
          settle = setTimeout(() => rev.set(cruise(v, min, max)), 380);
        });
      },
      // A shift: the drum travels, the revs blip up on the way down and drop on the way up, then settle.
      move(from, to) {
        const { min, max } = props.current;
        clearTimeout(settle);
        const c = cruise(to, min, max);
        if (reduced()) {
          pos.jump(to - min);
          return rev.jump(c);
        }
        pos.set(to - min);
        const up = to > from;
        rev.set(up ? Math.max(0.05, c - 0.2) : Math.min(1, c + 0.42));
        settle = setTimeout(() => rev.set(c), up ? 230 : 180);
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
    };

    return () => {
      engine.current = null;
      seen.current = null; // a remount places the drum again
      cancelAnimationFrame(raf);
      clearTimeout(settle);
      pulses.forEach(clearTimeout);
      pos.stop();
      shake.stop();
      rev.stop();
    };
  }, []);

  // A new value: the first lands where it is, the rest travel on the mechanism.
  useLayoutEffect(() => {
    const prev = seen.current;
    seen.current = value;
    current.current = value;
    if (prev === null) engine.current?.place(value);
    else if (prev !== value) {
      engine.current?.move(prev, value);
      if (!pointerShift.current) engine.current?.pulse(value > prev ? 1 : -1);
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
      engine.current?.bounce(dir);
      if (via === "key") engine.current?.pulse(dir);
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

  const figures = Array.from({ length: max - min + 1 }, (_, i) => labels?.[min + i] ?? String(min + i));

  return (
    <div
      ref={rootRef}
      onPointerDownCapture={() => (touched.current = true)}
      onKeyDownCapture={() => (touched.current = true)}
      className={cx("@container w-full max-w-[400px] select-none", className)}
    >
      <div data-part="plate" className="relative isolate animate-enter overflow-hidden rounded-[1.25em] p-[0.9em] text-[clamp(11px,4cqw,14px)] [background:var(--device-body)] shadow-[var(--device-body-edge),0_1px_2px_rgb(0_0_0/0.06),0_16px_32px_-18px_rgb(0_0_0/0.3)]">
        <div aria-hidden className="device-grain pointer-events-none absolute inset-0 -z-10 rounded-[inherit]" />

        {/* The wheel's hub, pressed into the plate: a paddle either side of the readout. */}
        <div data-part="well" className="grid h-[16.5em] grid-cols-[4.9em_minmax(0,1fr)_4.9em] items-center gap-[0.3em] rounded-[1.05em] bg-(--device-well) p-[0.45em] shadow-(--device-recess)">
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
                  // Curved and tapered: a full round at the hand end, the inner shoulder swept, the outer edge near straight.
                  "--r": dir < 0 ? "0.5em 0.8em 1.3em 0.8em / 0.5em 0.8em 1.8em 0.8em" : "0.8em 0.5em 0.8em 1.3em / 0.8em 0.5em 0.8em 1.8em",
                } as CSSProperties
              }
              className={cx(
                "group/key relative h-full touch-manipulation overflow-hidden rounded-[0.7em] px-[0.8em] pb-[0.4em] pt-[0.2em] outline-offset-2",
                dir < 0 ? "col-start-1" : "col-start-3",
              )}
            >
              {/* The lever: it hangs from its pivot, leans out 2° at rest and swings 3° the other way when pulled. */}
              <span className="relative block size-full origin-[calc(50%+var(--s)*1.1em)_0.95em] rounded-[var(--r)] text-(--device-key-ink) [background:var(--device-key-face)] shadow-(--device-key-shadow) [rotate:calc(var(--s)*2deg)] transition-[translate,rotate,box-shadow] duration-(--duration-exit) ease-out group-active/key:translate-y-[2px] group-active/key:[rotate:calc(var(--s)*-3deg)] group-active/key:shadow-(--device-key-shadow-pressed) group-active/key:duration-75 group-data-pressed/key:translate-y-[2px] group-data-pressed/key:[rotate:calc(var(--s)*-3deg)] group-data-pressed/key:shadow-(--device-key-shadow-pressed) group-data-pressed/key:duration-75">
                {/* The pivot, at the inner top edge: the lever swings about it. */}
                <span aria-hidden className="absolute top-[0.6em] size-[0.7em] -translate-x-1/2 rounded-full bg-black/[0.07] shadow-(--device-recess) [left:calc(50%+var(--s)*1.1em)]" />
                {/* Its cross-section: a soft highlight down the crown and a shade at the edges. */}
                <span aria-hidden className="absolute inset-0 rounded-[inherit] [background:linear-gradient(90deg,rgb(0_0_0/0.07),rgb(255_255_255/0.22)_35%,transparent_60%,rgb(0_0_0/0.08))]" />
                <span aria-hidden className="absolute inset-x-0 top-[46%] text-center text-[2.1em] font-medium leading-none [text-shadow:var(--device-engrave)]">
                  {dir > 0 ? "+" : "−"}
                </span>
                <span
                  aria-hidden
                  className="absolute inset-x-[20%] bottom-[1em] h-[1.5em] [background:repeating-linear-gradient(var(--device-meter-off)_0_1.5px,transparent_1.5px_0.42em)]"
                />
              </span>
            </button>
          ))}

          {/* The readout, between the paddles, is the spinbutton: chip, gear on its drum, revs. The paddles are its siblings, for the pointer. */}
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
            data-part="lcd"
            className="col-start-2 row-start-1 flex min-w-0 flex-col items-stretch gap-[0.7em] rounded-[0.7em] px-[0.7em] pb-[0.8em] pt-[0.7em] text-(--device-lcd-ink) [background:var(--device-lcd)] shadow-(--device-lcd-edge) outline-offset-2"
          >
            <span aria-hidden data-part="chip" className="inline-flex items-center gap-[0.35em] self-center rounded-[0.4em] bg-white px-[0.42em] py-[0.24em] text-black">
              <span className="size-[0.5em] rounded-full bg-black" />
              <span className="text-[0.58em] font-semibold uppercase leading-none tracking-[0.02em]">{label}</span>
            </span>

            {/* The drum: one figure per gear in a column, translated by the spring's --pos. */}
            <div ref={drumRef} aria-hidden data-part="drum" className="relative h-[1.2em] overflow-hidden rounded-[0.09em] text-[3.4em] shadow-[inset_0_1px_2px_rgb(0_0_0/0.3),0_1px_0_rgb(255_255_255/0.04)]">
              <div className="flex flex-col will-change-transform [translate:calc(var(--shake,0)*0.06em)_calc(var(--pos,0)*-1.2em)]">
                {figures.map((f, i) => (
                  <span key={i} className="grid h-[1.2em] place-items-center text-center font-light leading-none tabular-nums tracking-[-0.03em]">
                    {f}
                  </span>
                ))}
              </div>
              {/* The drum's curve: figures dim as they turn away. */}
              <span aria-hidden className="pointer-events-none absolute inset-0 [background:linear-gradient(rgb(0_0_0/0.55),transparent_30%,transparent_70%,rgb(0_0_0/0.55))]" />
            </div>

            {/* The revs: lit to --rev of the bar; the last 22% is the red zone, lit as the bar enters it. */}
            <div aria-hidden data-part="light" className="relative h-[0.42em] overflow-hidden rounded-full bg-white/15">
              <span className="absolute inset-y-0 left-[78%] right-0 bg-(--device-rec)/35" />
              <span className="absolute inset-y-0 left-0 bg-(--device-lcd-ink) [width:calc(min(var(--rev,0),0.78)*100%)]" />
              <span className="absolute inset-y-0 left-[78%] bg-(--device-rec) [width:calc(max(var(--rev,0)_-_0.78,0)*100%)]" />
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
