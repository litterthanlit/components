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
import { hostTransport, play } from "@/lib/sound";

/*
 * A radial gauge after an instrument cluster's: black glass in a polished
 * bezel, figures in light type, a red zone at the end of the scale and a red
 * needle that comes out of a cap at the centre. The cluster sets three of
 * them in a well, the large one in the middle with the two smaller tucked
 * partly behind it, lower and to either side.
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
 * it lets go the lap takes the needles back. The tach ticks for each 1,000 rpm
 * it passes, higher as the revs climb, and bumps on the limiter.
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
  large: { major: 6.5, minor: 3.2, majorW: 1.5, minorW: 0.8, label: 26, font: 13, weight: 500, tip: 39, tail: 9, needleW: 1.8, hub: 5.8, unitY: 36 },
  small: { major: 5.5, minor: 2.8, majorW: 1.6, minorW: 0.9, label: 29, font: 9.5, weight: 500, tip: 39, tail: 7, needleW: 1.5, hub: 4.8, unitY: 70 },
} as const;
const TICK_OUT = 41;
const PIN = 1.04; // the needle may press a little past the end stop

const bezel =
  "shadow-[0_1px_0_rgb(255_255_255/0.7),inset_0_1px_2px_rgb(0_0_0/0.6),inset_0_0_0_1px_rgb(255_255_255/0.08)] dark:shadow-[0_1px_0_rgb(255_255_255/0.06),inset_0_1px_2px_rgb(0_0_0/0.6),inset_0_0_0_1px_rgb(255_255_255/0.08)]";
/** The large face stands proud of the two behind it: a soft shadow falls on them. */
const bezelLarge =
  "shadow-[0_1px_0_rgb(255_255_255/0.7),inset_0_1px_2px_rgb(0_0_0/0.6),inset_0_0_0_1px_rgb(255_255_255/0.1),0_0.2em_1em_0.1em_rgb(0_0_0/0.55)] dark:shadow-[0_1px_0_rgb(255_255_255/0.06),inset_0_1px_2px_rgb(0_0_0/0.6),inset_0_0_0_1px_rgb(255_255_255/0.1),0_0.2em_1em_0.1em_rgb(0_0_0/0.7)]";

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
  // What the spring and the handle read when they fire, rather than when they were made.
  const props = useRef({ min, max, sweep, majorStep, format, onMark, needle });
  useLayoutEffect(() => {
    props.current = { min, max, sweep, majorStep, format, onMark, needle };
  });

  const angleOf = (v: number, p: { min: number; max: number; sweep: readonly [number, number] }) =>
    p.sweep[0] + clamp((v - p.min) / (p.max - p.min), 0, PIN) * (p.sweep[1] - p.sweep[0]);

  // The spring runs in degrees and draws the needle; a long tick passing under it is reported from here.
  useLayoutEffect(() => {
    const lines = [...rootRef.current!.querySelectorAll<SVGLineElement>("[data-needle]")];
    const start = props.current;
    const marks = Math.floor((start.max - start.min) / start.majorStep + 1e-6);
    const bandOf = (deg: number, p: typeof start) =>
      clamp(Math.floor(((deg - p.sweep[0]) / (p.sweep[1] - p.sweep[0])) * ((p.max - p.min) / p.majorStep) + 1e-6), 0, marks - 1);
    let band = bandOf(angleOf(initial, start), start);
    const s = createSpring(angleOf(initial, start), props.current.needle, (deg) => {
      const tip = polar(deg, f.tip);
      const tail = polar(deg + 180, f.tail);
      for (const line of lines) {
        line.setAttribute("x1", String(tail.x));
        line.setAttribute("y1", String(tail.y));
        line.setAttribute("x2", String(tip.x));
        line.setAttribute("y2", String(tip.y));
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
    const w = figure(v).length * font * 0.6;
    const reach = (Math.abs(Math.sin(rad)) * w + Math.abs(Math.cos(rad)) * font * 0.75) / 2;
    return polar(deg, TICK_OUT - f.major - 2.2 - reach);
  };
  const tip = polar(angleOf(initial, { min, max, sweep }), f.tip);
  const tail = polar(angleOf(initial, { min, max, sweep }) + 180, f.tail);
  const needleAt = { x1: tail.x, y1: tail.y, x2: tip.x, y2: tip.y };

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
      className={cx("aspect-square overflow-hidden rounded-full bg-(--device-rim) p-[5%]", size === "large" ? bezelLarge : bezel, className)}
      style={style}
    >
      <div data-part="face" className="relative size-full overflow-hidden rounded-full [background:var(--device-window)] shadow-(--device-window-edge)">
        <svg aria-hidden viewBox="0 0 100 100" className="absolute inset-0 size-full" style={{ fontVariantNumeric: "tabular-nums" }}>
          <circle cx="50" cy="50" r="48.4" fill="none" stroke="rgb(255 255 255 / 0.07)" strokeWidth="0.5" />
          {/* The red block at the end of the scale, outside the ticks. */}
          {redline !== undefined && <path d={arcPath(angle(redline), angle(max), 44.4)} fill="none" stroke="var(--device-rec)" strokeWidth="4" />}
          <path d={arcPath(angle(min), angle(redline ?? max), 41.8)} fill="none" stroke="rgb(255 255 255 / 0.22)" strokeWidth="0.5" />
          {ticks.map(({ v, major }) => {
            const deg = angle(v);
            const a = polar(deg, TICK_OUT);
            const b = polar(deg, TICK_OUT - (major ? f.major : f.minor));
            return <line key={v} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={major ? "var(--device-lcd-ink)" : "var(--device-lcd-dim)"} strokeWidth={major ? f.majorW : f.minorW} />;
          })}
          {figures.map((v) => {
            const t = labelAt(v);
            return (
              <text key={v} x={t.x} y={t.y} textAnchor="middle" dominantBaseline="central" fontSize={font} fontWeight={f.weight} fill="var(--device-lcd-ink)">
                {figure(v)}
              </text>
            );
          })}
          {unit && (
            <text x="50" y={f.unitY} textAnchor="middle" dominantBaseline="central" fontSize="4.6" letterSpacing="0.3" fill="var(--device-lcd-dim)">
              {unit}
            </text>
          )}

          {/* The needle, written by the spring every frame: a shadow under it, then the needle. */}
          <line data-needle {...needleAt} stroke="rgb(0 0 0 / 0.55)" strokeWidth={f.needleW} strokeLinecap="round" style={{ translate: "1px 1.6px" }} />
          <line data-needle {...needleAt} stroke="var(--device-rec)" strokeWidth={f.needleW} strokeLinecap="round" />
          {/* The cap the needle comes out of. */}
          <circle cx="50" cy="50" r={f.hub} fill="var(--device-rim)" stroke="rgb(255 255 255 / 0.22)" strokeWidth="0.6" />
          <circle cx="50" cy="50" r={f.hub - 2.2} fill="rgb(255 255 255 / 0.07)" />
        </svg>
        <div aria-hidden className="absolute inset-0">
          {children}
        </div>
        {/* Glass over the face, breaking where the light catches it. */}
        <div aria-hidden data-part="glass" className="pointer-events-none absolute inset-0 rounded-full [background:linear-gradient(160deg,rgb(255_255_255/0.16)_0%,rgb(255_255_255/0.03)_36%,transparent_36.4%)]" />
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
  /** Sends any of the readings to the needles and the digits; `jump` puts them there at once. Writes the DOM, never React state. */
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

export function GaugeCluster({ rpm, speed, oil, gear, onThrottle, onTick, handle, className }: GaugeClusterProps) {
  const descId = useId();
  const tach = useRef<GaugeHandle>(null);
  const speedo = useRef<GaugeHandle>(null);
  const oilGauge = useRef<GaugeHandle>(null);
  const gearRef = useRef<HTMLSpanElement>(null);
  const digitsRef = useRef<HTMLSpanElement>(null);
  const held = useRef({ pointer: null as number | null, key: false });
  const [initial] = useState({ gear, speed });
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

  useImperativeHandle(
    handle,
    () => ({
      set(r, jump = false) {
        if (r.rpm !== undefined) tach.current?.set(r.rpm, jump);
        if (r.speed !== undefined) speedo.current?.set(r.speed, jump);
        if (r.oil !== undefined) oilGauge.current?.set(r.oil, jump);
        writeText(r);
      },
    }),
     
    [],
  );
  // Values set through the props reach the digits and the chip too (the needles take them through their own props).
  useLayoutEffect(() => writeText({ gear, speed }), [gear, speed]);  

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
      className={cx("@container/cluster touch-none select-none rounded-[0.7em] outline-offset-2", className)}
    >
      <span id={descId} className="sr-only">
        Hold Space to rev the engine. Pressing and holding the cluster does the same. The lap takes over again two and a half seconds after you let go.
      </span>

      {/* The cluster's own size: its type is a share of its width, so the digits and the chip scale with the faces. */}
      <div className="relative aspect-[100/48] text-[4.4cqw]">
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
          figure={(v) => String(v / 1000)}
          unit="×1000 rpm"
          needle={{ stiffness: 260, damping: 26 }}
          onMark={(mark, rising) => onTick?.(mark, rising)}
          className="absolute z-20"
          style={{ left: "26%", top: 0, width: "48%" }}
        >
          {/* Inside the tach, under the needle's cap: the gear in a chip, and the road speed in digits. */}
          <div className="absolute inset-x-0 flex flex-col items-center" style={{ top: "57%", gap: "0.35em" }}>
            <span data-part="chip" className="flex min-w-[1.6em] justify-center rounded-[0.4em] bg-white px-[0.5em] py-[0.2em] text-black">
              <span ref={gearRef} className="text-[0.9em] font-semibold uppercase leading-none tabular-nums">
                {initial.gear}
              </span>
            </span>
            <span className="flex items-baseline justify-center gap-[0.3em] tabular-nums">
              <span ref={digitsRef} className="min-w-[3ch] text-right text-[1.35em] font-light leading-none tracking-[-0.03em] text-(--device-lcd-ink)">
                {Math.round(initial.speed)}
              </span>
              <span className="text-[0.5em] leading-none text-(--device-lcd-dim)">km/h</span>
            </span>
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

  // The cluster's tach ticks for each 1,000 rpm that passes, higher as the revs climb.
  const tick = (rpm: number) => {
    if (touched.current || hostTransport(rootRef.current) === "play") play("tick", { gain: 0.3, pitch: 0.9 + (rpm / TACH_MAX) * 0.3 });
  };

  useEffect(() => {
    const root = rootRef.current!;
    const cluster = clusterRef.current!;
    const reduced = reducedMotion();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (fn: () => void, ms: number) => {
      const id = setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
      return id;
    };
    const quietly = (name: "bump", options: { gain: number }) => {
      if (touched.current || hostTransport(root) === "play") play(name, options);
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
    let armed = true; // the limiter bumps once per visit
    let shownThrottle = -1;
    let lastGear = 0;
    let gearId: ReturnType<typeof setTimeout> | undefined;

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
      if (s.limit && armed) {
        armed = false;
        quietly("bump", { gain: 0.5 });
      } else if (!s.limit && s.rpm < 7000) armed = true;
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

    // Power-up: each needle swings to the end stop and back, 120 ms behind the one before; then the lap.
    const begin = () => {
      if (began || hostTransport(root) === "stop") return;
      began = true;
      if (reduced) return;
      enter("read");
      for (const { key, up, down, full, rest } of POWER_UP) {
        later(() => !touching && cluster.set({ [key]: full }), up);
        later(() => !touching && cluster.set({ [key]: rest }), down);
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
    // Off screen, the loop waits.
    const visible = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      if (onScreen) run();
      else {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    });
    visible.observe(root);

    return () => {
      timers.forEach(clearTimeout);
      observer.disconnect();
      visible.disconnect();
      cancelAnimationFrame(raf);
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
      <div data-part="plate" className="relative isolate animate-enter overflow-hidden rounded-[1.25em] p-[0.9em] text-[clamp(11px,4cqw,14px)] [background:var(--device-body)] shadow-[var(--device-body-edge),0_1px_2px_rgb(0_0_0/0.06),0_16px_32px_-18px_rgb(0_0_0/0.3)] @[26rem]:p-[1.1em]">
        <div aria-hidden className="device-grain pointer-events-none absolute inset-0 -z-10 rounded-[inherit]" />

        <div data-part="well" className="rounded-[1.05em] bg-(--device-well) p-[0.55em] shadow-(--device-recess)">
          <GaugeCluster handle={clusterRef} rpm={IDLE} speed={0} oil={OIL_REST} gear="N" onTick={tick} onThrottle={(held) => hand.current?.(held)} />
        </div>

        {/* The automation: a light for the hand, the mode and the throttle. */}
        <div className="mt-[0.7em] flex items-center gap-[0.6em]">
          <span aria-hidden className="grid size-[1.1em] shrink-0 place-items-center rounded-full bg-black/[0.05] shadow-(--device-recess)">
            <span
              data-part="light"
              className={cx(
                "size-[0.5em] rounded-full transition-[background-color,box-shadow] duration-(--duration-exit)",
                mode === "touch" ? "bg-(--device-hold) shadow-[0_0_0.45em_var(--device-hold)] duration-0" : mode === "read" ? "bg-(--device-meter-on)" : "bg-(--device-meter-off)",
              )}
            />
          </span>
          <span
            aria-hidden
            data-part="lcd"
            className="flex h-[2.3em] min-w-0 flex-1 items-center justify-between gap-[0.5em] overflow-hidden rounded-[0.7em] px-[0.6em] text-(--device-lcd-ink) [background:var(--device-lcd)] shadow-(--device-lcd-edge)"
          >
            <span data-part="chip" className="inline-flex shrink-0 items-center gap-[0.35em] rounded-[0.4em] bg-white px-[0.42em] py-[0.24em] text-black">
              <span
                className={cx(
                  "size-[0.55em] rounded-full",
                  mode === "touch" ? "bg-(--device-hold)" : mode === "read" ? "animate-pulse bg-(--device-rec)" : "rounded-[1px] bg-current",
                )}
              />
              <span className="text-[0.58em] font-semibold uppercase leading-none tracking-[0.02em]">
                {mode === "touch" ? "Touch" : mode === "read" ? "Auto · Read" : "Auto · Off"}
              </span>
            </span>
            <span className="min-w-0 truncate text-[0.72em] leading-none tabular-nums text-(--device-lcd-dim)">
              <span className="hidden @[26rem]:inline">Throttle </span>
              <span ref={throttleRef} className="text-(--device-lcd-ink)">
                0
              </span>{" "}
              %
            </span>
          </span>
          <span data-part="lettering" className="shrink-0 whitespace-nowrap text-[0.62em] font-semibold uppercase leading-none tracking-[0.14em] text-(--device-label-quiet) [text-shadow:var(--device-engrave)]">
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
