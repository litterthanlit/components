"use client";

import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { createSpring, focusQuietly, springs, type Spring } from "@/design-system";
import { hostTransport, play, type PlayOptions, type SoundName } from "@/lib/sound";

/*
 * A mode picker after a steering wheel's drive-mode switch: a knurled cap in
 * a collar with four detents across 120°, the modes engraved round it, and a
 * key in its centre that starts a timed response boost. A light beside the
 * chosen mode follows the cap, and the boost shows as a ring of twenty lights
 * that all come on together and go out one a second.
 *
 * Values set from outside travel on the motor, a spring in degrees
 * (springs.gentle), and tick through every detent they pass, pitched with the
 * detent so a mode recalled from outside sounds like the switch turning by
 * itself. A hand drags the cap round the centre (it follows the pointer's
 * angle, from where it was grabbed) and lets go onto the nearest detent. The
 * cap turns by its gradients, never a transform; the spring writes one CSS
 * variable and the lights, so a turn never re-renders React.
 *
 * The boost ring is drawn from a frame loop straight to the DOM, like the
 * hold-to-confirm ring. It counts real time (20 s); press the key again to
 * cancel. Arrow keys step the modes, Home and End go to the ends.
 */

const MODES = [
  { value: "wet", label: "Wet" },
  { value: "normal", label: "Normal" },
  { value: "sport", label: "Sport" },
  { value: "sport-plus", label: "Sport+" },
] as const;

export type DriveModeValue = (typeof MODES)[number]["value"];

const STEP = 40; // degrees between detents: four of them make ±60°
const ANGLES = MODES.map((_, i) => (i - (MODES.length - 1) / 2) * STEP);
const LIGHTS = 20; // one per second of the boost
const SECOND = 1000;
const BOOST_MS = LIGHTS * SECOND;

// The rotary's frame, in em of the plate: the collar's centre sits at (CX, CY).
const W = 17.2;
const H = 12.9;
const CX = W / 2;
const CY = 7.5;

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round2 = (v: number) => Math.round(v * 100) / 100;
/** An em length for a style, rounded so float dust (5.3999999999999995) never splits the server from the browser. */
const em = (v: number) => `${round2(v)}em`;

/** A point `r` out from (x, y) at `deg` clockwise from twelve o'clock, rounded so the server and the browser agree. */
const polar = (deg: number, r: number, x: number, y: number) => {
  const a = (deg * Math.PI) / 180;
  return { x: round2(x + r * Math.sin(a)), y: round2(y - r * Math.cos(a)) };
};

const detentAt = (deg: number) => clamp(Math.round((deg - ANGLES[0]) / STEP), 0, MODES.length - 1);
const indexOf = (value: DriveModeValue) => Math.max(0, MODES.findIndex((m) => m.value === value));

/** Where each mode's engraving sits, a little outside the collar. */
const labelAt = ANGLES.map((deg) => {
  const p = polar(deg, 7.2, CX, CY);
  return { left: em(p.x), top: em(p.y) };
});

/** A short mark engraved on the plate at each detent. */
const detentMarks = ANGLES.map((deg) => {
  const a = polar(deg, 5.25, CX, CY);
  const b = polar(deg, 5.8, CX, CY);
  return `M${a.x} ${a.y}L${b.x} ${b.y}`;
});

/** The boost ring's lights, short strokes round the key from twelve o'clock. */
const ring = Array.from({ length: LIGHTS }, (_, i) => {
  const a = polar((i + 0.5) * (360 / LIGHTS), 33.6, 50, 50);
  const b = polar((i + 0.5) * (360 / LIGHTS), 41.6, 50, 50);
  return `M${a.x} ${a.y}L${b.x} ${b.y}`;
});

type DriveModeProps = {
  value: DriveModeValue;
  onChange: (value: DriveModeValue) => void;
  /** Names a hidden input, so the mode goes with a form. */
  name?: string;
  /** The response boost is running. Leave it out and the switch keeps its own. */
  boost?: boolean;
  /** The key started or cancelled the boost, or its 20 s ran out (`expired`). */
  onBoostChange?: (on: boolean, expired?: boolean) => void;
  /** Whole seconds left on the boost, 20 down to 0. */
  onCount?: (seconds: number) => void;
  className?: string;
};

