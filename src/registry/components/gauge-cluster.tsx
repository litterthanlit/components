"use client";

import {
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
} from "react";
import { createSpring, focusQuietly, type Spring } from "@/design-system";
import { engine, hostTransport, play } from "@/lib/sound";

/*
 * An instrument cluster on the night-race line: three radial gauges in a
 * black well under a bar of shift lights, everything lit from within. The tach
 * is the hero, a GT car's yellow face with black figures in the race face
 * (condensed, italic, heavy), a red block at the end of the scale and a black
 * readout in its lower half that carries the gear in a yellow chip and the road
 * speed in huge glowing digits. The speedo and the oil temperature are dark
 * glass with scanlines and white figures, tucked partly behind it, lower and to
 * either side.
 *
 * A needle is a spring, in degrees, so it keeps its velocity when the value
 * jumps: stiff on the tach (260, 26: about 1.5% overshoot, settled in a third
 * of a second), gentler on the road speed (150, 20) and slower still on the
 * oil (90, 16), which has no business being quick. It is drawn through SVG
 * attributes (x1 to y2), never a transform, and every frame writes the DOM,
 * not React. A value set through the `value` prop travels on the spring; a
 * demo that feeds a gauge sixty times a second uses the handle instead, which
 * is the same path without a render.
 *
 * A red needle glows and leaves a light trail: four ghost needles behind it,
 * drawn in the same frame as the needle from the spring's own velocity. Each
 * lags it by a further 22 ms, so a fast needle smears over as many degrees as
 * it has moved in that time and a slow or settled one shows none. Reduced
 * motion draws none.
 *
 * The shift lights are ten LEDs: four green, three yellow, three red, lit one
 * by one from 5,500 rpm to 7,700 and all flashing together at the limiter
 * (steady under reduced motion). They are written, like the needles, from the
 * rpm the cluster is given.
 *
 * Each face is a meter for screen readers (aria-valuemin, max, now and a
 * valuetext with its unit), and the cluster is one tab stop: hold Space or
 * press and hold anywhere on it to rev.
 *
 * The demo drives it from a small car: five gear ratios and a limiter, so the
 * tach, the road speed and the gear always agree. On power-up the three
 * needles swing to full scale and back, 120 ms apart, and then a recorded
 * lap plays back as automation in READ: the launch to the limiter, an
 * upshift (the tach drops) in each gear, then the brakes, with a blip of
 * throttle on every downshift. A hand on the cluster takes the throttle in
 * TOUCH, from wherever the lap had got to, and two and a half seconds after
 * it lets go the lap takes the needles back. The engine is heard: one flat-six
 * voice follows the same rpm and throttle that draw the tach, cuts at the
 * limiter, and stays silent under a paused tape until a hand works it.
 */

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round2 = (n: number) => Math.round(n * 100) / 100;
let motionQuery: MediaQueryList | undefined;
const reducedMotion = () => (motionQuery ??= matchMedia("(prefers-reduced-motion: reduce)")).matches;

/** A point on a face, in viewBox units from its centre. Rounded, so the server's and the browser's trigonometry agree when it hydrates. */
const polar = (deg: number, r: number) => {
  const a = (deg * Math.PI) / 180;
  return { x: round2(50 + r * Math.sin(a)), y: round2(50 - r * Math.cos(a)) };
};

function arcPath(from: number, to: number, r: number) {
  const a = polar(from, r);
  const b = polar(to, r);
  return `M${a.x} ${a.y}A${r} ${r} 0 ${Math.abs(to - from) > 180 ? 1 : 0} 1 ${b.x} ${b.y}`;
}

/** The race face for figures: condensed, italic, heavy. */
const RACE_FIGURES = "font-[family-name:var(--font-race)] [font-stretch:62%] italic font-bold tabular-nums";

/* --- Gauge ---------------------------------------------------------------- */

export type GaugeHandle = {
  /** Sends the needle to a value on its spring, or `jump` puts it there at once. Writes the DOM, never React state. */
  set: (value: number, jump?: boolean) => void;
};

export type GaugeProps = {
  value: number;
  min: number;
  max: number;
  /** Where the red block begins; it runs to the end of the scale. */
  redline?: number;
  /** The accessible name, e.g. "Engine speed". */
  label: string;
  /** The text screen readers get: "4,200 rpm". */
  format?: (value: number) => string;
  /** A long tick every this much. */
  majorStep: number;
  /** A figure every this much, a multiple of `majorStep`. Default: at every long tick. */
  figureStep?: number;
  /** A short tick every this much. */
  minorStep: number;
  /** Large faces carry big figures; small ones are set a size down and tuck behind. */
  size?: "large" | "small";
  /** The face: dark glass with white figures and scanlines, or the tach's yellow with black ones. */
  tone?: "glass" | "yellow";
  /** Degrees from upright, clockwise, at the minimum and at the maximum. Default −135 to 135. */
  sweep?: readonly [number, number];
  /** What to print at a long tick. Default: the value. */
  figure?: (value: number) => string;
  /** The unit, printed on the face. */
  unit?: string;
  /** The needle's spring. */
  needle?: { stiffness: number; damping: number };
  /** The needle passed a long tick, going up (`rising`) or down. Called from the spring, not from React. */
  onMark?: (mark: number, rising: boolean) => void;
  /** Drive the needle without rendering. */
  handle?: Ref<GaugeHandle>;
  /** Printed on the face, under the needle's cap: a gear, a digital readout. */
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
};

