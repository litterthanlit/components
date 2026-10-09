"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { focusQuietly } from "@/design-system";
import { hostTransport, play, type PlayOptions, type SoundName } from "@/lib/sound";

/*
 * A destructive action that asks for intent, after a recorder's erase key:
 * a round key seated in a collar, with a ring of twelve lights around it.
 * Press and hold (pointer, Space or Enter) and the ring fills, light by
 * light, each one a click a little higher than the last, until it's full
 * and the action runs. Let go early and the ring runs back.
 *
 * The ring is drawn from a frame loop straight to the DOM, so holding never
 * re-renders React. `rehearse` shows the gesture once on mount: the key goes
 * down, the ring fills part way, and it lets go.
 */

const SEGMENTS = 12;
const REWIND = 220; // ms for a full ring to run back
const HOLD_LIT = 450; // ms a full ring stays lit once the action has run

type HoldToConfirmProps = {
  onConfirm: () => void;
  /** The key's name, printed under it. */
  children: ReactNode;
  /** Hold duration in ms. */
  duration?: number;
  /** Show the gesture once on mount: press, part of the ring, let go. */
  rehearse?: boolean;
  className?: string;
};

/** The ring's lights: twelve strokes round the collar, the first at twelve o'clock. */
const ring = Array.from({ length: SEGMENTS }, (_, i) => {
  const a = ((i * 360) / SEGMENTS - 90 + 360 / SEGMENTS / 2) * (Math.PI / 180);
  const p = (r: number) => `${(50 + r * Math.cos(a)).toFixed(2)} ${(50 + r * Math.sin(a)).toFixed(2)}`;
  return `M${p(41)}L${p(47)}`;
});

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export function HoldToConfirm({ onConfirm, children, duration = 1200, rehearse = false, className = "" }: HoldToConfirmProps) {
  const [pressed, setPressed] = useState(false);
  const hintId = useId();
  const rootRef = useRef<HTMLButtonElement>(null);
  const confirm = useRef(onConfirm);
  const engine = useRef<{ press: (ghost?: boolean) => void; release: () => void } | null>(null);

  useLayoutEffect(() => {
    confirm.current = onConfirm;
  });

  // The ring: fills while held, runs back when let go, and stays lit a moment once the action has run.
  useLayoutEffect(() => {
    const root = rootRef.current!;
    const lights = [...root.querySelectorAll<SVGPathElement>("[data-segment]")];
    let p = 0;
    let lit = 0;
    let holding = false;
    let ghost = false; // a rehearsal: it only sounds while the host's tape plays
    let litUntil = 0;
    let raf = 0;
    let last = 0;

    const sound = (name: SoundName, options?: PlayOptions) => {
      if (!ghost || hostTransport(root) === "play") play(name, options);
    };

    const draw = () => {
      const next = Math.min(SEGMENTS, Math.floor(p * SEGMENTS + 1e-6));
      if (next !== lit) {
        lights.forEach((light, i) => {
          if (i < next) light.dataset.on = "";
          else delete light.dataset.on;
        });
        // A ratchet: each light that comes on clicks a little higher.
        if (holding && next > lit) sound("tick", { gain: 0.7, pitch: 0.88 + next * 0.045 });
        lit = next;
      }
      root.style.setProperty("--p", p.toFixed(3));
    };

    const frame = (now: number) => {
      const dt = now - last;
      last = now;
      if (holding) {
        p = Math.min(1, p + dt / duration);
        if (p >= 1) {
          holding = false;
          litUntil = now + HOLD_LIT;
          setPressed(false);
          sound("stop");
          if (!ghost) confirm.current();
        }
      } else if (now >= litUntil) {
        p = Math.max(0, p - dt / REWIND);
      }
      draw();
      if (holding || p > 0) raf = requestAnimationFrame(frame);
      else raf = 0;
    };

    const run = () => {
      if (raf) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };

    engine.current = {
      press(rehearsal = false) {
        if (holding || performance.now() < litUntil) return;
        ghost = rehearsal;
        holding = true;
        setPressed(true);
        sound("press");
        run();
      },
      release() {
        if (!holding) return;
        holding = false;
        setPressed(false);
        sound("release");
        if (p > 0) sound("bump", { gain: 0.7 });
        run();
      },
    };
    return () => cancelAnimationFrame(raf);
  }, [duration]);

  // Rehearsal: press after a beat, fill about seven lights, let go.
  useEffect(() => {
    if (!rehearse || reducedMotion()) return;
    const down = setTimeout(() => engine.current?.press(true), 400);
    const up = setTimeout(() => engine.current?.release(), 400 + duration * 0.6);
    return () => {
      clearTimeout(down);
      clearTimeout(up);
    };
  }, [rehearse, duration]);

  const start = () => engine.current?.press();
  const cancel = () => engine.current?.release();

  return (
    <button
      ref={rootRef}
      type="button"
      data-pressed={pressed || undefined}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        focusQuietly(e.currentTarget);
        start();
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) {
          e.preventDefault();
          start();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === " " || e.key === "Enter") cancel();
      }}
      onContextMenu={(e) => e.preventDefault()}
      aria-describedby={hintId}
      className={`group/key flex touch-none select-none flex-col items-center gap-[0.7em] rounded-[1em] outline-offset-4 [-webkit-touch-callout:none] ${className}`}
    >
      <span className="relative grid size-[7.2em] place-items-center">
        {/* The ring of lights. */}
        <svg aria-hidden data-part="light" viewBox="0 0 100 100" className="absolute inset-0 size-full">
          {ring.map((d, i) => (
            <path
              key={i}
              data-segment
              d={d}
              strokeWidth="4.2"
              strokeLinecap="round"
              className="stroke-(--device-meter-off) transition-[stroke] duration-(--duration-exit) data-on:stroke-(--device-rec) data-on:duration-0 drawn:stroke-(--device-draw-line)! drawn:data-on:stroke-(--device-rec)!"
            />
          ))}
        </svg>
        {/* The collar, and the cap that sinks into it. Its mark glows as the hold builds; drawn, a red disc grows in its ring instead. */}
        <span aria-hidden data-part="collar" className="grid size-[68%] place-items-center rounded-full bg-black/[0.035] p-[7%] shadow-(--device-recess) dark:bg-black/30">
          <span data-part="cap" className="grid size-full place-items-center rounded-full [background:var(--device-wheel-face)] shadow-(--device-key-shadow) transition-[transform,box-shadow] duration-(--duration-exit) ease-out group-data-pressed/key:translate-y-[2px] group-data-pressed/key:shadow-(--device-key-shadow-pressed) group-data-pressed/key:duration-75">
            <span
              data-part="light"
              className="size-[26%] rounded-full bg-(--device-rec) drawn:[background-image:radial-gradient(circle,var(--device-rec)_calc(18%+var(--p,0)*28%),transparent_calc(19%+var(--p,0)*28%))]!"
              style={{ boxShadow: "0 0 calc(var(--p, 0) * 1.1em) calc(var(--p, 0) * 0.15em) var(--device-rec)" }}
            />
          </span>
        </span>
      </span>
      <span data-part="lettering" className="text-[0.62em] font-semibold uppercase leading-none tracking-[0.16em] text-(--device-label) [text-shadow:var(--device-engrave)]">
        {children}
      </span>
      <span id={hintId} className="sr-only">
        Press and hold to confirm
      </span>
    </button>
  );
}

