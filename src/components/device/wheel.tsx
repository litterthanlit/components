"use client";

import { useRef, useState, type PointerEvent, type RefObject } from "react";
import { cn } from "@/design-system";
import { play } from "@/lib/sound";

export type WheelButton = "menu" | "prev" | "next" | "play" | "select";

type WheelProps = {
  /** A press with no pointer to hold it down (keyboard), shown briefly. */
  flash: WheelButton | null;
  /** Detents turned since the last call: positive is clockwise. */
  onTurn: (steps: number) => void;
  onPress: (button: WheelButton) => void;
  /** The ring is a slider over whatever the screen is stepping through. */
  slider: { label: string; now: number; max: number; text: string };
  sliderRef: RefObject<HTMLDivElement | null>;
  /** id of the hint that explains the keys. */
  hint: string;
  playing: boolean;
  className?: string;
};

const DETENT = 15; // degrees of turn per click
const SLOP = 8; // degrees a press may slide before it becomes a turn

/*
 * Each side of the ring sinks and rocks toward the press, as the 2009 wheel
 * did; the centre is a key of its own that drops 2px into its well.
 */
const ROCK: Record<Exclude<WheelButton, "select">, string> = {
  menu: "perspective(600px) translateY(1.5px) rotateX(5deg)",
  play: "perspective(600px) translateY(1.5px) rotateX(-5deg)",
  prev: "perspective(600px) translateY(1.5px) rotateY(-5deg)",
  next: "perspective(600px) translateY(1.5px) rotateY(5deg)",
};

const label = "absolute grid place-items-center text-(--device-key-ink) [filter:var(--device-engrave-glyph)]";
const glyph = "size-[max(10px,6.5cqw)] fill-current";

/**
 * The click wheel. Turning is measured as the angle swept around the centre
 * (pointer capture, one detent every 15°); a press that slides further than a
 * few degrees becomes a turn. Handlers sit on the whole wheel, so a press on
 * a label can still turn into a turn.
 *
 * The four positions and the centre are real buttons, left out of the tab
 * order because the ring (a slider) takes the keyboard for all of them.
 */