/** Each size's measurements, in viewBox units. */
const FACE = {
  large: { major: 6.8, minor: 3.4, majorW: 2, minorW: 0.9, label: 26, font: 15.5, weight: 800, tip: 40, tail: 9, needleW: 1.9, hub: 6, unitY: 35 },
  small: { major: 5.5, minor: 2.8, majorW: 1.7, minorW: 0.9, label: 29, font: 11.5, weight: 700, tip: 39, tail: 7, needleW: 1.5, hub: 4.8, unitY: 70 },
} as const;
const TICK_OUT = 41;
const PIN = 1.04; // the needle may press a little past the end stop
const CHAR_W = 0.46; // a condensed italic figure's width, in ems
/** The light trail: four ghosts, each this many seconds behind the needle, and how bright each starts. */
const TRAIL = [
  { lag: 0.022, alpha: 0.4 },
  { lag: 0.044, alpha: 0.26 },
  { lag: 0.066, alpha: 0.15 },
  { lag: 0.088, alpha: 0.07 },
] as const;
const MAX_SMEAR = 32; // degrees

const bezel = "[box-shadow:0_0_0_1px_rgb(255_255_255/0.1),inset_0_1px_2px_rgb(0_0_0/0.8),0_0.12em_0.4em_rgb(0_0_0/0.8)]";
/** The large face stands proud of the two behind it: a hard shadow falls on them. */
const bezelLarge = "[box-shadow:0_0_0_1px_rgb(255_255_255/0.16),inset_0_1px_2px_rgb(0_0_0/0.8),0_0.2em_1em_0.1em_rgb(0_0_0/0.9)]";

