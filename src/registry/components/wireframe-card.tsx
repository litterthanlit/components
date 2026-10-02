"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent } from "react";

/*
 * Project cards with an animated SVG cover: hairline wireframes in one-point
 * perspective on black, lit by beams of coloured light that run along the
 * lines into a glowing focal point.
 *
 * Every line is plain SVG. Lines draw themselves in with the pathLength
 * trick (pathLength=1, dash 1, offset 1 → 0); a beam is the same trick with
 * a short dash that slides along the path. Loops are CSS keyframes, a radial
 * mask fades the wireframe out toward the edges, and the pointer tilts the
 * layers at different depths through two CSS variables, so moving the mouse
 * never re-renders React. Animations pause off-screen and hold still under
 * prefers-reduced-motion.
 */

export type WireframeScene = "tunnel" | "horizon" | "blueprint";
export type WireframeTone = "cobalt" | "ice" | "dusk";

const W = 400;
const H = 300;

/** glow: the light behind the focal point; beam: the light on the lines. */
const tones: Record<WireframeTone, { glow: string; beam: string; word: string }> = {
  cobalt: { glow: "#2563eb", beam: "#7cb4ff", word: "#7cb4ff" },
  ice: { glow: "#0e7490", beam: "#7ee8fa", word: "#7ee8fa" },
  dusk: { glow: "#6d28d9", beam: "#c4b0ff", word: "#c4b0ff" },
};

/* ------------------------------------------------------------------------ */
/* Keyframes                                                                 */
/* ------------------------------------------------------------------------ */

/* Scoped with a wf- prefix; rendering this more than once is harmless. */
const STYLES = `
.wf-draw {
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  animation: wf-draw 1.4s cubic-bezier(0.65, 0, 0.35, 1) both;
  animation-delay: calc(var(--i, 0) * 70ms + 120ms);
}
@keyframes wf-draw { to { stroke-dashoffset: 0; } }

.wf-beam {
  stroke-dasharray: 0.14 0.86;
  stroke-dashoffset: 0.14;
  animation: wf-beam var(--dur, 2.6s) cubic-bezier(0.45, 0, 0.55, 1) infinite;
  animation-delay: calc(var(--i, 0) * -0.43s + 1.2s);
}
@keyframes wf-beam { to { stroke-dashoffset: -0.86; } }

.wf-cycle {
  stroke-dasharray: 1;
  animation: wf-cycle 7s cubic-bezier(0.65, 0, 0.35, 1) infinite both;
  animation-delay: calc(var(--i, 0) * 90ms);
}
@keyframes wf-cycle {
  0% { stroke-dashoffset: 1; }
  30%, 72% { stroke-dashoffset: 0; }
  100% { stroke-dashoffset: -1; }
}

.wf-fly {
  transform-box: view-box;
  animation: wf-fly 6s cubic-bezier(0.55, 0, 1, 0.45) infinite both;
  animation-delay: calc(var(--i, 0) * -1s);
}
@keyframes wf-fly {
  from { transform: scale(0.04); opacity: 0; }
  30% { opacity: 0.7; }
  to { transform: scale(1.35); opacity: 0; }
}

.wf-floor {
  animation: wf-floor 4.8s cubic-bezier(0.55, 0, 1, 0.45) infinite both;
  animation-delay: calc(var(--i, 0) * -0.6s);
}
@keyframes wf-floor {
  from { transform: translateY(0); opacity: 0; }
  25% { opacity: 0.4; }
  to { transform: translateY(150px); opacity: 0.8; }
}

.wf-breathe { animation: wf-breathe 4s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
@keyframes wf-breathe { 0%, 100% { opacity: 0.85; transform: scale(1); } 50% { opacity: 1; transform: scale(1.08); } }

.wf-depth {
  transform: translate(calc(var(--px, 0) * var(--z) * 1px), calc(var(--py, 0) * var(--z) * 0.75px));
  transition: transform 700ms cubic-bezier(0.23, 1, 0.32, 1);
}

[data-paused="true"] * { animation-play-state: paused !important; }

@media (prefers-reduced-motion: reduce) {
  .wf-draw, .wf-cycle, .wf-breathe { animation: none; stroke-dashoffset: 0; }
  .wf-beam { animation: none; opacity: 0; }
  .wf-fly { animation: none; opacity: 0.5; transform: scale(var(--still, 0.5)); }
  .wf-floor { animation: none; opacity: 0.5; transform: translateY(var(--still, 0px)); }
  .wf-depth { transition: none; }
}
`;

/* ------------------------------------------------------------------------ */
/* Scenes                                                                    */
/* ------------------------------------------------------------------------ */

type P = { x: number; y: number };
type Ids = { fade: string; glow: string; beam: string };

