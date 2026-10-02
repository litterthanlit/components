"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent } from "react";

/*
 * Project cards with an animated SVG cover: hairline wireframes in one-point
 * perspective over a cold blue wash, after the Y2K drum & bass sleeves.
 *
 * Every line is plain SVG. Lines draw themselves in with the pathLength
 * trick (pathLength=1, dash 1, offset 1 → 0), loops are CSS keyframes on
 * transforms, and the pointer tilts the layers at different depths through
 * two CSS variables, so moving the mouse never re-renders React. Animations
 * pause off-screen and hold still under prefers-reduced-motion.
 */

export type WireframeScene = "tunnel" | "horizon" | "blueprint";
export type WireframeTone = "cobalt" | "ice" | "dusk";

const W = 400;
const H = 300;

const tones: Record<WireframeTone, { stops: [string, string, string]; glow: string; line: string; word: string }> = {
  cobalt: { stops: ["#06101f", "#1d4a8c", "#9cc1ee"], glow: "#cfe3ff", line: "#ffffff", word: "#8cc2ff" },
  ice: { stops: ["#0d2340", "#4f86c6", "#e4eefa"], glow: "#ffffff", line: "#ffffff", word: "#d6e8ff" },
  dusk: { stops: ["#0b0820", "#3b2c7a", "#b9a6ec"], glow: "#e6dcff", line: "#ffffff", word: "#c6b4ff" },
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
  25% { opacity: 0.9; }
  to { transform: scale(1.35); opacity: 0; }
}

.wf-floor {
  animation: wf-floor 4.8s cubic-bezier(0.55, 0, 1, 0.45) infinite both;
  animation-delay: calc(var(--i, 0) * -0.6s);
}
@keyframes wf-floor {
  from { transform: translateY(0); opacity: 0; }
  20% { opacity: 0.55; }
  to { transform: translateY(190px); opacity: 0.9; }
}

.wf-scan { animation: wf-scan 3.2s cubic-bezier(0.65, 0, 0.35, 1) infinite alternate both; }
@keyframes wf-scan { from { transform: translateY(0); } to { transform: translateY(140px); } }

.wf-pulse { animation: wf-pulse 2.4s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
@keyframes wf-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(0.6); } }

.wf-depth {
  transform: translate(calc(var(--px, 0) * var(--z) * 1px), calc(var(--py, 0) * var(--z) * 0.75px));
  transition: transform 700ms cubic-bezier(0.23, 1, 0.32, 1);
}

[data-paused="true"] * { animation-play-state: paused !important; }

