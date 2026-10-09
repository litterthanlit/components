"use client";

import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from "react";
import { focusQuietly } from "@/design-system";
import { hostTransport, play } from "@/lib/sound";

/*
 * A settings toggle as an over-centre slide switch, a recorder's HOLD switch
 * grown up: a knurled cap in a recessed track, an orange stripe the cap
 * uncovers as it slides on, a light beside it and an engraved label.
 *
 * The feel is a small integrator, not a transition. Under a finger the cap
 * lags further and further behind it toward the centre, the spring pushing
 * back; at the centre it snaps through, clicks and lands on the far stop on
 * its own, while the finger is still down. Let go short of the centre and the
 * spring takes it home, unless the finger was moving fast enough to carry it
 * over: a flick decides by velocity, not just position. Past the ends it gives
 * a little and bumps. A tap, Space or Enter flicks it. The cap is drawn from
 * a CSS variable the integrator writes; React only hears about the snap.
 *
 * With `name` it carries its state in a hidden checkbox, for forms.
 */

/* The track, in em. The cap is wider than its travel, so it always covers the stripe's far end. */
const TRACK_W = 5.8;
const TRACK_H = 2.35;
const INSET = 0.23;
const CAP_W = 2.9;
const TRAVEL = TRACK_W - 2 * INSET - CAP_W;

/* The mechanism, in travel (0 is off, 1 is on) and seconds. */
const BREAKOUT = 0.03; // the finger moves this far before the preloaded cap does
const SNAP_AT = 0.72; // how far the finger has gone when the cap reaches the centre and snaps over
const BEND = SNAP_AT - 0.5 - BREAKOUT; // how far behind the finger the cap has fallen by then
const RUBBER = 0.1; // the most the cap gives past an end
const FOLLOW = { k: 2200, c: 84 }; // the cap on the finger: stiff, just under critically damped
const SPRING = { preload: 40, peak: 260 }; // the over-centre spring, toward the nearer end: strongest just past the centre
const STOP = { k: 16000, c: 180 }; // the end stops: hard, with a little give
const AIR = 6;
const FLICK = 0.15; // s: on release, the cap is projected this far ahead at the finger's speed
const FLICK_MIN = 0.8; // travel per second toward the other side before a release counts as a flick
const FLICK_SPEED = 12; // travel per second of the finger a tap, a key or a change from outside stands in for
const STEP = 1 / 480;
const TAP = { px: 5, ms: 500 };

/** Where the cap sits for a finger `q` travel from its home end: further and further behind it toward the centre, a little past the end. */
function capFor(q: number) {
  if (q < 0) return -RUBBER * (1 - Math.exp(q / (2.5 * RUBBER)));
  return Math.max(0, q - BREAKOUT - BEND * (q / SNAP_AT) ** 2);
}

/** The finger that would hold the cap at `r`, so a hand can take it mid-flight without a jump. */
function fingerFor(r: number) {
  if (r < 0) return 2.5 * RUBBER * Math.log(1 + Math.max(-0.99 * RUBBER, r) / RUBBER);
  if (r < 1e-3) return 0;
  const a = BEND / SNAP_AT ** 2;
  return (1 - Math.sqrt(Math.max(0, 1 - 4 * a * (BREAKOUT + r)))) / (2 * a);
}

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

type SwitchProps = {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Carries the state in a hidden checkbox, for forms. */
  name?: string;
  disabled?: boolean;
  className?: string;
};

type Engine = {
  grab: (x: number, travelPx: number, t: number) => void;
  move: (x: number, t: number) => void;
  release: (t: number, cancelled: boolean) => void;
  /** Flicks it to the other side; `user` when a hand or a key asked. */
  flip: (user: boolean) => void;
  /** Puts it on a side at once (reduced motion). */
  place: (on: boolean, user: boolean) => void;
  /** The side it is on, or on its way to. */
  readonly on: boolean;
};

