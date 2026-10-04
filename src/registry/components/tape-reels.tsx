"use client";

import { useEffect, useEffectEvent, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { createSpring, focusQuietly } from "@/design-system";
import { hostTransport, play } from "@/lib/sound";

/*
 * Progress as a tape transport: two reels behind smoked glass, the tape
 * running from one to the other over two guides and a head.
 *
 * The reels keep real proportions. Tape winds at a constant speed, so a
 * reel's radius grows with the square root of the tape on it, and its angle
 * comes out in closed form: θ = 2(r − r_hub) / k, where k is the tape's
 * thickness over π. The emptying reel visibly speeds up as it runs down, and
 * a jump in progress makes both reels whirl, as fast-forward does.
 *
 * Progress eases in on a critically damped spring (the reels have mass) and
 * is drawn by writing CSS variables and SVG attributes, never re-rendering
 * React. Reels turn by their gradients, not transforms. With `onSeek`, the
 * window is a slider: drag either reel round, or use the arrow keys.
 */

/* The window's geometry, in viewBox units (200 × 110). */
const W = 200;
const H = 110;
const R = 38; // a full pack
const HUB = 15;
const REELS = [
  { x: 52, y: 46 },
  { x: 148, y: 46 },
];
const GUIDES = [
  { x: 13, y: 96 },
  { x: 187, y: 96 },
];
const GUIDE_R = 5;
const TAPE_Y = GUIDES[0].y - GUIDE_R; // the run across the head
/** Tape thickness over π, chosen so a reel turns about eight times end to end. */
const K = (2 * (R - HUB)) / (2 * Math.PI * 8);
const LENGTH = (R * R - HUB * HUB) / K; // the whole tape, in viewBox units
const TICK_EVERY = Math.PI / 6; // a click every 30° of reel turned by hand

/** Pack radii and reel angles (radians) at progress p. */
function transport(p: number) {
  const span = R * R - HUB * HUB;
  const supply = Math.sqrt(HUB * HUB + (1 - p) * span);
  const takeUp = Math.sqrt(HUB * HUB + p * span);
  return { supply, takeUp, a: [(2 * (R - supply)) / K, (2 * (takeUp - HUB)) / K] };
}

/** Where tape leaving `from` meets a circle, on the side away from the head. */
function tangent(from: { x: number; y: number }, c: { x: number; y: number }, r: number, outer: -1 | 1) {
  const dx = from.x - c.x;
  const dy = from.y - c.y;
  const d = Math.hypot(dx, dy);
  const phi = Math.atan2(dy, dx);
  const alpha = Math.acos(Math.min(1, r / d));
  const t = phi + outer * alpha;
  return { x: c.x + r * Math.cos(t), y: c.y + r * Math.sin(t) };
}

const pct = (v: number) => `${((v / R) * 100).toFixed(2)}%`;

type TapeReelsProps = {
  /** 0 to 1. */
  progress: number;
  label: string;
  /** The head is writing: its light is on. */
  recording?: boolean;
  /** Makes the window a slider: called with the new progress as a hand turns a reel. */
  onSeek?: (progress: number) => void;
  /** The hand let go. */
  onSeekEnd?: () => void;
  className?: string;
};

export function TapeReels({ progress, label, recording = false, onSeek, onSeekEnd, className = "" }: TapeReelsProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const tapeRef = useRef<SVGPolylineElement>(null);
  const spring = useRef<ReturnType<typeof createSpring> | null>(null);
  const shown = useRef(progress);
  const drag = useRef<{ id: number; reel: 0 | 1; angle: number; turned: number; p: number } | null>(null);

  // The spring runs in thousandths, so it settles without a visible last step.
  useLayoutEffect(() => {
    const root = rootRef.current!;
    const reels = [...root.querySelectorAll<HTMLElement>("[data-reel]")];
    const draw = (permille: number) => {
      const p = Math.min(1, Math.max(0, permille / 1000));
      shown.current = p;
      const { supply, takeUp, a } = transport(p);
      [supply, takeUp].forEach((r, i) => {
        reels[i].style.setProperty("--r", pct(r));
        reels[i].style.setProperty("--a", `${((a[i] * 180) / Math.PI).toFixed(2)}deg`);
      });
      // The tape: off the supply pack, round the left guide, across the head, round the right guide, onto the take-up pack.
      const left = tangent({ x: GUIDES[0].x - GUIDE_R, y: GUIDES[0].y }, REELS[0], supply, 1);
      const right = tangent({ x: GUIDES[1].x + GUIDE_R, y: GUIDES[1].y }, REELS[1], takeUp, -1);
      tapeRef.current?.setAttribute(
        "points",
        `${left.x.toFixed(2)},${left.y.toFixed(2)} ${GUIDES[0].x - GUIDE_R},${GUIDES[0].y} ${GUIDES[0].x},${TAPE_Y} ${GUIDES[1].x},${TAPE_Y} ${GUIDES[1].x + GUIDE_R},${GUIDES[1].y} ${right.x.toFixed(2)},${right.y.toFixed(2)}`,
      );
    };
    const s = createSpring(shown.current * 1000, { stiffness: 140, damping: 24 }, draw);
    spring.current = s;
    draw(shown.current * 1000);
    return () => s.stop();
  }, []);

  useLayoutEffect(() => {
    const s = spring.current!;
    // A hand on a reel moves the tape itself; anything else eases in.
    if (drag.current || matchMedia("(prefers-reduced-motion: reduce)").matches) s.jump(progress * 1000);
    else s.set(progress * 1000);
  }, [progress]);

  /* --- Seeking ------------------------------------------------------------ */

  const seek = (p: number) => onSeek?.(Math.min(1, Math.max(0, p)));

  function angleTo(e: PointerEvent, reel: 0 | 1) {
    const box = rootRef.current!.getBoundingClientRect();
    const cx = box.left + (REELS[reel].x / W) * box.width;
    const cy = box.top + (REELS[reel].y / H) * box.height;
    return Math.atan2(e.clientY - cy, e.clientX - cx);
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (!onSeek || e.button !== 0) return;
    e.preventDefault();
    focusQuietly(e.currentTarget);
    e.currentTarget.setPointerCapture(e.pointerId);
    const box = e.currentTarget.getBoundingClientRect();
    const reel = e.clientX - box.left < box.width / 2 ? 0 : 1;
    drag.current = { id: e.pointerId, reel, angle: angleTo(e, reel), turned: 0, p: shown.current };
    play("press", { gain: 0.6 });
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const angle = angleTo(e, d.reel);
    let delta = angle - d.angle;
    if (delta > Math.PI) delta -= 2 * Math.PI;
    if (delta < -Math.PI) delta += 2 * Math.PI;
    d.angle = angle;
    // Clockwise winds forward on either reel; the tape moved is the turn times the radius under the hand.
    const { supply, takeUp } = transport(d.p);
    d.p = Math.min(1, Math.max(0, d.p + (delta * (d.reel ? takeUp : supply)) / LENGTH));
    d.turned += delta;
    if (Math.abs(d.turned) >= TICK_EVERY) {
      d.turned %= TICK_EVERY;
      play("tick", { gain: 0.6, pitch: 0.92 + d.p * 0.16 });
    }
    seek(d.p);
  }

  function onPointerEnd(e: PointerEvent<HTMLDivElement>) {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    play("release", { gain: 0.6 });
    onSeekEnd?.();
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!onSeek) return;
    const delta = { ArrowRight: 0.01, ArrowUp: 0.01, ArrowLeft: -0.01, ArrowDown: -0.01, PageUp: 0.1, PageDown: -0.1 }[e.key];
    const next = delta !== undefined ? progress + delta : e.key === "Home" ? 0 : e.key === "End" ? 1 : null;
    if (next === null) return;
    e.preventDefault();
    if ((next <= 0 && progress <= 0) || (next >= 1 && progress >= 1)) return play("bump", { gain: 0.6 });
    play("tick", { gain: 0.6, pitch: 0.92 + next * 0.16 });
    seek(next);
    onSeekEnd?.();
  }

  const percent = Math.round(progress * 100);
  const a11y = onSeek
    ? { role: "slider", tabIndex: 0, "aria-orientation": "horizontal" as const, onKeyDown }
    : { role: "progressbar" };

  return (
    <div
      ref={rootRef}
      {...a11y}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={`${percent}%`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      className={`relative isolate aspect-[200/110] w-full touch-none select-none overflow-hidden rounded-[0.8em] outline-offset-2 [background:var(--device-window)] shadow-(--device-window-edge) ${onSeek ? "cursor-grab active:cursor-grabbing" : ""} ${className}`}
    >
      {/* A fine grille behind the glass and the lamp that lights the transport, as in the maker's window. */}
      <div aria-hidden className="absolute inset-0 -z-10 [background-image:radial-gradient(rgb(255_255_255/0.06)_0.7px,transparent_0.9px)] [background-size:5px_5px]" />
      <div aria-hidden className="absolute inset-0 -z-10 [background:radial-gradient(60%_55%_at_50%_42%,rgb(255_255_255/0.1),transparent)]" />

      {REELS.map((reel, i) => (
        <div
          key={i}
          data-reel
          aria-hidden
          className="absolute aspect-square rounded-full"
          style={
            {
              left: `${((reel.x - R) / W) * 100}%`,
              top: `${((reel.y - R) / H) * 100}%`,
              width: `${((2 * R) / W) * 100}%`,
              "--r": pct(HUB),
              "--a": "0deg",
            } as CSSProperties
          }
        >
          {/* The pack: oxide wound in fine layers, lit from above. */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background:
                "radial-gradient(circle closest-side, transparent calc(var(--r) - 0.6%), rgb(255 255 255 / 0.22) calc(var(--r) - 0.6%), rgb(255 255 255 / 0.22) var(--r), transparent var(--r)), repeating-radial-gradient(circle closest-side, rgb(255 255 255 / 0.035) 0 0.7%, transparent 0.7% 1.6%), radial-gradient(circle closest-side, #4b3426 0, #3a281d calc(var(--r) - 1%), #2c1e16 var(--r), transparent var(--r))",
              // The wound layers stop where the tape does.
              mask: "radial-gradient(circle closest-side, #000 var(--r), transparent var(--r))",
            }}
          />
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: "conic-gradient(from 290deg, transparent, rgb(255 255 255 / 0.1) 40deg, transparent 80deg, transparent 180deg, rgb(255 255 255 / 0.05) 220deg, transparent 260deg)",
              mask: "radial-gradient(circle closest-side, #000 var(--r), transparent var(--r))",
            }}
          />
          {/* The hub: three windows cut through it, and the spindle. */}
          <div
            className="absolute rounded-full [background:var(--device-wheel-face)] shadow-[0_0_0_0.5px_rgb(0_0_0/0.4),0_1px_3px_rgb(0_0_0/0.5)]"
            style={{ inset: `${50 - (HUB / R) * 50}%` }}
          >
            <div
              className="absolute inset-0 rounded-full bg-(--device-rim)"
              style={{
                mask: "conic-gradient(from var(--a), #000 0 46deg, transparent 46deg 120deg, #000 120deg 166deg, transparent 166deg 240deg, #000 240deg 286deg, transparent 286deg), radial-gradient(circle closest-side, transparent 42%, #000 43%, #000 84%, transparent 85%)",
                maskComposite: "intersect",
              }}
            />
            <div className="absolute inset-[38%] rounded-full bg-(--device-rim) shadow-[inset_0_0_0_1.5px_rgb(255_255_255/0.25)]" />
          </div>
        </div>
      ))}

      {/* Guides, the head and the tape between them. */}
      <svg aria-hidden viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 size-full">
        <polyline ref={tapeRef} fill="none" stroke="#3a281d" strokeWidth="1.6" strokeLinejoin="round" />
        {GUIDES.map((g, i) => (
          <g key={i}>
            <circle cx={g.x} cy={g.y} r={GUIDE_R} fill="#d9d9d7" stroke="rgb(0 0 0 / 0.5)" strokeWidth="0.6" />
            <circle cx={g.x} cy={g.y} r={GUIDE_R * 0.62} fill="none" stroke="rgb(0 0 0 / 0.18)" strokeWidth="0.5" />
            <circle cx={g.x} cy={g.y} r={GUIDE_R * 0.26} fill="#7a7a78" />
          </g>
        ))}
        <rect x={W / 2 - 9} y={TAPE_Y + 0.8} width="18" height="9" rx="1.6" fill="#cfcfcd" stroke="rgb(0 0 0 / 0.5)" strokeWidth="0.6" />
        <rect x={W / 2 - 5} y={TAPE_Y + 0.8} width="10" height="1.4" fill="#8e8e8c" />
        <circle
          cx={W / 2 + 14}
          cy={TAPE_Y + 5}
          r="1.6"
          className={recording ? "fill-(--device-rec) [filter:drop-shadow(0_0_2px_var(--device-rec))]" : "fill-white/15"}
        />
      </svg>

      {/* Glass: a sheen where the light catches it. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 [background:linear-gradient(112deg,rgb(255_255_255/0.07)_0%,rgb(255_255_255/0.02)_44%,transparent_44.2%)]" />
    </div>
  );
}

/* --- Demo: a take exporting to tape, on a loop -------------------------------- */

type Phase = "export" | "done" | "rewind" | "pause" | "stop";
const TAKE = 48; // seconds in the take being written
const chips: Record<Phase, string> = { export: "Export", done: "Done", rewind: "Rewind", pause: "Pause", stop: "Stop" };
const clock = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const jitter = () => 0.022 + Math.random() * 0.026;

export default function Demo() {
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<Phase>("stop");
  const [announcement, setAnnouncement] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const at = useRef(0); // progress, ahead of the render that shows it
  const touched = useRef(false);
  const ids = useId();

  const moveTo = (p: number) => {
    at.current = p;
    setProgress(p);
  };

  // Sounds follow the host's tape (see hostTransport): aloud while it plays, or once a hand is on this one.
  const sound = (name: "start" | "stop") => {
    if (touched.current || hostTransport(rootRef.current) === "play") play(name);
  };

  // Writing: progress arrives in uneven steps, as an export reports it, until the take is on tape.
  const write = useEffectEvent(() => {
    const next = Math.min(1, at.current + jitter());
    moveTo(next);
    if (next < 1) return;
    setPhase("done");
    sound("stop");
    setAnnouncement("Export done");
  });
  useEffect(() => {
    if (phase !== "export") return;
    const id = setInterval(write, 110);
    return () => clearInterval(id);
  }, [phase]);

  // Done: hold, rewind at speed, then write the take again.
  const restart = useEffectEvent(() => {
    setPhase("export");
    sound("start");
  });
  const rewind = useEffectEvent(() => {
    setPhase("rewind");
    moveTo(0);
  });
  useEffect(() => {
    if (phase !== "done" && phase !== "rewind") return;
    const id = setTimeout(phase === "done" ? rewind : restart, phase === "done" ? 1100 : 900);
    return () => clearTimeout(id);
  }, [phase]);

  // Power up: start writing unless the host's tape is stopped. Under reduced motion, sit part way in.
  const powerUp = useEffectEvent(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      moveTo(0.64);
      setPhase("pause");
    } else if (hostTransport(rootRef.current) !== "stop") restart();
  });
  useEffect(() => {
    const id = setTimeout(powerUp, 300);
    return () => clearTimeout(id);
  }, []);

  function toggle() {
    if (phase === "export") {
      setPhase("pause");
      play("stop", { gain: 0.55, pitch: 1.25 });
      setAnnouncement("Paused");
    } else {
      if (at.current >= 1) moveTo(0);
      setPhase("export");
      play("start");
      setAnnouncement("Exporting");
    }
  }

  const running = phase === "export" || phase === "rewind";

  return (
    <div
      ref={rootRef}
      onPointerDownCapture={() => (touched.current = true)}
      onKeyDownCapture={() => (touched.current = true)}
      className="@container w-full max-w-[440px] select-none"
    >
      <div className="relative isolate animate-enter overflow-hidden rounded-[1.25em] p-[0.9em] text-[clamp(11px,4cqw,14px)] [background:var(--device-body)] shadow-[var(--device-body-edge),0_1px_2px_rgb(0_0_0/0.06),0_16px_32px_-18px_rgb(0_0_0/0.3)] @[26rem]:p-[1.1em]">
        <div aria-hidden className="device-grain pointer-events-none absolute inset-0 -z-10 rounded-[inherit]" />

        {/* The transport sits in a well pressed into the plate. */}
        <div className="rounded-[1.05em] bg-(--device-well) p-[0.4em] shadow-(--device-recess)">
          <TapeReels
            label="Export progress, take_04.wav"
            progress={progress}
            recording={phase === "export"}
            onSeek={(p) => {
              if (phase !== "pause") setPhase("pause");
              moveTo(p);
            }}
          />
        </div>

        <div className="mt-[0.7em] flex items-stretch gap-[0.7em]">
          <div
            aria-hidden
            className="flex h-[3.4em] min-w-0 flex-1 flex-col justify-between overflow-hidden rounded-[0.7em] px-[0.8em] pb-[0.5em] pt-[0.55em] text-(--device-lcd-ink) [background:var(--device-lcd)] shadow-(--device-lcd-edge)"
          >
            <div className="flex min-w-0 items-center gap-[0.5em]">
              <span className="inline-flex shrink-0 items-center gap-[0.35em] rounded-[0.4em] bg-white px-[0.42em] py-[0.24em] text-black">
                <span className={phase === "export" ? "size-[0.55em] animate-pulse rounded-full bg-(--device-rec)" : "size-[0.5em] rounded-[1px] bg-current"} />
                <span className="text-[0.58em] font-semibold uppercase leading-none tracking-[0.02em]">{chips[phase]}</span>
              </span>
              <span className="truncate text-[0.7em] text-(--device-lcd-dim)">take_04.wav</span>
            </div>
            <p className="flex items-baseline justify-between gap-[0.6em] leading-none tabular-nums">
              <span className="text-[1.15em] font-light tracking-[-0.02em]">
                {clock(progress * TAKE)}
                <span className="text-(--device-lcd-dim)"> / {clock(TAKE)}</span>
              </span>
              <span className="text-[0.7em] text-(--device-lcd-dim)">{Math.round(progress * 100)} %</span>
            </p>
          </div>

          <button
            type="button"
            aria-label={phase === "export" ? "Pause" : "Export"}
            aria-pressed={running}
            aria-describedby={`${ids}-hint`}
            onPointerDown={(e) => e.button === 0 && focusQuietly(e.currentTarget)}
            onClick={toggle}
            className="group/key grid size-[3.4em] shrink-0 place-items-center rounded-full bg-black/[0.035] p-[0.26em] shadow-(--device-recess) outline-offset-2 dark:bg-black/30"
          >
            <span className="grid size-full place-items-center rounded-full [background:var(--device-wheel-face)] shadow-(--device-key-shadow) transition-[transform,box-shadow] duration-(--duration-exit) ease-out group-active/key:translate-y-[2px] group-active/key:shadow-(--device-key-shadow-pressed) group-active/key:duration-75">
              <svg aria-hidden viewBox="0 0 16 16" className="size-[1.3em] fill-(--device-rec)">
                {phase === "export" ? <path d="M4 2.5h2.8v11H4zM9.2 2.5H12v11H9.2z" /> : <path d="M4.5 2.4 13.2 8l-8.7 5.6z" />}
              </svg>
            </span>
          </button>
        </div>
      </div>

      <p id={`${ids}-hint`} className="sr-only">
        Turn a reel to scrub, or focus the window and use the arrow keys.
      </p>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
