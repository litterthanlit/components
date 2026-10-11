"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { createSpring, focusQuietly, type Spring } from "@/design-system";
import { engine as engineVoice, hostTransport, play, type PlayOptions, type SoundName } from "@/lib/sound";

/*
 * An ignition barrel on the night-race line, for the one action that has to be
 * armed before it is confirmed: a dark key bow with one thin red pointer
 * turning in a black collar, three engraved stops round it (Off, On, Start,
 * the spring-loaded run to Start in a fine red arc) and a row of three
 * warning glyphs above, nearly invisible until they light.
 *
 * The key's position and the engine's state are different things. Off and On
 * are detents: the key drops into each with a click, and the state follows
 * the drop (On runs the light check, Off cuts the engine). Start is spring-
 * loaded: past On the resistance climbs with the angle, and let go it
 * springs back and is stopped at On. Held at Start it cranks (the starter
 * grinds, through `onCrank`), and after 700 ms the engine catches: the state
 * becomes "running" and the lights that stayed on go out. Once it runs, the
 * starter is locked out: the key meets a hard stop 9° past On and bumps.
 *
 * The key is a small integrator at 480 Hz, not a transition: a finger (the
 * hand's, or a stand-in for a key press, the ghost or a value set from
 * outside) pulls it on a stiff spring, against a sawtooth detent between Off
 * and On, the return spring past On and the hard stops. It writes --a, the
 * bow's angle, every frame; React only hears about the three states. The bow
 * turns by CSS `rotate`, its sheen counter-turning so the light stays above.
 *
 * Drag round the barrel (from its centre, drag sideways), or use the arrow
 * keys: → steps one stop, and held at On (as are Space and Enter) it cranks
 * for as long as it is down. ← steps back. Under reduced motion the key
 * jumps between its stops and the light check is instant.
 *
 * The demo owns the voice: one engine() that grinds while the key is held at
 * Start, fires on the catch and runs until the key goes back to Off. The rpm
 * figure above the barrel is the state: 0, cranking, then a sweep up to 2,500
 * and a settle to an 850 idle on one spring, which drives the engine too.
 */

export type StartKeyValue = "off" | "on" | "running";

/* The stops, in degrees clockwise from upright, and the mechanism round them. */
const OFF = -40;
const ON = 0;
const START = 60;
const MID = (OFF + ON) / 2; // the ridge between the two detents
const ZONE = 3.5; // the key has dropped into a detent within this many degrees of it
const LOCK = 9; // with the engine running, the starter is locked out this far past On
const FOLLOW = { k: 900, c: 45 }; // the key on a finger: stiff, a touch over critically damped
const DETENT = { k: 330, c: 28 }; // the sawtooth between Off and On: peaks at the ridge, 20° from either
const RETURN = { k0: 80, k1: 2 }; // past On: force = k0·d + k1·d², so it stiffens toward Start
const STOP = { k: 40000, c: 400 }; // hard stops and the stop at On: ~3° of give
const AIR = 8;
const HAND = { lo: OFF - 30, hi: START + 30 }; // the most a finger can ask of the key
const PUSH = START + 14; // a key press holds the finger here: enough to reach Start against the return spring
const STEP = 1 / 480;
const REACH = START - 5; // the key counts as at Start from here
const CRANK = 0.7; // s held at Start before the engine catches

/* The light check: all on, then out one by one. Battery and oil stay until the engine runs. */
const CHECK = { hold: 240, gap: 120 }; // ms
const RUN_OUT = [120, 360]; // ms after the catch: battery, then oil pressure

/* The ghost (ms): On, then Start held until it catches. */
const GHOST = { start: 400, crank: 900, letGo: 350 };

