"use client";

import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { createSpring, type Spring } from "@/design-system";
import { hostTransport, play } from "@/lib/sound";

/*
 * A long-throw motorized fader after a mixing console's: a ridged cap riding
 * in a dark slot, an engraved scale beside it and its level on a small LCD.
 *
 * The value is the cap's position, min to max; the scale reads it through an
 * audio taper, as a console's is printed: 0 dB three quarters of the way up,
 * 5 dB an eighth above −10, and the bottom eighth falling away to −∞.
 *
 * Values set from outside travel on the motor, a spring; values set by hand
 * follow the hand, and while a hand is on the cap the motor lets go of it, as
 * a touch-sensitive fader's does. Near the default the cap drops into a
 * detent with a click and holds until the hand pulls clear. Double-click or
 * double-tap sends it home on the motor. Shift drags finely; the arrow keys
 * step, Page Up and Down move a tenth, Home and End go to the stops. The cap
 * moves by a CSS variable the spring writes, never by React state.
 *
 * With `name` it carries its value in a hidden input and returns to its
 * default when the form resets.
 */

/* The well, in em: the cap stops STOP short of either end. */
const TRACK = 13.4;
const WIDTH = 6;
const CAP = 2.3;
const STOP = 0.4;
const TRAVEL = TRACK - 2 * STOP - CAP;
const SLOT_X = 3.75; // the slot's centre, right of the scale

/** The motor: a whisker under critically damped, so it lands without hunting. */
const MOTOR = { stiffness: 240, damping: 30 };
const FINE = 0.25; // Shift: a quarter of the travel per pixel
const CATCH = 0.012; // of the range: how near the default the hand comes before the detent takes the cap
const RELEASE = 0.035; // of the range: how far past it the hand pulls before the detent lets go
const DOUBLE = 320; // ms between two presses that make a double tap

/** The audio taper: travel (0 to 1) against gain in dB, as the scale is printed. */
const TAPER: [number, number][] = [
  [0.12, -40],
  [0.22, -30],
  [0.35, -20],
  [0.5, -10],
  [0.625, -5],
  [0.75, 0],
  [0.875, 5],
  [1, 10],
];

/** Gain in dB at a point of the travel. Below −40 it falls away to −∞ at the bottom stop. */
export function faderGain(travel: number) {
  const [f0, db0] = TAPER[0];
  if (travel <= f0) return travel <= 0 ? -Infinity : db0 + 20 * Math.log10(travel / f0);
  for (let i = 1; i < TAPER.length; i++) {
    const [fa, a] = TAPER[i - 1];
    const [fb, b] = TAPER[i];
    if (travel <= fb) return a + ((travel - fa) / (fb - fa)) * (b - a);
  }
  return TAPER[TAPER.length - 1][1];
}