export function Switch({ label, checked, onCheckedChange, name, disabled = false, className }: SwitchProps) {
  const rootRef = useRef<HTMLButtonElement>(null);
  const engine = useRef<Engine | null>(null);
  const own = useRef<boolean | null>(null); // a state this switch just reported, ahead of the render that confirms it
  const placed = useRef(false);
  const [initial] = useState(checked);
  const props = useRef({ onCheckedChange });
  useLayoutEffect(() => {
    props.current = { onCheckedChange };
  });

  // The integrator: one cap, a finger (a hand's, or a stand-in for a tap, a key or a change from outside),
  // the over-centre spring and the stops. It writes --x every frame and tells React only at the snap.
  useLayoutEffect(() => {
    const root = rootRef.current!;
    let x = initial ? 1 : 0;
    let v = 0;
    let side: 0 | 1 = initial ? 1 : 0; // the end the spring is pushing toward
    let user = false; // whoever moved it last was the viewer, not the page
    let time = 0; // the integrator's own clock, s
    let raf = 0;
    let last = 0;
    type Hand = { anchorX: number; anchorP: number; lastX: number; startX: number; startT: number; travelPx: number; samples: [number, number][]; moved: boolean; flying: number; bumped: boolean };
    let hand: Hand | null = null;
    let ghost: { t0: number; q0: number; speed: number } | null = null;

    const rel = (p: number) => (side ? 1 - p : p); // travel from the home end, toward the other side
    const abs = (r: number) => (side ? 1 - r : r);
    const draw = () => root.style.setProperty("--x", x.toFixed(4));
    const light = () => {
      if (side) root.dataset.on = "";
      else delete root.dataset.on;
    };

    /** Where the finger wants the cap, or null when the cap is free. */
    function target() {
      if (ghost) return abs(capFor(ghost.q0 + ghost.speed * (time - ghost.t0)));
      if (!hand || hand.flying) return null;
      const q = rel(hand.anchorP + (hand.lastX - hand.anchorX) / hand.travelPx);
      // Pulled past the end: it gives, and bumps the stop once each time.
      if (q < -0.06 && !hand.bumped) {
        hand.bumped = true;
        play("bump", { gain: 0.5 });
      } else if (q > -0.02) hand.bumped = false;
      return abs(capFor(q));
    }

    /** Through the centre: the spring takes it to the other side. */
    function snap() {
      side = side ? 0 : 1;
      light();
      if (user) {
        play("toggle");
        navigator.vibrate?.(8);
        own.current = side === 1;
        props.current.onCheckedChange(side === 1);
      } else if (hostTransport(root) === "play") play("toggle");
      ghost = null;
      // The cap ran out from under the finger: it flies to the stop, then the finger has it again, from there.
      if (hand) {
        hand.flying = time;
        hand.anchorX = hand.lastX;
        hand.anchorP = side;
      }
    }

    function step(h: number) {
      time += h;
      const to = target();
      let f: number;
      if (to !== null) f = FOLLOW.k * (to - x) - FOLLOW.c * v;
      else {
        const toward = side ? 1 : -1;
        f = toward * (SPRING.preload + SPRING.peak * Math.max(0, 1 - Math.abs(2 * x - 1))) - AIR * v;
        if (x > 1) f -= STOP.k * (x - 1) + STOP.c * v;
        else if (x < 0) f -= STOP.k * x + STOP.c * v;
      }
      v += f * h;
      x += v * h;
      if (rel(x) >= 0.5) snap();
      // Landed: the finger takes it again.
      if (hand?.flying && ((rel(x) < 0.02 && Math.abs(v) < 0.6) || time - hand.flying > 0.25)) hand.flying = 0;
    }

    function frame(now: number) {
      let dt = Math.min(0.05, last ? (now - last) / 1000 : STEP);
      last = now;
      while (dt > 1e-9) {
        const h = Math.min(STEP, dt);
        step(h);
        dt -= h;
      }
      const rest = side + (side ? 1 : -1) * (SPRING.preload / STOP.k);
      if (!hand && !ghost && Math.abs(v) < 0.005 && Math.abs(x - rest) < 0.002) {
        x = side;
        v = 0;
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
      get on() {
        return ghost ? side === 0 : side === 1;
      },
      grab(clientX, travelPx, t) {
        user = true;
        ghost = null;
        const p = side ? 1 - fingerFor(rel(x)) : fingerFor(rel(x));
        hand = { anchorX: clientX, anchorP: p, lastX: clientX, startX: clientX, startT: t, travelPx, samples: [[t, clientX]], moved: false, flying: 0, bumped: false };
        run();
      },
      move(clientX, t) {
        if (!hand) return;
        hand.lastX = clientX;
        hand.samples.push([t, clientX]);
        while (hand.samples.length > 2 && t - hand.samples[0][0] > 100) hand.samples.shift();
        if (Math.abs(clientX - hand.startX) > TAP.px) hand.moved = true;
        run();
      },
      release(t, cancelled) {
        const h = hand;
        if (!h) return;
        hand = null;
        if (cancelled || h.flying) return run();
        if (!h.moved && t - h.startT < TAP.ms) return this.flip(true);
        // A flick: project the cap ahead at the finger's speed; if that carries it over the centre, it goes.
        const [t0, x0] = h.samples[0];
        const speed = t > t0 + 8 ? ((h.lastX - x0) / h.travelPx / (t - t0)) * 1000 : 0;
        const toward = side ? -speed : speed;
        if (toward > FLICK_MIN && rel(x) + toward * FLICK >= 0.5) ghost = { t0: time, q0: fingerFor(Math.max(0, rel(x))), speed: Math.max(FLICK_SPEED, toward) };
        run();
      },
      flip(byUser) {
        user = byUser;
        // Flipped again before it reached the centre: the stand-in finger lets go and the spring takes it home.
        if (ghost) ghost = null;
        else if (reducedMotion()) return this.place(side === 0, byUser);
        else ghost = { t0: time, q0: fingerFor(Math.max(0, rel(x))), speed: FLICK_SPEED };
        run();
      },
      place(on, byUser) {
        if ((side === 1) === on) return;
        user = byUser;
        ghost = null;
        x = on ? 1 : 0;
        v = 0;
        snap();
        draw();
      },
    };
    return () => cancelAnimationFrame(raf);
  }, [initial]);

  // A new state from outside: the cap is flicked over to match. The switch's own reports are already there.
  useLayoutEffect(() => {
    const e = engine.current!;
    if (!placed.current) {
      placed.current = true;
      return;
    }
    const ours = own.current === checked;
    own.current = null;
    if (ours || e.on === checked) return;
    if (reducedMotion()) e.place(checked, false);
    else e.flip(false);
  }, [checked]);

  function onPointerDown(e: PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return;
    const el = e.currentTarget;
    focusQuietly(el); // no ring until a key is pressed
    el.setPointerCapture(e.pointerId);
    const track = el.querySelector("[data-track]")!.getBoundingClientRect();
    engine.current?.grab(e.clientX, (track.width * TRAVEL) / TRACK_W, e.timeStamp);
  }

  // Keys and assistive tech arrive as clicks with no pointer behind them; the hand's own taps are handled above.
  function onClick(e: MouseEvent<HTMLButtonElement>) {
    if (e.detail === 0) engine.current?.flip(true);
  }

  return (
    <div className={cx("relative", className)}>
      <button
        ref={rootRef}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        data-on={initial || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={(e) => engine.current?.move(e.clientX, e.timeStamp)}
        onPointerUp={(e) => engine.current?.release(e.timeStamp, false)}
        onPointerCancel={(e) => engine.current?.release(e.timeStamp, true)}
        onClick={onClick}
        className="group/switch flex min-h-[2.9em] w-full touch-pan-y select-none items-center gap-[0.75em] rounded-[0.7em] px-[0.15em] text-left outline-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
        style={{ "--x": initial ? 1 : 0 } as CSSProperties}
      >
        <span data-part="lettering" className="min-w-0 flex-1 truncate text-[0.66em] font-semibold uppercase leading-none tracking-[0.14em] text-(--device-label) [text-shadow:var(--device-engrave)]">
          {label}
        </span>

        {/* The light: it comes on at the snap, not when React hears about it. */}
        <span aria-hidden data-part="well" className="grid size-[0.78em] shrink-0 place-items-center rounded-full bg-black/[0.05] shadow-(--device-recess) dark:bg-black/40">
          <span data-part="light" className="size-[0.44em] rounded-full bg-(--device-meter-off) transition-[background-color,box-shadow] duration-(--duration-exit) group-data-on/switch:bg-(--device-hold) group-data-on/switch:shadow-[0_0_0.5em_var(--device-hold)] group-data-on/switch:duration-0" />
        </span>

        {/* The track: recessed, its stripe uncovered by the cap as it slides on. */}
        <span
          aria-hidden
          data-track
          data-part="well"
          className="relative shrink-0 rounded-[0.62em] bg-black/[0.09] shadow-(--device-recess) dark:bg-black/45"
          style={{ width: `${TRACK_W}em`, height: `${TRACK_H}em` }}
        >
          <span
            className="absolute rounded-[0.42em] bg-(--device-hold) bg-[linear-gradient(rgb(255_255_255/0.2),transparent_55%,rgb(0_0_0/0.08))] shadow-[inset_0_1px_2px_rgb(0_0_0/0.3),inset_0_0_0_1px_rgb(0_0_0/0.08)]"
            style={{ left: `${INSET}em`, top: `${INSET}em`, bottom: `${INSET}em`, width: `${TRAVEL + 0.3}em` }}
          />
          {/* The cap: a knurled key with a raised grip in the middle. */}
          <span
            data-part="key"
            className="absolute rounded-[0.42em] [background:var(--device-key-face)] shadow-(--device-key-shadow) [--grip-hi:rgb(255_255_255/0.95)] [--grip:rgb(0_0_0/0.15)] dark:[--grip-hi:rgb(255_255_255/0.08)] dark:[--grip:rgb(0_0_0/0.6)]"
            style={{
              left: `${INSET}em`,
              top: `${INSET}em`,
              bottom: `${INSET}em`,
              width: `${CAP_W}em`,
              translate: `calc(var(--x) * ${TRAVEL}em) 0`,
            }}
          >
            <span
              className="absolute inset-x-[0.42em] inset-y-[0.3em] rounded-[0.14em]"
              style={{ background: "repeating-linear-gradient(to right, var(--grip) 0 1px, var(--grip-hi) 1px 2px, transparent 2px 3.5px)" }}
            />
          </span>
        </span>
      </button>
      {name && <input type="checkbox" name={name} checked={checked} disabled={disabled} readOnly hidden />}
    </div>
  );
}

/* --- Demo: an input settings plate that tests its switches on power-up ------ */

type Setting = "noise" | "level" | "monitor";

const SETTINGS: { key: Setting; label: string; short: string }[] = [
  { key: "noise", label: "Noise reduction", short: "NR" },
  { key: "level", label: "Auto level", short: "AGC" },
  { key: "monitor", label: "Monitor", short: "MON" },
];
/** The self-test: each switch flicked on in turn, and Monitor back off. */
const SELF_TEST: [number, Setting, boolean][] = [
  [120, "noise", true],
  [360, "level", true],
  [600, "monitor", true],
  [1400, "monitor", false],
];
const TESTED = 2000; // ms: the screen reads Ready
const OFF: Record<Setting, boolean> = { noise: false, level: false, monitor: false };
const AFTER_TEST: Record<Setting, boolean> = { noise: true, level: true, monitor: false };
const chips = { idle: "Standby", test: "Self-test", ready: "Ready" } as const;

export default function Demo() {
  const [state, setState] = useState(OFF);
  const [phase, setPhase] = useState<"idle" | "test" | "ready">("idle");
  const rootRef = useRef<HTMLDivElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Power-up: the self-test flicks each switch in turn (its clicks follow the host's tape),
  // unless the viewer prefers less motion (then it just lands) or the host's tape is stopped.
  const powerUp = useEffectEvent(() => {
    if (reducedMotion()) {
      setState(AFTER_TEST);
      setPhase("ready");
      return;
    }
    if (hostTransport(rootRef.current) === "stop") return;
    setPhase("test");
    timers.current = [
      ...SELF_TEST.map(([at, key, on]) => setTimeout(() => setState((s) => ({ ...s, [key]: on })), at)),
      setTimeout(() => setPhase("ready"), TESTED),
    ];
  });
  useEffect(() => {
    const id = setTimeout(powerUp, 0);
    const pending = timers;
    return () => {
      clearTimeout(id);
      pending.current.forEach(clearTimeout);
    };
  }, []);

  // A hand on a switch ends the test where it stands.
  function stopTest() {
    if (phase !== "test") return;
    timers.current.forEach(clearTimeout);
    setPhase("ready");
  }

  return (
    <div ref={rootRef} onPointerDownCapture={stopTest} onKeyDownCapture={stopTest} className="@container w-full max-w-[360px] select-none">
      <div data-part="plate" className="relative isolate animate-enter overflow-hidden rounded-[1.25em] p-[0.9em] pb-[0.6em] text-[clamp(11px,4.2cqw,14px)] [background:var(--device-body)] shadow-[var(--device-body-edge),0_1px_2px_rgb(0_0_0/0.06),0_16px_32px_-18px_rgb(0_0_0/0.3)]">
        <div aria-hidden className="device-grain pointer-events-none absolute inset-0 -z-10 rounded-[inherit]" />

        {/* The input's screen: the self-test, then what is switched on. */}
        <div
          aria-hidden
          data-part="lcd"
          className="flex h-[3.3em] flex-col justify-between overflow-hidden rounded-[0.7em] px-[0.8em] pb-[0.5em] pt-[0.55em] text-(--device-lcd-ink) [background:var(--device-lcd)] shadow-(--device-lcd-edge)"
        >
          <div className="flex items-center gap-[0.5em]">
            <span data-part="chip" className="inline-flex shrink-0 items-center gap-[0.35em] rounded-[0.4em] bg-white px-[0.42em] py-[0.24em] text-black">
              {phase === "test" ? (
                <span className="size-[0.55em] animate-pulse rounded-full bg-(--device-rec)" />
              ) : phase === "ready" ? (
                <span className="size-[0.55em] rounded-full bg-black" />
              ) : (
                <span className="size-[0.5em] rounded-[1px] bg-current" />
              )}
              <span className="text-[0.58em] font-semibold uppercase leading-none tracking-[0.02em]">{chips[phase]}</span>
            </span>
            <span className="ml-auto text-[0.66em] tabular-nums text-(--device-lcd-dim)">48 kHz · 24 bit</span>
          </div>
          <div className="flex items-baseline gap-[0.6em] leading-none">
            <span className="mr-auto truncate text-[1.05em] font-light tracking-[-0.01em]">Input 1</span>
            {SETTINGS.map((s) => (
              <span
                key={s.key}
                className={cx("text-[0.6em] font-semibold tracking-[0.06em] transition-colors duration-(--duration-exit)", state[s.key] ? "text-(--device-lcd-ink)" : "text-white/25")}
              >
                {s.short}
              </span>
            ))}
          </div>
        </div>

        {/* The switches, each on its own engraved row. */}
        <div role="group" aria-label="Input" className="mt-[0.55em] flex flex-col">
          {SETTINGS.map((s, i) => (
            <div key={s.key}>
              {i > 0 && <div aria-hidden className="mx-[0.15em] h-px bg-black/[0.08] shadow-[0_1px_0_rgb(255_255_255/0.85)] dark:bg-black/60 dark:shadow-[0_1px_0_rgb(255_255_255/0.05)]" />}
              <Switch label={s.label} checked={state[s.key]} onCheckedChange={(on) => setState((prev) => ({ ...prev, [s.key]: on }))} />
            </div>
          ))}
        </div>
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {phase === "ready" ? "Input ready" : ""}
      </p>
    </div>
  );
}