type Light = { name: string; hot: boolean; tone: "red" | "white"; d: string };
/** Three lights as simple strokes in a 16-unit box. Hot ones are red when lit and stay on until the engine runs. */
const LIGHTS: Light[] = [
  { name: "Battery", hot: true, tone: "red", d: "M2.5 5.2h11v7.3h-11zM4.8 5.2V3.6M11.2 5.2V3.6M4.6 8.8h2.2M5.7 7.7v2.2M9.2 8.8h2.2" },
  { name: "Oil pressure", hot: true, tone: "red", d: "M8 2.4C6 5 3.6 7.4 3.6 10a4.4 4.4 0 0 0 8.8 0C12.4 7.4 10 5 8 2.4z" },
  { name: "Engine", hot: false, tone: "white", d: "M2.2 6.6h1.8M4 6.6V5.4h2.1l.7-1.4h3l.7 1.4h1.5v1.5h1.8v3.4h-1.8v1.5H5.4L4 10.6V9H2.2z" },
];
/** The lights the check leaves out one by one, in order. */
const CHECK_OUT = LIGHTS.flatMap((l, i) => (l.hot ? [] : [i]));

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** An angle difference, folded into -180°…180°. */
const wrap = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;
const round2 = (v: number) => Math.round(v * 100) / 100;

/** A point round the barrel's centre, in em. Rounded, so the server's and the browser's trigonometry agree when it hydrates. */
const polar = (deg: number, r: number) => {
  const a = (deg * Math.PI) / 180;
  return { x: round2(r * Math.sin(a)), y: round2(-r * Math.cos(a)) };
};

/* The dial, in em: a 16 × 13.2 box with the collar's centre in it. */
const BOX = { w: 16, h: 13.2 };
const MIDDLE = { x: 8, y: 7.4 };
const COLLAR = 11;
/** The lit glyph of each tone: its colour, nothing more. */
const TONES = {
  red: "data-on:text-(--race-red)",
  white: "data-on:text-(--race-ink)",
} as const;
const STOPS: { key: StartKeyValue | "start"; label: string; deg: number }[] = [
  { key: "off", label: "Off", deg: OFF },
  { key: "on", label: "On", deg: ON },
  { key: "start", label: "Start", deg: START },
];
/** The engraving: one fine red arc for the spring-loaded run from On to Start (user units are tenths of an em). */
const run = (() => {
  const at = (deg: number) => {
    const p = polar(deg, 59.5);
    return `${round2(MIDDLE.x * 10 + p.x)} ${round2(MIDDLE.y * 10 + p.y)}`;
  };
  return `M${at(ON + 4)}A59.5 59.5 0 0 1 ${at(START)}`;
})();

type StartKeyProps = {
  value: StartKeyValue;
  /** The engine's state changed: the key dropped into On or Off, or the engine caught. */
  onChange: (value: StartKeyValue) => void;
  /** The starter turns while the key is held at Start, and stops when it is let go or the engine catches. */
  onCrank?: (on: boolean) => void;
  label?: string;
  /** Run the sequence once on mount: On, the light check, crank, catch. A first touch ends it. */
  rehearse?: boolean;
  className?: string;
};

type Engine = {
  grab: (cx: number, cy: number, x: number, y: number, dead: number) => void;
  move: (x: number, y: number) => void;
  release: () => void;
  /** Puts a stand-in finger on the key; `auto` lets go once the key has arrived. */
  hold: (phi: number, by: "key" | "ghost" | "motor", auto: boolean) => void;
  letGo: (by: "key" | "ghost" | "motor") => void;
  /** A state set from outside. */
  sync: (state: StartKeyValue) => void;
  readonly state: StartKeyValue;
};