/** Shared hairline props: non-scaling, so strokes stay a hairline under scale. */
const hair = (opacity: number, width = 0.75) =>
  ({
    stroke: "currentColor",
    strokeWidth: width,
    strokeOpacity: opacity,
    fill: "none",
    vectorEffect: "non-scaling-stroke",
    pathLength: 1,
  }) as const;

const i = (n: number) => ({ "--i": n }) as CSSProperties;
const z = (n: number) => ({ "--z": n }) as CSSProperties;

/** A beam of light travelling along a line: a blurred coloured halo and a white core. */
function Beam({ from, to, n, ids, dur }: { from: P; to: P; n: number; ids: Ids; dur?: string }) {
  const style = { ...i(n), ...(dur ? { "--dur": dur } : {}) } as CSSProperties;
  const line = { x1: from.x, y1: from.y, x2: to.x, y2: to.y, pathLength: 1, fill: "none", strokeLinecap: "round" } as const;
  return (
    <>
      <line {...line} stroke={`var(--${ids.beam})`} strokeWidth={4} strokeOpacity={0.9} filter={`url(#${ids.glow})`} className="wf-beam" style={style} />
      <line {...line} stroke="#ffffff" strokeWidth={1.25} className="wf-beam" style={style} />
    </>
  );
}

/** A glowing rectangle: the bright, bloomed focal shape of a scene. */
function Focal({ x, y, width, height, ids }: { x: number; y: number; width: number; height: number; ids: Ids }) {
  return (
    <g className="wf-breathe">
      <rect x={x} y={y} width={width} height={height} fill="none" stroke={`var(--${ids.beam})`} strokeWidth={3} filter={`url(#${ids.glow})`} />
      <rect x={x} y={y} width={width} height={height} {...hair(1, 1)} className="wf-draw" style={i(6)} />
    </g>
  );
}

/** Rectangles stream out of the vanishing point while light runs down the corners. */
function Tunnel({ ids }: { ids: Ids }) {
  const vp: P = { x: 200, y: 150 };
  const corners: P[] = [
    { x: 0, y: 0 },
    { x: W, y: 0 },
    { x: W, y: H },
    { x: 0, y: H },
  ];
  const thirds: P[] = [
    { x: W / 3, y: 0 },
    { x: (2 * W) / 3, y: 0 },
    { x: W, y: H / 2 },
    { x: (2 * W) / 3, y: H },
    { x: W / 3, y: H },
    { x: 0, y: H / 2 },
  ];
  return (
    <>
      <g className="wf-depth" style={z(10)} mask={`url(#${ids.fade})`}>
        {corners.map((c, n) => (
          <line key={n} x1={vp.x} y1={vp.y} x2={c.x} y2={c.y} {...hair(0.35)} className="wf-draw" style={i(n)} />
        ))}
        {thirds.map((c, n) => (
          <line key={n} x1={vp.x} y1={vp.y} x2={c.x} y2={c.y} {...hair(0.12)} className="wf-draw" style={i(n + 2)} />
        ))}
        {Array.from({ length: 5 }, (_, n) => (
          <rect
            key={n}
            width={W}
            height={H}
            {...hair(0.55)}
            pathLength={undefined}
            className="wf-fly"
            style={{ ...i(n * 1.2), transformOrigin: `${vp.x}px ${vp.y}px`, "--still": 0.2 + n * 0.18 } as CSSProperties}
          />
        ))}
        {corners.map((c, n) => (
          <Beam key={n} from={vp} to={c} n={n * 1.5} ids={ids} />
        ))}
      </g>
      <g className="wf-depth" style={z(18)}>
        <Focal x={vp.x - 36} y={vp.y - 27} width={72} height={54} ids={ids} />
      </g>
    </>
  );
}

/** A floor grid racing toward you, with light shooting along it from the horizon. */
function Horizon({ ids }: { ids: Ids }) {
  const vp: P = { x: 200, y: 140 };
  const rays = Array.from({ length: 17 }, (_, n) => -600 + n * 100);
  return (
    <>
      <g className="wf-depth" style={z(6)} mask={`url(#${ids.fade})`}>
        {rays.map((x, n) => (
          <line key={x} x1={vp.x} y1={vp.y} x2={x} y2={H} {...hair(n % 2 ? 0.1 : 0.28)} className="wf-draw" style={i(Math.abs(n - 8) * 0.5)} />
        ))}
        {Array.from({ length: 6 }, (_, n) => (
          <line
            key={n}
            x1={-40}
            y1={vp.y}
            x2={W + 40}
            y2={vp.y}
            {...hair(0.55)}
            pathLength={undefined}
            className="wf-floor"
            style={{ ...i(n * 1.33), "--still": `${(n / 6) ** 2 * 150}px` } as CSSProperties}
          />
        ))}
        {[6, 8, 10, 7, 9].map((r, n) => (
          <Beam key={r} from={vp} to={{ x: rays[r], y: H }} n={n * 1.2} ids={ids} dur="2.2s" />
        ))}
      </g>
      <g className="wf-depth" style={z(12)}>
        {/* The horizon itself: a bloomed line, brightest where the beams leave it. */}
        <line x1={40} y1={vp.y} x2={W - 40} y2={vp.y} stroke={`var(--${ids.beam})`} strokeWidth={3} filter={`url(#${ids.glow})`} className="wf-breathe" />
        <line x1={0} y1={vp.y} x2={W} y2={vp.y} {...hair(0.9, 1)} className="wf-draw" mask={`url(#${ids.fade})`} />
      </g>
    </>
  );
}

