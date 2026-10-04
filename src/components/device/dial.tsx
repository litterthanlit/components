"use client";

import { useRef, useState, type CSSProperties, type PointerEvent, type ReactNode, type RefObject } from "react";
import { cn } from "@/design-system";
import { play } from "@/lib/sound";
import { focusQuietly } from "./hooks";

type DialProps = {
  /** The centre pressed with no pointer to hold it down (a keyboard shortcut), shown briefly. */
  flash: boolean;
  /** Detents turned since the last call: positive is clockwise. */
  onTurn: (steps: number) => void;
  /** The centre key: what it says and does depends on the screen (PLAY on a take, OK on a list). */
  centre: { label: string; glyph: ReactNode; onPress: () => void };
  /** The ring is a slider over whatever the screen is stepping through. */
  slider: { label: string; now: number; max: number; text: string };
  sliderRef: RefObject<HTMLDivElement | null>;
  /** id of the hint that explains the keys. */
  hint: string;
  className?: string;
};

const DETENT = 15; // degrees of turn per click
const REST = 38; // degrees: where the dimple sits before the first turn, up and to the right

/**
 * The dial: a ring that turns round a large centre key. The ring only turns:
 * one detent every 15° steps through whatever the screen shows, and a dimple
 * near its rim, a shallow cup for a fingertip, travels with the hand so the
 * ring shows how far it has gone. Turning is measured as the angle swept
 * around the centre, under pointer capture. The centre is the deck's main
 * key, PLAY on a take and OK on a list; a press on it never turns.
 *
 * The centre is a real button, left out of the tab order because the ring
 * (a slider) takes the keyboard, and Space and Enter reach it from anywhere.
 */
export function Dial({ flash, onTurn, centre, slider, sliderRef, hint, className }: DialProps) {
  const dialRef = useRef<HTMLDivElement>(null);
  const rotorRef = useRef<HTMLDivElement>(null);
  const spin = useRef(REST);
  const drag = useRef<{ id: number; angle: number; acc: number; centre: boolean } | null>(null);
  const [held, setHeld] = useState(false);
  const pressed = held || flash;

  function polar(e: PointerEvent) {
    const r = dialRef.current!.getBoundingClientRect();
    const x = e.clientX - (r.left + r.width / 2);
    const y = e.clientY - (r.top + r.height / 2);
    return { angle: (Math.atan2(y, x) * 180) / Math.PI, distance: Math.hypot(x, y) / (r.width / 2) };
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const { angle, distance } = polar(e);
    if (distance > 1.02) return;
    // Keep the press from selecting text or focusing the centre: the ring
    // takes focus instead, so the keyboard picks up where the hand left off.
    e.preventDefault();
    focusQuietly(sliderRef.current);
    e.currentTarget.setPointerCapture(e.pointerId);
    const onCentre = (e.target as Element).closest("[data-dial-centre]") !== null;
    drag.current = { id: e.pointerId, angle, acc: 0, centre: onCentre };
    if (onCentre) {
      setHeld(true);
      play("press");
    }
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const g = drag.current;
    if (!g || g.id !== e.pointerId || g.centre) return;
    const { angle } = polar(e);
    let delta = angle - g.angle;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    g.angle = angle;
    g.acc += delta;
    // The dimple follows the hand exactly; the detents decide the steps.
    spin.current += delta;
    rotorRef.current?.style.setProperty("--a", `${spin.current.toFixed(2)}deg`);
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
    if (!g.centre) return;
    setHeld(false);
    play("release");
    // The centre only counts if it lets go over the centre.
    if (commit && polar(e).distance < 0.44) centre.onPress();
  }

  return (
    <div className={cn("@container relative aspect-square select-none", className)}>
      {/* The collar: a round well the ring sits in. */}
      <div aria-hidden className="absolute inset-0 rounded-full bg-black/[0.035] shadow-(--device-recess) dark:bg-black/30" />
      <div
        ref={dialRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => onPointerEnd(e, true)}
        onPointerCancel={(e) => onPointerEnd(e, false)}
        onLostPointerCapture={(e) => onPointerEnd(e, false)}
        className="absolute inset-[3.5%] touch-none rounded-full [background:var(--device-wheel-face)] shadow-(--device-wheel-shadow)"
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

        {/* The dimple, turning with the ring. Clipped to the ring, so its turn never spills. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
          <div ref={rotorRef} className="absolute inset-0 [rotate:var(--a)]" style={{ "--a": `${REST}deg` } as CSSProperties}>
            <span className="absolute left-1/2 top-[6%] size-[12%] -translate-x-1/2 rounded-full bg-black/[0.03] shadow-(--device-recess) dark:bg-black/25" />
          </div>
        </div>

        {/* The centre key, in a well cut through the ring. */}
        <div className="absolute inset-[27%] rounded-full shadow-(--device-recess)">
          <button
            type="button"
            tabIndex={-1}
            data-dial-centre
            aria-label={centre.label}
            // Pointer presses are handled above; this catches keyboard and assistive-tech activation (detail 0).
            onClick={(e) => e.detail === 0 && centre.onPress()}
            data-pressed={pressed || undefined}
            className="absolute inset-[5%] grid place-items-center rounded-full [background:var(--device-wheel-face)] shadow-(--device-key-shadow) transition-[transform,box-shadow] duration-(--duration-exit) ease-out data-pressed:translate-y-[2px] data-pressed:shadow-(--device-key-shadow-pressed) data-pressed:duration-75"
          >
            {centre.glyph}
          </button>
        </div>
      </div>
    </div>
  );
}