@media (prefers-reduced-motion: reduce) {
  .wf-draw, .wf-cycle, .wf-scan, .wf-pulse { animation: none; stroke-dashoffset: 0; }
  .wf-fly { animation: none; opacity: 0.5; transform: scale(var(--still, 0.5)); }
  .wf-floor { animation: none; opacity: 0.5; transform: translateY(var(--still, 0px)); }
  .wf-depth { transition: none; }
}
`;

/* ------------------------------------------------------------------------ */
/* Scenes                                                                    */
/* ------------------------------------------------------------------------ */

type P = { x: number; y: number };

/** Shared hairline props: non-scaling so strokes stay 1px under scale. */
const hair = (opacity: number, width = 1) =>
  ({
    stroke: "currentColor",
    strokeWidth: width,
    strokeOpacity: opacity,
    fill: "none",
    vectorEffect: "non-scaling-stroke",
    pathLength: 1,
  }) as const;

const i = (n: number) => ({ "--i": n }) as CSSProperties;

/** Long guide lines that cross the whole cover, like crop marks. */
function Guides() {
  const lines = [
    [0, 64, W, 64],
    [0, 226, W, 226],
    [86, 0, 86, H],
    [322, 0, 322, H],
  ];
  return (
    <g className="wf-depth" style={{ "--z": 4 } as CSSProperties}>
      {lines.map(([x1, y1, x2, y2], n) => (
        <line key={n} x1={x1} y1={y1} x2={x2} y2={y2} {...hair(0.22)} className="wf-draw" style={i(n)} />
      ))}
    </g>
  );
}

/** Rectangles stream out of the vanishing point; rays run to the corners. */
function Tunnel() {
  const vp: P = { x: 236, y: 128 };
  const corners: P[] = [
    { x: 0, y: 0 },
    { x: W, y: 0 },
    { x: W, y: H },
    { x: 0, y: H },
    { x: W / 2, y: 0 },
    { x: W, y: H / 2 },
    { x: W / 2, y: H },
    { x: 0, y: H / 2 },
  ];
  return (
    <>
      <g className="wf-depth" style={{ "--z": 10 } as CSSProperties}>
        {corners.map((c, n) => (
          <line
            key={n}
            x1={vp.x}
            y1={vp.y}
            x2={vp.x + (c.x - vp.x) * 1.4}
            y2={vp.y + (c.y - vp.y) * 1.4}
            {...hair(n < 4 ? 0.5 : 0.22)}
            className="wf-draw"
            style={i(n + 2)}
          />
        ))}
        {Array.from({ length: 6 }, (_, n) => (
          <rect
            key={n}
            x={0}
            y={0}
            width={W}
            height={H}
            {...hair(0.8)}
            pathLength={undefined}
            className="wf-fly"
            style={{ ...i(n), transformOrigin: `${vp.x}px ${vp.y}px`, "--still": 0.15 + n * 0.16 } as CSSProperties}
          />
        ))}
      </g>
      <g className="wf-depth" style={{ "--z": 18 } as CSSProperties}>
        <rect x={vp.x - 46} y={vp.y - 34} width={92} height={68} {...hair(0.9)} className="wf-draw" style={i(10)} />
        <rect x={vp.x - 46} y={vp.y - 34} width={92} height={68} fill="currentColor" fillOpacity={0.06} />
        <circle cx={vp.x} cy={vp.y} r={3} className="wf-pulse" fill="var(--accent, #c2ff4d)" />
      </g>
    </>
  );
}

/** A floor grid racing toward you, with a fine mesh panel and a scan line. */
function Horizon({ meshId }: { meshId: string }) {
  const horizon = 112;
  const vpx = 210;
  const rays = Array.from({ length: 15 }, (_, n) => -560 + n * 110);
  return (
    <>
      <g className="wf-depth" style={{ "--z": 6 } as CSSProperties}>
        <line x1={0} y1={horizon} x2={W} y2={horizon} {...hair(0.7)} className="wf-draw" />
        {rays.map((x, n) => (
          <line key={x} x1={vpx} y1={horizon} x2={x} y2={H + 40} {...hair(0.3)} className="wf-draw" style={i(n * 0.5 + 2)} />
        ))}
        {Array.from({ length: 8 }, (_, n) => (
          <line
            key={n}
            x1={-40}
            y1={horizon}
            x2={W + 40}
            y2={horizon}
            {...hair(0.8)}
            pathLength={undefined}
            className="wf-floor"
            style={{ ...i(n), "--still": `${(n / 8) ** 2 * 190}px` } as CSSProperties}
          />
        ))}
      </g>
      <g className="wf-depth" style={{ "--z": 16 } as CSSProperties}>
        <rect x={224} y={36} width={132} height={150} fill={`url(#${meshId})`} />
        <rect x={224} y={36} width={132} height={150} {...hair(0.75)} className="wf-draw" style={i(6)} />
        <line x1={224} y1={36} x2={356} y2={36} {...hair(0.95, 1.5)} pathLength={undefined} className="wf-scan" />
        <line x1={190} y1={36} x2={224} y2={36} {...hair(0.5)} className="wf-draw" style={i(9)} />
        <line x1={356} y1={186} x2={384} y2={214} {...hair(0.5)} className="wf-draw" style={i(10)} />
        <circle cx={224} cy={36} r={2.5} className="wf-pulse" fill="var(--accent, #c2ff4d)" />
      </g>
    </>
  );
}

