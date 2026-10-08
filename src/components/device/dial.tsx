"use client";

import { useEffect, useRef, useState, type PointerEvent, type ReactNode, type RefObject } from "react";
import { cn } from "@/design-system";
import { play } from "@/lib/sound";
import { focusQuietly } from "./hooks";

export type DialButton = "up" | "down" | "prev" | "next" | "centre";

type DialProps = {
  /** A press with no pointer to hold it down (keyboard), shown briefly. */
  flash: DialButton | null;
  /** Detents turned since the last call: positive is clockwise. */
  onTurn: (steps: number) => void;
  onPress: (button: DialButton) => void;
  /** The ring is a slider over whatever the screen is stepping through. */
  slider: { label: string; now: number; max: number; text: string };
  sliderRef: RefObject<HTMLDivElement | null>;
  /** id of the hint that explains the keys. */
  hint: string;
  labels: Record<DialButton, string>;
  /** What the centre key shows: it changes with the screen (PLAY on a take, OK on a list). */
  centre: ReactNode;
  /** Holding the centre this long does this instead of a press (STOP, on a take). Left out, the centre only presses. */
  onHold?: () => void;
  className?: string;
};

const DETENT = 15; // degrees of turn per click
const SLOP = 8; // degrees a press may slide before it becomes a turn
const HOLD = 600; // ms the centre has to be held to stop instead of play or pause

/*
 * Each side of the ring sinks and rocks toward the press, as a D-pad does;
 * the centre is a key of its own that drops 2px into its well.
 */
const ROCK: Record<Exclude<DialButton, "centre">, string> = {
  up: "perspective(600px) translateY(1.5px) rotateX(5deg)",
  down: "perspective(600px) translateY(1.5px) rotateX(-5deg)",
  prev: "perspective(600px) translateY(1.5px) rotateY(-5deg)",
  next: "perspective(600px) translateY(1.5px) rotateY(5deg)",
};

const position = "absolute grid place-items-center text-(--device-dial-ink) [filter:var(--device-dial-engrave-glyph)]";
// One small solid triangle per side, the same size as the centre's legend, pointing the way its arrow key does.
const triangle = "w-[max(7px,4.6cqw)] fill-current opacity-80";

/**
 * The dial: a round D-pad in a collar, that also turns. Turning is measured
 * as the angle swept around the centre (pointer capture, one detent every
 * 15°); a press that slides further than a few degrees becomes a turn.
 * Handlers sit on the whole dial, so a press on an arrow can still turn into
 * a turn.
 *
 * The centre has a second function under a held press: after 600ms it fires
 * `onHold` (STOP, on a take) while the finger is still down, and a ring in its
 * well fills over those 600ms so the hand can see it coming. Letting go
 * sooner is an ordinary press.
 *
 * The four arrows and the centre are real buttons, left out of the tab order
 * because the ring (a slider) takes the keyboard for all of them.
 *
 * It is black on the silver body, as a click wheel is: the one part the hand
 * works is the one that stands out. It has its own `--device-dial-*` tokens,
 * so the white caps on the studies keep theirs.
 */
