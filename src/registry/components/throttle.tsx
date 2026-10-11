"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { createSpring, focusQuietly, type Spring } from "@/design-system";
import { engine as engineVoice, hostTransport, play } from "@/lib/sound";

/*
 * A spring-return analogue input after an organ-hinged accelerator pedal: a
 * plate of dark machined metal with a few fine grip ribs, standing in a pocket
 * with its hinge at the foot and a thin line on the floor under it that comes
 * up red as it goes down. Press it and it tilts back from the hinge; let go and
 * a return spring takes it home with one small rebound. Its value, 0 to 1, is
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
 * pedal into revs, drawn as one large figure over a hairline that fills white
 * and red toward a redline, with a limiter at the top, and the same revs drive
 * a flat-six that you can hear: it follows the integrator every frame, cuts at
 * the limiter and crackles when the foot comes off. At the limiter the figure
 * turns red and the hairline pulses, slowly.
 */

/* The well, in em. The plate's foot sits on the hinge; the hand reaches REACH of the plate's length. */
const WELL_H = 13.6;
const WELL_W = 14.6;
const PEDAL_W = 9.4;
const PEDAL_H = 11.4;
const PEDAL_TOP = 0.8;
const HINGE = PEDAL_TOP + PEDAL_H;
const REACH = 0.8;
const TILT = 34; // degrees from upright to the floor
const RIBS = 6; // the grip: fine ribs across the plate, the first at the toe
const DEPTH = "40em"; // the well's perspective: the toe shrinks to about 84% at full travel

/** The return spring, in permille of travel: ζ ≈ 0.72, so it rebounds about 4% of whatever it was pushed, once. */
const RETURN = { stiffness: 300, damping: 25 };
const PUSH = 1.7; // travel per second while Space or Down is held
const EASE = 2.5; // travel per second Up takes off
const FLOOR = 5; // travel per second while End is held

