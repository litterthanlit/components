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

const tones: Record<WireframeTone, { stops: [string, string]; glow: string; line: string; word: string }> = {
  cobalt: { stops: ["#0a1a33", "#2f62a8"], glow: "#a9caf5", line: "#ffffff", word: "#9ccaff" },
  ice: { stops: ["#1b3a63", "#6f9fd6"], glow: "#e8f1fc", line: "#ffffff", word: "#dcebff" },
  dusk: { stops: ["#141033", "#5446a0"], glow: "#cbbcf5", line: "#ffffff", word: "#cdbfff" },
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
  30% { opacity: 0.8; }
  to { transform: scale(1.35); opacity: 0; }
}

.wf-floor {
  animation: wf-floor 4.8s cubic-bezier(0.55, 0, 1, 0.45) infinite both;
  animation-delay: calc(var(--i, 0) * -0.6s);
}
@keyframes wf-floor {
  from { transform: translateY(0); opacity: 0; }
  25% { opacity: 0.4; }
  to { transform: translateY(168px); opacity: 0.8; }
}

.wf-scan { animation: wf-scan 2.8s cubic-bezier(0.65, 0, 0.35, 1) infinite alternate both; }
@keyframes wf-scan { from { transform: translateY(0); } to { transform: translateY(72px); } }

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

/** Two faint guides that cross at the scene's focal point, like a crosshair. */
function Guides({ at }: { at: P }) {
  return (
    <g className="wf-depth" style={z(4)}>
      <line x1={0} y1={at.y} x2={W} y2={at.y} {...hair(0.14)} className="wf-draw" />
      <line x1={at.x} y1={0} x2={at.x} y2={H} {...hair(0.14)} className="wf-draw" style={i(1)} />
    </g>
  );
}

/** Rectangles stream out of the vanishing point; rays run to the corners. */
function Tunnel() {
  const vp: P = { x: 200, y: 150 };
  const corners: P[] = [
    { x: 0, y: 0 },
    { x: W, y: 0 },
    { x: W, y: H },
    { x: 0, y: H },
  ];
  return (
    <>
      <Guides at={vp} />
      <g className="wf-depth" style={z(10)}>
        {corners.map((c, n) => (
          <line key={n} x1={vp.x} y1={vp.y} x2={c.x} y2={c.y} {...hair(0.3)} className="wf-draw" style={i(n + 2)} />
        ))}
        {Array.from({ length: 5 }, (_, n) => (
          <rect
            key={n}
            width={W}
            height={H}
            {...hair(0.6)}
            pathLength={undefined}
            className="wf-fly"
            style={{ ...i(n * 1.2), transformOrigin: `${vp.x}px ${vp.y}px`, "--still": 0.2 + n * 0.18 } as CSSProperties}
          />
        ))}
      </g>
      <g className="wf-depth" style={z(18)}>
        <rect x={vp.x - 40} y={vp.y - 30} width={80} height={60} {...hair(0.9)} className="wf-draw" style={i(7)} />
        <circle cx={vp.x} cy={vp.y} r={2} className="wf-pulse" fill="var(--accent, #c2ff4d)" />
      </g>
    </>
  );
}

/** A floor grid moving toward you, under a fine mesh panel with a scan line. */
function Horizon({ meshId }: { meshId: string }) {
  const vp: P = { x: 200, y: 132 };
  const panel = { x: 150, y: 44, w: 100, h: 72 };
  return (
    <>
      <Guides at={vp} />
      <g className="wf-depth" style={z(6)}>
        {Array.from({ length: 11 }, (_, n) => (
          <line key={n} x1={vp.x} y1={vp.y} x2={-300 + n * 100} y2={H} {...hair(0.2)} className="wf-draw" style={i(n * 0.4 + 2)} />
        ))}
        {Array.from({ length: 6 }, (_, n) => (
          <line
            key={n}
            x1={-40}
            y1={vp.y}
            x2={W + 40}
            y2={vp.y}
            {...hair(0.6)}
            pathLength={undefined}
            className="wf-floor"
            style={{ ...i(n * 1.33), "--still": `${(n / 6) ** 2 * 168}px` } as CSSProperties}
          />
        ))}
      </g>
      <g className="wf-depth" style={z(16)}>
        <rect x={panel.x} y={panel.y} width={panel.w} height={panel.h} fill={`url(#${meshId})`} />
        <rect x={panel.x} y={panel.y} width={panel.w} height={panel.h} {...hair(0.8)} className="wf-draw" style={i(6)} />
        <svg x={panel.x} y={panel.y} width={panel.w} height={panel.h} overflow="hidden">
          <line x1={0} y1={0} x2={panel.w} y2={0} {...hair(0.9)} pathLength={undefined} className="wf-scan" />
        </svg>
        <circle cx={vp.x} cy={vp.y} r={2} className="wf-pulse" fill="var(--accent, #c2ff4d)" />
      </g>
    </>
  );
}

/** Wireframe boxes on one baseline that draw, hold and undraw on a loop. */
function Blueprint() {
  const vp: P = { x: 200, y: 96 };
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
      <Guides at={{ x: vp.x, y: base }} />
      {fronts.map((f, b) => {
        const fc: P[] = [
          { x: f.x, y: base - f.h },
          { x: f.x + f.w, y: base - f.h },
          { x: f.x + f.w, y: base },
          { x: f.x, y: base },
        ];
        const bc = fc.map((p) => back(p));
        const d = b * 4;
        return (
          <g key={b} className="wf-depth" style={z(f.z)}>
            <polygon points={poly(bc)} {...hair(0.35)} className="wf-cycle" style={i(d)} />
            {fc.map((p, n) => (
              <line key={n} x1={bc[n].x} y1={bc[n].y} x2={p.x} y2={p.y} {...hair(0.45)} className="wf-cycle" style={i(d + 1 + n * 0.4)} />
            ))}
            <polygon points={poly(fc)} {...hair(0.9)} className="wf-cycle" style={i(d + 2.5)} />
          </g>
        );
      })}
      <g className="wf-depth" style={z(14)}>
        <circle cx={fronts[1].x} cy={base - fronts[1].h} r={2} className="wf-pulse" fill="var(--accent, #c2ff4d)" />
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
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor={t.stops[0]} />
          <stop offset="1" stopColor={t.stops[1]} />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={t.glow} stopOpacity="0.35" />
          <stop offset="1" stopColor={t.glow} stopOpacity="0" />
        </radialGradient>
        <pattern id={`${id}-mesh`} width="4" height="4" patternUnits="userSpaceOnUse">
          <path d="M4 0H0V4" fill="none" stroke={t.line} strokeOpacity="0.22" strokeWidth="0.5" />
        </pattern>
      </defs>

      {/* The wash: a two-stop gradient and one soft highlight behind the focal point. */}
      <rect width={W} height={H} fill={`url(#${id}-bg)`} />
      <g className="wf-depth" style={z(-6)}>
        <ellipse cx={W / 2} cy={H / 2} rx={W * 0.55} ry={H * 0.5} fill={`url(#${id}-glow)`} />
      </g>

      {scene === "tunnel" && <Tunnel />}
      {scene === "horizon" && <Horizon meshId={`${id}-mesh`} />}
      {scene === "blueprint" && <Blueprint />}

      {wordmark && (
        <text x={18} y={28} fontSize={12} fontWeight={400} letterSpacing="0.02em" fontFamily="var(--font-geist-sans), Helvetica, sans-serif">
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
