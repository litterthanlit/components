"use client";

import { useEffect, useState, type ComponentType, type CSSProperties, type ReactNode } from "react";

/*
 * Abstract shapes for the ways an agent works. Each is a small metaphor: a
 * spark while it thinks, orbits while it weighs options, a graph while it
 * searches, a form finding its shape while it plans, one continuous thread
 * while it writes, tiles folding together while it builds.
 *
 * AgentShape takes the current phase and crossfades between them. Every shape
 * is SVG or plain elements driven by the design system's keyframes (stretch,
 * trace, morph, assemble, wave), drawn in currentColor with a single accent.
 * Under prefers-reduced-motion each holds a deliberate still frame, and each
 * carries a label for screen readers.
 */

type ShapeProps = { label?: string; size?: number; className?: string };

function Frame({ label, size, className, children }: { label: string; size: number; className: string; children: ReactNode }) {
  return (
    <span role="status" aria-label={label} className={`relative inline-block shrink-0 ${className}`} style={{ width: size, height: size }}>
      {children}
    </span>
  );
}

/** A negative delay that puts a looping animation `fraction` of the way through, so nothing starts at rest. */
const offset = (fraction: number, duration: number) => `${-(((fraction % 1) + 1) % 1) * duration}ms`;

/* --- Spark: thinking ---------------------------------------------------- */

const RAYS = 8;
const STRETCH = 1600;

/** Rays reaching out from a point, a wave running round the ring. */
export function Spark({ label = "Thinking", size = 32, className = "" }: ShapeProps) {
  return (
    <Frame label={label} size={size} className={className}>
      <span aria-hidden className="absolute inset-0 animate-spin [animation-duration:9s] motion-reduce:animate-none">
        {Array.from({ length: RAYS }, (_, i) => (
          <span key={i} className="absolute inset-0" style={{ transform: `rotate(${(i * 360) / RAYS}deg)` }}>
            <span
              className={`absolute bottom-[64%] left-1/2 h-[34%] w-[9%] -translate-x-1/2 origin-bottom animate-stretch rounded-full bg-current motion-reduce:animate-none ${i % 2 ? "motion-reduce:scale-y-50" : ""}`}
              style={{ animationDelay: offset(1 - i / RAYS, STRETCH) }}
            />
          </span>
        ))}
      </span>
      <span aria-hidden className="absolute top-1/2 left-1/2 size-[18%] -translate-1/2 rounded-full bg-accent-strong" />
    </Frame>
  );
}

/* --- Orbit: reasoning --------------------------------------------------- */

const ELLIPSE = "M3 16a13 5 0 1 0 26 0a13 5 0 1 0 -26 0";
const ORBITS = [
  { angle: 0, duration: 1800 },
  { angle: 60, duration: 2400 },
  { angle: 120, duration: 3000 },
];

/** Three ideas in motion at once: comets on tilted orbits around a breathing core. */
export function Orbit({ label = "Reasoning", size = 32, className = "" }: ShapeProps) {
  return (
    <Frame label={label} size={size} className={className}>
      <svg aria-hidden viewBox="0 0 32 32" fill="none" className="size-full overflow-visible">
        {ORBITS.map(({ angle, duration }, i) => (
          <g key={angle} transform={`rotate(${angle} 16 16)`}>
            <path d={ELLIPSE} className="stroke-line-strong" strokeWidth={1} />
            <path
              d={ELLIPSE}
              pathLength={1}
              strokeDasharray="0.12 0.88"
              strokeWidth={1.75}
              strokeLinecap="round"
              className={`animate-trace motion-reduce:animate-none ${i === 0 ? "stroke-accent-strong" : "stroke-current"}`}
              style={{ animationDuration: `${duration}ms`, animationDelay: offset(i / 3, duration) }}
            />
          </g>
        ))}
        <circle
          cx={16}
          cy={16}
          r={3}
          fill="currentColor"
          className="origin-center animate-wave [transform-box:fill-box] motion-reduce:animate-none"
        />
      </svg>
    </Frame>
  );
}