export function DriveMode({ value, onChange, name, boost, onBoostChange, onCount, className }: DriveModeProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const keyRef = useRef<HTMLButtonElement>(null);
  const spring = useRef<Spring | null>(null);
  const engine = useRef<{ begin: () => void; cancel: () => void } | null>(null);
  const [first] = useState(() => indexOf(value)); // the detent it is drawn on before the spring takes over
  const [own, setOwn] = useState(false);
  const on = boost ?? own;

  const index = useRef(-1); // the detent the cap is on, ahead of the render that confirms it
  const target = useRef(0); // degrees the motor is heading for
  const landing = useRef(false); // the cap is on its way to a detent and will click into it
  const touched = useRef(false); // a hand has worked it: it may sound while the host is paused
  const drag = useRef<{ id: number; cx: number; cy: number; cap: number; last: number | null } | null>(null);
  const held = useRef(false); // the boost key is under a finger
  const expired = useRef(false); // the boost ran out by itself
  const blip = useRef<ReturnType<typeof setTimeout>>(undefined);
  const wasOn = useRef(false);
  // Props the spring and the frame loop read when they fire, rather than when they were made.
  const props = useRef({ onBoostChange, onCount });
  useLayoutEffect(() => {
    props.current = { onBoostChange, onCount };
  });

  /** A sound the switch makes by itself follows the host's tape; once a hand has worked it, it always sounds. */
  const sound = (name: SoundName, options?: PlayOptions) => {
    if (touched.current || hostTransport(rootRef.current) === "play") play(name, options);
  };

  // The spring runs in degrees and draws the cap, the light beside the chosen mode and the clicks.
  useLayoutEffect(() => {
    const root = rootRef.current!;
    const lights = [...root.querySelectorAll<HTMLElement>("[data-mode-light]")];
    let shown = -1;
    index.current = -1; // a remount starts from the value again, not from a stale detent
    const s = createSpring(0, springs.gentle, (deg) => {
      root.style.setProperty("--a", `${deg.toFixed(2)}deg`);
      const detent = detentAt(deg);
      if (detent !== shown) {
        // A click for every detent the cap passes, a little higher for each.
        if (shown !== -1) sound("tick", { gain: 0.55, pitch: 0.9 + (detent / (MODES.length - 1)) * 0.25 });
        shown = detent;
        lights.forEach((light, i) => {
          if (i === detent) light.dataset.on = "";
          else delete light.dataset.on;
        });
      }
      if (landing.current && deg === target.current) {
        landing.current = false;
        sound("select", { gain: 0.5, pitch: 0.95 + detent * 0.06 });
      }
    });
    spring.current = s;
    return () => s.stop();
  }, []);

  // A new value: a hand's drag already holds the cap; anyone else's travels on the motor.
  useLayoutEffect(() => {
    const s = spring.current!;
    const initial = index.current === -1;
    const i = indexOf(value);
    index.current = i;
    target.current = ANGLES[i];
    if (drag.current) return;
    if (initial || reducedMotion()) {
      landing.current = false;
      s.jump(target.current);
      if (!initial) sound("select", { gain: 0.5, pitch: 0.95 + i * 0.06 });
    } else {
      landing.current = true;
      s.set(target.current);
    }
  }, [value]);

  // The boost ring: all twenty lights on at once, one out each second, drawn from a frame loop.
  useLayoutEffect(() => {
    const root = rootRef.current!;
    const lights = [...root.querySelectorAll<SVGPathElement>("[data-segment]")];
    let raf = 0;
    let begun = 0;
    let lit = -1;

    const show = (n: number) => {
      lights.forEach((light, i) => {
        if (i < n) light.dataset.on = "";
        else delete light.dataset.on;
      });
      lit = n;
    };

    const frame = (now: number) => {
      const left = Math.max(0, BOOST_MS - (now - begun));
      const n = Math.min(LIGHTS, Math.ceil(left / SECOND));
      if (n !== lit) {
        show(n);
        props.current.onCount?.(n);
      }
      if (left > 0) {
        raf = requestAnimationFrame(frame);
        return;
      }
      raf = 0;
      expired.current = true;
      setOwn(false);
      props.current.onBoostChange?.(false, true);
    };

    engine.current = {
      begin() {
        cancelAnimationFrame(raf);
        begun = performance.now();
        lit = -1;
        raf = requestAnimationFrame(frame);
      },
      cancel() {
        cancelAnimationFrame(raf);
        raf = 0;
        show(0);
      },
    };
    return () => cancelAnimationFrame(raf);
  }, []);

  // The boost starting or stopping, whoever asked: the loop, the sound, and the key sinking if no finger did.
  useEffect(() => {
    if (wasOn.current === on) return;
    wasOn.current = on;
    const ended = expired.current;
    expired.current = false;
    if (on) engine.current?.begin();
    else engine.current?.cancel();
    sound(on ? "start" : "stop");
    const key = keyRef.current;
    if (key && !touched.current && !ended) {
      key.dataset.pressed = "";
      sound("press", { gain: 0.7 });
      clearTimeout(blip.current);
      blip.current = setTimeout(() => {
        delete key.dataset.pressed;
        sound("release", { gain: 0.7 });
      }, 180);
    }
  }, [on]);
  useEffect(() => {
    const pending = blip;
    return () => clearTimeout(pending.current);
  }, []);

  /** Moves to detent `i`; the motor takes the cap there. */
  function pick(i: number) {
    const next = clamp(i, 0, MODES.length - 1);
    if (next === index.current) return play("bump", { gain: 0.5 });
    index.current = next;
    onChange(MODES[next].value);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const delta = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
    if (delta) pick(index.current + delta);
    else if (e.key === "Home") pick(0);
    else if (e.key === "End") pick(MODES.length - 1);
    else return;
    e.preventDefault();
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    focusQuietly(e.currentTarget);
    e.currentTarget.setPointerCapture(e.pointerId);
    const box = e.currentTarget.getBoundingClientRect();
    drag.current = { id: e.pointerId, cx: box.left + box.width / 2, cy: box.top + box.height / 2, cap: spring.current!.value, last: null };
    play("press", { gain: 0.6 });
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.cx;
    const dy = e.clientY - d.cy;
    if (dx * dx + dy * dy < 16) return; // too near the pivot for an angle to mean anything
    // The cap follows the change in the pointer's angle round the centre, from where it was grabbed.
    const a = (Math.atan2(dx, -dy) * 180) / Math.PI;
    if (d.last !== null) {
      const turn = a - d.last;
      d.cap = clamp(d.cap + (turn > 180 ? turn - 360 : turn < -180 ? turn + 360 : turn), ANGLES[0], ANGLES[MODES.length - 1]);
      spring.current!.jump(d.cap);
      const next = detentAt(d.cap);
      if (next !== index.current) {
        index.current = next;
        onChange(MODES[next].value);
      }
    }
    d.last = a;
  }
  function onPointerEnd(e: PointerEvent<HTMLDivElement>) {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    const s = spring.current!;
    const rest = ANGLES[index.current];
    target.current = rest;
    // Let go between detents and the cap settles onto the nearest, clicking home.
    if (Math.abs(s.value - rest) > 0.5) {
      landing.current = true;
      s.set(rest);
    }
    play("release", { gain: 0.6 });
  }

  function toggleBoost() {
    const next = !on;
    setOwn(next);
    onBoostChange?.(next);
  }

  return (
    <div
      ref={rootRef}
      onPointerDownCapture={() => (touched.current = true)}
      onKeyDownCapture={() => (touched.current = true)}
      className={cx("relative shrink-0", className)}
      style={{ width: `${W}em`, height: `${H}em`, "--a": `${ANGLES[first]}deg` } as CSSProperties}
    >
      {name && <input type="hidden" name={name} value={value} />}

      {/* The detent marks, engraved on the plate. */}
      <svg aria-hidden data-part="lettering" viewBox={`0 0 ${W} ${H}`} className="pointer-events-none absolute inset-0 size-full">
        {detentMarks.map((d, i) => (
          <path key={i} d={d} strokeWidth="0.14" strokeLinecap="round" className="stroke-(--device-label-quiet)" />
        ))}
      </svg>

      {/* The modes, engraved round the collar; a light beside the chosen one follows the cap. */}
      {MODES.map((m, i) => (
        <span
          key={m.value}
          aria-hidden
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            focusQuietly(sliderRef.current);
            play("press", { gain: 0.5 });
            pick(i);
          }}
          style={labelAt[i]}
          className="absolute flex -translate-1/2 cursor-pointer items-center gap-[0.35em] px-[0.3em] py-[0.8em]"
        >
          <span
            data-part="light"
            data-mode-light
            data-on={i === first || undefined}
            className="size-[0.36em] rounded-full bg-(--device-meter-off) transition-[background-color] duration-(--duration-exit) data-on:bg-(--device-meter-on) data-on:duration-0"
          />
          <span data-part="lettering" className="text-[0.62em] font-semibold uppercase leading-none tracking-[0.16em] text-(--device-label) [text-shadow:var(--device-engrave)]">
            {m.label}
          </span>
        </span>
      ))}

      {/* The collar is the slider; the cap seated in it turns by its gradients. */}
      <div
        ref={sliderRef}
        role="slider"
        tabIndex={0}
        aria-label="Drive mode"
        aria-valuemin={0}
        aria-valuemax={MODES.length - 1}
        aria-valuenow={indexOf(value)}
        aria-valuetext={MODES[indexOf(value)].label}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        data-part="collar"
        className="absolute cursor-grab touch-none rounded-full bg-black/[0.035] p-[0.32em] shadow-(--device-recess) outline-offset-2 active:cursor-grabbing dark:bg-black/30"
        style={{ left: em(CX - 4.8), top: em(CY - 4.8), width: "9.6em", height: "9.6em" }}
      >
        <div aria-hidden data-part="cap" className="relative size-full rounded-full [background:var(--device-wheel-face)] shadow-(--device-wheel-shadow)">
          {/* Knurling round the skirt: it turns with the cap. */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: "repeating-conic-gradient(from var(--a), var(--device-meter-off) 0 1.6deg, transparent 1.6deg 7.5deg)",
              mask: "radial-gradient(circle closest-side, transparent 86%, #000 88%, #000 98%, transparent 100%)",
            }}
          />
          {/* The smooth face, a shade below the skirt: the ring of lights sits on it, so the knurling stays on the skirt. */}
          <div className="absolute inset-[11%] rounded-full [background:var(--device-wheel-face)] shadow-[0_0_0_1px_rgb(0_0_0/0.1),inset_0_1px_3px_rgb(0_0_0/0.14),0_1px_0_rgb(255_255_255/0.7)] dark:shadow-[0_0_0_1px_rgb(0_0_0/0.6),inset_0_1px_3px_rgb(0_0_0/0.6),0_1px_0_rgb(255_255_255/0.06)]" />
          {/* The pointer: a line across the knurled skirt. */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: "conic-gradient(from calc(var(--a) - 2.2deg), var(--device-key-ink) 0 4.4deg, transparent 4.4deg)",
              mask: "radial-gradient(circle closest-side, transparent 87%, #000 88%, #000 97%, transparent 98%)",
            }}
          />
        </div>
      </div>

      {/* The boost ring, round the key. */}
      <svg
        aria-hidden
        data-part="light"
        viewBox="0 0 100 100"
        className="pointer-events-none absolute"
        style={{ left: em(CX - 3.2), top: em(CY - 3.2), width: "6.4em", height: "6.4em" }}
      >
        {ring.map((d, i) => (
          <path
            key={i}
            data-segment
            d={d}
            strokeWidth="3.2"
            strokeLinecap="round"
            className="stroke-(--device-meter-off) transition-[stroke] duration-(--duration-exit) data-on:stroke-(--device-rec) data-on:duration-0 motion-reduce:transition-none"
          />
        ))}
      </svg>

      {/* The key in the centre: a round cap in its own collar, sinking 2px. */}
      <button
        ref={keyRef}
        type="button"
        data-sound="key"
        aria-label="Response boost"
        aria-pressed={on}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          held.current = true;
          focusQuietly(e.currentTarget);
        }}
        onPointerUp={() => (held.current = false)}
        onPointerCancel={() => (held.current = false)}
        onClick={toggleBoost}
        className="group/key absolute rounded-full outline-offset-2"
        style={{ left: em(CX - 1.8), top: em(CY - 1.8), width: "3.6em", height: "3.6em" }}
      >
        <span aria-hidden data-part="collar" className="grid size-full place-items-center rounded-full bg-black/[0.035] p-[8%] shadow-(--device-recess) dark:bg-black/30">
          <span
            data-part="cap"
            className="grid size-full place-items-center rounded-full [background:var(--device-wheel-face)] shadow-(--device-key-shadow) transition-[translate,box-shadow] duration-(--duration-exit) ease-out group-active/key:translate-y-[2px] group-active/key:shadow-(--device-key-shadow-pressed) group-active/key:duration-75 group-data-pressed/key:translate-y-[2px] group-data-pressed/key:shadow-(--device-key-shadow-pressed) group-data-pressed/key:duration-75"
          >
            {/* Its mark glows while the boost runs. */}
            <span
              data-part="light"
              className="size-[24%] rounded-full bg-(--device-meter-off) transition-[background-color,box-shadow] duration-(--duration-exit) group-aria-pressed/key:bg-(--device-rec) group-aria-pressed/key:shadow-[0_0_0.45em_var(--device-rec)] group-aria-pressed/key:duration-0"
            />
          </span>
        </span>
      </button>
    </div>
  );
}