export function Wheel({ flash, onTurn, onPress, slider, sliderRef, hint, playing, className }: WheelProps) {
  const wheelRef = useRef<HTMLDivElement>(null);
  const trailRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; angle: number; acc: number; travel: number; button: WheelButton | null; turns: boolean } | null>(null);
  const [held, setHeld] = useState<WheelButton | null>(null);
  const pressed = held ?? flash;

  function polar(e: PointerEvent) {
    const r = wheelRef.current!.getBoundingClientRect();
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
    sliderRef.current?.focus({ preventScroll: true });
    e.currentTarget.setPointerCapture(e.pointerId);
    const hit = (e.target as Element).closest<HTMLElement>("[data-wheel]");
    const button = (hit?.dataset.wheel as WheelButton | undefined) ?? null;
    drag.current = { id: e.pointerId, angle, acc: 0, travel: 0, button, turns: button !== "select" };
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
      // A press that starts sliding becomes a turn, as on the real wheel.
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
    const over = g.button !== "select" || polar(e).distance < 0.42;
    if (commit && over) onPress(g.button);
  }

  // Pointer presses are handled above; this catches keyboard and assistive-tech activation (detail 0).
  const activate = (button: WheelButton) => (e: { detail: number }) => {
    if (e.detail === 0) onPress(button);
  };

  const rocked = pressed && pressed !== "select";

  return (
    <div className={cn("@container relative aspect-square select-none", className)}>
      <div
        ref={wheelRef}
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
          aria-orientation="vertical"
          aria-valuemin={1}
          aria-valuemax={slider.max}
          aria-valuenow={slider.now}
          aria-valuetext={slider.text}
          className="absolute inset-0 cursor-grab rounded-full outline-offset-4 active:cursor-grabbing"
        />

        {/* Detents, cut finely into the rim. */}
        <svg aria-hidden viewBox="-50 -50 100 100" className="pointer-events-none absolute inset-0 size-full text-(--device-key-ink) opacity-25">
          {Array.from({ length: 24 }, (_, i) => (
            <line key={i} x1="0" y1="-48.6" x2="0" y2="-46.6" stroke="currentColor" strokeWidth="0.35" transform={`rotate(${i * DETENT})`} />
          ))}
        </svg>

        <div
          ref={trailRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full opacity-0 transition-opacity duration-(--duration-move) ease-out [background:conic-gradient(from_calc(var(--a,0deg)-40deg),transparent,rgb(255_255_255/0.55)_40deg,transparent_80deg)] [mask:radial-gradient(circle,transparent_33%,#000_34%,#000_70%,transparent_100%)] dark:[background:conic-gradient(from_calc(var(--a,0deg)-40deg),transparent,rgb(255_255_255/0.12)_40deg,transparent_80deg)]"
        />

        <button
          type="button"
          tabIndex={-1}
          data-wheel="menu"
          aria-label="Menu"
          onClick={activate("menu")}
          className={cn(label, "left-[30%] top-[3%] h-[24%] w-[40%] text-[max(9px,5.4cqw)] font-semibold tracking-[0.1em] [filter:none] [text-shadow:var(--device-engrave)]")}
        >
          MENU
        </button>
        <button type="button" tabIndex={-1} data-wheel="prev" aria-label="Previous" onClick={activate("prev")} className={cn(label, "left-[3%] top-[30%] h-[40%] w-[24%]")}>
          <svg aria-hidden viewBox="0 0 16 16" className={glyph}>
            <path d="M2 3.5h1.6v9H2zM8.6 3.5 3.8 8l4.8 4.5zM14 3.5 9.2 8l4.8 4.5z" />
          </svg>
        </button>
        <button type="button" tabIndex={-1} data-wheel="next" aria-label="Next" onClick={activate("next")} className={cn(label, "right-[3%] top-[30%] h-[40%] w-[24%]")}>
          <svg aria-hidden viewBox="0 0 16 16" className={glyph}>
            <path d="M12.4 3.5H14v9h-1.6zM7.4 3.5 12.2 8l-4.8 4.5zM2 3.5 6.8 8 2 12.5z" />
          </svg>
        </button>
        <button
          type="button"
          tabIndex={-1}
          data-wheel="play"
          aria-label={playing ? "Stop shuffle" : "Shuffle"}
          aria-pressed={playing}
          onClick={activate("play")}
          className={cn(label, "bottom-[3%] left-[30%] h-[24%] w-[40%]")}
        >
          <svg aria-hidden viewBox="0 0 22 16" className="h-[max(10px,6.5cqw)] w-auto fill-current">
            <path d="M1.5 3 8.5 8l-7 5zM12 3h2.6v10H12zM17 3h2.6v10H17z" />
          </svg>
        </button>

        {/* The centre key sits in a well cut through the ring. */}
        <div className="absolute inset-[29%] rounded-full shadow-(--device-recess)">
          <button
            type="button"
            tabIndex={-1}
            data-wheel="select"
            aria-label="Select"
            onClick={activate("select")}
            data-pressed={pressed === "select" || undefined}
            className="absolute inset-[5%] rounded-full [background:var(--device-key-face)] shadow-(--device-key-shadow) transition-[transform,box-shadow] duration-(--duration-exit) ease-out data-pressed:translate-y-[2px] data-pressed:shadow-(--device-key-shadow-pressed) data-pressed:duration-75"
          >
            {/* Fine lathe rings, catching the light. */}
            <span
              aria-hidden
              className="absolute inset-0 rounded-full opacity-60 [background:repeating-radial-gradient(circle,rgb(255_255_255/0.22)_0_0.5px,transparent_0.5px_2.5px)] dark:opacity-25"
            />
          </button>
        </div>
      </div>
    </div>
  );
}