/* --- Graph: searching --------------------------------------------------- */

const NODES: [number, number][] = [
  [6, 7],
  [18, 4],
  [28, 12],
  [23, 26],
  [9, 27],
  [4, 17],
];
const CHORDS: [number, number][] = [
  [1, 4],
  [2, 5],
];
const TRACE = 2400;
const SIGNAL = 0.16;

// The signal runs a closed loop through every node. Each node's distance
// along that loop decides when it lights up.
const LOOP = `M${NODES.map(([x, y]) => `${x} ${y}`).join("L")}Z`;
const NODE_AT = (() => {
  const edges = NODES.map(([x, y], i) => {
    const [nx, ny] = NODES[(i + 1) % NODES.length];
    return Math.hypot(nx - x, ny - y);
  });
  const total = edges.reduce((sum, d) => sum + d, 0);
  return NODES.map((_, i) => edges.slice(0, i).reduce((sum, d) => sum + d, 0) / total);
})();

/** A signal hopping between sources; each lights up as it arrives. */
export function Graph({ label = "Searching", size = 32, className = "" }: ShapeProps) {
  return (
    <Frame label={label} size={size} className={className}>
      <svg aria-hidden viewBox="0 0 32 32" fill="none" className="size-full overflow-visible">
        <path d={LOOP} className="stroke-line-strong" strokeWidth={1} strokeLinejoin="round" />
        {CHORDS.map(([a, b]) => (
          <line
            key={`${a}-${b}`}
            x1={NODES[a][0]}
            y1={NODES[a][1]}
            x2={NODES[b][0]}
            y2={NODES[b][1]}
            className="stroke-line-strong"
            strokeWidth={1}
          />
        ))}
        <path
          d={LOOP}
          pathLength={1}
          strokeDasharray={`${SIGNAL} ${1 - SIGNAL}`}
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="animate-trace stroke-accent-strong motion-reduce:animate-none"
          style={{ animationDuration: `${TRACE}ms` }}
        />
        {NODES.map(([x, y], i) => (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={2.4}
            fill="currentColor"
            className="origin-center animate-wave [transform-box:fill-box] motion-reduce:animate-none"
            // Peak (the keyframe's 50%) when the head of the signal reaches the node.
            style={{ animationDuration: `${TRACE}ms`, animationDelay: offset(0.5 - NODE_AT[i] + SIGNAL, TRACE) }}
          />
        ))}
      </svg>
    </Frame>
  );
}

/* --- Morph: planning ---------------------------------------------------- */

const MORPH = 3200;

/** An idea finding its shape: circle, squircle, diamond, leaf, and round again. */
export function Morph({ label = "Planning", size = 32, className = "" }: ShapeProps) {
  return (
    <Frame label={label} size={size} className={className}>
      {/* A ghost outline trails the form by a beat. */}
      <span
        aria-hidden
        className="absolute inset-[14%] animate-morph rounded-full border-[1.5px] border-accent-strong opacity-70 motion-reduce:animate-none"
        style={{ animationDelay: offset(-0.1, MORPH) }}
      />
      <span aria-hidden className="absolute inset-[24%] animate-morph rounded-full bg-current motion-reduce:animate-none" />
    </Frame>
  );
}

/* --- Thread: writing ---------------------------------------------------- */

// A 3:2 Lissajous figure, sampled once.
const CURVE = (() => {
  const steps = 120;
  const points = Array.from({ length: steps }, (_, i) => {
    const t = (i / steps) * Math.PI * 2;
    return `${(16 + 12.5 * Math.cos(3 * t)).toFixed(2)} ${(16 + 10 * Math.sin(2 * t)).toFixed(2)}`;
  });
  return `M${points.join("L")}Z`;
})();
const THREAD = 3200;
// Tail first, head last: longer, fainter dashes whose heads line up.
const STRANDS = [
  { length: 0.26, opacity: 0.2 },
  { length: 0.14, opacity: 0.5 },
  { length: 0.05, opacity: 1 },
];