export function StartKey({ value, onChange, onCrank, label = "Ignition", rehearse = false, className }: StartKeyProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine | null>(null);
  const own = useRef<StartKeyValue | null>(null); // a state the key just reported, ahead of the render that confirms it
  const placed = useRef(false);
  const touched = useRef(false); // a hand has worked it: it sounds even while the host is paused, and the ghost has gone
  const ghost = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [initial] = useState(value);
  const props = useRef({ onChange, onCrank });
  useLayoutEffect(() => {
    props.current = { onChange, onCrank };
  });

  // The integrator: one key, one finger, the detents, the return spring and the stops. It draws --a every frame
  // and the lights as the states change; it tells React only about those states.
  useLayoutEffect(() => {
    const root = rootRef.current!;
    const lights = [...root.querySelectorAll<SVGElement>("[data-light]")];
    const legends = [...root.querySelectorAll<HTMLElement>("[data-stop]")];
    let x = initial === "off" ? OFF : ON;
    let v = 0;
    let st: StartKeyValue = initial;
    let zone: "off" | "on" | null = initial === "off" ? "off" : "on"; // the detent the key sits in
    let time = 0; // the integrator's own clock, s
    let raf = 0;
    let last = 0;
    let armed = false; // let go past On: the stop at On catches it on the way back
    let overrun = false; // the engine caught with the key still at Start: no lockout until it has sprung back
    let hitHi = false;
    let hitLo = false;
    let crank: { t0: number } | null = null;
    let grinding = false; // the starter has been reported turning
    let lit = initial === "off" ? 0 : 1; // the legend lit
    let hand: { dial: boolean; cx: number; cy: number; x0: number; prev: number; base: number; acc: number; phi: number } | null = null;
    let finger: { phi: number; by: "key" | "ghost" | "motor"; auto: boolean; since: number } | null = null;
    let releaseTimer: ReturnType<typeof setTimeout> | undefined;
    const timers: ReturnType<typeof setTimeout>[] = [];

    /** Sounds the key makes by itself follow the host's tape; a hand's always play. */
    const sound = (name: SoundName, options?: PlayOptions) => {
      if (touched.current || hostTransport(root) === "play") play(name, options);
    };
    const report = (next: StartKeyValue) => {
      own.current = next;
      props.current.onChange(next);
    };

    /* --- Lights ------------------------------------------------------------ */

    const setLight = (i: number, on: boolean) => {
      if (on) lights[i]?.setAttribute("data-on", "");
      else lights[i]?.removeAttribute("data-on");
    };
    const later = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    const clearLights = () => {
      timers.forEach(clearTimeout);
      timers.length = 0;
    };
    /** Where the lights come to rest in a state: the hot ones stay on until the engine runs. */
    const paint = (state: StartKeyValue) => lights.forEach((_, i) => setLight(i, state === "on" && LIGHTS[i].hot));
    /** The check: everything on at once, then out one by one; battery and oil stay. */
    const check = () => {
      clearLights();
      if (reducedMotion()) return paint("on");
      lights.forEach((_, i) => setLight(i, true));
      CHECK_OUT.forEach((light, k) => later(CHECK.hold + k * CHECK.gap, () => setLight(light, false)));
    };
    /** The engine runs: whatever is left goes out, the battery light first and the oil light as pressure builds. */
    const running = () => {
      clearLights();
      lights.forEach((_, i) => !LIGHTS[i].hot && setLight(i, false));
      if (reducedMotion()) return paint("running");
      RUN_OUT.forEach((ms, k) => later(ms, () => setLight(k, false)));
    };

    /* --- The key ----------------------------------------------------------- */

    const phi = () => (hand ? hand.phi : finger ? finger.phi : null);
    const ceiling = () => (st === "running" && !overrun ? ON + LOCK : START + 3);
    const bumpGain = () => Math.min(0.9, 0.35 + Math.abs(v) / 900);

    function physics(h: number) {
      const to = phi();
      if (to === null) {
        if (x > ON + 3) armed = true;
      } else armed = false;
      let f = -AIR * v;
      if (to !== null) f += FOLLOW.k * (to - x) - FOLLOW.c * v;
      if (x <= ON) f -= DETENT.k * (x - (x < MID ? OFF : ON)) + DETENT.c * v;
      else f -= RETURN.k0 * (x - ON) + RETURN.k1 * (x - ON) ** 2;
      // The hard stops, and the stop at On that the spring brings the key back to.
      const hi = ceiling();
      if (x > hi) {
        f -= STOP.k * (x - hi) + STOP.c * v;
        if (v > 30 && !hitHi) {
          hitHi = true;
          sound("bump", { gain: bumpGain() });
        }
      } else if (x < hi - 3) hitHi = false;
      if (x < OFF - 3) {
        f -= STOP.k * (x - (OFF - 3)) + STOP.c * v;
        if (v < -30 && !hitLo) {
          hitLo = true;
          sound("bump", { gain: bumpGain() });
        }
      } else if (x > OFF - 1) hitLo = false;
      if (armed && to === null && x < ON) f -= STOP.k * (x - ON) + STOP.c * v;
      v += f * h;
      x += v * h;
    }

    /** Reduced motion: the key is on a stop, never between them. */
    function direct() {
      const to = phi();
      let at = x;
      if (to !== null) at = to < MID ? OFF : to < (ON + START) / 2 ? ON : START;
      else if (x > ON + 3) at = ON;
      else at = x < MID ? OFF : ON;
      const hi = ceiling();
      if (at > hi) {
        at = hi;
        if (x !== hi) sound("bump", { gain: 0.6 });
      }
      x = at;
      v = 0;
    }

    /** The key has dropped into a detent: it clicks, and the state follows. */
    function arrive(into: "off" | "on") {
      sound("tick", { gain: 0.65, pitch: into === "on" ? 0.98 : 0.84 });
      if (into === "on" && st === "off") {
        st = "on";
        report("on");
        check();
      } else if (into === "off" && st !== "off") {
        const was = st;
        st = "off";
        crank = null;
        clearLights();
        paint("off");
        report("off");
        sound("stop", { gain: was === "running" ? 0.9 : 0.5 });
      }
    }

    /** The engine catches. */
    function catchOn() {
      crank = null;
      st = "running";
      overrun = x > ON + LOCK;
      navigator.vibrate?.(10);
      report("running");
      running();
      // A ghost on the key lets go a beat after the catch; a hand keeps it as long as it likes.
      if (finger?.by === "ghost") releaseTimer = setTimeout(() => engine.current?.letGo("ghost"), GHOST.letGo);
    }

    function events() {
      const near = x < MID ? OFF : ON;
      if (x <= ON + ZONE && Math.abs(x - near) <= ZONE) {
        const into = near === OFF ? "off" : "on";
        if (zone !== into) {
          zone = into;
          arrive(into);
        }
      } else if (zone && Math.abs(x - (zone === "off" ? OFF : ON)) > ZONE + 2) zone = null;
      if (overrun && x < ON + LOCK - 2) overrun = false;

      // Held at Start with the ignition on: the starter cranks, a little unsteadily, until the engine catches.
      const atStart = st === "on" && x >= REACH;
      if (atStart && !crank) crank = { t0: time };
      else if (crank && (st !== "on" || (!atStart && x < START - 16))) crank = null;
      if (crank && time - crank.t0 >= CRANK) catchOn();
      // The starter grinds for as long as the crank runs: the host hears it start and stop.
      if ((crank !== null) !== grinding) {
        grinding = crank !== null;
        props.current.onCrank?.(grinding);
      }

      // A stand-in finger lets go once the key has arrived (or has given up trying).
      if (finger?.auto && ((Math.abs(x - finger.phi) < 2.5 && Math.abs(v) < 60) || time - finger.since > 0.8)) finger = null;
    }

    function step(h: number) {
      time += h;
      if (reducedMotion()) direct();
      else physics(h);
      events();
    }

    const draw = () => {
      root.style.setProperty("--a", `${x.toFixed(2)}deg`);
      // The legend the key points at lights up.
      const at = x < MID ? 0 : x < (ON + START) / 2 ? 1 : 2;
      if (at !== lit) {
        lit = at;
        legends.forEach((el, i) => (i === at ? el.setAttribute("data-on", "") : el.removeAttribute("data-on")));
      }
    };

    function frame(now: number) {
      let dt = Math.min(0.05, last ? (now - last) / 1000 : STEP);
      last = now;
      while (dt > 1e-9) {
        const h = Math.min(STEP, dt);
        step(h);
        dt -= h;
      }
      const home = x > ON + 0.05 ? null : x < MID ? OFF : ON;
      if (!hand && !finger && !crank && home !== null && Math.abs(v) < 0.5 && Math.abs(x - home) < 0.05) {
        x = home;
        v = 0;
        armed = false;
        draw();
        raf = 0;
        last = 0;
        return;
      }
      draw();
      raf = requestAnimationFrame(frame);
    }
    const run = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };

    engine.current = {
      get state() {
        return st;
      },
      grab(cx, cy, px, py, dead) {
        const dial = Math.hypot(px - cx, py - cy) > dead;
        const angle = (Math.atan2(px - cx, -(py - cy)) * 180) / Math.PI;
        // The hand takes the key where it is, so there is no jump: it carries on from the key's angle.
        hand = { dial, cx, cy, x0: px, prev: angle, base: x, acc: 0, phi: x };
        finger = null;
        clearTimeout(releaseTimer);
        run();
      },
      move(px, py) {
        if (!hand) return;
        const turn = hand.dial ? wrap((Math.atan2(px - hand.cx, -(py - hand.cy)) * 180) / Math.PI - hand.prev) : 0;
        if (hand.dial) hand.prev += turn;
        // Near the centre an angle is unstable: there, a sideways drag turns the key instead.
        hand.acc = clamp(hand.dial ? hand.acc + turn : (px - hand.x0) * 0.9, HAND.lo - hand.base, HAND.hi - hand.base);
        hand.phi = hand.base + hand.acc;
        run();
      },
      release() {
        hand = null;
        run();
      },
      hold(to, by, auto) {
        if (hand) return;
        finger = { phi: to, by, auto, since: time };
        run();
      },
      letGo(by) {
        if (finger?.by === by) finger = null;
        run();
      },
      sync(next) {
        const was = st;
        st = next;
        crank = null;
        zone = x < MID ? "off" : "on";
        if (next === "on" && was === "off") check();
        else {
          clearLights();
          paint(next);
        }
        // Set from outside, the key travels to the stop on its own.
        if (next === "off" && x > OFF + ZONE) this.hold(OFF, "motor", true);
        else if (next !== "off" && x < MID) this.hold(ON, "motor", true);
        run();
      },
    };
    draw();
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(releaseTimer);
      clearLights();
      if (grinding) props.current.onCrank?.(false);
    };
  }, [initial]);

  // A new state from outside: the key's own reports are already there.
  useLayoutEffect(() => {
    const e = engine.current!;
    if (!placed.current) {
      placed.current = true;
      return;
    }
    const ours = own.current === value;
    own.current = null;
    if (ours || e.state === value) return;
    e.sync(value);
  }, [value]);

  // The ghost: On, the light check, then Start held until the engine catches. It waits for the host's tape
  // to roll, and a first touch ends it for good. Reduced motion never starts it.
  useEffect(() => {
    if (!rehearse || reducedMotion()) return;
    const root = rootRef.current;
    let started = false;
    const go = () => {
      if (started || touched.current) return;
      started = true;
      ghost.current = [
        setTimeout(() => engine.current?.hold(ON, "ghost", true), 0),
        setTimeout(() => engine.current?.hold(PUSH, "ghost", false), GHOST.crank),
      ];
    };
    const begin = () => hostTransport(root) !== "stop" && !started && ghost.current.push(setTimeout(go, GHOST.start));
    begin();
    const host = root?.closest("[data-transport]");
    const observer = new MutationObserver(begin);
    if (host) observer.observe(host, { attributes: true, attributeFilter: ["data-transport"] });
    const pending = ghost;
    return () => {
      observer.disconnect();
      pending.current.forEach(clearTimeout);
      pending.current = [];
    };
  }, [rehearse]);

  /** A hand has come to the key: the ghost goes, and the key lets go of whatever it was doing. */
  function touch() {
    touched.current = true;
    ghost.current.forEach(clearTimeout);
    ghost.current = [];
    engine.current?.letGo("ghost");
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const forward = e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === " " || e.key === "Enter";
    const back = e.key === "ArrowLeft" || e.key === "ArrowDown" || e.key === "Home";
    if (!forward && !back) return;
    e.preventDefault();
    const key = engine.current;
    if (e.repeat || !key) return;
    // Forward: Off steps to On; at On the key is held at Start while the key is down. Back goes a stop towards Off.
    if (forward) key.hold(key.state === "off" ? ON : PUSH, "key", key.state === "off");
    else key.hold(key.state === "off" ? OFF - 12 : OFF, "key", true);
  }
  function onKeyUp(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === " " || e.key === "Enter") engine.current?.letGo("key");
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    focusQuietly(e.currentTarget);
    e.currentTarget.setPointerCapture(e.pointerId);
    const r = e.currentTarget.getBoundingClientRect();
    engine.current?.grab(r.left + r.width / 2, r.top + r.height / 2, e.clientX, e.clientY, r.width * 0.2);
  }

  const index = value === "off" ? 0 : value === "on" ? 1 : 2;
  const text = value === "off" ? "Off" : value === "on" ? "On" : "Engine running";
  const startLights = LIGHTS.map((l) => l.hot && initial === "on");
  const startLit = initial === "off" ? 0 : 1;

  return (
    <div
      ref={rootRef}
      onPointerDownCapture={touch}
      onKeyDownCapture={touch}
      className={cx("flex flex-col items-center gap-[0.7em]", className)}
      style={{ "--a": `${initial === "off" ? OFF : ON}deg` } as CSSProperties}
    >
      {/* The warning lights: three small glyphs, nearly invisible until they light. Battery and oil are red. */}
      <div aria-hidden className="flex items-center justify-center gap-[1.8em]">
        {LIGHTS.map((l, i) => (
          <svg
            key={l.name}
            data-part="light"
            data-light={l.name}
            data-on={startLights[i] ? "" : undefined}
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={cx("block size-[1.3em] text-(--race-led-off) transition-colors duration-(--duration-exit) data-on:duration-0", TONES[l.tone])}
          >
            <path d={l.d} />
          </svg>
        ))}
      </div>

      <div className="relative" style={{ width: `${BOX.w}em`, height: `${BOX.h}em` }}>
        {/* The stops, engraved round the collar; the run to Start is a fine red arc. */}
        <svg aria-hidden viewBox={`0 0 ${BOX.w * 10} ${BOX.h * 10}`} fill="none" strokeLinecap="round" className="absolute inset-0 size-full">
          <path d={run} strokeWidth="1.2" strokeDasharray="2.5 3.5" className="stroke-(--race-red)" />
        </svg>
        {STOPS.map((s, i) => {
          // Each legend sits where the key's tip points, anchored by its inner edge so it never runs over the arc.
          const p = polar(s.deg, 6.8);
          const anchor = s.deg < ON ? "-translate-x-full" : s.deg > ON ? "" : "-translate-x-1/2";
          return (
            <span key={s.key} className={cx("absolute -translate-y-1/2", anchor)} style={{ left: `${round2(MIDDLE.x + p.x)}em`, top: `${round2(MIDDLE.y + p.y)}em` }}>
              <span
                aria-hidden
                data-part="lettering"
                data-stop={s.key}
                data-on={i === startLit ? "" : undefined}
                className="block whitespace-nowrap text-[0.62em] font-semibold uppercase leading-none tracking-[0.18em] text-(--race-dim) transition-colors duration-(--duration-exit) data-on:text-(--race-ink) data-on:duration-0"
              >
                {s.label}
              </span>
            </span>
          );
        })}

        {/* The key: a slider over the collar. Drag round it, or step it with the arrow keys. */}
        <div
          role="slider"
          tabIndex={0}
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={2}
          aria-valuenow={index}
          aria-valuetext={text}
          data-state={value}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
          onBlur={() => engine.current?.letGo("key")}
          onPointerDown={onPointerDown}
          onPointerMove={(e) => engine.current?.move(e.clientX, e.clientY)}
          onPointerUp={() => engine.current?.release()}
          onPointerCancel={() => engine.current?.release()}
          className="group/s absolute cursor-grab touch-none rounded-full outline-offset-2 active:cursor-grabbing"
          style={{ left: `${MIDDLE.x - COLLAR / 2}em`, top: `${MIDDLE.y - COLLAR / 2}em`, width: `${COLLAR}em`, height: `${COLLAR}em` }}
        >
          {/* The collar: black, with a fine knurl round its rim. */}
          <div
            aria-hidden
            data-part="collar"
            className="size-full rounded-full p-[0.95em] [background:repeating-conic-gradient(rgb(255_255_255/0.07)_0deg_0.9deg,transparent_0.9deg_3deg),var(--race-well)] shadow-[var(--race-recess),0_0_0_1px_rgb(255_255_255/0.05)]"
          >
            {/* The barrel face, black glass. */}
            <div data-part="cap" className="relative size-full rounded-full [background:var(--race-glass)] shadow-[0_0_0_1px_rgb(0_0_0/0.9),0_0.25em_0.7em_rgb(0_0_0/0.8),inset_0_1px_0_rgb(255_255_255/0.08)]">
              {/* The bow: a clean dark key, turned by rotate. Its sheen counter-turns, so the light stays above. */}
              <div
                data-part="key"
                className="absolute inset-0 m-auto h-[8.2em] w-[3.8em] rounded-[1em_1em_1.5em_1.5em] [background:linear-gradient(calc(180deg_-_var(--a)),rgb(255_255_255/0.09),transparent_55%),linear-gradient(#232327,#131315)] [rotate:var(--a)] shadow-[0_0_0_1px_rgb(0_0_0/0.9),0_0_0.8em_-0.1em_rgb(0_0_0/0.9),inset_0_1px_0_rgb(255_255_255/0.14)]"
              >
                {/* The pointer: one thin red line in the bow's tip, at full strength once the ignition is on. */}
                <div className="absolute left-1/2 top-[0.7em] h-[2.4em] w-[0.18em] -translate-x-1/2 rounded-full bg-(--race-red) opacity-50 transition-opacity duration-(--duration-exit) group-data-[state=on]/s:opacity-100 group-data-[state=running]/s:opacity-100" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <p role="status" className="sr-only">
        {value === "off" ? "Ignition off" : value === "on" ? "Ignition on" : "Engine running"}
      </p>
    </div>
  );
}

