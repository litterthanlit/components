"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { createSpring, focusQuietly, type Spring } from "@/design-system";
import { hostTransport, play, type PlayOptions, type SoundName } from "@/lib/sound";

/*
 * A spring-return analogue input after an organ-hinged accelerator pedal: a
 * brushed aluminium plate studded with rubber, standing in a well with its
 * hinge at the foot. Press it and it tilts back from the hinge; let go and a
 * return spring takes it home with a little rebound. Its value, 0 to 1, is
 * how far it is pressed: a scrub speed, a zoom rate, anything that should
 * stop the moment a foot leaves it.
 *
 * A hand lands at once: the pedal goes where the pointer is, and the value
 * follows every move. Values set from outside travel on the spring, as a
 * motor would take it. On release the component asks for 0 and the spring
 * does the rest; `onTravel` reports the pedal's drawn depth on each frame it
 * moves (without rendering), so whatever it drives can follow the metal
 * instead of the command. The tilt is CSS `rotate` on the plate, inside a
 * well that clips and lends it perspective, written through one variable.
 *
 * Hold Space or the Down arrow to push it in (it ramps while held), the Up arrow
 * to ease off, End to put it to the floor; let go and it springs back.
 *
 * With `name` it carries its value in a hidden input, for forms.
 *
 * The demo is the other half of the mechanism: a small integrator turns the
 * pedal into revs, with shift lights over them and a limiter at the top.
 */

/* The well, in em. The plate's foot sits on the hinge; the hand reaches REACH of the plate's length. */
const WELL_H = 13.6;
const PEDAL_W = 9.4;
const PEDAL_H = 11.4;
const PEDAL_TOP = 0.8;
const HINGE = PEDAL_TOP + PEDAL_H;
const REACH = 0.8;
const TILT = 34; // degrees from upright to the floor
const DEPTH = "40em"; // the well's perspective: the toe shrinks to about 84% at full travel

/** The return spring, in permille of travel: ζ ≈ 0.62, so it rebounds about 8% of whatever it was pushed. */
const RETURN = { stiffness: 320, damping: 22 };
const PUSH = 1.7; // travel per second while Space or Down is held
const EASE = 2.5; // travel per second Up takes off
const FLOOR = 5; // travel per second while End is held

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

type ThrottleProps = {
  /** How far the pedal is pressed, 0 to 1. A hand sets it directly; it returns to 0 when the hand lets go. */
  value: number;
  onChange: (value: number) => void;
  /** The pedal's drawn depth on each frame it moves, rebound included. Not for rendering: write to a ref or the DOM. */
  onTravel?: (depth: number) => void;
  /** Carries the value in a hidden input, for forms. */
  name?: string;
  /** The pedal's name: its accessible name and the lettering under it. */
  label: string;
  className?: string;
};

type Engine = {
  readonly held: boolean;
  pointerDown: (id: number, f: number) => void;
  pointerMove: (id: number, f: number) => void;
  pointerUp: (id: number) => void;
  keyDown: (key: string) => void;
  keyUp: (key: string) => void;
  blur: () => void;
};

