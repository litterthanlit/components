"use client";

import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { createSpring, springs, type Spring } from "@/design-system";
import { play } from "@/lib/sound";

/*
 * A detented rotary control after a mixing desk's: a knurled cap seated in a
 * collar, a ring of fifteen lights around it and its value on a small LCD.
 * Every detent clicks.
 *
 * Values set from outside (recalling a scene) travel on the motor, a spring,
 * and click through each detent they pass; values set by hand follow the hand.
 * One update drives the cap, the lights, the LCD and the clicks, so what you
 * hear always matches what you see. Turning writes CSS variables, never React
 * state, and the cap turns by its gradients, not a transform.
 *
 * Drag up or right to turn it up (Shift for fine), scroll over it, or use the
 * arrow keys, Page Up and Down, Home and End.
 */

const SWEEP = 270; // degrees from the lowest detent to the highest
const SEGMENTS = 15;
const PX_PER_DETENT = 6;

type KnobProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  /** Clicks from min to max. */
  detents?: number;
  /** "log" spaces detents evenly by ratio, for frequencies. */
  taper?: "linear" | "log";
  /** Light the ring from the centre, for controls that cut and boost. */
  bipolar?: boolean;
  format?: (value: number) => string;
  /** The motor has brought the knob to a value set from outside. */
  onSettle?: () => void;
  className?: string;
};

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");

/** The ring's lights, drawn as short strokes around the cap from -135° to +135°. */
const segments = Array.from({ length: SEGMENTS }, (_, i) => {
  const a = ((-SWEEP / 2 + (i * SWEEP) / (SEGMENTS - 1) - 90) * Math.PI) / 180;
  const p = (r: number) => `${(50 + r * Math.cos(a)).toFixed(2)} ${(50 + r * Math.sin(a)).toFixed(2)}`;
  return `M${p(42.5)}L${p(47.5)}`;
});