/** Wireframe boxes on one baseline that draw, hold and undraw, lit from below. */
function Blueprint({ ids }: { ids: Ids }) {
  const vp: P = { x: 200, y: 78 };
  const base = 214;
  const fronts = [
    { x: 52, w: 84, h: 84, z: 10 },
    { x: 158, w: 84, h: 112, z: 14 },
    { x: 264, w: 84, h: 64, z: 10 },
  ];
  const back = (p: P, k = 0.62): P => ({ x: vp.x + (p.x - vp.x) * k, y: vp.y + (p.y - vp.y) * k });
  const poly = (ps: P[]) => ps.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <>
      <g className="wf-depth" style={z(4)} mask={`url(#${ids.fade})`}>
        <line x1={0} y1={base} x2={W} y2={base} {...hair(0.5)} className="wf-draw" />
        <Beam from={{ x: 0, y: base }} to={{ x: W, y: base }} n={0} ids={ids} dur="3.4s" />
      </g>
      {fronts.map((f, b) => {
        const fc: P[] = [
          { x: f.x, y: base - f.h },
          { x: f.x + f.w, y: base - f.h },
          { x: f.x + f.w, y: base },
          { x: f.x, y: base },
        ];
        const bc = fc.map((p) => back(p));
        const d = b * 4;
        const lit = b === 1;
        return (
          <g key={b} className="wf-depth" style={z(f.z)}>
            {lit && (
              <polygon
                points={poly(fc)}
                fill="none"
                stroke={`var(--${ids.beam})`}
                strokeWidth={3}
                filter={`url(#${ids.glow})`}
                className="wf-breathe"
              />
            )}
            <polygon points={poly(bc)} {...hair(0.3)} className="wf-cycle" style={i(d)} />
            {fc.map((p, n) => (
              <line key={n} x1={bc[n].x} y1={bc[n].y} x2={p.x} y2={p.y} {...hair(0.4)} className="wf-cycle" style={i(d + 1 + n * 0.4)} />
            ))}
            <polygon points={poly(fc)} {...hair(lit ? 1 : 0.75, lit ? 1 : 0.75)} className="wf-cycle" style={i(d + 2.5)} />
          </g>
        );
      })}
    </>
  );
}

/* ------------------------------------------------------------------------ */
/* Cover                                                                     */
/* ------------------------------------------------------------------------ */

type WireframeCoverProps = {
  scene?: WireframeScene;
  tone?: WireframeTone;
  /** Lowercase wordmark set in the top-left corner, split after the first word. */
  wordmark?: string;
  className?: string;
};