export function Gauge({
  value,
  min,
  max,
  redline,
  label,
  format = (v) => String(Math.round(v)),
  majorStep,
  figureStep = majorStep,
  minorStep,
  size = "small",
  tone = "glass",
  sweep = [-135, 135],
  figure = (v) => String(v),
  unit,
  needle = { stiffness: 170, damping: 22 },
  onMark,
  handle,
  children,
  className,
  style,
}: GaugeProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const spring = useRef<Spring | null>(null);
  const placed = useRef(false);
  const silent = useRef(false); // a jump passes no marks
  const aria = useRef({ at: 0, text: "" }); // the last valuetext written by the handle, and when
  const [initial] = useState(value);
  const f = FACE[size];
  const yellow = tone === "yellow";
  // What the spring and the handle read when they fire, rather than when they were made.
  const props = useRef({ min, max, sweep, majorStep, format, onMark, needle });
  useLayoutEffect(() => {
    props.current = { min, max, sweep, majorStep, format, onMark, needle };
  });

  const angleOf = (v: number, p: { min: number; max: number; sweep: readonly [number, number] }) =>
    p.sweep[0] + clamp((v - p.min) / (p.max - p.min), 0, PIN) * (p.sweep[1] - p.sweep[0]);

  // The spring runs in degrees and draws the needle and its trail; a long tick passing under it is reported from here.
  useLayoutEffect(() => {
    const root = rootRef.current!;
    const lines = [...root.querySelectorAll<SVGLineElement>("[data-needle]")];
    const ghosts = [...root.querySelectorAll<SVGLineElement>("[data-ghost]")];
    const trails = !reducedMotion();
    const start = props.current;
    const marks = Math.floor((start.max - start.min) / start.majorStep + 1e-6);
    const bandOf = (deg: number, p: typeof start) =>
      clamp(Math.floor(((deg - p.sweep[0]) / (p.sweep[1] - p.sweep[0])) * ((p.max - p.min) / p.majorStep) + 1e-6), 0, marks - 1);
    let band = bandOf(angleOf(initial, start), start);
    let lastDeg = angleOf(initial, start);
    let lastAt = 0;
    const s = createSpring(lastDeg, props.current.needle, (deg) => {
      const tip = polar(deg, f.tip);
      const tail = polar(deg + 180, f.tail);
      for (const line of lines) {
        line.setAttribute("x1", String(tail.x));
        line.setAttribute("y1", String(tail.y));
        line.setAttribute("x2", String(tip.x));
        line.setAttribute("y2", String(tip.y));
      }
      if (trails) {
        // The needle's speed from this frame and the last, which a jump (a long gap) does not count.
        const at = performance.now();
        const dt = (at - lastAt) / 1000;
        const speed = lastAt && dt > 0.004 && dt < 0.08 ? (deg - lastDeg) / dt : 0;
        lastAt = at;
        lastDeg = deg;
        ghosts.forEach((ghost, i) => {
          const smear = clamp(speed * TRAIL[i].lag, -MAX_SMEAR, MAX_SMEAR);
          const a = polar(deg - smear, f.tip);
          const b = polar(deg - smear + 180, f.tail);
          ghost.setAttribute("x1", String(b.x));
          ghost.setAttribute("y1", String(b.y));
          ghost.setAttribute("x2", String(a.x));
          ghost.setAttribute("y2", String(a.y));
          ghost.setAttribute("opacity", String(round2(TRAIL[i].alpha * clamp(Math.abs(smear) / 3, 0, 1))));
        });
      }
      const p = props.current;
      const now = bandOf(deg, p);
      if (now !== band) {
        const rising = now > band;
        band = now;
        if (!silent.current) p.onMark?.(p.min + (rising ? now : now + 1) * p.majorStep, rising);
      }
    });
    spring.current = s;
    return () => s.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, size]);

  const place = (v: number, jump: boolean, first = false) => {
    const s = spring.current!;
    const deg = angleOf(v, props.current);
    if (jump || reducedMotion()) {
      silent.current = first; // only the first placement is silent: a jump under a hand still ticks
      s.jump(deg);
      silent.current = false;
    } else s.set(deg);
  };

  // A new value: the needle travels to it.
  useLayoutEffect(() => {
    place(value, !placed.current, !placed.current);
    placed.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, min, max]);

  useImperativeHandle(
    handle,
    () => ({
      set(v, jump = false) {
        place(v, jump);
        // Screen readers hear the value a few times a second at most, and only when its text changes.
        const el = rootRef.current;
        const text = props.current.format(v);
        const at = performance.now();
        if (el && text !== aria.current.text && (jump || at - aria.current.at > 400)) {
          aria.current = { at, text };
          el.setAttribute("aria-valuenow", String(Math.round(v * 10) / 10));
          el.setAttribute("aria-valuetext", text);
        }
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // The scale: long and short ticks, a figure at each long one, the red block at the end.
  const span = max - min;
  const angle = (v: number) => sweep[0] + clamp((v - min) / span, 0, 1) * (sweep[1] - sweep[0]);
  const ticks = Array.from({ length: Math.round(span / minorStep) + 1 }, (_, i) => {
    const v = min + i * minorStep;
    const r = (v - min) / majorStep;
    return { v, major: Math.abs(r - Math.round(r)) < 1e-6 };
  });
  const figures = Array.from({ length: Math.floor(span / figureStep + 1e-6) + 1 }, (_, i) => min + i * figureStep);
  const font = f.font;
  // A figure sits clear of the long ticks: its centre is as far in as its own extent along the radius, plus a gap.
  const labelAt = (v: number) => {
    const deg = angle(v);
    const rad = (deg * Math.PI) / 180;
    const w = figure(v).length * font * CHAR_W;
    const reach = (Math.abs(Math.sin(rad)) * w + Math.abs(Math.cos(rad)) * font * 0.75) / 2;
    return polar(deg, TICK_OUT - f.major - 2.2 - reach);
  };
  const tip = polar(angleOf(initial, { min, max, sweep }), f.tip);
  const tail = polar(angleOf(initial, { min, max, sweep }) + 180, f.tail);
  const needleAt = { x1: tail.x, y1: tail.y, x2: tip.x, y2: tip.y };
  const ink = yellow ? "var(--race-yellow-ink)" : "var(--race-ink)";
  const quiet = yellow ? "var(--race-yellow-ink)" : "var(--race-dim)";

  return (
    <div
      ref={rootRef}
      role="meter"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={format(value)}
      data-part="bezel"
      className={cx("aspect-square overflow-hidden rounded-full bg-(--race-well) p-[4.5%]", size === "large" ? bezelLarge : bezel, className)}
      style={style}
    >
      <div
        data-part="face"
        className={cx(
          "relative size-full overflow-hidden rounded-full",
          yellow ? "[background:radial-gradient(circle_at_50%_44%,transparent_58%,rgb(0_0_0/0.22)_100%),var(--race-yellow)]" : "[background:var(--race-glass)]",
        )}
      >
        <svg aria-hidden viewBox="0 0 100 100" className="absolute inset-0 size-full" style={{ fontVariantNumeric: "tabular-nums" }}>
          {/* The red block at the end of the scale, outside the ticks. */}
          {redline !== undefined && <path d={arcPath(angle(redline), angle(max), 44.6)} fill="none" stroke="var(--race-red)" strokeWidth="4" />}
          <path d={arcPath(angle(min), angle(redline ?? max), 41.8)} fill="none" stroke={ink} strokeOpacity={yellow ? 0.5 : 0.3} strokeWidth="0.5" />
          {ticks.map(({ v, major }) => {
            const deg = angle(v);
            const a = polar(deg, TICK_OUT);
            const b = polar(deg, TICK_OUT - (major ? f.major : f.minor));
            const hot = redline !== undefined && v >= redline && !yellow;
            return <line key={v} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={hot ? "var(--race-red)" : ink} strokeOpacity={major ? 1 : 0.55} strokeWidth={major ? f.majorW : f.minorW} />;
          })}
          {figures.map((v) => {
            if (figure(v) === "") return null; // a long tick with no figure: the readout sits where it would be
            const t = labelAt(v);
            return (
              <text
                key={v}
                x={t.x}
                y={t.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={font}
                fontWeight={f.weight}
                fill={ink}
                style={{ fontFamily: "var(--font-race)", fontStretch: "62%", fontStyle: "italic" }}
              >
                {figure(v)}
              </text>
            );
          })}
          {unit && (
            <text x="50" y={f.unitY} textAnchor="middle" dominantBaseline="central" fontSize="4.4" letterSpacing="0.4" fill={quiet} fillOpacity={yellow ? 0.75 : 1} style={{ fontWeight: 600, textTransform: "uppercase" }}>
              {unit}
            </text>
          )}

          {/* The needle, written by the spring every frame: its trail of ghosts, a glow, the needle itself. */}
          {TRAIL.map((_, i) => (
            <line key={i} data-ghost {...needleAt} opacity={0} stroke="var(--race-red)" strokeWidth={f.needleW * 0.9} strokeLinecap="round" />
          ))}
          <line data-needle {...needleAt} stroke="var(--race-red)" strokeOpacity={0.14} strokeWidth={f.needleW * 4.2} strokeLinecap="round" />
          <line data-needle {...needleAt} stroke="var(--race-red)" strokeOpacity={0.3} strokeWidth={f.needleW * 2.3} strokeLinecap="round" />
          {yellow && <line data-needle {...needleAt} stroke="var(--race-yellow-ink)" strokeOpacity={0.85} strokeWidth={f.needleW * 1.7} strokeLinecap="round" />}
          <line data-needle {...needleAt} stroke="var(--race-red)" strokeWidth={f.needleW} strokeLinecap="round" />
          {/* The cap the needle comes out of: black, with a red ring and a lit dot. */}
          <circle cx="50" cy="50" r={f.hub} fill="var(--race-well)" stroke="var(--race-red)" strokeWidth="0.7" />
          <circle cx="50" cy="50" r={f.hub - 3} fill="var(--race-red)" />
        </svg>
        <div aria-hidden className="absolute inset-0">
          {children}
        </div>
        {/* Glass over the face: scanlines on the dark ones, and a sheen breaking where the light catches it. */}
        <div
          aria-hidden
          data-part="glass"
          className={cx(
            "pointer-events-none absolute inset-0 rounded-full",
            yellow
              ? "[background:linear-gradient(160deg,rgb(255_255_255/0.26)_0%,rgb(255_255_255/0.04)_34%,transparent_34.4%)]"
              : "[background:var(--race-scanlines),linear-gradient(160deg,rgb(255_255_255/0.12)_0%,rgb(255_255_255/0.02)_36%,transparent_36.4%)]",
          )}
        />
      </div>
    </div>
  );
}

/* --- Gauge cluster ---------------------------------------------------------- */

export type ClusterReading = {
  /** Engine speed, rpm. */
  rpm: number;
  /** Road speed, km/h. */
  speed: number;
  /** Oil temperature, °C. */
  oil: number;
  /** The gear chip: "N", "1" to "6". */
  gear: string;
};

export type ClusterHandle = {
  /** Sends any of the readings to the needles, the shift lights and the digits; `jump` puts them there at once. Writes the DOM, never React state. */
  set: (reading: Partial<ClusterReading>, jump?: boolean) => void;
};

type GaugeClusterProps = ClusterReading & {
  /** A hand took the throttle (true) by pressing and holding the cluster, or Space when it is focused, or let go of it (false). */
  onThrottle?: (held: boolean) => void;
  /** The tach passed a 1,000 rpm mark. */
  onTick?: (rpm: number, rising: boolean) => void;
  handle?: Ref<ClusterHandle>;
  className?: string;
};

const TACH_MAX = 8000;
const REDLINE = 7200;
const fmtRpm = (v: number) => `${(Math.round(v / 100) * 100).toLocaleString("en-US")} rpm`;
const fmtSpeed = (v: number) => `${Math.round(v)} km/h`;
const fmtOil = (v: number) => `${Math.round(v)} °C`;

/** The shift lights: four green, three yellow, three red; the first comes on at 5,500 rpm and the last at 7,700. */
const LEDS = [
  ...Array.from({ length: 4 }, () => ({ colour: "var(--race-green)", glow: "0 0 0.6em var(--race-green), 0 0 1.4em -0.2em var(--race-green)" })),
  ...Array.from({ length: 3 }, () => ({ colour: "var(--race-yellow)", glow: "var(--race-glow-yellow)" })),
  ...Array.from({ length: 3 }, () => ({ colour: "var(--race-red)", glow: "var(--race-glow-red)" })),
];
const LED_FROM = 5500;
const LED_STEP = 244; // rpm between lights
const LIMITER = 7980; // the model sits at 8,000 while the limiter holds it
const FLASH = 70; // ms on, ms off

export function GaugeCluster({ rpm, speed, oil, gear, onThrottle, onTick, handle, className }: GaugeClusterProps) {
  const descId = useId();
  const tach = useRef<GaugeHandle>(null);
  const speedo = useRef<GaugeHandle>(null);
  const oilGauge = useRef<GaugeHandle>(null);
  const gearRef = useRef<HTMLSpanElement>(null);
  const digitsRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const held = useRef({ pointer: null as number | null, key: false });
  const [initial] = useState({ gear, speed, lit: LEDS.filter((_, i) => rpm >= LED_FROM + i * LED_STEP).length });
  const props = useRef({ onThrottle });
  useLayoutEffect(() => {
    props.current = { onThrottle };
  });

  const writeText = (r: Partial<ClusterReading>) => {
    if (r.gear !== undefined && gearRef.current && gearRef.current.textContent !== r.gear) gearRef.current.textContent = r.gear;
    if (r.speed !== undefined && digitsRef.current) {
      const text = String(Math.round(r.speed));
      if (digitsRef.current.textContent !== text) digitsRef.current.textContent = text;
    }
  };

  /** Lights the shift LEDs for an rpm: one at a time from 5,500, and all together, flashing, at the limiter. */
  const writeLights = (rpmNow: number) => {
    const bar = barRef.current;
    if (!bar) return;
    const limiter = rpmNow >= LIMITER;
    const flashOn = limiter && (reducedMotion() || Math.floor(performance.now() / FLASH) % 2 === 0);
    [...bar.children].forEach((led, i) => {
      const on = limiter ? flashOn : rpmNow >= LED_FROM + i * LED_STEP;
      if (led.hasAttribute("data-on") !== on) led.toggleAttribute("data-on", on);
    });
  };

  useImperativeHandle(
    handle,
    () => ({
      set(r, jump = false) {
        if (r.rpm !== undefined) {
          tach.current?.set(r.rpm, jump);
          writeLights(r.rpm);
        }
        if (r.speed !== undefined) speedo.current?.set(r.speed, jump);
        if (r.oil !== undefined) oilGauge.current?.set(r.oil, jump);
        writeText(r);
      },
    }),
     
    [],
  );
  // Values set through the props reach the digits, the chip and the lights too (the needles take them through their own props).
  useLayoutEffect(() => writeText({ gear, speed }), [gear, speed]);  
  useLayoutEffect(() => writeLights(rpm), [rpm]);  

  /** The throttle is down while a pointer or the space bar is: tell the owner when that changes. */
  function hold(next: Partial<typeof held.current>) {
    const h = held.current;
    const was = h.pointer !== null || h.key;
    Object.assign(h, next);
    const now = h.pointer !== null || h.key;
    if (was !== now) props.current.onThrottle?.(now);
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || held.current.pointer !== null) return;
    e.preventDefault();
    focusQuietly(e.currentTarget);
    e.currentTarget.setPointerCapture(e.pointerId);
    play("press", { gain: 0.6 });
    hold({ pointer: e.pointerId });
  }
  function onPointerEnd(e: PointerEvent<HTMLDivElement>) {
    if (held.current.pointer !== e.pointerId) return;
    play("release", { gain: 0.5 });
    hold({ pointer: null });
  }
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== " ") return;
    e.preventDefault();
    if (e.repeat || held.current.key) return;
    play("press", { gain: 0.6 });
    hold({ key: true });
  }
  function onKeyUp(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== " " || !held.current.key) return;
    e.preventDefault();
    play("release", { gain: 0.5 });
    hold({ key: false });
  }
  function onBlur() {
    if (held.current.key) hold({ key: false });
  }

  return (
    <div
      role="group"
      tabIndex={0}
      aria-label="Instrument cluster"
      aria-describedby={descId}
      aria-keyshortcuts="Space"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onLostPointerCapture={onPointerEnd}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={onBlur}
      className={cx("@container/cluster mx-auto w-[94%] touch-none select-none rounded-[0.6em] outline-offset-2", className)}
    >
      <span id={descId} className="sr-only">
        Hold Space to rev the engine. Pressing and holding the cluster does the same. The lap takes over again two and a half seconds after you let go.
      </span>

      {/* The shift lights: ten LEDs, off until the revs come up, lit with their glow. */}
      <div ref={barRef} aria-hidden className="mb-[0.55em] flex gap-[0.3em]">
        {LEDS.map((led, i) => (
          <span
            key={i}
            data-part="light"
            data-on={i < initial.lit ? "" : undefined}
            className="h-[0.5em] flex-1 rounded-[0.12em] bg-(--race-led-off) data-[on]:bg-(--led) data-[on]:[box-shadow:var(--glow)]"
            style={{ "--led": led.colour, "--glow": led.glow } as CSSProperties}
          />
        ))}
      </div>

      {/* The cluster's own size: its type is a share of its width, so the digits and the chip scale with the faces. */}
      <div className="relative aspect-[100/46] text-[4.4cqw]">
        <Gauge
          handle={speedo}
          value={speed}
          min={0}
          max={300}
          label="Road speed"
          format={fmtSpeed}
          majorStep={50}
          figureStep={100}
          minorStep={10}
          size="small"
          sweep={[-150, 30]}
          unit="km/h"
          needle={{ stiffness: 150, damping: 20 }}
          className="absolute z-10"
          style={{ left: 0, top: "18.33%", width: "38.4%" }}
        />
        <Gauge
          handle={oilGauge}
          value={oil}
          min={60}
          max={150}
          redline={130}
          label="Oil temperature"
          format={fmtOil}
          majorStep={30}
          minorStep={10}
          size="small"
          sweep={[-30, 150]}
          unit="°C"
          needle={{ stiffness: 90, damping: 16 }}
          className="absolute z-10"
          style={{ left: "61.6%", top: "18.33%", width: "38.4%" }}
        />
        <Gauge
          handle={tach}
          value={rpm}
          min={0}
          max={TACH_MAX}
          redline={REDLINE}
          label="Engine speed"
          format={fmtRpm}
          majorStep={1000}
          minorStep={200}
          size="large"
          tone="yellow"
          figure={(v) => (v === 0 || v === TACH_MAX ? "" : String(v / 1000))}
          unit="×1000 rpm"
          needle={{ stiffness: 260, damping: 26 }}
          onMark={(mark, rising) => onTick?.(mark, rising)}
          className="absolute z-20"
          style={{ left: "26%", top: 0, width: "48%" }}
        >
          {/* Inside the tach, under the needle's cap: a black readout with the gear in a yellow chip and the road speed in huge glowing digits. */}
          <div className="absolute inset-x-0 flex justify-center" style={{ top: "64%" }}>
            <div className="flex items-center gap-[0.4em] rounded-[0.5em] bg-(--race-well) py-[0.3em] pr-[0.5em] pl-[0.4em] [box-shadow:inset_0_0_0_1px_rgb(255_255_255/0.1)]">
              <span data-part="chip" className="flex min-w-[1.3em] justify-center rounded-[0.3em] bg-(--race-yellow) px-[0.3em] py-[0.25em] text-(--race-yellow-ink)">
                <span ref={gearRef} className={cx(RACE_FIGURES, "text-[1.15em] leading-none")}>
                  {initial.gear}
                </span>
              </span>
              <span className="flex items-baseline gap-[0.25em]">
                <span ref={digitsRef} className={cx(RACE_FIGURES, "min-w-[2.1ch] text-right text-[2.3em] leading-[0.9] text-(--race-ink) [text-shadow:var(--race-glow-white)]")}>
                  {Math.round(initial.speed)}
                </span>
                <span className="text-[0.42em] font-semibold uppercase leading-none tracking-[0.08em] text-(--race-dim)">km/h</span>
              </span>
            </div>
          </div>
        </Gauge>
      </div>
    </div>
  );
}

/* --- The car ---------------------------------------------------------------- */

/*
 * A simple car, so the tach, the road speed and the gear agree. Road speed
 * per 1,000 rpm in each gear: the engine turns 8,000 rpm at 69 km/h in first
 * and 328 km/h in sixth. It accelerates by a curve that tails off toward its
 * top speed, shifts up at 7,650 rpm (first goes on to the limiter, 8,000),
 * shifts down under braking when the revs fall under 4,800 and blips the
 * throttle as it does, and launches on a clutch that holds 4,500 rpm until the
 * wheels catch up. The recorded lap and the hand's live throttle run the
 * same model, so a hand takes over from exactly where the lap was.
 */

const KMH_PER_KRPM = [0, 8.6, 14.4, 20.5, 27, 34, 41];
const IDLE = 900;
const LIMIT = 8000;
const UPSHIFT = 7650;
const OIL_REST = 84;

type Car = { v: number; gear: number; cut: number; blip: number; limit: number; rpm: number; oil: number; thr: number };
const newCar = (): Car => ({ v: 0, gear: 0, cut: 0, blip: 0, limit: 0, rpm: IDLE, oil: OIL_REST, thr: 0 });

/** Moves the car on by `dt` seconds at a throttle and a brake (each 0 to 1). */
function drive(c: Car, thr: number, brk: number, dt: number) {
  c.cut = Math.max(0, c.cut - dt);
  c.limit = Math.max(0, c.limit - dt);
  c.blip *= Math.exp(-dt / 0.12);
  if (c.gear === 0 && thr > 0.05) c.gear = 1;
  const wheelRpm = (g: number) => (g ? (c.v / KMH_PER_KRPM[g]) * 1000 : 0);

  let wheel = wheelRpm(c.gear);
  if (c.gear && wheel >= LIMIT - 10) c.limit = 0.12;
  if (c.gear && c.cut === 0) {
    if (c.gear < 6 && thr > 0.5 && wheel >= (c.gear === 1 ? LIMIT - 10 : UPSHIFT)) {
      c.gear += 1; // the tach drops to the next gear's revs
      c.cut = 0.2;
      c.blip = 0;
    } else if (c.gear > 1 && (brk > 0.2 || thr < 0.1) && wheel < (brk > 0.2 ? 4800 : 2300) && wheelRpm(c.gear - 1) < 7400) {
      c.gear -= 1; // a blip of throttle matches the revs
      c.cut = 0.1;
      c.blip = brk > 0.2 ? 1100 : 500;
    }
    wheel = wheelRpm(c.gear);
  }

  const power = c.cut > 0 || wheel >= LIMIT ? 0 : thr;
  const pull = 40 * (1 - (c.v / 300) ** 2); // km/h per second at full throttle
  const drag = (1 - thr) * (3 + 1e-4 * c.v * c.v);
  c.v = Math.max(0, c.v + (power * pull - drag - brk * 58) * dt);
  if (c.v < 0.5 && thr < 0.05) {
    c.v = 0;
    c.gear = 0;
  }

  wheel = wheelRpm(c.gear);
  const clutch = c.gear === 1 && c.v < 38 ? IDLE + thr * 3600 : IDLE;
  const want = Math.min(LIMIT, Math.max(IDLE, wheel, clutch) + c.blip);
  c.rpm += (want - c.rpm) * (1 - Math.exp(-dt / (want > c.rpm ? 0.05 : 0.1)));
  if (c.limit > 0) c.rpm = LIMIT;
  c.oil += (OIL_REST + 24 * (c.rpm / LIMIT) * (0.3 + 0.7 * thr) - c.oil) * (dt / 5);
  c.thr = thr;
}

const HZ = 120;
const LEAD = 0.3; // s at rest before the launch
const BRAKE_AT = 225; // km/h
const REST = 2.2; // s at rest after the stop, while the oil cools

type Sample = { v: number; rpm: number; oil: number; thr: number; gear: number; limit: boolean };

/** The recorded lap: launch, five gears to 225 km/h, a hard stop down through the gears, a rest. The second pass is kept, so the oil closes the loop. */
function recordLap() {
  const car = newCar();
  const lap = { v: [] as number[], rpm: [] as number[], oil: [] as number[], thr: [] as number[], gear: [] as number[], limit: [] as number[] };
  for (let pass = 0; pass < 2; pass++) {
    let phase = 0;
    let thr = 0;
    let brk = 0;
    let stopped = 0;
    for (let i = 0; i < 60 * HZ; i++) {
      const t = i / HZ;
      if (phase === 0 && t >= LEAD) phase = 1;
      if (phase === 1) {
        thr = Math.min(1, thr + 6 / HZ);
        if (car.v >= BRAKE_AT) phase = 2;
      }
      if (phase === 2) {
        thr = 0;
        brk = Math.min(1, brk + 10 / HZ);
        if (car.v <= 0) {
          phase = 3;
          brk = 0;
          stopped = t;
        }
      }
      if (phase === 3 && t >= stopped + REST) break;
      drive(car, thr, brk, 1 / HZ);
      if (pass === 1) {
        lap.v.push(car.v);
        lap.rpm.push(car.rpm);
        lap.oil.push(car.oil);
        lap.thr.push(car.thr);
        lap.gear.push(car.gear);
        lap.limit.push(car.limit > 0 ? 1 : 0);
      }
    }
  }
  return lap;
}

const LAP = recordLap();
const LAP_LENGTH = (LAP.v.length - 1) / HZ; // s

/** The lap at `t` seconds, interpolated, written into `out`. */
function lapAt(t: number, out: Sample) {
  const x = clamp(t, 0, LAP_LENGTH) * HZ;
  const i = Math.min(LAP.v.length - 2, Math.floor(x));
  const f = x - i;
  const mix = (a: number[]) => a[i] + (a[i + 1] - a[i]) * f;
  out.v = mix(LAP.v);
  out.rpm = mix(LAP.rpm);
  out.oil = mix(LAP.oil);
  out.thr = mix(LAP.thr);
  out.gear = LAP.gear[f < 0.5 ? i : i + 1];
  out.limit = LAP.limit[i] + LAP.limit[i + 1] > 0;
}

/* --- Demo: a cluster that runs a recorded lap and gives the throttle to a hand ---------- */

type Mode = "read" | "touch" | "off";

const HAND_BACK = 2500; // ms after the hand lets go before the lap takes the needles back
const POWER_UP = [
  { key: "rpm", up: 0, down: 440, full: TACH_MAX, rest: IDLE },
  { key: "speed", up: 120, down: 560, full: 300, rest: 0 },
  { key: "oil", up: 240, down: 680, full: 150, rest: OIL_REST },
] as const;
const LAP_STARTS = 1000; // ms after mount
const THROTTLE_UP = 4; // per second under a hand
const THROTTLE_DOWN = 6;
const STEP = 1 / 120;

const gearName = (g: number) => (g ? String(g) : "N");


export default function Demo() {
  const rootRef = useRef<HTMLDivElement>(null);
  const clusterRef = useRef<ClusterHandle>(null);
  const throttleRef = useRef<HTMLSpanElement>(null);
  const touched = useRef(false); // a hand has worked it: it may sound while the host is paused
  const hand = useRef<(held: boolean) => void>(null);
  const [mode, setMode] = useState<Mode>("off");
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    const root = rootRef.current!;
    const cluster = clusterRef.current!;
    const reduced = reducedMotion();
    const voice = engine({ redline: LIMIT });
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (fn: () => void, ms: number) => {
      const id = setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
      return id;
    };

    const live = newCar(); // the car under a hand
    const out: Sample = { v: 0, rpm: IDLE, oil: OIL_REST, thr: 0, gear: 0, limit: false };
    let mode: Mode = "off";
    let began = false;
    let lapStart = -1; // on the frame clock; -1 until the lap starts
    let touching = false; // the hand has the throttle, down or in its two and a half seconds
    let pressed = false; // and it is down now
    let backId: ReturnType<typeof setTimeout> | undefined;
    let raf = 0;
    let last = 0;
    let onScreen = true;
    let shownThrottle = -1;
    let lastGear = 0;
    let gearId: ReturnType<typeof setTimeout> | undefined;
    let cutNow: boolean | undefined;
    let levelNow = -1;

    /** The engine follows what draws the tach. Automation under a paused tape runs it silent; a hand always sounds. */
    const sound = (rpm: number, load: number, cut: boolean) => {
      const level = touched.current || hostTransport(root) === "play" ? 1 : 0;
      if (level !== levelNow) voice.level((levelNow = level));
      voice.set(rpm, load);
      if (cut !== cutNow) voice.cut((cutNow = cut));
    };

    const enter = (next: Mode) => {
      if (next === mode) return;
      const was = mode;
      mode = next;
      setMode(next);
      if (next === "touch") setAnnouncement("Throttle: touch");
      else if (was === "touch") setAnnouncement(next === "read" ? "Throttle: back on automation" : "Throttle: released");
    };

    const paint = (s: Sample) => {
      cluster.set({ rpm: s.rpm, speed: s.v, oil: s.oil, gear: gearName(s.gear) }, reduced);
      const pct = Math.round(s.thr * 100);
      if (pct !== shownThrottle && throttleRef.current) {
        shownThrottle = pct;
        throttleRef.current.textContent = String(pct);
      }
      sound(s.rpm, s.thr, s.limit);
    };

    const idle = () => {
      Object.assign(out, { v: 0, rpm: IDLE, oil: OIL_REST, thr: 0, gear: 0, limit: false });
      paint(out);
    };

    const frame = (now: number) => {
      raf = 0;
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 1 / 60);
      last = now;
      if (touching) {
        // The hand's throttle ramps like a foot; the car runs in small fixed steps.
        live.thr = pressed ? Math.min(1, live.thr + THROTTLE_UP * dt) : Math.max(0, live.thr - THROTTLE_DOWN * dt);
        for (let left = dt; left > 0; left -= STEP) drive(live, live.thr, 0, Math.min(STEP, left));
        Object.assign(out, { v: live.v, rpm: live.rpm, oil: live.oil, thr: live.thr, gear: live.gear, limit: live.limit > 0 });
        // Only a hand-driven shift is announced, once the gear has stayed put a moment.
        if (live.gear !== lastGear) {
          lastGear = live.gear;
          clearTimeout(gearId);
          gearId = later(() => setAnnouncement(lastGear ? `Gear ${lastGear}` : "Neutral"), 700);
        }
      } else if (lapStart >= 0) {
        lapAt((Math.max(0, now - lapStart) / 1000) % LAP_LENGTH, out);
      } else return;
      paint(out);
      if (onScreen) raf = requestAnimationFrame(frame);
    };
    const run = () => {
      if (raf || !onScreen) return;
      last = 0;
      raf = requestAnimationFrame(frame);
    };

    const handBack = () => {
      touching = false;
      if (lapStart >= 0) {
        enter("read");
        run();
      } else {
        enter("off");
        idle();
      }
    };

    // A hand on the cluster: it takes the throttle from the lap as it stands, and the lap takes the needles back after it lets go.
    hand.current = (held) => {
      touched.current = true;
      clearTimeout(backId);
      pressed = held;
      if (held) {
        if (!touching) {
          if (lapStart >= 0) lapAt((Math.max(0, performance.now() - lapStart) / 1000) % LAP_LENGTH, out);
          else idle();
          Object.assign(live, newCar(), { v: out.v, gear: out.gear, rpm: out.rpm, oil: out.oil, thr: 0 });
          lastGear = out.gear;
          touching = true;
          enter("touch");
        }
        run();
      } else if (touching) backId = later(handBack, HAND_BACK);
    };

    // Power-up: each needle swings to the end stop and back, 120 ms behind the one before, and the engine blips with the tach; then the lap.
    const begin = () => {
      if (began || hostTransport(root) === "stop") return;
      began = true;
      if (reduced) return;
      enter("read");
      sound(IDLE, 0, false);
      for (const { key, up, down, full, rest } of POWER_UP) {
        later(() => {
          if (touching) return;
          cluster.set({ [key]: full });
          if (key === "rpm") sound(LIMIT * 0.92, 0.9, false);
        }, up);
        later(() => {
          if (touching) return;
          cluster.set({ [key]: rest });
          if (key === "rpm") sound(IDLE, 0, false);
        }, down);
      }
      later(() => {
        lapStart = performance.now();
        run();
      }, LAP_STARTS);
    };
    later(begin, 0);

    // A tape that was stopped and plays again starts the show.
    const host = root.closest("[data-transport]");
    const observer = new MutationObserver(begin);
    if (host) observer.observe(host, { attributes: true, attributeFilter: ["data-transport"] });
    // Off screen, the loop waits, and so does the engine.
    const visible = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      if (onScreen) run();
      else {
        cancelAnimationFrame(raf);
        raf = 0;
        voice.set(0, 0);
        voice.cut(false);
        cutNow = false;
      }
    });
    visible.observe(root);

    return () => {
      timers.forEach(clearTimeout);
      observer.disconnect();
      visible.disconnect();
      cancelAnimationFrame(raf);
      voice.stop();
      hand.current = null;
    };
  }, []);

  return (
    <div
      ref={rootRef}
      onPointerDownCapture={() => (touched.current = true)}
      onKeyDownCapture={() => (touched.current = true)}
      className="@container w-full max-w-[500px] select-none"
    >
      <div data-part="plate" className="relative isolate animate-enter overflow-hidden rounded-[0.9em] p-[0.8em] pt-[1em] text-[clamp(11px,4cqw,14px)] [background:var(--race-body)] [box-shadow:var(--race-edge),var(--race-shadow)] @[26rem]:p-[1em] @[26rem]:pt-[1.2em]">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 rounded-[inherit] [background:var(--race-weave)]" />
        {/* Two rules along the top edge: yellow, then red. */}
        <span aria-hidden className="absolute top-0 left-[1.2em] h-[2px] w-[4em] bg-(--race-yellow) [box-shadow:var(--race-glow-yellow)]" />
        <span aria-hidden className="absolute top-0 left-[5.5em] h-[2px] w-[1.2em] bg-(--race-red) [box-shadow:var(--race-glow-red)]" />

        <div data-part="well" className="rounded-[0.6em] bg-(--race-well) px-[0.6em] pt-[0.6em] pb-[0.75em] [box-shadow:var(--race-recess)]">
          <GaugeCluster handle={clusterRef} rpm={IDLE} speed={0} oil={OIL_REST} gear="N" onThrottle={(held) => hand.current?.(held)} />
        </div>

        {/* The automation: a light for the hand, the mode and the throttle. */}
        <div className="mt-[0.6em] flex items-center gap-[0.6em]">
          <span
            data-part="light"
            aria-hidden
            className={cx(
              "size-[0.7em] shrink-0 rounded-full transition-[background-color,box-shadow] duration-(--duration-exit)",
              mode === "touch" ? "bg-(--race-yellow) [box-shadow:var(--race-glow-yellow)] duration-0" : mode === "read" ? "bg-(--race-dim)" : "bg-(--race-led-off)",
            )}
          />
          <span
            aria-hidden
            data-part="lcd"
            className="relative flex h-[2.4em] min-w-0 flex-1 items-center justify-between gap-[0.5em] overflow-hidden rounded-[0.5em] px-[0.6em] text-(--race-ink) [background:var(--race-glass)] [box-shadow:inset_0_0_0_1px_rgb(255_255_255/0.08)]"
          >
            <span data-part="chip" className={cx("relative inline-flex shrink-0 items-center gap-[0.35em] rounded-[0.3em] px-[0.5em] py-[0.26em]", mode === "touch" ? "bg-(--race-yellow) text-(--race-yellow-ink)" : "bg-(--race-faint) text-(--race-ink)")}>
              <span
                className={cx(
                  "size-[0.5em] rounded-full",
                  mode === "touch" ? "bg-(--race-yellow-ink)" : mode === "read" ? "animate-pulse bg-(--race-red) motion-reduce:animate-none" : "rounded-[1px] bg-current",
                )}
              />
              <span className="text-[0.62em] font-semibold uppercase leading-none tracking-[0.1em]">
                {mode === "touch" ? "Touch" : mode === "read" ? "Auto · Read" : "Auto · Off"}
              </span>
            </span>
            <span className="relative flex min-w-0 items-baseline gap-[0.35em] truncate leading-none">
              <span className="hidden text-[0.58em] font-semibold uppercase tracking-[0.12em] text-(--race-dim) @[26rem]:inline">Throttle</span>
              <span ref={throttleRef} className={cx(RACE_FIGURES, "text-[1.35em] text-(--race-ink)")}>
                0
              </span>
              <span className="text-[0.58em] font-semibold text-(--race-dim)">%</span>
            </span>
            <span aria-hidden data-part="glass" className="pointer-events-none absolute inset-0 [background:var(--race-scanlines)]" />
          </span>
          <span data-part="lettering" className="shrink-0 whitespace-nowrap text-[0.62em] font-semibold uppercase leading-none tracking-[0.14em] text-(--race-dim)">
            Hold to rev
          </span>
        </div>
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