export default function Demo() {
  const [take, setTake] = useState(4);
  const [erased, setErased] = useState(false);

  // After an erase the recorder moves on to the next take.
  useEffect(() => {
    if (!erased) return;
    const id = setTimeout(() => {
      setErased(false);
      setTake((t) => (t % 99) + 1);
    }, 2200);
    return () => clearTimeout(id);
  }, [erased]);

  const file = `take_${String(take).padStart(2, "0")}.wav`;

  return (
    <div className="@container w-full max-w-[280px] select-none">
      <div data-part="plate" className="relative isolate flex animate-enter flex-col items-center gap-[1em] overflow-hidden rounded-[1.25em] p-[0.9em] pb-[1.1em] text-[clamp(11px,4.6cqw,14px)] [background:var(--device-body)] shadow-[var(--device-body-edge),0_1px_2px_rgb(0_0_0/0.06),0_16px_32px_-18px_rgb(0_0_0/0.3)]">
        <div aria-hidden className="device-grain pointer-events-none absolute inset-0 -z-10 rounded-[inherit]" />

        <div
          aria-hidden
          data-part="lcd"
          className="flex h-[3.3em] w-full flex-col justify-between overflow-hidden rounded-[0.7em] px-[0.8em] pb-[0.5em] pt-[0.55em] text-(--device-lcd-ink) [background:var(--device-lcd)] shadow-(--device-lcd-edge)"
        >
          <span data-part="chip" className="inline-flex items-center gap-[0.35em] self-start rounded-[0.4em] bg-white px-[0.42em] py-[0.24em] text-black">
            {/* Drawn, the recording dot stays red (it records); the erased square is ink. */}
            <span className={erased ? "size-[0.5em] rounded-[1px] bg-current drawn:bg-(--device-draw-ink)!" : "size-[0.55em] rounded-full bg-(--device-rec) drawn:bg-(--device-rec)!"} />
            <span className="text-[0.58em] font-semibold uppercase leading-none tracking-[0.02em]">{erased ? "Erased" : "Take"}</span>
          </span>
          <span key={file + erased} className="animate-enter truncate text-[1.05em] font-light leading-none tracking-[-0.01em]">
            {erased ? <span className="text-(--device-lcd-dim) line-through decoration-1">{file}</span> : file}
          </span>
        </div>

        <HoldToConfirm rehearse onConfirm={() => setErased(true)}>
          Hold to erase
        </HoldToConfirm>
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {erased ? `${file} erased` : ""}
      </p>
    </div>
  );
}