/** A train of thought: one continuous line with a bright head and a fading tail. */
export function Thread({ label = "Writing", size = 32, className = "" }: ShapeProps) {
  const longest = STRANDS[0].length;
  return (
    <Frame label={label} size={size} className={className}>
      <svg aria-hidden viewBox="0 0 32 32" fill="none" className="size-full overflow-visible">
        <path d={CURVE} className="stroke-line-strong" strokeWidth={1} />
        {STRANDS.map(({ length, opacity }, i) => (
          <path
            key={length}
            d={CURVE}
            pathLength={1}
            strokeDasharray={`${length} ${1 - length}`}
            strokeWidth={1.75}
            strokeLinecap="round"
            opacity={opacity}
            className={`animate-trace motion-reduce:animate-none ${i === STRANDS.length - 1 ? "stroke-accent-strong" : "stroke-current"}`}
            // Shorter strands run slightly ahead so every head sits at the same point.
            style={{ animationDuration: `${THREAD}ms`, animationDelay: offset(longest - length, THREAD) }}
          />
        ))}
      </svg>
    </Frame>
  );
}

/* --- Fold: building ----------------------------------------------------- */

const ASSEMBLE = 2000;
// Grid order is top-left, top-right, bottom-left, bottom-right; each folds out
// along its own diagonal, in clockwise turn.
const TILES = [
  { fx: "-45%", fy: "-45%", turn: 0 },
  { fx: "45%", fy: "-45%", turn: 1 },
  { fx: "-45%", fy: "45%", turn: 3 },
  { fx: "45%", fy: "45%", turn: 2 },
];

/** Pieces being placed: four tiles fold out and settle back, one after another. */
export function Fold({ label = "Building", size = 32, className = "" }: ShapeProps) {
  return (
    <Frame label={label} size={size} className={className}>
      <span aria-hidden className="absolute inset-[20%] grid grid-cols-2 grid-rows-2 gap-[12%]">
        {TILES.map(({ fx, fy, turn }, i) => (
          <span
            key={i}
            className={`animate-assemble rounded-[2px] motion-reduce:animate-none ${i === 3 ? "bg-accent-strong" : "bg-current"}`}
            style={{ "--fx": fx, "--fy": fy, animationDelay: offset(-turn / 4, ASSEMBLE) } as CSSProperties}
          />
        ))}
      </span>
    </Frame>
  );
}

/* --- AgentShape: one glyph that follows the agent's phase --------------- */

export type AgentPhase = "thinking" | "reasoning" | "searching" | "planning" | "writing" | "building";

export const phases: Record<AgentPhase, { name: string; label: string; Shape: ComponentType<ShapeProps> }> = {
  thinking: { name: "Spark", label: "Thinking", Shape: Spark },
  reasoning: { name: "Orbit", label: "Reasoning", Shape: Orbit },
  searching: { name: "Graph", label: "Searching", Shape: Graph },
  planning: { name: "Morph", label: "Planning", Shape: Morph },
  writing: { name: "Thread", label: "Writing", Shape: Thread },
  building: { name: "Fold", label: "Building", Shape: Fold },
};

/**
 * Pass the agent's current phase; the glyph crossfades to the matching shape.
 * Screen readers hear the label (or the phase name) when it changes.
 */
export function AgentShape({ phase, label, size = 32, className = "" }: ShapeProps & { phase: AgentPhase }) {
  const [shown, setShown] = useState(phase);
  const [leaving, setLeaving] = useState<AgentPhase | null>(null);

  // Swap during render rather than in an effect, so the new shape never lags a frame.
  if (phase !== shown) {
    setLeaving(shown);
    setShown(phase);
  }

  useEffect(() => {
    if (!leaving) return;
    const id = setTimeout(() => setLeaving(null), 150);
    return () => clearTimeout(id);
  }, [leaving]);

  const { Shape } = phases[shown];
  const Leaving = leaving ? phases[leaving].Shape : null;

  return (
    <span role="status" className={`inline-grid shrink-0 ${className}`} style={{ width: size, height: size }}>
      <span className="sr-only">{label ?? phases[shown].label}</span>
      {Leaving && (
        <span
          key={`out-${leaving}`}
          aria-hidden
          className="col-start-1 row-start-1 flex"
          // The entrance keyframe played backwards, at exit speed.
          style={{ animation: "enter var(--duration-exit) var(--ease-out) reverse both" }}
        >
          <Leaving size={size} />
        </span>
      )}
      <span key={shown} aria-hidden className="col-start-1 row-start-1 flex animate-enter">
        <Shape size={size} />
      </span>
    </span>
  );
}