/** Wireframe boxes that draw, hold and undraw themselves on a loop. */
function Blueprint() {
  const vp: P = { x: 210, y: 120 };
  const fronts = [
    { x: 44, y: 150, w: 112, h: 92, z: 14 },
    { x: 176, y: 58, w: 84, h: 66, z: 8 },
    { x: 262, y: 166, w: 104, h: 84, z: 20 },
  ];
  const back = (p: P, k = 0.58): P => ({ x: vp.x + (p.x - vp.x) * k, y: vp.y + (p.y - vp.y) * k });

  return (
    <>
      <g className="wf-depth" style={{ "--z": 5 } as CSSProperties}>
        {[0, 1, 2, 3].map((n) => {
          const c = [
            { x: 0, y: 0 },
            { x: W, y: 0 },
            { x: W, y: H },
            { x: 0, y: H },
          ][n];
          return <line key={n} x1={vp.x} y1={vp.y} x2={c.x} y2={c.y} {...hair(0.16)} className="wf-draw" style={i(n)} />;
        })}
      </g>
      {fronts.map((f, b) => {
        const fc: P[] = [
          { x: f.x, y: f.y },
          { x: f.x + f.w, y: f.y },
          { x: f.x + f.w, y: f.y + f.h },
          { x: f.x, y: f.y + f.h },
        ];
        const bc = fc.map((p) => back(p));
        const poly = (ps: P[]) => ps.map((p) => `${p.x},${p.y}`).join(" ");
        const base = b * 5;
        return (
          <g key={b} className="wf-depth" style={{ "--z": f.z } as CSSProperties}>
            <polygon points={poly(fc)} fill="currentColor" fillOpacity={0.05} />
            <polygon points={poly(bc)} {...hair(0.45)} className="wf-cycle" style={i(base)} />
            {fc.map((p, n) => (
              <line key={n} x1={bc[n].x} y1={bc[n].y} x2={p.x} y2={p.y} {...hair(0.55)} className="wf-cycle" style={i(base + 1 + n * 0.5)} />
            ))}
            <polygon points={poly(fc)} {...hair(0.95)} className="wf-cycle" style={i(base + 3)} />
          </g>
        );
      })}
      <g className="wf-depth" style={{ "--z": 20 } as CSSProperties}>
        <circle cx={fronts[2].x} cy={fronts[2].y} r={2.5} className="wf-pulse" fill="var(--accent, #c2ff4d)" />
      </g>
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
      style={{ color: t.line }}
    >
      <style>{STYLES}</style>
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={t.stops[0]} />
          <stop offset="0.55" stopColor={t.stops[1]} />
          <stop offset="1" stopColor={t.stops[2]} />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="0.62" cy="0.42" r="0.5">
          <stop offset="0" stopColor={t.glow} stopOpacity="0.55" />
          <stop offset="1" stopColor={t.glow} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-shade`} cx="0.2" cy="0.55" r="0.55">
          <stop offset="0" stopColor={t.stops[0]} stopOpacity="0.7" />
          <stop offset="1" stopColor={t.stops[0]} stopOpacity="0" />
        </radialGradient>
        <pattern id={`${id}-mesh`} width="4" height="4" patternUnits="userSpaceOnUse">
          <path d="M4 0H0V4" fill="none" stroke={t.line} strokeOpacity="0.35" strokeWidth="0.6" />
        </pattern>
      </defs>

      {/* The wash: a diagonal gradient, a cold highlight and a dark pool. */}
      <rect width={W} height={H} fill={`url(#${id}-bg)`} />
      <g className="wf-depth" style={{ "--z": -6 } as CSSProperties}>
        <rect x={-20} y={-20} width={W + 40} height={H + 40} fill={`url(#${id}-glow)`} />
        <rect x={-20} y={-20} width={W + 40} height={H + 40} fill={`url(#${id}-shade)`} />
      </g>

      <Guides />
      {scene === "tunnel" && <Tunnel />}
      {scene === "horizon" && <Horizon meshId={`${id}-mesh`} />}
      {scene === "blueprint" && <Blueprint />}

      {wordmark && (
        <text x={16} y={26} fontSize={15} fontWeight={300} letterSpacing="0.04em" fontFamily="var(--font-geist-sans), Helvetica, sans-serif">
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