export function Knob({ label, value, onChange, min, max, detents = 24, taper = "linear", bipolar = false, format = String, onSettle, className }: KnobProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const readoutRef = useRef<HTMLSpanElement>(null);
  const spring = useRef<Spring | null>(null);
  const index = useRef(-1); // the detent the knob is on, ahead of the render that confirms it
  const target = useRef(0); // degrees the motor is heading for
  const moving = useRef(false); // the motor is running toward a value set from outside
  const byHand = useRef<number | null>(null); // a value the hand set: follow it, don't motor to it
  const drag = useRef<{ id: number; x: number; y: number; from: number } | null>(null);
  // Props the spring and the wheel read when they fire, rather than when they were made.
  const props = useRef({ onChange, onSettle, format, min, max, detents, taper, bipolar });
  useLayoutEffect(() => {
    props.current = { onChange, onSettle, format, min, max, detents, taper, bipolar };
  });

  // The spring runs in degrees of travel and draws everything that turns: the cap, the lights, the
  // LCD. It clicks once per detent it passes, so the motor and the hand sound the same.
  useLayoutEffect(() => {
    const root = rootRef.current!;
    const lights = [...root.querySelectorAll<SVGPathElement>("[data-segment]")];
    const centre = (SEGMENTS - 1) / 2;
    let shown = -1;
    const s = createSpring(0, springs.gentle, (deg) => {
      const { detents, bipolar, format } = props.current;
      root.style.setProperty("--a", `${(deg - SWEEP / 2).toFixed(2)}deg`);
      const f = deg / SWEEP;
      const at = f * (SEGMENTS - 1);
      lights.forEach((light, i) => {
        const on = bipolar ? (at >= centre ? i >= centre && i <= at + 0.5 : i <= centre && i >= at - 0.5) : f > 0 && i <= at + 0.5;
        if (on) light.dataset.on = "";
        else delete light.dataset.on;
      });
      const detent = Math.round(f * detents);
      if (detent !== shown) {
        if (shown !== -1) play("tick", { gain: 0.55, pitch: 0.9 + (detent / detents) * 0.25 });
        shown = detent;
        if (readoutRef.current) readoutRef.current.textContent = format(valueAt(detent, props.current));
      }
      if (moving.current && deg === target.current) {
        moving.current = false;
        props.current.onSettle?.();
      }
    });
    spring.current = s;
    return () => s.stop();
  }, []);

  // A new value: the hand's lands at once, anyone else's travels on the motor.
  useLayoutEffect(() => {
    const s = spring.current!;
    const first = index.current === -1;
    const i = indexOf(value, props.current);
    index.current = i;
    target.current = (i / props.current.detents) * SWEEP;
    if (first || byHand.current === value || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      moving.current = false;
      s.jump(target.current);
    } else {
      moving.current = true;
      s.set(target.current);
    }
    byHand.current = null;
  }, [value]);

  /** Moves to detent `i`; `hand` lands it at once instead of on the motor. */
  function turnTo(i: number, hand: boolean) {
    const next = Math.min(detents, Math.max(0, i));
    if (next === index.current) return play("bump", { gain: 0.5 });
    index.current = next;
    const v = valueAt(next, props.current);
    if (hand) byHand.current = v;
    onChange(v);
  }

  // Scrolling over the knob turns it; the listener is native so it can keep the page from scrolling.
  const wheel = useEffectEvent((up: boolean) => turnTo(index.current + (up ? 1 : -1), true));
  useEffect(() => {
    const el = rootRef.current!;
    let acc = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      acc -= e.deltaY;
      if (Math.abs(acc) < 30) return;
      wheel(acc > 0);
      acc = 0;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const page = Math.max(1, Math.round(detents / 10));
    const delta = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: page, PageDown: -page }[e.key];
    if (delta) turnTo(index.current + delta, false);
    else if (e.key === "Home") turnTo(0, false);
    else if (e.key === "End") turnTo(detents, false);
    else return;
    e.preventDefault();
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, from: index.current };
    play("press", { gain: 0.6 });
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    // Up or right turns it up. Shift is fine control: three times the travel per detent.
    const travel = e.clientX - d.x - (e.clientY - d.y);
    const next = Math.min(detents, Math.max(0, d.from + Math.round(travel / (PX_PER_DETENT * (e.shiftKey ? 3 : 1)))));
    if (next !== index.current) turnTo(next, true);
  }
  function onPointerEnd(e: PointerEvent<HTMLDivElement>) {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    play("release", { gain: 0.6 });
  }

  return (
    <div className={cx("flex flex-col items-center gap-[0.55em]", className)}>
      <div
        ref={rootRef}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-orientation="vertical"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={format(value)}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        className="relative size-[5.6em] cursor-ns-resize touch-none rounded-full outline-offset-2"
        style={{ "--a": `${-SWEEP / 2}deg` } as CSSProperties}
      >
        {/* The ring of lights. */}
        <svg aria-hidden viewBox="0 0 100 100" className="absolute inset-0 size-full">
          {segments.map((d, i) => (
            <path
              key={i}
              data-segment
              d={d}
              strokeWidth="3.4"
              strokeLinecap="round"
              className="stroke-(--device-meter-off) transition-[stroke] duration-75 data-on:stroke-(--device-meter-on)"
            />
          ))}
        </svg>

        {/* The collar, pressed into the plate, and the cap seated in it. */}
        <div aria-hidden className="absolute inset-[15%] rounded-full bg-black/[0.035] p-[5%] shadow-(--device-recess) dark:bg-black/30">
          <div className="relative size-full rounded-full [background:var(--device-wheel-face)] shadow-(--device-wheel-shadow)">
            {/* Knurling round the skirt: it turns with the cap. */}
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: "repeating-conic-gradient(from var(--a), var(--device-meter-off) 0 1.6deg, transparent 1.6deg 7.5deg)",
                mask: "radial-gradient(circle closest-side, transparent 72%, #000 74%, #000 97%, transparent 100%)",
              }}
            />
            {/* The turned top, and its pointer. */}
            <div className="absolute inset-[15%] rounded-full [background:var(--device-wheel-face)] shadow-[0_0_0_1px_rgb(0_0_0/0.06),inset_0_1px_0_rgb(255_255_255/0.9)] dark:shadow-[0_0_0_1px_rgb(0_0_0/0.5),inset_0_1px_0_rgb(255_255_255/0.08)]" />
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: "conic-gradient(from calc(var(--a) - 3.5deg), var(--device-key-ink) 0 7deg, transparent 7deg)",
                mask: "radial-gradient(circle closest-side, transparent 30%, #000 31.5%, #000 64%, transparent 65.5%)",
              }}
            />
          </div>
        </div>
      </div>

      {/* The LCD: the spring writes it, so it counts through the detents with the clicks. */}
      <span
        ref={readoutRef}
        aria-hidden
        className="min-h-[1.6em] min-w-[5.6em] rounded-[0.45em] px-[0.5em] py-[0.3em] text-center text-[0.74em] leading-none tabular-nums text-(--device-lcd-ink) [background:var(--device-lcd)] shadow-(--device-lcd-edge)"
      />
      <span aria-hidden className="text-[0.6em] font-semibold uppercase leading-none tracking-[0.16em] text-(--device-label) [text-shadow:var(--device-engrave)]">
        {label}
      </span>
    </div>
  );
}

