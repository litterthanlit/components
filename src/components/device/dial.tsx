"use client";

import { useRef, useState, type PointerEvent, type RefObject } from "react";
import { cn } from "@/design-system";
import { play } from "@/lib/sound";
import { focusQuietly } from "./hooks";

export type DialButton = "up" | "down" | "prev" | "next" | "ok";

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
  className?: string;
};

const DETENT = 15; // degrees of turn per click
const SLOP = 8; // degrees a press may slide before it becomes a turn

/*
 * Each side of the ring sinks and rocks toward the press, as a D-pad does;
 * the centre is a key of its own that drops 2px into its well.
 */
const ROCK: Record<Exclude<DialButton, "ok">, string> = {
  up: "perspective(600px) translateY(1.5px) rotateX(5deg)",
  down: "perspective(600px) translateY(1.5px) rotateX(-5deg)",
  prev: "perspective(600px) translateY(1.5px) rotateY(-5deg)",
  next: "perspective(600px) translateY(1.5px) rotateY(5deg)",
};

const position = "absolute grid place-items-center text-(--device-key-ink) [filter:var(--device-engrave-glyph)]";
const glyph = "w-[max(9px,6cqw)] fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.6]";

/**
 * The dial: a round D-pad after the field recorder, that also turns.
 * Turning is measured as the angle swept around the centre (pointer capture,
 * one detent every 15°); a press that slides further than a few degrees
 * becomes a turn. Handlers sit on the whole dial, so a press on an arrow can
 * still turn into a turn.
 *
 * The four arrows and the centre are real buttons, left out of the tab order
 * because the ring (a slider) takes the keyboard for all of them.
 */
export function Dial({ flash, onTurn, onPress, slider, sliderRef, hint, labels, className }: DialProps) {
  const dialRef = useRef<HTMLDivElement>(null);
  const trailRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; angle: number; acc: number; travel: number; button: DialButton | null; turns: boolean } | null>(null);
  const [held, setHeld] = useState<DialButton | null>(null);
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
    drag.current = { id: e.pointerId, angle, acc: 0, travel: 0, button, turns: button !== "ok" };
    if (button) {
      setHeld(button);
      play("press");
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
    if (!g.button) return;
    setHeld(null);
    play("release");
    // A centre press only counts if it lets go over the centre.
    const over = g.button !== "ok" || polar(e).distance < 0.44;
    if (commit && over) onPress(g.button);
  }

  // Pointer presses are handled above; this catches keyboard and assistive-tech activation (detail 0).
  const activate = (button: DialButton) => (e: { detail: number }) => {
    if (e.detail === 0) onPress(button);
  };

  const rocked = pressed && pressed !== "ok";

  return (
    <div className={cn("@container relative aspect-square select-none", className)}>
      <div
        ref={dialRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => onPointerEnd(e, true)}
        onPointerCancel={(e) => onPointerEnd(e, false)}
        onLostPointerCapture={(e) => onPointerEnd(e, false)}
        data-pressed={rocked || undefined}
        className="absolute inset-0 touch-none rounded-full [background:var(--device-wheel-face)] shadow-(--device-wheel-shadow) transition-[transform,box-shadow] duration-(--duration-exit) ease-out data-pressed:shadow-(--device-wheel-shadow-pressed) data-pressed:duration-75"
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

        {/* A fine rim, turned on a lathe, and the light catching it as it turns. */}
        <div aria-hidden className="pointer-events-none absolute inset-[3.5%] rounded-full shadow-[0_0_0_1px_rgb(0_0_0/0.045)] dark:shadow-[0_0_0_1px_rgb(255_255_255/0.04)]" />
        <div
          ref={trailRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full opacity-0 transition-opacity duration-(--duration-move) ease-out [background:conic-gradient(from_calc(var(--a,0deg)-40deg),transparent,rgb(0_0_0/0.05)_40deg,transparent_80deg)] [mask:radial-gradient(circle,transparent_33%,#000_34%,#000_70%,transparent_100%)] dark:[background:conic-gradient(from_calc(var(--a,0deg)-40deg),transparent,rgb(255_255_255/0.12)_40deg,transparent_80deg)]"
        />

        <button type="button" tabIndex={-1} data-dial="up" aria-label={labels.up} onClick={activate("up")} className={cn(position, "left-[30%] top-[2%] h-[26%] w-[40%]")}>
          <svg aria-hidden viewBox="0 0 16 16" className={glyph}>
            <path d="M3.5 10 8 5.5l4.5 4.5" />
          </svg>
        </button>
        <button type="button" tabIndex={-1} data-dial="down" aria-label={labels.down} onClick={activate("down")} className={cn(position, "bottom-[2%] left-[30%] h-[26%] w-[40%]")}>
          <svg aria-hidden viewBox="0 0 16 16" className={glyph}>
            <path d="M3.5 6 8 10.5 12.5 6" />
          </svg>
        </button>
        <button type="button" tabIndex={-1} data-dial="prev" aria-label={labels.prev} onClick={activate("prev")} className={cn(position, "left-[2%] top-[30%] h-[40%] w-[26%]")}>
          <svg aria-hidden viewBox="0 0 16 16" className={glyph}>
            <path d="M8 3.5 3.5 8 8 12.5M13 3.5 8.5 8l4.5 4.5" />
          </svg>
        </button>
        <button type="button" tabIndex={-1} data-dial="next" aria-label={labels.next} onClick={activate("next")} className={cn(position, "right-[2%] top-[30%] h-[40%] w-[26%]")}>
          <svg aria-hidden viewBox="0 0 16 16" className={glyph}>
            <path d="M8 3.5 12.5 8 8 12.5M3 3.5 7.5 8 3 12.5" />
          </svg>
        </button>

        {/* The centre key sits in a well cut through the dial. */}
        <div className="absolute inset-[29%] rounded-full shadow-(--device-recess)">
          <button
            type="button"
            tabIndex={-1}
            data-dial="ok"
            aria-label={labels.ok}
            onClick={activate("ok")}
            data-pressed={pressed === "ok" || undefined}
            className="absolute inset-[5%] grid place-items-center rounded-full [background:var(--device-wheel-face)] shadow-(--device-key-shadow) transition-[transform,box-shadow] duration-(--duration-exit) ease-out data-pressed:translate-y-[2px] data-pressed:shadow-(--device-key-shadow-pressed) data-pressed:duration-75"
          >
            {/* OK, printed small. */}
            <span aria-hidden className="text-[max(8px,4.4cqw)] font-semibold tracking-[0.08em] text-(--device-key-ink) opacity-55 [text-shadow:var(--device-engrave)]">
              OK
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