/** The animated SVG on its own: drop it into anything with an aspect ratio. */
export function WireframeCover({ scene = "tunnel", tone = "cobalt", wordmark, className = "" }: WireframeCoverProps) {
  const id = useId().replace(/:/g, "");
  const ref = useRef<SVGSVGElement>(null);
  const [paused, setPaused] = useState(false);
  const t = tones[tone];
  const [first, ...rest] = (wordmark ?? "").toLowerCase().split(" ");
  const ids: Ids = { fade: `${id}-fade`, glow: `${id}-glow`, beam: `${id}-beam` };
  const focus = scene === "horizon" ? { cx: 0.5, cy: 0.47 } : scene === "blueprint" ? { cx: 0.5, cy: 0.62 } : { cx: 0.5, cy: 0.5 };

  // Stop animating while the cover is off-screen.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setPaused(!entry.isIntersecting));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      data-paused={paused}
      className={`block size-full ${className}`}
      style={{ color: "#ffffff", [`--${ids.beam}`]: t.beam } as CSSProperties}
    >
      <style>{STYLES}</style>
      <defs>
        <radialGradient id={`${id}-light`} cx={focus.cx} cy={focus.cy} r="0.6">
          <stop offset="0" stopColor={t.glow} stopOpacity="0.9" />
          <stop offset="0.35" stopColor={t.glow} stopOpacity="0.28" />
          <stop offset="1" stopColor={t.glow} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-fade-g`} gradientUnits="userSpaceOnUse" cx={W / 2} cy={H / 2} r={W * 0.58}>
          <stop offset="0.3" stopColor="#ffffff" />
          <stop offset="1" stopColor="#000000" />
        </radialGradient>
        <mask id={ids.fade} maskUnits="userSpaceOnUse" x={-W} y={-H} width={W * 3} height={H * 3}>
          <rect x={-W} y={-H} width={W * 3} height={H * 3} fill={`url(#${id}-fade-g)`} />
        </mask>
        <filter id={ids.glow} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3.5" />
        </filter>
      </defs>

      {/* Black ground and one coloured light behind the focal point. */}
      <rect width={W} height={H} fill="#030304" />
      <g className="wf-depth" style={z(-6)}>
        <rect x={-20} y={-20} width={W + 40} height={H + 40} fill={`url(#${id}-light)`} />
      </g>

      {scene === "tunnel" && <Tunnel ids={ids} />}
      {scene === "horizon" && <Horizon ids={ids} />}
      {scene === "blueprint" && <Blueprint ids={ids} />}

      {wordmark && (
        <text x={20} y={30} fontSize={12} fontWeight={500} letterSpacing="-0.01em" fontFamily="var(--font-geist-sans), Helvetica, sans-serif">
          <tspan fill="#ffffff">{first}</tspan>
          {rest.length > 0 && <tspan fill={t.word}> {rest.join(" ")}</tspan>}
        </text>
      )}
    </svg>
  );
}

/* ------------------------------------------------------------------------ */
/* Card                                                                      */
/* ------------------------------------------------------------------------ */

type WireframeCardProps = {
  title: string;
  description: string;
  meta?: string;
  scene?: WireframeScene;
  tone?: WireframeTone;
};

export function WireframeCard({ title, description, meta, scene = "tunnel", tone = "cobalt" }: WireframeCardProps) {
  const ref = useRef<HTMLButtonElement>(null);
  // Bumping the key remounts the SVG, which replays every draw-in.
  const [take, setTake] = useState(0);

  function handleMove(event: PointerEvent<HTMLButtonElement>) {
    const el = ref.current;
    if (!el || event.pointerType !== "mouse") return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--px", (((event.clientX - rect.left) / rect.width) * 2 - 1).toFixed(3));
    el.style.setProperty("--py", (((event.clientY - rect.top) / rect.height) * 2 - 1).toFixed(3));
  }

  function handleLeave() {
    ref.current?.style.setProperty("--px", "0");
    ref.current?.style.setProperty("--py", "0");
  }

  return (
    <article className="flex flex-col">
      <button
        ref={ref}
        type="button"
        onClick={() => setTake((n) => n + 1)}
        onPointerMove={handleMove}
        onPointerLeave={handleLeave}
        aria-label={`${title} cover, an animated ${scene} wireframe. Replay the drawing`}
        className="relative aspect-[4/3] cursor-pointer overflow-hidden rounded-xl outline-offset-4 transition-[scale] duration-(--duration-exit) ease-out active:scale-[0.98]"
      >
        <WireframeCover key={take} scene={scene} tone={tone} wordmark={title} />
        <span aria-hidden className="pointer-events-none absolute inset-0 rounded-xl shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]" />
      </button>
      <div className="mt-3 flex items-baseline justify-between gap-3 px-0.5">
        <h3 className="text-body font-medium text-ink">{title}</h3>
        {meta && <span className="shrink-0 text-meta tabular-nums text-muted">{meta}</span>}
      </div>
      <p className="mt-0.5 px-0.5 text-body text-muted">{description}</p>
    </article>
  );
}

/* ------------------------------------------------------------------------ */
/* Demo                                                                      */
/* ------------------------------------------------------------------------ */

const projects: WireframeCardProps[] = [
  { title: "Blue Colours", description: "One-point perspective, on a loop.", meta: "Tunnel", scene: "tunnel", tone: "cobalt" },
  { title: "Low Horizon", description: "A floor grid racing to meet you.", meta: "Horizon", scene: "horizon", tone: "ice" },
  { title: "Dusk Plans", description: "Boxes that draw and undraw.", meta: "Blueprint", scene: "blueprint", tone: "dusk" },
];

export default function Demo() {
  return (
    <div className="grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-3">
      {projects.map((project, n) => (
        <div key={project.title} className="animate-enter" style={{ animationDelay: `calc(${n} * var(--stagger))` }}>
          <WireframeCard {...project} />
        </div>
      ))}
    </div>
  );
}