export function Throttle({ value, onChange, onTravel, name, label, className }: ThrottleProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const spring = useRef<Spring | null>(null);
  const engine = useRef<Engine | null>(null);
  const placed = useRef(false);
  const at = useRef(value); // the value, ahead of the render that confirms it
  const own = useRef<number | null>(null); // a value this pedal just reported: it is already drawn
  const reach = useRef({ top: 0, span: 1 }); // where the hand's travel starts, and how far it goes, in px
  const [initial] = useState(value);
  const props = useRef({ onChange, onTravel });
  useLayoutEffect(() => {
    props.current = { onChange, onTravel };
  });

  // The spring runs in permille of travel and draws the tilt. The mechanism lives here too: a hand
  // (pointer or keys) lands the pedal at once, and letting go sends the spring home.
  useLayoutEffect(() => {
    const root = rootRef.current!;
    const s = createSpring(initial * 1000, RETURN, (permille) => {
      const d = permille / 1000;
      root.style.setProperty("--d", d.toFixed(4));
      props.current.onTravel?.(d);
    });
    spring.current = s;

    let held = false;
    let pointer: number | null = null;
    const keys = new Set<string>();
    let raw = 0; // the keys' own running depth, finer than the 1% the value moves in
    let raf = 0;
    let last = 0;

    /** Puts the pedal under the hand at `f`, to the percent. */
    const land = (f: number) => {
      const next = Math.round(clamp(f, 0, 1) * 100) / 100;
      s.jump(next * 1000);
      if (next === at.current) return;
      at.current = next;
      own.current = next;
      props.current.onChange(next);
    };

    const take = () => {
      if (held) return;
      held = true;
      raw = s.value / 1000;
      play("press", { gain: 0.6 });
    };

    /** The last hand is off: the spring takes the pedal home and the value goes with it. */
    const drop = () => {
      if (!held) return;
      held = false;
      cancelAnimationFrame(raf);
      raf = 0;
      play("release", { gain: 0.5 });
      if (reducedMotion()) s.jump(0);
      else s.set(0);
      if (at.current !== 0) {
        at.current = 0;
        own.current = 0;
        props.current.onChange(0);
      }
    };

    // Held keys ramp the pedal, so a push takes a moment and a foot-off is as quick as a foot.
    const frame = (now: number) => {
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 1 / 60);
      last = now;
      const rate = (keys.has("End") ? FLOOR : 0) + (keys.has("ArrowDown") || keys.has(" ") ? PUSH : 0) - (keys.has("ArrowUp") ? EASE : 0);
      if (rate) {
        raw = clamp(raw + rate * dt, 0, 1);
        land(raw);
      }
      raf = keys.size ? requestAnimationFrame(frame) : 0;
    };

    engine.current = {
      get held() {
        return held;
      },
      pointerDown(id, f) {
        pointer = id;
        take();
        land(f);
      },
      pointerMove(id, f) {
        if (pointer === id) land(f);
      },
      pointerUp(id) {
        if (pointer !== id) return;
        pointer = null;
        if (!keys.size) drop();
      },
      keyDown(key) {
        // Easing off only means something while the pedal is held.
        if (key === "ArrowUp" && !held) return;
        keys.add(key);
        take();
        if (!raf) {
          last = 0;
          raf = requestAnimationFrame(frame);
        }
      },
      keyUp(key) {
        if (!keys.delete(key)) return;
        if (!keys.size && pointer === null) drop();
      },
      blur() {
        keys.clear();
        if (pointer === null) drop();
      },
    };
    return () => {
      cancelAnimationFrame(raf);
      s.stop();
    };
  }, [initial]);

  // A new value: the pedal's own reports are already drawn; anyone else's travel on the spring, unless a hand has it.
  useLayoutEffect(() => {
    const s = spring.current!;
    if (own.current === value) {
      own.current = null;
      return;
    }
    own.current = null;
    at.current = value;
    if (engine.current?.held) return;
    if (!placed.current || reducedMotion()) s.jump(value * 1000);
    else s.set(value * 1000);
    placed.current = true;
  }, [value]);

  /** Where the pointer is, as depth: the hand's travel runs down the plate from its toe. */
  const depthAt = (y: number) => (y - reach.current.top) / reach.current.span;

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget;
    focusQuietly(el); // no ring until a key is pressed
    el.setPointerCapture(e.pointerId);
    const box = el.getBoundingClientRect();
    const em = box.height / WELL_H;
    reach.current = { top: box.top + PEDAL_TOP * em, span: PEDAL_H * REACH * em };
    engine.current?.pointerDown(e.pointerId, depthAt(e.clientY));
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== " " && e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "End") return;
    e.preventDefault();
    if (!e.repeat) engine.current?.keyDown(e.key);
  }

  const pct = Math.round(clamp(value, 0, 1) * 100);

  return (
    <div className={cx("flex flex-col items-center gap-[0.55em]", className)}>
      {/* The well: the pedal stands in it, hinged at its foot, and tilts back as it is pressed. */}
      <div
        ref={rootRef}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-orientation="vertical"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${pct}% throttle`}
        onKeyDown={onKeyDown}
        onKeyUp={(e) => engine.current?.keyUp(e.key)}
        onBlur={() => engine.current?.blur()}
        onPointerDown={onPointerDown}
        onPointerMove={(e) => engine.current?.pointerMove(e.pointerId, depthAt(e.clientY))}
        onPointerUp={(e) => engine.current?.pointerUp(e.pointerId)}
        onPointerCancel={(e) => engine.current?.pointerUp(e.pointerId)}
        data-part="well"
        className="relative w-full cursor-ns-resize touch-none select-none overflow-hidden rounded-[1.05em] bg-(--device-well) shadow-(--device-recess) outline-offset-2"
        style={{ height: `${WELL_H}em`, "--d": initial } as CSSProperties}
      >
        <div aria-hidden className="absolute inset-0" style={{ perspective: DEPTH, perspectiveOrigin: `50% ${HINGE}em` }}>
          {/* The floor in front of the hinge. */}
          <div className="absolute inset-x-0 bottom-0" style={{ top: `${HINGE}em`, background: "linear-gradient(to bottom, rgb(0 0 0 / 0.1), rgb(0 0 0 / 0.02))" }} />

          {/* The hinge: a groove across the foot of the plate. */}
          <div
            data-part="slot"
            className="absolute left-1/2 h-[0.6em] -translate-x-1/2 rounded-full bg-(--device-rim) shadow-[inset_0_1px_2px_rgb(0_0_0/0.7),0_1px_0_rgb(255_255_255/0.9)] dark:shadow-[inset_0_1px_2px_rgb(0_0_0/0.9),0_1px_0_rgb(255_255_255/0.06)]"
            style={{ width: `${PEDAL_W + 1.2}em`, top: `${HINGE - 0.2}em` }}
          />

          {/* The plate: brushed aluminium, a pad of rubber studs in rows, and a shade that deepens with travel. */}
          <div
            data-part="key"
            className="absolute rounded-[0.7em] [background:var(--device-wheel-face)] shadow-(--device-key-shadow) [--brush-hi:rgb(255_255_255/0.3)] [--stud-hi:rgb(255_255_255/0.7)] [--stud:rgb(0_0_0/0.55)] dark:[--brush-hi:rgb(255_255_255/0.04)] dark:[--stud-hi:rgb(255_255_255/0.08)] dark:[--stud:rgb(0_0_0/0.7)]"
            style={{
              left: `calc(50% - ${PEDAL_W / 2}em)`,
              width: `${PEDAL_W}em`,
              top: `${PEDAL_TOP}em`,
              height: `${PEDAL_H}em`,
              transformOrigin: "50% 100%",
              rotate: `x calc(var(--d) * ${TILT}deg)`,
            }}
          >
            <div
              className="absolute inset-0 rounded-[inherit]"
              style={{ background: "repeating-linear-gradient(0deg, var(--brush-hi) 0 1px, rgb(0 0 0 / 0.04) 1px 2px, transparent 2px 3px)" }}
            />
            <div
              className="absolute inset-x-[1.1em] inset-y-[0.9em] rounded-[0.4em] bg-black/[0.06] shadow-[inset_0_1px_2px_rgb(0_0_0/0.18),0_1px_0_rgb(255_255_255/0.5)] dark:bg-black/20 dark:shadow-[inset_0_1px_2px_rgb(0_0_0/0.5),0_1px_0_rgb(255_255_255/0.05)]"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 50% 50%, var(--stud) 0 0.2em, transparent 0.25em), radial-gradient(circle at 50% 50%, var(--stud-hi) 0 0.2em, transparent 0.25em)",
                backgroundSize: "1.2em 1.2em",
                backgroundPosition: "0 0, 0 1px",
              }}
            />
            <div className="absolute inset-0 rounded-[inherit] bg-black" style={{ opacity: "calc(var(--d) * 0.36)" }} />
          </div>
        </div>
      </div>

      <span aria-hidden data-part="lettering" className="text-[0.6em] font-semibold uppercase leading-none tracking-[0.16em] text-(--device-label) [text-shadow:var(--device-engrave)]">
        {label}
      </span>
      {name && <input type="hidden" name={name} value={value} />}
    </div>
  );
}

/* --- Demo: a pedal feeding an engine's revs --------------------------------- */

/* The engine, in rpm and seconds. */
const IDLE = 850;
const LIMIT = 8000;
const RISE = { tau: 0.22, min: 2400, max: 16000 }; // rpm/s: quick, and never an asymptote
const FALL = { tau: 0.7, min: 700, max: 6000 }; // slower back to idle
const CUT = 0.07; // s the fuel stays cut at the limiter
const CUT_FALL = 3000; // rpm/s while it is cut: about 200 rpm of bounce
const FLASH_HOLD = 0.4; // s the shift lights flash after the last cut
const FLASH_HALF = 0.055; // s per half-cycle: all twelve flash together
const STEP = 1 / 240;
const BUMP_GAP = 0.15; // s between limiter bumps: the cut buzzes faster than the ear can count

const SHIFT = 12;
const SHIFT_FROM = 3000; // rpm of the first light; the twelfth is lit at 7,796
const SHIFT_STEP = 436;
const THRESHOLDS = Array.from({ length: SHIFT }, (_, i) => SHIFT_FROM + i * SHIFT_STEP);

/** The ghost: three blips, the last one into the limiter. [ms, throttle] */
const GHOST: [number, number][] = [
  [400, 0.45],
  [900, 0],
  [1400, 0.75],
  [1950, 0],
  [2400, 1],
  [3700, 0],
];

const chipText = { idle: "Idle", rev: "Rev", limiter: "Limiter" } as const;
type ChipState = keyof typeof chipText;

/** 7,196 rpm, with the comma tabular figures set it with. */
const figures = (rpm: number) => (rpm >= 1000 ? `${Math.floor(rpm / 1000)},${String(rpm % 1000).padStart(3, "0")}` : String(rpm));

export default function Demo() {
  const [throttle, setThrottle] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const touched = useRef(false); // a hand has worked it: it may sound while the host is paused
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const depth = useRef(0); // the pedal's drawn depth, from the spring
  const wake = useRef<(() => void) | null>(null);

  // The engine: revs rise fast toward 850 + throttle × 7,150 and fall slower back to idle; at 8,000 the
  // fuel cuts and they bounce. A fixed-step integrator in a frame loop, drawn straight to the DOM; it
  // stops once the pedal is at rest and the revs are settled.
  useLayoutEffect(() => {
    const root = rootRef.current!;
    const lights = [...root.querySelectorAll<HTMLElement>("[data-shift-light]")];
    const strip = root.querySelector<HTMLElement>("[data-shift]")!;
    const figure = root.querySelector<HTMLElement>("[data-rpm]")!;
    const chip = root.querySelector<HTMLElement>("[data-chip]")!;
    const chipLabel = chip.querySelector<HTMLElement>("[data-chip-text]")!;

    let r = IDLE;
    let cut = 0;
    let flash = 0;
    let t = 0;
    let lastBump = -Infinity;
    let shownRpm = IDLE;
    let natural = 0; // lights lit by the revs alone
    let shown = 0; // lights drawn, flashing included
    let flashing = false;
    let state: ChipState = "idle";
    let said = false;
    let raf = 0;
    let last = 0;

    // What it does by itself follows the host's tape; a hand on it always sounds.
    const sound = (name: SoundName, options?: PlayOptions) => {
      if (touched.current || hostTransport(root) === "play") play(name, options);
    };

    const hit = () => {
      if (t - lastBump >= BUMP_GAP) {
        lastBump = t;
        sound("bump", { gain: 0.6 });
      }
      if (!said && touched.current) {
        said = true;
        setAnnouncement("Limiter");
      }
    };

    const target = () => IDLE + clamp(depth.current, 0, 1) * (LIMIT - IDLE);

    const step = (h: number) => {
      t += h;
      const to = target();
      if (flash > 0) flash -= h;
      if (cut > 0) {
        cut -= h;
        r -= CUT_FALL * h;
      } else if (r < to) {
        r = Math.min(to, r + clamp((to - r) / RISE.tau, RISE.min, RISE.max) * h);
      } else if (r > to) {
        r = Math.max(to, r - clamp((r - to) / FALL.tau, FALL.min, FALL.max) * h);
      }
      if (r >= LIMIT && cut <= 0) {
        r = LIMIT;
        cut = CUT;
        flash = FLASH_HOLD;
        hit();
      }
      if (said && r < LIMIT - 1500) {
        said = false;
        setAnnouncement("");
      }
    };

    const draw = () => {
      const rpm = Math.round(r);
      if (rpm !== shownRpm) {
        shownRpm = rpm;
        figure.textContent = figures(rpm);
      }

      const n = THRESHOLDS.filter((limit) => r >= limit).length;
      const isFlashing = flash > 0;
      const on = isFlashing ? ((Math.floor(t / FLASH_HALF) & 1) === 0 ? SHIFT : 0) : n;
      // A ratchet: each light the revs bring on clicks a little higher.
      if (!isFlashing && n > natural) sound("tick", { gain: 0.5, pitch: 0.88 + n * 0.045 });
      natural = n;
      if (isFlashing !== flashing) {
        flashing = isFlashing;
        strip.toggleAttribute("data-flash", flashing);
      }
      if (on !== shown) {
        shown = on;
        lights.forEach((light, i) => {
          if (i < on) light.dataset.on = "";
          else delete light.dataset.on;
        });
      }

      const next: ChipState = isFlashing ? "limiter" : r > IDLE + 40 ? "rev" : "idle";
      if (next !== state) {
        state = next;
        chip.dataset.state = next;
        chipLabel.textContent = chipText[next];
      }
    };

    const frame = (now: number) => {
      let dt = Math.min(0.05, last ? (now - last) / 1000 : STEP);
      last = now;
      while (dt > 1e-9) {
        const h = Math.min(STEP, dt);
        step(h);
        dt -= h;
      }
      draw();
      // Settled: no cut, no flash, and the revs are where the pedal wants them. The next movement wakes it.
      if (cut <= 0 && flash <= 0 && Math.abs(r - target()) < 0.5) {
        r = target();
        draw();
        raf = 0;
        last = 0;
        return;
      }
      raf = requestAnimationFrame(frame);
    };

    wake.current = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    return () => {
      cancelAnimationFrame(raf);
      wake.current = null;
    };
  }, []);

  // The ghost: three blips of the pedal, the last one into the limiter. A hand ends it for good; reduced
  // motion and a stopped host never start it.
  useEffect(() => {
    if (reducedMotion() || hostTransport(rootRef.current) === "stop") return;
    const pending = timers;
    pending.current = GHOST.map(([ms, v]) => setTimeout(() => setThrottle(v), ms));
    return () => pending.current.forEach(clearTimeout);
  }, []);

  function touch() {
    if (touched.current) return;
    touched.current = true;
    timers.current.forEach(clearTimeout);
    setThrottle(0);
  }

  return (
    <div ref={rootRef} onPointerDownCapture={touch} onKeyDownCapture={touch} className="@container w-full max-w-[320px] select-none">
      <div data-part="plate" className="relative isolate animate-enter overflow-hidden rounded-[1.25em] p-[0.9em] text-[clamp(11px,4cqw,14px)] [background:var(--device-body)] shadow-[var(--device-body-edge),0_1px_2px_rgb(0_0_0/0.06),0_16px_32px_-18px_rgb(0_0_0/0.3)]">
        <div aria-hidden className="device-grain pointer-events-none absolute inset-0 -z-10 rounded-[inherit]" />

        {/* The shift lights: twelve, the last three red. At the limiter they flash together. */}
        <div data-part="well" data-shift className="group/shift flex gap-[0.3em] rounded-[1.05em] bg-(--device-well) p-[0.45em] shadow-(--device-recess)">
          {Array.from({ length: SHIFT }, (_, i) => (
            <span
              key={i}
              aria-hidden
              data-part="light"
              data-shift-light
              className={cx(
                "h-[0.8em] min-w-0 flex-1 rounded-full bg-(--device-meter-off) transition-[background-color,box-shadow] duration-(--duration-exit) group-data-flash/shift:duration-0 data-on:duration-0",
                i >= SHIFT - 3 ? "data-on:bg-(--device-rec) data-on:shadow-[0_0_0.45em_var(--device-rec)]" : "data-on:bg-(--device-meter-on)",
              )}
            />
          ))}
        </div>

        {/* The tachometer's readout. */}
        <div
          aria-hidden
          data-part="lcd"
          className="mt-[0.55em] flex items-center justify-between gap-[0.6em] overflow-hidden rounded-[0.7em] px-[0.8em] py-[0.6em] text-(--device-lcd-ink) [background:var(--device-lcd)] shadow-(--device-lcd-edge)"
        >
          <span data-part="chip" data-chip data-state="idle" className="group/chip inline-flex shrink-0 items-center gap-[0.35em] rounded-[0.4em] bg-white px-[0.42em] py-[0.24em] text-black">
            <span className="size-[0.55em] rounded-full bg-black group-data-[state=limiter]/chip:rounded-[1px] group-data-[state=limiter]/chip:bg-(--device-rec) group-data-[state=rev]/chip:animate-pulse group-data-[state=rev]/chip:bg-(--device-rec)" />
            <span data-chip-text className="text-[0.58em] font-semibold uppercase leading-none tracking-[0.02em]">
              Idle
            </span>
          </span>
          <span className="whitespace-nowrap text-[2.35em] font-light leading-none tracking-[-0.03em] tabular-nums">
            <span data-rpm>{figures(IDLE)}</span>
            <span className="ml-[0.2em] text-[0.3em] tracking-normal text-(--device-lcd-dim)">rpm</span>
          </span>
        </div>

        <Throttle
          label="Throttle"
          name="throttle"
          value={throttle}
          className="mt-[0.55em]"
          onChange={setThrottle}
          onTravel={(d) => {
            depth.current = d;
            wake.current?.();
          }}
        />
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
