"use client";

import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { createSpring, focusQuietly, type Spring } from "@/design-system";
import { engine, hostTransport, play, type PlayOptions, type SoundName } from "@/lib/sound";

/*
 * A mode picker after a steering wheel's drive-mode switch, on a night
 * cockpit: a black knurled cap in a black collar with four detents across
 * 120°, one thin red pointer line on its skirt, the modes engraved round it
 * (the chosen one white, with a tiny red dot), and a key in its centre that
 * starts a timed response boost. The boost shows as a thin red arc round the
 * key that shrinks over twenty seconds.
 *
 * Values set from outside travel on the motor, a spring in degrees (a touch
 * under springs.gentle's damping, so the cap overshoots a few per cent and
 * settles), and tick through every detent they pass, pitched with the
 * detent so a mode recalled from outside sounds like the switch turning by
 * itself. A hand drags the cap round the centre (it follows the pointer's
 * angle, from where it was grabbed) and lets go onto the nearest detent. The
 * cap turns by its gradients, never a transform; the spring writes one CSS
 * variable and the lights, so a turn never re-renders React.
 *
 * An engine idles under it, and each mode sets how: Wet low and smooth, Sport+
 * higher, louder and lumpier. A change of mode blips the throttle, and the
 * boost flares it; a small spring in rpm takes the revs up and lets them fall,
 * and the engine pops on the lift. While the host's tape is paused it runs
 * silent until a hand works the switch.
 *
 * The boost arc is drawn from a frame loop straight to the DOM, like the
 * hold-to-confirm ring (stepping by the second under reduced motion). It
 * counts real time (20 s); press the key again to cancel. Arrow keys step
 * the modes, Home and End go to the ends.
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
const SECONDS = 20; // the boost
const SECOND = 1000;
const BOOST_MS = SECONDS * SECOND;
const CAP_SPRING = { stiffness: 140, damping: 17 }; // ζ ≈ 0.72: a weighty turn, ~4% overshoot, one clean settle

/** How each mode idles, in thousands of rpm and throttle load: Sport+ sits higher, louder and lumpier. */
const IDLE = [
  { rpm: 0.8, load: 0 },
  { rpm: 0.85, load: 0 },
  { rpm: 1, load: 0.1 },
  { rpm: 1.15, load: 0.2 },
];
const BLIP = { rpm: 1.5, load: 0.7, ms: 250 }; // a change of mode: this much more rpm at this load, for this long
const FLARE = { rpm: 4.5, load: 1, ms: 400 }; // the boost starting: up to this rpm
const REV_SPRING = { stiffness: 150, damping: 15 }; // in thousands of rpm: a little overshoot on the way up and down

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

/** The boost arc: a circle from twelve o'clock, clockwise, in a 100-unit box, with a path length of 100 so a dash is a percentage. */
const ARC = "M50 11.5a38.5 38.5 0 1 1 0 77a38.5 38.5 0 1 1 0-77";

/**
 * The engine under the switch: it idles at the mode's rpm, and a small spring
 * in rpm takes it up for a blip or a flare and back. `level` says how loud it
 * may be (the host's tape); it is asked each frame the revs move and every
 * quarter second, so a paused tape quietens it even at rest.
 */