/* --- Demo: the wheel's drive-mode switch ----------------------------------- */

/** Throttle, damping and exhaust as a fraction of travel, for each mode. */
const PRESETS: Record<DriveModeValue, [number, number, number]> = {
  wet: [0.26, 0.34, 0.12],
  normal: [0.5, 0.5, 0.4],
  sport: [0.76, 0.72, 0.74],
  "sport-plus": [1, 0.94, 1],
};
const BARS = ["Throttle", "Damping", "Exhaust"];

export default function Demo() {
  const [mode, setMode] = useState<DriveModeValue>("normal");
  const [boost, setBoost] = useState(false);
  const [left, setLeft] = useState(LIGHTS);
  const [said, setSaid] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const touched = useRef(false);
  const bars = useRef<Spring[]>([]);

  // The rehearsal is silent in the live region; only a viewer's own changes (and a boost running out) are said.
  const changeMode = (value: DriveModeValue, ghost = false) => {
    setMode(value);
    if (!ghost) setSaid(`Drive mode: ${MODES[indexOf(value)].label}`);
  };
  const changeBoost = (on: boolean, expired?: boolean, ghost = false) => {
    setBoost(on);
    if (on) setLeft(LIGHTS);
    if (!ghost) setSaid(on ? `Response boost on, ${LIGHTS} s` : expired ? "Response boost ended" : "Response boost cancelled");
  };

  // The bars travel on springs to each mode's preset, written straight to a CSS variable.
  useLayoutEffect(() => {
    const els = [...rootRef.current!.querySelectorAll<HTMLElement>("[data-bar]")];
    bars.current = els.map((el, i) => createSpring(PRESETS.normal[i], springs.gentle, (v) => el.style.setProperty("--w", v.toFixed(3))));
    const made = bars.current;
    return () => made.forEach((s) => s.stop());
  }, []);
  useLayoutEffect(() => {
    bars.current.forEach((s, i) => (reducedMotion() ? s.jump(PRESETS[mode][i]) : s.set(PRESETS[mode][i])));
  }, [mode]);

  // The ghost: Normal, Sport, Sport+, the boost, and back to Normal. The first touch ends it for good.
  const rehearse = useEffectEvent((step: number) => {
    if (touched.current) return;
    if (step === 0) changeMode("sport", true);
    else if (step === 1) changeMode("sport-plus", true);
    else if (step === 2) changeBoost(true, false, true);
    else changeMode("normal", true);
  });
  useEffect(() => {
    if (reducedMotion() || hostTransport(rootRef.current) === "stop") return;
    const ids = [400, 1000, 1500, 3200].map((ms, step) => setTimeout(() => rehearse(step), ms));
    return () => ids.forEach(clearTimeout);
  }, []);

  return (
    <div
      ref={rootRef}
      onPointerDownCapture={() => (touched.current = true)}
      onKeyDownCapture={() => (touched.current = true)}
      className="@container w-full max-w-[420px] select-none"
    >
      <div data-part="plate" className="relative isolate animate-enter overflow-hidden rounded-[1.25em] p-[0.9em] text-[clamp(11px,4cqw,14px)] [background:var(--device-body)] shadow-[var(--device-body-edge),0_1px_2px_rgb(0_0_0/0.06),0_16px_32px_-18px_rgb(0_0_0/0.3)] @[26rem]:p-[1.1em]">
        <div aria-hidden className="device-grain pointer-events-none absolute inset-0 -z-10 rounded-[inherit]" />

        {/* The cluster's readout: the mode, what it does to the car, the boost. */}
        <div
          aria-hidden
          data-part="lcd"
          className="flex h-[5.6em] items-stretch gap-[1em] overflow-hidden rounded-[0.7em] px-[0.8em] py-[0.65em] text-(--device-lcd-ink) [background:var(--device-lcd)] shadow-(--device-lcd-edge)"
        >
          <div className="flex w-[6em] shrink-0 flex-col justify-between">
            <span data-part="chip" className="inline-flex items-center gap-[0.35em] self-start rounded-[0.4em] bg-white px-[0.42em] py-[0.24em] text-black">
              <span className="size-[0.55em] rounded-full bg-black" />
              <span className="text-[0.58em] font-semibold uppercase leading-none tracking-[0.02em]">{MODES[indexOf(mode)].label}</span>
            </span>
            <div className="flex h-[2.3em] flex-col justify-end gap-[0.25em]">
              {boost && (
                <>
                  <span className="text-[0.56em] font-semibold uppercase leading-none tracking-[0.14em] text-(--device-lcd-dim)">Boost</span>
                  <span className="flex items-center gap-[0.4em] tabular-nums">
                    <span data-part="light" className="size-[0.5em] rounded-full bg-(--device-rec) motion-safe:animate-pulse" />
                    <span className="text-[1.45em] font-light leading-none tracking-[-0.03em]">
                      {left}
                      <span className="ml-[0.3em] text-[0.42em] tracking-normal text-(--device-lcd-dim)">s</span>
                    </span>
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-between">
            {BARS.map((label, i) => (
              <div key={label} className="flex items-center gap-[0.7em]">
                <div className="w-[4.2em] shrink-0">
                  <span className="text-[0.56em] font-semibold uppercase leading-none tracking-[0.14em] text-(--device-lcd-dim)">{label}</span>
                </div>
                <div data-bar className="meter-ticks relative h-[0.42em] min-w-0 flex-1 overflow-hidden text-white/20" style={{ "--w": PRESETS.normal[i] } as CSSProperties}>
                  <div className="meter-ticks absolute inset-y-0 left-0 text-(--device-lcd-ink)" style={{ width: "calc(var(--w) * 100%)" }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* The switch, pressed into the plate. */}
        <div data-part="well" className="mx-auto mt-[0.8em] w-fit rounded-[1.05em] bg-(--device-well) p-[0.4em] shadow-(--device-recess)">
          <DriveMode value={mode} onChange={(v) => changeMode(v)} name="drive-mode" boost={boost} onBoostChange={changeBoost} onCount={setLeft} />
        </div>
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {said}
      </p>
    </div>
  );
}