export function Dial({ flash, onTurn, onPress, slider, sliderRef, hint, labels, centre, onHold, className }: DialProps) {
  const dialRef = useRef<HTMLDivElement>(null);
  const trailRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; angle: number; acc: number; travel: number; button: DialButton | null; turns: boolean; spent: boolean } | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // The hold fires from a timer, so it reads the latest handler rather than the one the press began with.
  const holdRef = useRef(onHold);
  useEffect(() => {
    holdRef.current = onHold;
  });
  useEffect(() => () => clearTimeout(holdTimer.current), []);
  const [held, setHeld] = useState<DialButton | null>(null);
  const [charging, setCharging] = useState(false);
  const pressed = held ?? flash;

  function polar(e: PointerEvent) {
    const r = dialRef.current!.getBoundingClientRect();
    const x = e.clientX - (r.left + r.width / 2);
    const y = e.clientY - (r.top + r.height / 2);
    return { angle: (Math.atan2(y, x) * 180) / Math.PI, distance: Math.hypot(x, y) / (r.width / 2) };
  }

  /** A soft light under the finger as it travels round the ring. */
  function trail(angle: number | null) {
    const el = trailRef.current;
    if (!el) return;
    if (angle === null) {
      el.style.opacity = "0";
      return;
    }
    el.style.setProperty("--a", `${angle + 90}deg`);
    el.style.opacity = "1";
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const { angle, distance } = polar(e);
    if (distance > 1.02) return;
    // Keep the press from selecting text or focusing a button: the ring takes
    // focus instead, so the keyboard picks up where the hand left off.
    e.preventDefault();
    focusQuietly(sliderRef.current);
    e.currentTarget.setPointerCapture(e.pointerId);
    const hit = (e.target as Element).closest<HTMLElement>("[data-dial]");
    const button = (hit?.dataset.dial as DialButton | undefined) ?? null;
    drag.current = { id: e.pointerId, angle, acc: 0, travel: 0, button, turns: button !== "centre", spent: false };
    if (button) {
      setHeld(button);
      play("press");
    }
    if (button === "centre" && onHold) {
      setCharging(true);
      holdTimer.current = setTimeout(() => {
        const g = drag.current;
        if (!g || g.button !== "centre") return;
        // The press is spent on the hold: letting go won't play or pause as well.
        g.spent = true;
        setCharging(false);
        holdRef.current?.();
      }, HOLD);
    }
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const g = drag.current;
    if (!g || g.id !== e.pointerId || !g.turns) return;
    const { angle } = polar(e);
    let delta = angle - g.angle;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    g.angle = angle;
    g.acc += delta;
    g.travel += Math.abs(delta);
    if (g.travel > SLOP) {
      trail(angle);
      // A press that starts sliding becomes a turn.
      if (g.button) {
        g.button = null;
        setHeld(null);
        play("release");
      }
    }
    let steps = 0;
    while (g.acc >= DETENT) {
      steps++;
      g.acc -= DETENT;
    }
    while (g.acc <= -DETENT) {
      steps--;
      g.acc += DETENT;
    }
    if (steps) onTurn(steps);
  }

  function onPointerEnd(e: PointerEvent<HTMLDivElement>, commit: boolean) {
    const g = drag.current;
    if (!g || g.id !== e.pointerId) return;
    drag.current = null;
    trail(null);
    clearTimeout(holdTimer.current);
    setCharging(false);
    if (!g.button) return;
    setHeld(null);
    play("release");
    if (g.spent) return;
    // A centre press only counts if it lets go over the centre.
    const over = g.button !== "centre" || polar(e).distance < 0.44;
    if (commit && over) onPress(g.button);
  }

  // Pointer presses are handled above; this catches keyboard and assistive-tech activation (detail 0).
  const activate = (button: DialButton) => (e: { detail: number }) => {
    if (e.detail === 0) onPress(button);
  };

  const rocked = pressed && pressed !== "centre";

  return (
    <div className={cn("@container relative aspect-square select-none", className)}>
      {/* The collar: a round well the dial sits in. */}
      <div aria-hidden className="absolute inset-0 rounded-full bg-black/[0.06] shadow-(--device-recess) dark:bg-black/30" />
      <div
        ref={dialRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => onPointerEnd(e, true)}
        onPointerCancel={(e) => onPointerEnd(e, false)}
        onLostPointerCapture={(e) => onPointerEnd(e, false)}
        data-pressed={rocked || undefined}
        className="absolute inset-[3.5%] touch-none rounded-full [background:var(--device-dial-face)] shadow-(--device-dial-shadow) transition-[transform,box-shadow] duration-(--duration-exit) ease-out data-pressed:shadow-(--device-dial-shadow-pressed) data-pressed:duration-75"
        style={{ transform: rocked ? ROCK[pressed] : "perspective(600px)" }}
      >
        {/* The ring itself: the slider, and the keyboard's way in. */}
        <div
          ref={sliderRef}
          role="slider"
          tabIndex={0}
          aria-label={slider.label}
          aria-describedby={hint}
          aria-orientation="horizontal"
          aria-valuemin={1}
          aria-valuemax={slider.max}
          aria-valuenow={slider.now}
          aria-valuetext={slider.text}
          className="absolute inset-0 cursor-grab rounded-full outline-offset-4 active:cursor-grabbing"
        />

        <div
          ref={trailRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full opacity-0 transition-opacity duration-(--duration-move) ease-out [background:conic-gradient(from_calc(var(--a,0deg)-40deg),transparent,rgb(255_255_255/0.1)_40deg,transparent_80deg)] [mask:radial-gradient(circle,transparent_33%,#000_34%,#000_70%,transparent_100%)]"
        />

        <button type="button" tabIndex={-1} data-dial="up" aria-label={labels.up} onClick={activate("up")} className={cn(position, "left-[30%] top-[2%] h-[25%] w-[40%]")}>
          <svg aria-hidden viewBox="0 0 16 16" className={triangle}>
            <path d="M8 4 13 11H3z" />
          </svg>
        </button>
        <button type="button" tabIndex={-1} data-dial="down" aria-label={labels.down} onClick={activate("down")} className={cn(position, "bottom-[2%] left-[30%] h-[25%] w-[40%]")}>
          <svg aria-hidden viewBox="0 0 16 16" className={triangle}>
            <path d="M8 12 3 5h10z" />
          </svg>
        </button>
        <button type="button" tabIndex={-1} data-dial="prev" aria-label={labels.prev} onClick={activate("prev")} className={cn(position, "left-[2%] top-[30%] h-[40%] w-[25%]")}>
          <svg aria-hidden viewBox="0 0 16 16" className={triangle}>
            <path d="M4 8 11 3v10z" />
          </svg>
        </button>
        <button type="button" tabIndex={-1} data-dial="next" aria-label={labels.next} onClick={activate("next")} className={cn(position, "right-[2%] top-[30%] h-[40%] w-[25%]")}>
          <svg aria-hidden viewBox="0 0 16 16" className={triangle}>
            <path d="M12 8 5 13V3z" />
          </svg>
        </button>

        {/* The centre key sits in a well cut through the dial. */}
        <div className="absolute inset-[29%] rounded-full shadow-(--device-dial-recess)">
          <button
            type="button"
            tabIndex={-1}
            data-dial="centre"
            aria-label={labels.centre}
            onClick={activate("centre")}
            data-pressed={pressed === "centre" || undefined}
            className="absolute inset-[5%] grid place-items-center rounded-full [background:var(--device-dial-key-face)] text-(--device-dial-ink) shadow-(--device-dial-key-shadow) transition-[transform,box-shadow] duration-(--duration-exit) ease-out data-pressed:translate-y-[2px] data-pressed:shadow-(--device-dial-key-shadow-pressed) data-pressed:duration-75"
          >
            {centre}
          </button>
          {/* The hold: a ring in the well that fills while the centre is held, and drains at once when it lets go. */}
          {onHold && (
            <svg aria-hidden viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 -rotate-90 text-(--device-dial-ink)">
              <circle
                cx="50"
                cy="50"
                r="47.5"
                pathLength={1}
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeDasharray="1"
                className="opacity-55 transition-[stroke-dashoffset] ease-linear"
                style={{ strokeDashoffset: charging ? 0 : 1, transitionDuration: charging ? `${HOLD}ms` : "0ms" }}
              />
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}