function createRev(first: number, level: () => number) {
  const e = engine();
  let idle = IDLE[first];
  let load = idle.load;
  let heard = -1;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const push = (thousands: number) => {
    const g = level();
    if (g !== heard) {
      heard = g;
      e.level(g);
    }
    e.set(thousands * 1000, load);
  };
  const s = createSpring(idle.rpm, REV_SPRING, push);
  s.jump(idle.rpm);
  const poll = setInterval(() => push(s.value), 250);
  const rev = (rpm: number, throttle: number, ms: number) => {
    clearTimeout(timer);
    load = throttle;
    s.set(rpm);
    push(s.value);
    timer = setTimeout(() => {
      load = idle.load;
      s.set(idle.rpm);
      push(s.value);
    }, ms);
  };
  return {
    mode(i: number) {
      idle = IDLE[i];
      rev(idle.rpm + BLIP.rpm, BLIP.load, BLIP.ms);
    },
    flare() {
      rev(FLARE.rpm, FLARE.load, FLARE.ms);
    },
    stop() {
      clearTimeout(timer);
      clearInterval(poll);
      s.stop();
      e.stop();
    },
  };
}

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
  const countdown = useRef<{ begin: () => void; cancel: () => void } | null>(null);
  const rev = useRef<ReturnType<typeof createRev> | null>(null);
  const heardMode = useRef(-1); // the mode the engine last idled for
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
    const s = createSpring(0, CAP_SPRING, (deg) => {
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

  // The boost arc: full at the start, shrinking round to twelve o'clock over twenty seconds, drawn from a frame loop.
  useLayoutEffect(() => {
    const root = rootRef.current!;
    const arc = root.querySelector<SVGPathElement>("[data-arc]")!;
    let raf = 0;
    let begun = 0;
    let lit = -1;

    const draw = (fraction: number) => arc.setAttribute("stroke-dasharray", `${(fraction * 100).toFixed(2)} 100`);

    const frame = (now: number) => {
      const left = Math.max(0, BOOST_MS - (now - begun));
      const n = Math.min(SECONDS, Math.ceil(left / SECOND));
      draw(reducedMotion() ? n / SECONDS : left / BOOST_MS);
      if (n !== lit) {
        lit = n;
        props.current.onCount?.(n);
      }
      if (left > 0) {
        raf = requestAnimationFrame(frame);
        return;
      }
      raf = 0;
      delete arc.dataset.on;
      expired.current = true;
      setOwn(false);
      props.current.onBoostChange?.(false, true);
    };

    countdown.current = {
      begin() {
        cancelAnimationFrame(raf);
        begun = performance.now();
        lit = -1;
        draw(1);
        arc.dataset.on = "";
        raf = requestAnimationFrame(frame);
      },
      cancel() {
        cancelAnimationFrame(raf);
        raf = 0;
        delete arc.dataset.on;
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
    if (on) {
      countdown.current?.begin();
      rev.current?.flare();
    } else countdown.current?.cancel();
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
  // The engine: it idles for the mode, and is quiet while the host is paused until a hand has worked the switch.
  useEffect(() => {
    const r = createRev(Math.max(0, index.current), () => (touched.current || hostTransport(rootRef.current) === "play" ? 1 : 0));
    rev.current = r;
    heardMode.current = index.current;
    return () => {
      r.stop();
      rev.current = null;
    };
  }, []);
  useEffect(() => {
    const i = indexOf(value);
    if (i === heardMode.current) return;
    heardMode.current = i;
    rev.current?.mode(i);
  }, [value]);
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

      {/* The modes, engraved round the collar; the chosen one is white with a tiny red dot and follows the cap. */}
      {MODES.map((m, i) => (
        <span
          key={m.value}
          aria-hidden
          data-mode-light
          data-on={i === first || undefined}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            focusQuietly(sliderRef.current);
            play("press", { gain: 0.5 });
            pick(i);
          }}
          style={labelAt[i]}
          className="group/mode absolute flex -translate-1/2 cursor-pointer items-center gap-[0.4em] px-[0.3em] py-[0.8em]"
        >
          <span
            data-part="light"
            className="size-[0.34em] rounded-full bg-transparent transition-colors duration-(--duration-exit) group-data-on/mode:bg-(--race-red) group-data-on/mode:duration-0"
          />
          <span
            data-part="lettering"
            className="text-[0.66em] font-semibold uppercase leading-none tracking-[0.16em] text-(--race-dim) transition-colors duration-(--duration-exit) group-data-on/mode:text-(--race-ink) group-data-on/mode:duration-0"
          >
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
        className="absolute cursor-grab touch-none rounded-full p-[0.32em] outline-offset-2 [background:var(--race-body)] shadow-(--race-recess) active:cursor-grabbing"
        style={{ left: em(CX - 4.8), top: em(CY - 4.8), width: "9.6em", height: "9.6em" }}
      >
        <div aria-hidden data-part="cap" className="relative size-full rounded-full [background:var(--race-key-face)] shadow-(--race-key-shadow)">
          {/* Knurling round the skirt: it turns with the cap. */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: "repeating-conic-gradient(from var(--a), rgb(255 255 255 / 0.1) 0 1deg, transparent 1deg 4deg)",
              mask: "radial-gradient(circle closest-side, transparent 86%, #000 88%, #000 98%, transparent 100%)",
            }}
          />
          {/* The smooth face, a shade below the skirt: the boost arc sits on it, so the knurling stays on the skirt. */}
          <div className="absolute inset-[11%] rounded-full [background:var(--race-body)] shadow-[0_0_0_1px_rgb(0_0_0/0.8),inset_0_1px_3px_rgb(0_0_0/0.9),0_1px_0_var(--race-faint)]" />
          {/* The pointer: one thin red line across the skirt, with a faint halo. */}
          <div className="absolute inset-0 [filter:drop-shadow(0_0_0.18em_rgb(255_31_31/0.5))]">
            <div
              className="size-full rounded-full"
              style={{
                background: "conic-gradient(from calc(var(--a) - 0.9deg), var(--race-red) 0 1.8deg, transparent 1.8deg)",
                mask: "radial-gradient(circle closest-side, transparent 70%, #000 72%, #000 97%, transparent 98%)",
              }}
            />
          </div>
        </div>
      </div>

      {/* The boost arc, round the key: thin and red, shrinking over twenty seconds. */}
      <svg
        aria-hidden
        data-part="light"
        viewBox="0 0 100 100"
        className="pointer-events-none absolute"
        style={{ left: em(CX - 3.2), top: em(CY - 3.2), width: "6.4em", height: "6.4em" }}
      >
        <path
          data-arc
          d={ARC}
          pathLength="100"
          fill="none"
          strokeWidth="1.1"
          strokeLinecap="round"
          strokeDasharray="0 100"
          className="stroke-(--race-red) opacity-0 transition-opacity duration-(--duration-exit) data-on:opacity-75 data-on:duration-0 motion-reduce:transition-none"
        />
      </svg>

      {/* The key in the centre: a black cap in its own collar, sinking 2px. */}
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
        <span aria-hidden data-part="collar" className="grid size-full place-items-center rounded-full p-[8%] [background:var(--race-body)] shadow-(--race-recess)">
          <span
            data-part="cap"
            className="grid size-full place-items-center rounded-full [background:var(--race-key-face)] shadow-(--race-key-shadow) transition-[translate,box-shadow] duration-(--duration-exit) ease-out group-active/key:translate-y-[2px] group-active/key:shadow-(--race-key-shadow-pressed) group-active/key:duration-75 group-data-pressed/key:translate-y-[2px] group-data-pressed/key:shadow-(--race-key-shadow-pressed) group-data-pressed/key:duration-75"
          >
            {/* Its mark turns red while the boost runs. */}
            <span
              data-part="light"
              className="size-[24%] rounded-full bg-(--race-led-off) transition-colors duration-(--duration-exit) group-aria-pressed/key:bg-(--race-red) group-aria-pressed/key:duration-0"
            />
          </span>
        </span>
      </button>
    </div>
  );
}

/* --- Demo: the wheel's drive-mode switch ----------------------------------- */

export default function Demo() {
  const [mode, setMode] = useState<DriveModeValue>("normal");
  const [boost, setBoost] = useState(false);
  const [left, setLeft] = useState(SECONDS);
  const [said, setSaid] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const touched = useRef(false);

  // The rehearsal is silent in the live region; only a viewer's own changes (and a boost running out) are said.
  const changeMode = (value: DriveModeValue, ghost = false) => {
    setMode(value);
    if (!ghost) setSaid(`Drive mode: ${MODES[indexOf(value)].label}`);
  };
  const changeBoost = (on: boolean, expired?: boolean, ghost = false) => {
    setBoost(on);
    if (on) setLeft(SECONDS);
    if (!ghost) setSaid(on ? `Response boost on, ${SECONDS} s` : expired ? "Response boost ended" : "Response boost cancelled");
  };

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
      <div data-part="plate" className="relative isolate flex animate-enter flex-col items-center gap-[0.5em] overflow-hidden rounded-[0.9em] p-[0.9em] pt-[1.3em] text-[clamp(11px,4cqw,14px)] [background:var(--race-body)] shadow-[var(--race-edge),var(--race-shadow)] @[26rem]:p-[1.1em] @[26rem]:pt-[1.5em]">
        {/* The one line of text: the mode, large and white. The four names are stacked and crossfade; the boost count hangs quietly beside it. */}
        <div aria-hidden data-part="lettering" className="grid h-[1.1em] grid-cols-1 items-center text-[3.2em] leading-none text-(--race-ink)">
          {MODES.map((m) => (
            <span
              key={m.value}
              className={cx(
                "relative col-start-1 row-start-1 justify-self-center whitespace-nowrap font-[family-name:var(--font-race)] font-bold uppercase italic [font-stretch:62%] opacity-0 transition-opacity duration-[120ms] ease-out",
                m.value === mode && "opacity-100",
              )}
            >
              {m.label}
              <span
                className={cx(
                  "absolute bottom-[0.14em] left-full ml-[0.45em] whitespace-nowrap font-[family-name:var(--font-sans)] text-[0.22em] font-semibold normal-case not-italic tracking-[0.04em] text-(--race-dim) tabular-nums [font-stretch:100%] transition-opacity duration-(--duration-exit)",
                  !boost && "opacity-0",
                )}
              >
                {left} s
              </span>
            </span>
          ))}
        </div>

        <DriveMode className="mt-[0.6em] text-[1.2em]" value={mode} onChange={(v) => changeMode(v)} name="drive-mode" boost={boost} onBoostChange={changeBoost} onCount={setLeft} />
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {said}
      </p>
    </div>
  );
}