type Scale = Pick<KnobProps, "min" | "max" | "detents" | "taper">;

/** The detent nearest to a value. */
function indexOf(v: number, { min, max, detents = 24, taper }: Scale) {
  const f = taper === "log" ? Math.log(v / min) / Math.log(max / min) : (v - min) / (max - min);
  return Math.round(Math.min(1, Math.max(0, f)) * detents);
}

/** A detent's value, clean of float dust (2339.9999 → 2340). */
function valueAt(i: number, { min, max, detents = 24, taper }: Scale) {
  const v = taper === "log" ? min * Math.pow(max / min, i / detents) : min + ((max - min) * i) / detents;
  return Math.round(v * 100) / 100;
}

/* --- Demo: a channel strip that recalls scenes on its motors ---------------- */

type Param = "gain" | "tone" | "mix";
type Scene = "A" | "B";

const PARAMS: { key: Param; label: string; min: number; max: number; detents: number; taper?: "log"; bipolar?: boolean; format: (v: number) => string }[] = [
  { key: "gain", label: "Gain", min: -12, max: 12, detents: 24, bipolar: true, format: (v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(Math.round(v))} dB` },
  { key: "tone", label: "Tone", min: 200, max: 8000, detents: 24, taper: "log", format: (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)} kHz` : `${Math.round(v)} Hz`) },
  { key: "mix", label: "Mix", min: 0, max: 100, detents: 20, format: (v) => `${Math.round(v)} %` },
];

const SCENES: Record<Scene, Record<Param, number>> = {
  A: at({ gain: 18, tone: 16, mix: 8 }),
  B: at({ gain: 9, tone: 8, mix: 15 }),
};
/** Every knob fully down, as the desk powers up. */
const HOME = at({ gain: 0, tone: 0, mix: 0 });
const STAGGER = 120; // ms between one motor starting and the next

/** A scene by detent, so every value sits exactly on a click. */
function at(detents: Record<Param, number>) {
  return Object.fromEntries(PARAMS.map((p) => [p.key, valueAt(detents[p.key], p)])) as Record<Param, number>;
}

const chip = { recall: "Recall", loaded: "Loaded", edited: "Edited" } as const;

