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

.wf-fade {
  animation: wf-fade 900ms ease-out both;
  animation-delay: calc(var(--i, 0) * 70ms + 300ms);
}
@keyframes wf-fade { from { opacity: 0; } }

.wf-pulse { animation: wf-pulse 2.4s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
@keyframes wf-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(0.6); } }

.wf-depth {
  transform: translate(calc(var(--px, 0) * var(--z) * 1px), calc(var(--py, 0) * var(--z) * 0.75px));
  transition: transform 700ms cubic-bezier(0.23, 1, 0.32, 1);
}

[data-paused="true"] * { animation-play-state: paused !important; }

@media (prefers-reduced-motion: reduce) {
  .wf-draw, .wf-cycle, .wf-scan, .wf-fade {
  animation: wf-fade 900ms ease-out both;
  animation-delay: calc(var(--i, 0) * 70ms + 300ms);
}
@keyframes wf-fade { from { opacity: 0; } }

.wf-pulse { animation: none; stroke-dashoffset: 0; }
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

/** Dashed construction lines can't use the dash draw-in, so they fade in instead. */
const dash = (opacity: number) =>
  ({
    stroke: "currentColor",
    strokeWidth: 0.75,
    strokeOpacity: opacity,
    strokeDasharray: "2 3",
    fill: "none",
    vectorEffect: "non-scaling-stroke",
    className: "wf-fade",
  }) as const;

const i = (n: number) => ({ "--i": n }) as CSSProperties;
const z = (n: number) => ({ "--z": n }) as CSSProperties;
const MONO = "var(--font-geist-mono), ui-monospace, Menlo, monospace";

/** Tiny monospaced annotation, like the notes on a technical drawing. */
function Label({ x, y, children, anchor = "start", delay = 8 }: { x: number; y: number; children: string; anchor?: "start" | "middle" | "end"; delay?: number }) {
  return (
    <text x={x} y={y} textAnchor={anchor} fontSize={7} fontFamily={MONO} letterSpacing="0.06em" fill="currentColor" fillOpacity={0.55} className="wf-fade" style={i(delay)}>
      {children}
    </text>
  );
}

/** A small circled crosshair marking a vanishing point. */
function Cross({ at, r = 6 }: { at: P; r?: number }) {
  return (
    <g className="wf-fade" style={i(6)}>
      <circle cx={at.x} cy={at.y} r={r} {...hair(0.35)} pathLength={undefined} />
      <path d={`M${at.x - r * 1.8} ${at.y}H${at.x + r * 1.8}M${at.x} ${at.y - r * 1.8}V${at.y + r * 1.8}`} {...hair(0.35)} pathLength={undefined} />
    </g>
  );
}

/** Two faint guides that cross at the scene's focal point. */
function Guides({ at }: { at: P }) {
  return (
    <g className="wf-depth" style={z(4)}>
      <line x1={0} y1={at.y} x2={W} y2={at.y} {...hair(0.14)} className="wf-draw" />
      <line x1={at.x} y1={0} x2={at.x} y2={H} {...hair(0.14)} className="wf-draw" style={i(1)} />
    </g>
  );
}

/** Corner registration marks with a dimension ruler down the right edge. */
function Frame({ figure, vp }: { figure: string; vp: P }) {
  const m = 16;
  const k = 7;
  const corners = `M${m} ${m + k}V${m}H${m + k}M${W - m - k} ${m}H${W - m}V${m + k}M${W - m} ${H - m - k}V${H - m}H${W - m - k}M${m + k} ${H - m}H${m}V${H - m - k}`;
  let ruler = "";
  for (let y = 60; y <= 240; y += 6) ruler += `M${W - m} ${y}h${(y - 60) % 30 === 0 ? -6 : -3}`;
  return (
    <g className="wf-depth" style={z(2)}>
      <path d={corners} {...hair(0.55)} className="wf-draw" />
      <path d={ruler} {...hair(0.3)} className="wf-draw" style={i(2)} />
      <Label x={W - m - 2} y={30} anchor="end">{`VP ${vp.x}·${vp.y}`}</Label>
      <Label x={m + 6} y={H - m - 6}>{figure}</Label>
      <Label x={W - m - 10} y={H - m - 6} anchor="end">400×300</Label>
    </g>
  );
}

/** Rectangles stream out of the vanishing point through fixed depth frames. */
function Tunnel({ meshId }: { meshId: string }) {
  const vp: P = { x: 200, y: 150 };
  const at = (k: number) => ({ x: vp.x - vp.x * k, y: vp.y - vp.y * k, width: W * k, height: H * k });
  const corners: P[] = [
    { x: 0, y: 0 },
    { x: W, y: 0 },
    { x: W, y: H },
    { x: 0, y: H },
  ];
  const mids: P[] = [
    { x: W / 2, y: 0 },
    { x: W, y: H / 2 },
    { x: W / 2, y: H },
    { x: 0, y: H / 2 },
  ];
  const focal = at(0.2);
  return (
    <>
      <Frame figure="FIG. 01 — TUNNEL" vp={vp} />
      <Guides at={vp} />
      <g className="wf-depth" style={z(8)}>
        {[0.4, 0.62, 0.84].map((k) => (
          <rect key={k} {...at(k)} {...dash(0.16)} style={i(4)} />
        ))}
        {mids.flatMap((c) => [-1, 1].map((s) => {
          // Rays that split each side into thirds, very faint.
          const p = c.x === W / 2 ? { x: c.x + s * (W / 6), y: c.y } : { x: c.x, y: c.y + s * (H / 6) };
          return <line key={`${c.x}-${c.y}-${s}`} x1={vp.x} y1={vp.y} x2={p.x} y2={p.y} {...dash(0.1)} style={i(5)} />;
        }))}
      </g>
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
        <rect {...focal} fill={`url(#${meshId})`} className="wf-fade" style={i(7)} />
        <rect {...focal} {...hair(0.9)} className="wf-draw" style={i(7)} />
        <rect {...at(0.1)} {...hair(0.45)} className="wf-draw" style={i(9)} />
        <Cross at={vp} />
        <Label x={focal.x + focal.width + 5} y={focal.y + 6}>z 0.20</Label>
        <circle cx={vp.x} cy={vp.y} r={2} className="wf-pulse" fill="var(--accent, #c2ff4d)" />
      </g>
    </>
  );
}

/** A floor grid moving toward you, a rising sun of arcs and a scanning panel. */
function Horizon({ meshId }: { meshId: string }) {
  const vp: P = { x: 200, y: 150 };
  const panel = { x: 268, y: 48, w: 92, h: 64 };
  let ticks = "";
  for (let x = 20; x <= W - 20; x += 10) ticks += `M${x} ${vp.y}v${(x - 20) % 50 === 0 ? 4 : 2}`;
  const brackets = (() => {
    const { x, y, w, h } = panel;
    const o = 4;
    const k = 6;
    return `M${x - o} ${y - o + k}V${y - o}H${x - o + k}M${x + w + o - k} ${y - o}H${x + w + o}V${y - o + k}M${x + w + o} ${y + h + o - k}V${y + h + o}H${x + w + o - k}M${x - o + k} ${y + h + o}H${x - o}V${y + h + o - k}`;
  })();
  return (
    <>
      <Frame figure="FIG. 02 — HORIZON" vp={vp} />
      <Guides at={vp} />
      <g className="wf-depth" style={z(3)}>
        {[22, 42, 66, 94].map((r, n) => (
          <path key={r} d={`M${vp.x - r} ${vp.y}A${r} ${r} 0 0 1 ${vp.x + r} ${vp.y}`} {...hair(0.22 - n * 0.04)} className="wf-draw" style={i(3 + n)} />
        ))}
      </g>
      <g className="wf-depth" style={z(6)}>
        <path d={ticks} {...hair(0.3)} className="wf-draw" style={i(2)} />
        {Array.from({ length: 21 }, (_, n) => (
          <line
            key={n}
            x1={vp.x}
            y1={vp.y}
            x2={-300 + n * 50}
            y2={H}
            {...hair(n % 2 ? 0.08 : 0.22)}
            className="wf-draw"
            style={i(n * 0.2 + 2)}
          />
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
            style={{ ...i(n * 1.33), "--still": `${(n / 6) ** 2 * 150}px` } as CSSProperties}
          />
        ))}
      </g>
      <g className="wf-depth" style={z(16)}>
        <line x1={vp.x} y1={vp.y} x2={panel.x} y2={panel.y + panel.h} {...dash(0.3)} style={i(8)} />
        <rect x={panel.x} y={panel.y} width={panel.w} height={panel.h} fill={`url(#${meshId})`} className="wf-fade" style={i(6)} />
        <rect x={panel.x} y={panel.y} width={panel.w} height={panel.h} {...hair(0.8)} className="wf-draw" style={i(6)} />
        <path d={brackets} {...hair(0.5)} className="wf-draw" style={i(8)} />
        <svg x={panel.x} y={panel.y} width={panel.w} height={panel.h} overflow="hidden">
          <line x1={0} y1={0} x2={panel.w} y2={0} {...hair(0.9)} pathLength={undefined} className="wf-scan" />
        </svg>
        <Label x={panel.x - 4} y={panel.y - 10}>SCAN · 04</Label>
        <Cross at={vp} />
        <circle cx={vp.x} cy={vp.y} r={2} className="wf-pulse" fill="var(--accent, #c2ff4d)" />
      </g>
    </>
  );
}

/** Dimensioned wireframe boxes on one baseline that draw, hold and undraw. */
function Blueprint() {
  const vp: P = { x: 200, y: 78 };
  const base = 206;
  const fronts = [
    { x: 52, w: 84, h: 84, z: 10 },
    { x: 158, w: 84, h: 112, z: 14 },
    { x: 264, w: 84, h: 64, z: 10 },
  ];
  const back = (p: P, k = 0.62): P => ({ x: vp.x + (p.x - vp.x) * k, y: vp.y + (p.y - vp.y) * k });
  const poly = (ps: P[]) => ps.map((p) => `${p.x},${p.y}`).join(" ");
  const dy = base + 14;
  const tall = fronts[1];
  const first = fronts[0];

  return (
    <>
      <Frame figure="FIG. 03 — BLUEPRINT" vp={vp} />
      <Guides at={{ x: vp.x, y: base }} />
      <g className="wf-depth" style={z(6)}>
        {fronts.flatMap((f) =>
          [f.x, f.x + f.w].map((x) => <line key={x} x1={vp.x} y1={vp.y} x2={x} y2={base - f.h} {...dash(0.14)} style={i(4)} />),
        )}
        {/* Width dimensions under the baseline. */}
        {fronts.map((f, b) => (
          <g key={b}>
            <path d={`M${f.x} ${dy}H${f.x + f.w}M${f.x} ${dy - 3}v6M${f.x + f.w} ${dy - 3}v6`} {...hair(0.4)} className="wf-draw" style={i(6 + b)} />
            <Label x={f.x + f.w / 2} y={dy + 11} anchor="middle" delay={9 + b}>{String(f.w)}</Label>
          </g>
        ))}
        {/* Height dimension on the outside of the first box. */}
        <path
          d={`M${first.x - 12} ${base}V${base - first.h}M${first.x - 15} ${base}h6M${first.x - 15} ${base - first.h}h6`}
          {...hair(0.4)}
          className="wf-draw"
          style={i(9)}
        />
        <Label x={first.x - 16} y={base - first.h / 2 + 2} anchor="end" delay={11}>{String(first.h)}</Label>
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
        <Cross at={vp} r={5} />
        <circle cx={tall.x} cy={base - tall.h} r={2} className="wf-pulse" fill="var(--accent, #c2ff4d)" />
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

      {scene === "tunnel" && <Tunnel meshId={`${id}-mesh`} />}
      {scene === "horizon" && <Horizon meshId={`${id}-mesh`} />}
      {scene === "blueprint" && <Blueprint />}

      {wordmark && (
        <text x={28} y={33} fontSize={12} fontWeight={400} letterSpacing="0.02em" fontFamily="var(--font-geist-sans), Helvetica, sans-serif">
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