/* --- Demo --------------------------------------------------------------- */

const SCRIPT: { phase: AgentPhase; line: string }[] = [
  { phase: "thinking", line: "Thinking it through" },
  { phase: "reasoning", line: "Weighing 3 approaches" },
  { phase: "searching", line: "Searching 12 sources" },
  { phase: "planning", line: "Planning the changes" },
  { phase: "writing", line: "Drafting the answer" },
  { phase: "building", line: "Running the tests" },
];

function Shimmer({ children }: { children: ReactNode }) {
  return (
    <span
      className="animate-shimmer bg-clip-text text-transparent motion-reduce:animate-none motion-reduce:text-muted"
      style={{
        backgroundImage:
          "linear-gradient(90deg, var(--muted) 0%, var(--muted) 40%, var(--ink) 50%, var(--muted) 60%, var(--muted) 100%)",
        backgroundSize: "200% 100%",
      }}
    >
      {children}
    </span>
  );
}

// The demo sizes itself to its container, not the viewport: narrow stages
// (gallery cards, phones) get a compact grid, wide ones get captioned tiles.
function Tile({ name, phase, children, index }: { name: string; phase: string; children: ReactNode; index: number }) {
  return (
    <figure
      className="flex animate-enter flex-col overflow-hidden rounded-xl bg-surface shadow-md"
      style={{ animationDelay: `calc(${index} * var(--stagger))` }}
    >
      <div className="flex items-center justify-center pt-2.5 text-ink @md:h-16 @md:pt-0">
        {/* zoom, unlike scale, shrinks the layout box too. */}
        <span className="flex [zoom:0.78] @md:[zoom:1]">{children}</span>
      </div>
      <figcaption className="flex items-baseline justify-center gap-2 px-2 pt-1 pb-2 font-mono text-[11px] leading-none @md:justify-between @md:border-t @md:border-line @md:px-3 @md:py-2 @md:text-meta @md:leading-normal">
        <span className="text-ink">{name}</span>
        <span className="hidden truncate text-muted @md:inline">{phase}</span>
      </figcaption>
    </figure>
  );
}

export default function Demo() {
  const [step, setStep] = useState(0);
  const { phase, line } = SCRIPT[step];

  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s + 1) % SCRIPT.length), 2400);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="@container w-full max-w-xl">
      <div className="grid grid-cols-3 gap-2 @md:gap-3">
        <div className="col-span-full flex animate-enter items-center gap-2.5 rounded-xl bg-surface px-3 py-2 shadow-md @md:gap-3 @md:px-4 @md:py-3.5">
          <AgentShape phase={phase} label={line} size={28} className="text-ink" />
          <span aria-hidden key={step} className="min-w-0 flex-1 animate-enter truncate text-body font-medium">
            <Shimmer>{line}</Shimmer>
          </span>
          <span aria-hidden className="font-mono text-meta tabular-nums text-muted">
            {String(step + 1).padStart(2, "0")} / {String(SCRIPT.length).padStart(2, "0")}
          </span>
        </div>
        {SCRIPT.map((entry, i) => {
          const { name, label, Shape } = phases[entry.phase];
          return (
            <Tile key={entry.phase} name={name} phase={label.toLowerCase()} index={i + 1}>
              <Shape size={36} />
            </Tile>
          );
        })}
      </div>
    </div>
  );
}