export default function Demo() {
  const [values, setValues] = useState(HOME);
  const [scene, setScene] = useState<Scene>("A");
  const [status, setStatus] = useState<keyof typeof chip>("recall");
  const travelling = useRef(new Set<Param>());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const valuesRef = useRef(values);

  useEffect(() => {
    valuesRef.current = values;
  }, [values]);

  /** The motors bring every knob to the scene, one after another. */
  function recall(next: Scene, delay = 0) {
    timers.current.forEach(clearTimeout);
    const moving = PARAMS.filter((p) => valuesRef.current[p.key] !== SCENES[next][p.key]).map((p) => p.key);
    travelling.current = new Set(moving);
    setScene(next);
    setStatus(moving.length ? "recall" : "loaded");
    timers.current = moving.map((key, i) => setTimeout(() => setValues((v) => ({ ...v, [key]: SCENES[next][key] })), delay + i * STAGGER));
  }

  function settled(key: Param) {
    const set = travelling.current;
    if (!set.delete(key) || set.size) return;
    setStatus("loaded");
    play("select", { gain: 0.5 });
  }

  // On power-up the desk recalls scene A.
  const powerUp = useEffectEvent(() => recall("A"));
  useEffect(() => {
    const id = setTimeout(powerUp, 350);
    const pending = timers;
    return () => {
      clearTimeout(id);
      pending.current.forEach(clearTimeout);
    };
  }, []);

  return (
    <div className="@container w-full max-w-[460px] select-none">
      <div className="relative isolate animate-enter overflow-hidden rounded-[1.25em] p-[0.95em] text-[clamp(11px,4cqw,14px)] [background:var(--device-body)] shadow-[var(--device-body-edge),0_1px_2px_rgb(0_0_0/0.06),0_16px_32px_-18px_rgb(0_0_0/0.3)] @[26rem]:p-[1.2em]">
        <div aria-hidden className="device-grain pointer-events-none absolute inset-0 -z-10 rounded-[inherit]" />

        <div className="flex items-stretch gap-[0.55em]">
          {/* The scene screen. */}
          <div
            aria-hidden
            className="flex h-[3.3em] min-w-0 flex-1 flex-col justify-between overflow-hidden rounded-[0.7em] px-[0.8em] pb-[0.5em] pt-[0.55em] text-(--device-lcd-ink) [background:var(--device-lcd)] shadow-(--device-lcd-edge)"
          >
            <span className="inline-flex items-center gap-[0.35em] self-start rounded-[0.4em] bg-white px-[0.42em] py-[0.24em] text-black">
              <span
                className={cx(
                  "size-[0.55em] rounded-full",
                  status === "recall" ? "animate-pulse bg-(--device-rec)" : status === "edited" ? "bg-(--device-hold)" : "bg-black",
                )}
              />
              <span className="text-[0.58em] font-semibold uppercase leading-none tracking-[0.02em]">{chip[status]}</span>
            </span>
            <span className="truncate text-[1.05em] font-light leading-none tracking-[-0.01em]">
              Scene {scene}
              {status === "edited" && <span className="text-(--device-lcd-dim)">*</span>}
            </span>
          </div>

          {/* Scene keys: each recalls its scene on the motors. */}
          {(["A", "B"] as const).map((s) => (
            <button
              key={s}
              type="button"
              data-sound="key"
              aria-label={`Recall scene ${s}`}
              aria-pressed={scene === s && status !== "edited"}
              onPointerDown={(e) => e.button === 0 && e.currentTarget.focus({ preventScroll: true, focusVisible: false } as FocusOptions)}
              onClick={() => recall(s)}
              className="group/key w-[2.9em] shrink-0 rounded-[0.7em] outline-offset-2"
            >
              <span className="relative grid h-full place-items-center rounded-[0.7em] text-(--device-key-ink) [background:var(--device-key-face)] shadow-(--device-key-shadow) transition-[transform,box-shadow] duration-(--duration-exit) ease-out group-active/key:translate-y-[2px] group-active/key:shadow-(--device-key-shadow-pressed) group-active/key:duration-75">
                <span
                  aria-hidden
                  className={cx(
                    "absolute inset-x-[30%] top-[0.45em] h-[0.24em] rounded-full transition-[background-color] duration-(--duration-exit)",
                    scene === s ? "bg-(--device-meter-on)" : "bg-(--device-meter-off)",
                  )}
                />
                <span className="mt-[0.5em] text-[0.95em] font-medium leading-none [text-shadow:var(--device-engrave)]">{s}</span>
              </span>
            </button>
          ))}
        </div>

        {/* The channel strip. */}
        <div className="mt-[1em] grid grid-cols-3 gap-[0.4em]">
          {PARAMS.map((p) => (
            <Knob
              key={p.key}
              label={p.label}
              value={values[p.key]}
              min={p.min}
              max={p.max}
              detents={p.detents}
              taper={p.taper}
              bipolar={p.bipolar}
              format={p.format}
              onSettle={() => settled(p.key)}
              onChange={(v) => {
                travelling.current.delete(p.key);
                setStatus("edited");
                setValues((prev) => ({ ...prev, [p.key]: v }));
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