const em = (n: number) => `${Math.round(n * 100) / 100}em`; // server and client write the same string
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
      root.style.setProperty("--l", clamp(d, 0, 1).toFixed(4)); // the drawn depth, without the rebound, for colours
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
    <div className={cx("flex flex-col items-center", className)}>
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
        className="relative max-w-full cursor-ns-resize touch-none select-none overflow-hidden rounded-[0.6em] bg-(--race-well) shadow-(--race-recess) outline-offset-2"
        style={{ width: `${WELL_W}em`, height: `${WELL_H}em`, "--d": initial, "--l": clamp(initial, 0, 1) } as CSSProperties}
      >
        <div aria-hidden className="absolute inset-0" style={{ perspective: DEPTH, perspectiveOrigin: `50% ${em(HINGE)}` }}>
          {/* The hinge: a line on the floor at the foot of the plate, faint at rest and red at full travel. */}
          <div
            data-part="slot"
            className="absolute left-1/2 h-[2px] -translate-x-1/2"
            style={{
              width: em(PEDAL_W),
              top: em(HINGE + 0.25),
              backgroundColor: "color-mix(in srgb, var(--race-red) calc(14% + var(--l) * 86%), var(--race-well))",
            }}
          />

          {/* The plate: dark machined metal with fine ribs; the toe rib turns red with travel, and a shade deepens. */}
          <div
            data-part="key"
            className="absolute rounded-[0.5em] [background:var(--race-metal)] shadow-(--race-key-shadow)"
            style={{
              left: `calc(50% - ${PEDAL_W / 2}em)`,
              width: `${em(PEDAL_W)}`,
              top: `${em(PEDAL_TOP)}`,
              height: `${PEDAL_H}em`,
              transformOrigin: "50% 100%",
              rotate: `x calc(var(--d) * ${TILT}deg)`,
            }}
          >
            <div className="absolute inset-0 rounded-[inherit] bg-(--race-well)" style={{ opacity: "calc(var(--l) * 0.4)" }} />
            <div className="absolute inset-x-[1.8em] top-[2.6em] bottom-[1.8em] flex flex-col justify-between">
              {Array.from({ length: RIBS }, (_, i) => (
                <span
                  key={i}
                  className="block h-[2px] shadow-[0_1px_0_rgb(0_0_0/0.7)]"
                  style={{ backgroundColor: i === 0 ? "color-mix(in srgb, var(--race-red) calc(var(--l) * 100%), var(--race-dim))" : "var(--race-faint)" }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
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
const FLASH_HOLD = 0.4; // s the limiter pulse carries on after the last cut
const PULSE_HZ = 2.5; // the limiter pulse: calm, not a strobe
const REDLINE = 0.88; // where on the hairline the red begins
const STEP = 1 / 240;

/** The ghost: three blips, the last one into the limiter. [ms, throttle] */
const GHOST: [number, number][] = [
  [400, 0.45],
  [900, 0],
  [1400, 0.75],
  [1950, 0],
  [2400, 1],
  [3700, 0],
];

/** 7,190 rpm, with the comma tabular figures set it with. */
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
  // stops once the pedal is at rest and the revs are settled. The same revs and pedal travel go to the
  // flat-six every frame it draws, and the fuel cut to its limiter.
  useLayoutEffect(() => {
    const root = rootRef.current!;
    const bar = root.querySelector<HTMLElement>("[data-bar]")!;
    const figure = root.querySelector<HTMLElement>("[data-rpm]")!;

    let r = IDLE;
    let cut = 0;
    let flash = 0;
    let shownRpm = IDLE;
    const voice = engineVoice({ redline: LIMIT });
    const still = reducedMotion();
    let flashing = false;
    let pulse = 0; // s into the limiter pulse
    let said = false;
    let raf = 0;
    let last = 0;

    // What it does by itself follows the host's tape; a hand on it always sounds.
    const audible = () => touched.current || hostTransport(root) === "play";

    const hit = () => {
      voice.cut(true);
      if (!said && touched.current) {
        said = true;
        setAnnouncement("Limiter");
      }
    };

    const target = () => IDLE + clamp(depth.current, 0, 1) * (LIMIT - IDLE);

    const step = (h: number) => {
      const to = target();
      if (flash > 0) {
        flash -= h;
        pulse += h;
      }
      if (cut > 0) {
        cut -= h;
        r -= CUT_FALL * h;
        if (cut <= 0) voice.cut(false);
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
      // Revs to the nearest ten, so the last figure rolls without flicker.
      const rpm = Math.round(r / 10) * 10;
      if (rpm !== shownRpm) {
        shownRpm = rpm;
        figure.textContent = figures(rpm);
      }
      bar.style.setProperty("--rev", clamp(r / LIMIT, 0, 1).toFixed(4));

      // The limiter: the figure goes red and the hairline breathes at a calm 2.5 Hz; steady under reduced motion.
      const isFlashing = flash > 0;
      if (isFlashing !== flashing) {
        flashing = isFlashing;
        bar.toggleAttribute("data-limit", flashing);
        figure.toggleAttribute("data-limit", flashing);
        if (flashing) pulse = 0;
        else bar.style.removeProperty("--breath");
      }
      if (flashing && !still) bar.style.setProperty("--breath", (0.6 + 0.4 * (0.5 + 0.5 * Math.cos(2 * Math.PI * PULSE_HZ * pulse))).toFixed(3));

      // The voice follows the integrator and the drawn pedal, frame for frame.
      voice.level(audible() ? 1 : 0);
      voice.set(r, clamp(depth.current, 0, 1));
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
    // A tape that pauses or plays while the pedal is still: the voice hears of it at once.
    const host = root.closest("[data-transport]");
    const watcher = host ? new MutationObserver(() => voice.level(audible() ? 1 : 0)) : null;
    if (host) watcher?.observe(host, { attributes: true, attributeFilter: ["data-transport"] });
    voice.level(audible() ? 1 : 0);
    voice.set(IDLE, 0);
    return () => {
      cancelAnimationFrame(raf);
      watcher?.disconnect();
      wake.current = null;
      voice.stop();
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
    wake.current?.(); // the voice is let in at full level
  }

  return (
    <div ref={rootRef} onPointerDownCapture={touch} onKeyDownCapture={touch} className="@container w-full max-w-[320px] select-none">
      <div data-part="plate" className="relative flex animate-enter flex-col items-center overflow-hidden rounded-[0.9em] px-[0.9em] pt-[1.3em] pb-[1.1em] text-[clamp(11px,4cqw,14px)] [background:var(--race-body)] shadow-[var(--race-edge),var(--race-shadow)]">
        {/* The revs: one large figure, white, red at the limiter. */}
        <div aria-hidden data-part="lettering" className="relative text-(--race-ink)">
          <span className="grid justify-items-end font-[family-name:var(--font-race)] text-[5.6em] leading-[0.9] font-bold tabular-nums italic [font-stretch:62%]">
            <span className="invisible col-start-1 row-start-1">8,888</span>
            <span data-rpm className="col-start-1 row-start-1 transition-colors duration-(--duration-exit) data-limit:text-(--race-red) data-limit:duration-0">
              {figures(IDLE)}
            </span>
          </span>
          <span className="absolute bottom-[0.45em] left-full ml-[0.7em] text-[0.62em] font-semibold uppercase leading-none tracking-[0.2em] text-(--race-dim)">rpm</span>
        </div>

        {/* The hairline: white to the redline, red beyond it, a fine tick where the red begins. It follows the same revs. */}
        <div aria-hidden data-part="light" data-bar className="relative mt-[1.1em] h-[2px] w-full bg-(--race-faint) transition-opacity duration-(--duration-exit) data-limit:transition-none [opacity:var(--breath,1)]">
          <span className="absolute inset-y-0 left-0 origin-left bg-(--race-ink)" style={{ width: `${REDLINE * 100}%`, transform: `scaleX(clamp(0, var(--rev, 0) / ${REDLINE}, 1))` }} />
          <span className="absolute inset-y-0 origin-left bg-(--race-red)" style={{ left: `${REDLINE * 100}%`, right: 0, transform: `scaleX(clamp(0, (var(--rev, 0) - ${REDLINE}) / ${1 - REDLINE}, 1))` }} />
          <span className="absolute -top-[0.3em] h-[0.8em] w-px bg-(--race-red)" style={{ left: `${REDLINE * 100}%` }} />
        </div>

        <Throttle
          label="Throttle"
          name="throttle"
          value={throttle}
          className="mt-[1.4em]"
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