/** "−3.5 dB", "0.0 dB", "+10 dB", "−∞ dB": tenths near unity, whole decibels further out. */
export function formatGain(db: number) {
  if (db < -99) return "−∞ dB";
  const r = Math.abs(db) < 9.95 ? Math.round(db * 10) / 10 : Math.round(db);
  const figures = Math.abs(r) < 10 ? Math.abs(r).toFixed(1) : String(Math.abs(r));
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${figures} dB`;
}

/** Where the cap's centre line sits at a point of the travel, in em from the top of the well. */
const lineAt = (travel: number) => Math.round((STOP + CAP / 2 + (1 - travel) * TRAVEL) * 1000) / 1000;

/** The scale: a labelled mark at each point of the taper, and −∞ at the bottom stop. */
const MARKS = [...TAPER.map(([f, db]) => ({ f, label: db > 0 ? `+${db}` : db < 0 ? `−${-db}` : "0" })).reverse(), { f: 0, label: "−∞" }].map(
  (m) => ({ ...m, y: lineAt(m.f) }),
);
/** Short unlabelled marks halfway between the labelled ones. */
const MINOR = TAPER.slice(1).map(([f], i) => lineAt((f + TAPER[i][0]) / 2));

type FaderProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  /** Where the detent sits, and where a double-click or a form reset sends the cap. */
  defaultValue: number;
  /** The LCD and aria-valuetext. Defaults to the scale's gain in dB. */
  format?: (value: number) => string;
  /** Carries the value in a hidden input, for forms. */
  name?: string;
  /** A hand took hold of the cap (true) or let go of it (false). */
  onTouch?: (touching: boolean) => void;
  className?: string;
};

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

type Range = { min: number; max: number; step: number };

/** How far up the travel a value sits, 0 to 1. */
const travelOf = (v: number, { min, max }: Range) => clamp((v - min) / (max - min), 0, 1);

/** The nearest step to a value, inside the range and clean of float dust. */
function snap(v: number, { min, max, step }: Range) {
  const n = Math.round((clamp(v, min, max) - min) / step);
  return clamp(Math.round((min + n * step) * 1e6) / 1e6, min, max);
}

export function Fader({ label, value, onChange, min, max, step, defaultValue, format, name, onTouch, className }: FaderProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const readoutRef = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const spring = useRef<Spring | null>(null);
  const placed = useRef(false);
  const at = useRef(value); // the value, ahead of the render that confirms it
  const target = useRef(0); // permille of travel the motor is heading for
  const pending = useRef<{ value: number; glide: boolean } | null>(null); // a value this fader just asked for
  const held = useRef(false); // a hand is on the cap: the motor lets go of it
  const homing = useRef(false); // the motor is taking it home: it clicks into the detent as it lands
  const press = useRef<number | null>(null); // the pointer that is down
  const lastPress = useRef({ at: -Infinity, y: 0 });
  const drag = useRef<{ id: number; y: number; from: number; raw: number; travel: number; fine: boolean; caught: boolean } | null>(null);
  const [initial] = useState(() => travelOf(value, { min, max, step }));
  const show = format ?? ((v: number) => formatGain(faderGain(travelOf(v, { min, max, step }))));
  // Props the spring and the form read when they fire, rather than when they were made.
  const props = useRef({ value, onChange, onTouch, show, min, max, step, defaultValue });
  useLayoutEffect(() => {
    props.current = { value, onChange, onTouch, show, min, max, step, defaultValue };
  });

  // The spring runs in permille of travel and draws everything that moves: the cap and the LCD.
  useLayoutEffect(() => {
    const root = rootRef.current!;
    let shown = "";
    const s = createSpring(initial * 1000, MOTOR, (permille) => {
      const { show, min, max } = props.current;
      const f = permille / 1000;
      root.style.setProperty("--f", f.toFixed(4));
      const text = show(snap(min + f * (max - min), props.current));
      if (text !== shown && readoutRef.current) {
        shown = text;
        readoutRef.current.textContent = text;
      }
      if (homing.current && permille === target.current) {
        homing.current = false;
        play("tick", { gain: 0.8, pitch: 1.1 });
      }
    });
    spring.current = s;
    return () => s.stop();
  }, [initial]);

  // A new value: the hand's lands at once, anyone else's travels on the motor, unless a hand is holding the cap.
  useLayoutEffect(() => {
    const s = spring.current!;
    const ours = pending.current?.value === value ? pending.current : null;
    pending.current = null;
    at.current = value;
    target.current = travelOf(value, props.current) * 1000;
    if (value !== props.current.defaultValue) homing.current = false;
    if (!placed.current || reducedMotion() || (ours && !ours.glide)) {
      placed.current = true;
      s.jump(target.current);
    } else if (ours || !held.current) s.set(target.current);
  }, [value]);

  /** Asks for a value: `glide` carries it on the motor, otherwise it lands under the hand. */
  function moveTo(v: number, glide: boolean) {
    at.current = v;
    pending.current = { value: v, glide };
    props.current.onChange(v);
  }

  function home() {
    const { defaultValue } = props.current;
    if (at.current === defaultValue && spring.current?.value === target.current) return play("tick", { gain: 0.8, pitch: 1.1 });
    homing.current = true;
    moveTo(defaultValue, true);
  }

  // In a form: a reset sends the cap home on the motor.
  const reset = useEffectEvent(() => {
    if (at.current !== defaultValue) moveTo(defaultValue, true);
  });
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const onReset = () => reset();
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, [name]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    delete e.currentTarget.dataset.quiet; // keys bring the focus ring back
    const range = max - min;
    const delta = { ArrowUp: step, ArrowRight: step, ArrowDown: -step, ArrowLeft: -step, PageUp: range / 10, PageDown: -range / 10 }[e.key];
    const next = delta !== undefined ? snap(at.current + delta, props.current) : e.key === "Home" ? min : e.key === "End" ? max : null;
    if (next === null) return;
    e.preventDefault();
    const from = at.current;
    if (next === from) return play("bump", { gain: 0.5 });
    // A light click per step; the stops bump, and the default clicks firmly, as the detent does under the hand.
    if (next === min || next === max) play("bump", { gain: 0.5 });
    else if (next === defaultValue || (from - defaultValue) * (next - defaultValue) < 0) play("tick", { gain: 0.8, pitch: 1.1 });
    else play("tick", { gain: 0.35, pitch: 0.9 + travelOf(next, props.current) * 0.25 });
    moveTo(next, true);
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || press.current !== null) return;
    e.preventDefault();
    const el = e.currentTarget;
    // Focus that follows the hand: no ring (browsers that ignore focusVisible get data-quiet), until a key is pressed.
    el.dataset.quiet = "";
    el.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
    el.setPointerCapture(e.pointerId);
    press.current = e.pointerId;
    play("press", { gain: 0.5 });
    onTouch?.(true);

    // The second press of a double tap sends it home.
    const last = lastPress.current;
    const double = e.timeStamp - last.at < DOUBLE && Math.abs(e.clientY - last.y) < 24;
    lastPress.current = { at: double ? -Infinity : e.timeStamp, y: e.clientY };
    if (double) return home();

    const s = spring.current!;
    const box = el.getBoundingClientRect();
    const cap = el.querySelector("[data-cap]")!.getBoundingClientRect();
    const travel = box.height * (TRAVEL / TRACK);
    held.current = true;
    homing.current = false;
    el.dataset.held = "";
    let from: number;
    if (e.clientY >= cap.top && e.clientY <= cap.bottom) {
      // On the cap: the hand stops the motor where it is.
      s.jump(s.value);
      from = min + (s.value / 1000) * (max - min);
    } else {
      // Beside it: the motor brings the cap to the hand, and the hand takes it from there.
      const f = clamp(1 - (e.clientY - box.top - box.height * ((STOP + CAP / 2) / TRACK)) / travel, 0, 1);
      from = snap(min + f * (max - min), props.current);
      if (from !== at.current) moveTo(from, true);
    }
    drag.current = { id: e.pointerId, y: e.clientY, from, raw: from, travel, fine: e.shiftKey, caught: from === defaultValue };
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const range = max - min;
    // Shift is fine control. Changing it mid-drag starts over from here, so the cap never jumps.
    if (e.shiftKey !== d.fine) {
      d.from = d.raw;
      d.y = e.clientY;
      d.fine = e.shiftKey;
    }
    let raw = d.from - ((e.clientY - d.y) / d.travel) * range * (d.fine ? FINE : 1);
    // Past a stop, the hand slides off the cap: coming back moves it at once.
    if (raw > max || raw < min) {
      raw = clamp(raw, min, max);
      d.from = raw;
      d.y = e.clientY;
    }

    // The detent at the default: it takes the cap as the hand comes near and holds it until the hand pulls clear.
    const off = raw - defaultValue;
    let next: number;
    if (d.caught && Math.abs(off) <= RELEASE * range) next = defaultValue;
    else if (!d.caught && Math.abs(off) <= CATCH * range) {
      d.caught = true;
      next = defaultValue;
      play("tick", { gain: 0.85, pitch: 1.1 });
    } else {
      if (d.caught) play("tick", { gain: 0.4, pitch: 0.95 });
      else if ((d.raw - defaultValue) * off < 0) play("tick", { gain: 0.6, pitch: 1.1 }); // flew straight through it
      d.caught = false;
      next = snap(raw, props.current);
    }
    d.raw = raw;
    if (next === at.current) return;
    if (next === min || next === max) play("bump", { gain: 0.55 });
    moveTo(next, false);
  }

  function onPointerEnd(e: PointerEvent<HTMLDivElement>) {
    if (press.current !== e.pointerId) return;
    press.current = null;
    drag.current = null;
    play("release", { gain: 0.5 });
    if (held.current) {
      held.current = false;
      delete e.currentTarget.dataset.held;
      // If the value moved on while the hand held the cap, the motor takes it there now.
      const { value } = props.current;
      if (value !== at.current) {
        at.current = value;
        target.current = travelOf(value, props.current) * 1000;
        spring.current?.set(target.current);
      }
    }
    onTouch?.(false);
  }

  return (
    <div className={cx("flex flex-col items-center gap-[0.5em]", className)}>
      {/* The LCD: the spring writes it, so it counts as the motor travels. */}
      <span
        ref={readoutRef}
        aria-hidden
        className="min-h-[1.6em] min-w-[5.4em] rounded-[0.45em] px-[0.45em] py-[0.32em] text-center text-[0.72em] leading-none tabular-nums text-(--device-lcd-ink) [background:var(--device-lcd)] shadow-(--device-lcd-edge)"
      />

      {/* The well: the scale engraved beside a dark slot, and the cap riding in it. */}
      <div
        ref={rootRef}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-orientation="vertical"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={show(value)}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onBlur={(e) => delete e.currentTarget.dataset.quiet}
        className="group/fader relative shrink-0 cursor-ns-resize touch-none select-none rounded-[0.85em] bg-(--device-well) shadow-(--device-recess) outline-offset-2 data-quiet:outline-none!"
        style={{ width: `${WIDTH}em`, height: `${TRACK}em`, "--f": initial } as CSSProperties}
      >
        <div aria-hidden>
          {MARKS.map((m) => (
            <div key={m.label} className="absolute inset-x-0" style={{ top: `${m.y}em` }}>
              <span className="absolute left-0 top-0 flex w-[1.7em] -translate-y-1/2 justify-end">
                <span
                  className={cx(
                    "whitespace-nowrap text-[0.5em] font-semibold leading-none tracking-[0.02em] tabular-nums [text-shadow:var(--device-engrave)]",
                    m.label === "0" ? "text-(--device-label)" : "text-(--device-label-quiet)",
                  )}
                >
                  {m.label}
                </span>
              </span>
              <span
                className={cx(
                  "absolute top-0 h-px -translate-y-1/2 shadow-[0_1px_0_rgb(255_255_255/0.85)] dark:shadow-[0_-1px_0_rgb(0_0_0/0.6)]",
                  m.label === "0" ? "left-[1.85em] right-[0.3em] bg-(--device-label)" : "left-[2em] right-[0.45em] bg-(--device-label-quiet)/70",
                )}
              />
            </div>
          ))}
          {MINOR.map((y) => (
            <span
              key={y}
              className="absolute left-[2.2em] right-[0.65em] h-px -translate-y-1/2 bg-(--device-label-quiet)/40 shadow-[0_1px_0_rgb(255_255_255/0.85)] dark:shadow-[0_-1px_0_rgb(0_0_0/0.6)]"
              style={{ top: `${y}em` }}
            />
          ))}

          {/* The slot the cap's stem runs in. */}
          <div
            className="absolute w-[0.26em] -translate-x-1/2 rounded-full bg-(--device-rim) shadow-[inset_0_1px_2px_rgb(0_0_0/0.7),0_1px_0_rgb(255_255_255/0.9)] dark:shadow-[inset_0_1px_2px_rgb(0_0_0/0.9),0_1px_0_rgb(255_255_255/0.06)]"
            style={{ left: `${SLOT_X}em`, top: `${STOP + CAP / 2 - 0.35}em`, bottom: `${STOP + CAP / 2 - 0.35}em` }}
          />

          {/* The cap: a ridged key, grip lines either side of the line that reads against the scale. */}
          <div
            data-cap
            className="absolute rounded-[0.36em] [background:var(--device-key-face)] shadow-(--device-key-shadow) transition-[box-shadow] duration-(--duration-exit) group-data-held/fader:shadow-(--device-key-shadow-pressed) [--grip-hi:rgb(255_255_255/0.95)] [--grip:rgb(0_0_0/0.14)] dark:[--grip-hi:rgb(255_255_255/0.07)] dark:[--grip:rgb(0_0_0/0.6)]"
            style={{
              left: `${SLOT_X - 1.25}em`,
              width: "2.5em",
              top: `${STOP}em`,
              height: `${CAP}em`,
              transform: `translateY(calc((1 - var(--f)) * ${TRAVEL}em))`,
            }}
          >
            {["top-[0.24em]", "bottom-[0.24em]"].map((edge) => (
              <span
                key={edge}
                className={cx("absolute inset-x-[0.24em] h-[0.66em] rounded-[0.12em]", edge)}
                style={{ background: "repeating-linear-gradient(to bottom, var(--grip) 0 1px, var(--grip-hi) 1px 2px, transparent 2px 3.5px)" }}
              />
            ))}
            <span className="absolute inset-x-0 top-1/2 h-[0.13em] -translate-y-1/2 bg-(--device-key-ink) shadow-[0_1px_0_var(--grip-hi)]" />
          </div>
        </div>
      </div>

      <span aria-hidden className="text-[0.6em] font-semibold uppercase leading-none tracking-[0.16em] text-(--device-label) [text-shadow:var(--device-engrave)]">
        {label}
      </span>
      {name && <input ref={inputRef} type="hidden" name={name} value={value} />}
    </div>
  );
}

/* --- Demo: a three-channel strip playing back its mix automation ------------- */

type Channel = "voice" | "music" | "room";
type Mode = "read" | "touch" | "off";

const CHANNELS: { key: Channel; label: string }[] = [
  { key: "voice", label: "Voice" },
  { key: "music", label: "Music" },
  { key: "room", label: "Room" },
];
const RANGE = { min: 0, max: 100, step: 0.5 };
const UNITY = 75; // 0 dB on the scale
const LOOP = 8; // s of recorded automation, played round
const READ_EVERY = 80; // ms between automation reads; the motors smooth between them
const STAGGER = 0.12; // s between one motor joining the playback and the next, on power-up
const HAND_BACK = 650; // ms a channel waits after the hand leaves it before the motor takes it back
const KEY_HAND_BACK = 1600; // ms after a key or a double-click

const smooth = (x: number) => {
  const c = clamp(x, 0, 1);
  return c * c * (3 - 2 * c);
};
/** Up at `a`, down at `b`, each over `r` seconds. */
const swell = (t: number, a: number, b: number, r: number) => smooth((t - a) / r) * (1 - smooth((t - b) / r));
/** Voice has two phrases a loop. */
const speaking = (t: number) => {
  const u = ((t % LOOP) + LOOP) % LOOP;
  return swell(u, 0.35, 2.7, 0.45) + swell(u, 3.7, 6.5, 0.45);
};
const q = (v: number) => snap(v, RANGE);

/** The recorded mix at `t` seconds: Voice rides its phrases, Music ducks under it a beat later, Room breathes. */
function mix(t: number): Record<Channel, number> {
  const voice = speaking(t);
  const duck = speaking(t - 0.18);
  return {
    voice: q(44 + 30 * voice + 2.2 * voice * Math.sin(t * Math.PI * 1.5)),
    music: q(77 - 21 * duck + 1.6 * Math.sin((t * Math.PI) / 2)),
    room: q(40 + 7 * Math.sin((t * Math.PI) / 4 + 0.6)),
  };
}

const now = () => performance.now();
const clock = (t: number) => `${String(Math.floor(t / 60) % 60).padStart(2, "0")}:${(t % 60).toFixed(1).padStart(4, "0")}`;
const SILENT: Record<Channel, number> = { voice: 0, music: 0, room: 0 };
const OFF: Record<Channel, Mode> = { voice: "off", music: "off", room: "off" };
const READ: Record<Channel, Mode> = { voice: "read", music: "read", room: "read" };

export default function Demo() {
  const [values, setValues] = useState(SILENT);
  const [modes, setModes] = useState(OFF);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const modesRef = useRef(OFF);
  const playingRef = useRef(false);
  const started = useRef(0);
  const holding = useRef(new Set<Channel>());
  const homed = useRef(new Set<Channel>()); // sent home under the hand: let the motor land before handing back
  const timers = useRef<Partial<Record<Channel, ReturnType<typeof setTimeout>>>>({});

  function setMode(ch: Channel, mode: Mode) {
    if (modesRef.current[ch] === mode) return;
    modesRef.current = { ...modesRef.current, [ch]: mode };
    setModes(modesRef.current);
    const label = CHANNELS.find((c) => c.key === ch)!.label;
    if (mode === "touch") setAnnouncement(`${label}: touch`);
    else if (mode === "read") setAnnouncement(`${label}: back on automation`);
  }

  function start() {
    started.current = now();
    playingRef.current = true;
    modesRef.current = READ;
    setModes(READ);
    setPlaying(true);
  }

  // Playback: read the curves a few times a second; each channel in READ follows them on its motor.
  // It makes no sound of its own: only a hand on the strip clicks.
  const read = useEffectEvent(() => {
    const t = (now() - started.current) / 1000;
    const curve = mix(t);
    const reading = CHANNELS.filter(({ key }, i) => modesRef.current[key] === "read" && t >= i * STAGGER);
    setTime(t);
    setValues((prev) => {
      const next = { ...prev };
      reading.forEach(({ key }) => (next[key] = curve[key]));
      return next;
    });
  });
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(read, READ_EVERY);
    return () => clearInterval(id);
  }, [playing]);

  // Power-up: play the automation, unless the viewer prefers less motion (then a still mix) or the host's tape is stopped.
  // A stopped host that starts again starts the playback.
  const powerUp = useEffectEvent(() => {
    if (reducedMotion()) setValues(mix(1.6));
    else if (hostTransport(rootRef.current) !== "stop") start();
  });
  const hostPlays = useEffectEvent(() => {
    if (!playingRef.current && !reducedMotion() && hostTransport(rootRef.current) === "play") start();
  });
  useEffect(() => {
    const id = setTimeout(powerUp, 250);
    const host = rootRef.current?.closest("[data-transport]");
    const observer = new MutationObserver(hostPlays);
    if (host) observer.observe(host, { attributes: true, attributeFilter: ["data-transport"] });
    const pending = timers.current;
    return () => {
      clearTimeout(id);
      observer.disconnect();
      Object.values(pending).forEach(clearTimeout);
    };
  }, []);

  /** After a pause, the channel goes back to reading its automation and the motor brings it to the curve. */
  function handBack(ch: Channel, after: number) {
    clearTimeout(timers.current[ch]);
    timers.current[ch] = setTimeout(() => setMode(ch, playingRef.current ? "read" : "off"), after);
  }

  function touch(ch: Channel, on: boolean) {
    clearTimeout(timers.current[ch]);
    if (on) {
      holding.current.add(ch);
      setMode(ch, "touch");
    } else {
      holding.current.delete(ch);
      handBack(ch, homed.current.delete(ch) ? KEY_HAND_BACK : HAND_BACK);
    }
  }

  function change(ch: Channel, v: number) {
    setValues((prev) => ({ ...prev, [ch]: v }));
    if (holding.current.has(ch)) {
      if (v === UNITY) homed.current.add(ch);
      else homed.current.delete(ch);
      return;
    }
    // A key or a double-click takes the channel over too, until it has been left alone a moment.
    setMode(ch, "touch");
    handBack(ch, KEY_HAND_BACK);
  }

  const touched = CHANNELS.filter((c) => modes[c.key] === "touch");

  return (
    <div ref={rootRef} className="@container w-full max-w-[360px] select-none">
      <div className="relative isolate animate-enter overflow-hidden rounded-[1.25em] p-[0.9em] text-[clamp(11px,4cqw,14px)] [background:var(--device-body)] shadow-[var(--device-body-edge),0_1px_2px_rgb(0_0_0/0.06),0_16px_32px_-18px_rgb(0_0_0/0.3)]">
        <div aria-hidden className="device-grain pointer-events-none absolute inset-0 -z-10 rounded-[inherit]" />

        {/* The automation screen. */}
        <div
          aria-hidden
          className="flex h-[3.3em] flex-col justify-between overflow-hidden rounded-[0.7em] px-[0.8em] pb-[0.5em] pt-[0.55em] text-(--device-lcd-ink) [background:var(--device-lcd)] shadow-(--device-lcd-edge)"
        >
          <div className="flex items-center gap-[0.5em]">
            <span className="inline-flex shrink-0 items-center gap-[0.35em] rounded-[0.4em] bg-white px-[0.42em] py-[0.24em] text-black">
              {touched.length ? (
                <span className="size-[0.55em] rounded-full bg-(--device-hold)" />
              ) : playing ? (
                <span className="size-[0.55em] animate-pulse rounded-full bg-(--device-rec)" />
              ) : (
                <span className="size-[0.5em] rounded-[1px] bg-current" />
              )}
              <span className="text-[0.58em] font-semibold uppercase leading-none tracking-[0.02em]">
                {touched.length ? "Touch" : playing ? "Auto · Read" : "Auto · Off"}
              </span>
            </span>
            <span className="ml-auto text-[0.66em] tabular-nums text-(--device-lcd-dim)">{clock(time)}</span>
          </div>
          <span className="truncate text-[1.05em] font-light leading-none tracking-[-0.01em]">
            {touched.length ? touched.map((c) => c.label).join(" · ") : "Mix · take_04"}
          </span>
        </div>

        {/* The strip. */}
        <div className="mt-[0.85em] grid grid-cols-3 gap-[0.4em]">
          {CHANNELS.map(({ key, label }) => (
            <div key={key} className="flex flex-col items-center gap-[0.45em]">
              <Fader
                label={label}
                value={values[key]}
                min={RANGE.min}
                max={RANGE.max}
                step={RANGE.step}
                defaultValue={UNITY}
                onChange={(v) => change(key, v)}
                onTouch={(on) => touch(key, on)}
              />
              {/* The channel's automation light. */}
              <span aria-hidden className="flex items-center gap-[0.4em]">
                <span
                  className={cx(
                    "size-[0.4em] rounded-full transition-[background-color,box-shadow] duration-(--duration-exit)",
                    modes[key] === "touch"
                      ? "bg-(--device-hold) shadow-[0_0_0.45em_var(--device-hold)]"
                      : modes[key] === "read"
                        ? "bg-(--device-meter-on)"
                        : "bg-(--device-meter-off)",
                  )}
                />
                <span className="text-[0.52em] font-semibold uppercase leading-none tracking-[0.14em] text-(--device-label-quiet) [text-shadow:var(--device-engrave)]">
                  {modes[key]}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