/* --- Demo: the ignition of a car whose readout settles to idle ---------------- */

const IDLE = 850; // rpm
const FLARE = 2500; // rpm: the engine catches high and drops back to idle
const CRANKING = 240; // rpm: what the starter turns the engine at, on the readout only
const PEAK = 260; // ms the revs sweep up before they are let down to idle
/** Revs ease on a spring a little under critical (ζ ≈ 0.8): a clean sweep, a hair of overshoot, no ringing. */
const REVS = { stiffness: 100, damping: 16 };
const thousands = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

export default function Demo() {
  const [value, setValue] = useState<StartKeyValue>("off");
  const rootRef = useRef<HTMLDivElement>(null);
  const rpmRef = useRef<HTMLSpanElement>(null);
  const revs = useRef<Spring | null>(null);
  const voice = useRef<ReturnType<typeof engineVoice> | null>(null);
  const current = useRef<StartKeyValue>("off"); // the engine's state as the key last reported it
  const touched = useRef(false); // a hand has worked the key: the engine sounds even while the host is paused

  /** The host-transport rule: a ghost driving the engine under a paused host runs it silent; a hand always sounds. */
  const level = () => voice.current?.level(touched.current || hostTransport(rootRef.current) === "play" ? 1 : 0);

  // The voice: one engine, made after mount and stopped with it. It follows the host's tape while the ghost runs it.
  useEffect(() => {
    const e = engineVoice();
    voice.current = e;
    level();
    const host = rootRef.current?.closest("[data-transport]");
    const observer = new MutationObserver(level);
    if (host) observer.observe(host, { attributes: true, attributeFilter: ["data-transport"] });
    return () => {
      observer.disconnect();
      e.stop();
      voice.current = null;
    };
  }, []);

  // The revs are a spring that writes straight into the glass, and into the engine once it runs.
  useLayoutEffect(() => {
    const el = rpmRef.current!;
    const s = createSpring(0, REVS, (rpm) => {
      const n = Math.max(0, rpm);
      el.textContent = thousands(Math.round(n));
      // The throttle rides the flare: 0.6 at the top of it, none at idle.
      if (current.current === "running") voice.current?.set(n, Math.min(0.6, Math.max(0, ((n - IDLE) / (FLARE - IDLE)) * 0.6)));
    });
    revs.current = s;
    return () => s.stop();
  }, []);

  // The engine catching sweeps the revs up to the flare and lets them down to idle; the key back at Off cuts the engine.
  useEffect(() => {
    const s = revs.current!;
    if (value === "running") {
      if (reducedMotion()) s.jump(IDLE);
      else {
        s.set(FLARE);
        const down = setTimeout(() => s.set(IDLE), PEAK);
        return () => clearTimeout(down);
      }
    } else {
      voice.current?.set(0, 0);
      if (reducedMotion()) s.jump(0);
      else s.set(0);
    }
  }, [value]);

  function onChange(next: StartKeyValue) {
    current.current = next;
    setValue(next);
  }

  /** The starter turns: it grinds, and the readout shows the engine turning over. */
  function onCrank(on: boolean) {
    level();
    voice.current?.crank(on);
    if (on) revs.current?.[reducedMotion() ? "jump" : "set"](CRANKING);
    else if (current.current !== "running") revs.current?.[reducedMotion() ? "jump" : "set"](0);
  }

  /** The viewer's own hand on the key ends the ghost's silence. */
  function touch(e: { target: EventTarget }) {
    if (touched.current || !(e.target as Element).closest?.("[role=slider]")) return;
    touched.current = true;
    level();
  }

  return (
    <div ref={rootRef} onPointerDownCapture={touch} onKeyDownCapture={touch} className="@container w-full max-w-[320px] select-none">
      <div data-part="plate" className="relative isolate flex animate-enter flex-col items-center gap-[0.8em] overflow-hidden rounded-[0.9em] p-[0.9em] pt-[1.5em] text-[clamp(11px,4cqw,14px)] [background:var(--race-body)] shadow-[var(--race-edge),var(--race-shadow)]">
        {/* The revs, bare on the plate: the figure is the state (0, turning over, idling). */}
        <span aria-hidden className="flex items-baseline gap-[0.5em] leading-none">
          <span
            ref={rpmRef}
            data-part="lettering"
            className={cx(
              "inline-block w-[4.6ch] text-right font-[family-name:var(--font-race)] text-[4.4em] font-bold italic tabular-nums [font-stretch:62%] transition-colors duration-(--duration-exit)",
              value === "running" ? "text-(--race-ink)" : "text-(--race-dim)",
            )}
          >
            0
          </span>
          <span className="text-[0.62em] font-semibold uppercase tracking-[0.16em] text-(--race-faint)">rpm</span>
        </span>

        <StartKey rehearse value={value} onChange={onChange} onCrank={onCrank} />
      </div>
    </div>
  );
}
