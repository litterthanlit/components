"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

/*
 * Project cards with a live wireframe cover: a perspective camera flying
 * through an endless 3D lattice of hairlines, with glowing nodes where the
 * lines meet and dust hanging in the air. The look comes from real-time
 * graphics tools like TouchDesigner: additive light on black, depth fog,
 * motion trails and a bloom pass.
 *
 * Rendering is plain Canvas 2D. Every line is projected from 3D each frame,
 * batched into a handful of paths by depth so the browser strokes ~30 paths
 * instead of thousands, and blended with "lighter" so crossings glow. Bloom
 * is a quarter-size copy of the frame blurred by CSS on the GPU. Hover speeds
 * the flight up and steers the camera; a click warps forward with trails.
 * It stops when off-screen and renders one still frame under reduced motion.
 */

export type WireframeScene = "lattice" | "tunnel" | "horizon";
export type WireframeTone = "mono" | "cobalt" | "ice";

const tones: Record<WireframeTone, { rgb: string; bloom: number }> = {
  mono: { rgb: "236, 240, 255", bloom: 0.7 },
  cobalt: { rgb: "140, 180, 255", bloom: 0.9 },
  ice: { rgb: "150, 232, 255", bloom: 0.85 },
};

/* ------------------------------------------------------------------------ */
/* Scenes: lines and nodes in world space, one unit between lattice layers   */
/* ------------------------------------------------------------------------ */

/** Depth of one repeat of the world; the camera loops through it forever. */
const LOOP = 18;

type World = {
  /** x1, y1, z1, x2, y2, z2, weight */
  lines: Float32Array;
  /** x, y, z, radius, weight */
  nodes: Float32Array;
};

/** A stable hash in [0, 1), so a scene looks the same on every load. */
function rand(a: number, b: number, c: number, salt: number) {
  let h = Math.imul(a + 1013, 374761393) ^ Math.imul(b + 2027, 668265263) ^ Math.imul(c + 3041, 1274126177) ^ Math.imul(salt, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Index an edge from n to n+1 so it hashes the same as its mirror image. */
const edge = (n: number) => (n >= 0 ? n : -n - 1);

function build(scene: WireframeScene): World {
  const lines: number[] = [];
  const nodes: number[] = [];
  const line = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, w: number) =>
    lines.push(x1, y1, z1, x2, y2, z2, w);
  const node = (x: number, y: number, z: number, r: number, w: number) => nodes.push(x, y, z, r, w);

  if (scene === "lattice") {
    // A grid mirrored left/right and top/bottom. Even columns and rows are
    // "major": denser, brighter and doubled with close parallel lines.
    const N = 5;
    const major = (n: number) => (n === 0 ? 1 : n % 2 === 0 ? 0.75 : 0.16);
    for (let k = 0; k < LOOP; k++) {
      for (let i = -N; i <= N; i++) {
        for (let j = -N; j <= N; j++) {
          const ai = Math.abs(i);
          const aj = Math.abs(j);
          const wi = major(ai);
          const wj = major(aj);
          if (j < N && rand(ai, edge(j), k, 1) < wi * 0.6) {
            line(i, j, k, i, j + 1, k, wi);
            if (wi > 0.5) for (const o of [-0.08, 0.08, 0.16]) line(i + o * Math.sign(i || 1), j, k, i + o * Math.sign(i || 1), j + 1, k, 0.3);
          }
          if (i < N && rand(edge(i), aj, k, 2) < wj * 0.55) {
            line(i, j, k, i + 1, j, k, wj);
            if (wj > 0.5) for (const o of [-0.08, 0.08]) line(i, j + o, k, i + 1, j + o, k, 0.3);
          }
          if (rand(ai, aj, k, 3) < 0.1 + 0.55 * wi * wj) {
            const start = k + rand(ai, aj, k, 6) * 0.4;
            line(i, j, start, i, j, start + 0.3 + rand(ai, aj, k, 7) * 0.7, 0.4 + 0.6 * wi * wj);
          }
          if (rand(ai, aj, k, 4) < 0.08 + 0.6 * wi * wj) node(i, j, k, 0.025 + rand(ai, aj, k, 5) * 0.035, 1);
        }
      }
    }
  } else if (scene === "tunnel") {
    // A square tunnel: only the cells on its walls, with a ring every other layer.
    const R = 3;
    for (let k = 0; k < LOOP; k++) {
      for (let i = -R; i <= R; i++) {
        for (let j = -R; j <= R; j++) {
          if (Math.max(Math.abs(i), Math.abs(j)) !== R) continue;
          const ai = Math.abs(i);
          const aj = Math.abs(j);
          const ring = k % 2 === 0 || rand(ai, aj, k, 1) < 0.3;
          if (aj === R && i < R && ring) line(i, j, k, i + 1, j, k, 1);
          if (ai === R && j < R && ring) line(i, j, k, i, j + 1, k, 1);
          if (k % 4 === 0) {
            const inset = R - 0.1;
            if (aj === R && i < R) line(i, Math.sign(j) * inset, k + 0.12, i + 1, Math.sign(j) * inset, k + 0.12, 0.3);
            if (ai === R && j < R) line(Math.sign(i) * inset, j, k + 0.12, Math.sign(i) * inset, j + 1, k + 0.12, 0.3);
          }
          if (rand(ai, aj, k, 3) < 0.75) line(i, j, k, i, j, k + 0.4 + rand(ai, aj, k, 7) * 0.6, 0.9);
          if (rand(ai, aj, k, 4) < 0.55) node(i, j, k, 0.03 + rand(ai, aj, k, 5) * 0.03, 1);
        }
      }
    }
  } else {
    // A floor and a ceiling that meet at the horizon, joined by sparse pillars.
    const N = 10;
    const floor = -1.2;
    const ceil = 1.8;
    for (let k = 0; k < LOOP; k++) {
      for (let i = -N; i <= N; i++) {
        const ai = Math.abs(i);
        const w = ai % 3 === 0 ? 1 : 0.35;
        line(i, floor, k, i, floor, k + 1, w);
        if (i < N) line(i, floor, k, i + 1, floor, k, k % 2 === 0 ? 0.8 : 0.3);
        if (rand(ai, 0, k, 1) < 0.7) line(i, ceil, k, i, ceil, k + 0.3 + rand(ai, 0, k, 2) * 0.7, w === 1 ? 0.7 : 0.3);
        if (i < N && k % 3 === 0 && rand(edge(i), 0, k, 3) < 0.7) line(i, ceil, k, i + 1, ceil, k, 0.6);
        if (ai % 3 === 0 && ai > 0 && k % 2 === 0 && rand(ai, 0, k, 4) < 0.55) line(i, floor, k, i, ceil, k, 0.6);
        if (w === 1 && rand(ai, 1, k, 8) < 0.45) node(i, ceil, k, 0.025 + rand(ai, 1, k, 9) * 0.025, 1);
        if (w === 1 && rand(ai, 0, k, 5) < 0.6) node(i, floor, k, 0.03 + rand(ai, 0, k, 6) * 0.03, 1);
      }
    }
  }

  // Dust: specks in the air, and now and then a soft out-of-focus mote.
  for (let n = 0; n < 260; n++) {
    const bokeh = rand(n, 0, 0, 11) < 0.06;
    node(
      (rand(n, 1, 0, 12) - 0.5) * 12,
      (rand(n, 2, 0, 13) - 0.5) * 8,
      rand(n, 3, 0, 14) * LOOP,
      bokeh ? 0.035 + rand(n, 4, 0, 15) * 0.03 : 0.006 + rand(n, 5, 0, 16) * 0.01,
      0.45,
    );
  }

  return { lines: new Float32Array(lines), nodes: new Float32Array(nodes) };
}

/* ------------------------------------------------------------------------ */
/* Renderer                                                                  */
/* ------------------------------------------------------------------------ */

const NEAR = 0.15;
const BUCKETS = 16;
const BASE_SPEED = 0.55;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Brightness by depth: fade in from the lens, fog out into the distance. */
const fog = (z: number) => smoothstep(NEAR, NEAR + 1.1, z) * Math.exp((-z * 2) / LOOP) * (1 - smoothstep(LOOP * 0.72, LOOP, z));

/** Buckets are spaced on a square-root curve, so there are more of them up close. */
const bucketOf = (z: number) => Math.min(BUCKETS - 1, Math.floor(Math.sqrt(Math.max(0, z) / LOOP) * BUCKETS));
const bucketDepth = (b: number) => ((b + 0.5) / BUCKETS) ** 2 * LOOP;

type Control = { hover: boolean; active: boolean; tx: number; ty: number; warp: number };

type EngineOptions = {
  wrap: HTMLElement;
  canvas: HTMLCanvasElement;
  bloom: HTMLCanvasElement;
  readout: HTMLElement | null;
  scene: WireframeScene;
  tone: WireframeTone;
};

export function createEngine({ wrap, canvas, bloom, readout, scene, tone }: EngineOptions) {
  const ctx = canvas.getContext("2d");
  const bctx = bloom.getContext("2d");
  const ctl: Control = { hover: false, active: false, tx: 0, ty: 0, warp: 0 };
  const world = build(scene);
  const rgb = tones[tone].rgb;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let W = 1;
  let H = 1;
  let dpr = 1;
  let raf = 0;
  let last = 0;
  let frame = 0;
  let camZ = 3.3;
  let speed = BASE_SPEED;
  const cam = { x: 0, y: 0 };
  const strong = Array.from({ length: BUCKETS }, () => new Path2D());
  const faint = Array.from({ length: BUCKETS }, () => new Path2D());
  const dots = Array.from({ length: BUCKETS * 2 }, () => new Path2D());

  function draw() {
    if (!ctx || !bctx) return;
    const { lines, nodes } = world;
    const f = Math.min(W, H) * 0.95;
    const cx = W / 2;
    const cy = H / 2;
    const flash = 1 + ctl.warp * 0.6;

    // A translucent clear leaves trails behind while warping.
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = `rgba(0, 0, 0, ${Math.max(0.22, 1 - ctl.warp * 0.85)})`;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";

    for (let b = 0; b < BUCKETS; b++) {
      strong[b] = new Path2D();
      faint[b] = new Path2D();
      dots[b] = new Path2D();
      dots[b + BUCKETS] = new Path2D();
    }

    for (let n = 0; n < lines.length; n += 7) {
      let z1 = (((lines[n + 2] - camZ) % LOOP) + LOOP) % LOOP;
      const z2 = z1 + (lines[n + 5] - lines[n + 2]);
      if (z2 < NEAR) continue;
      let x1 = lines[n];
      let y1 = lines[n + 1];
      const x2 = lines[n + 3];
      const y2 = lines[n + 4];
      if (z1 < NEAR) {
        // Clip lines that pass the lens so they don't flip behind the camera.
        const t = (NEAR - z1) / (z2 - z1);
        x1 += (x2 - x1) * t;
        y1 += (y2 - y1) * t;
        z1 = NEAR;
      }
      const b = bucketOf((z1 + z2) / 2);
      const p = lines[n + 6] > 0.5 ? strong[b] : faint[b];
      p.moveTo(cx + ((x1 - cam.x) * f) / z1, cy - ((y1 - cam.y) * f) / z1);
      p.lineTo(cx + ((x2 - cam.x) * f) / z2, cy - ((y2 - cam.y) * f) / z2);
    }

    const cap = 5 * dpr;
    for (let n = 0; n < nodes.length; n += 5) {
      const z = (((nodes[n + 2] - camZ) % LOOP) + LOOP) % LOOP;
      if (z < NEAR + 0.05) continue;
      const s = f / z;
      const px = cx + (nodes[n] - cam.x) * s;
      const py = cy - (nodes[n + 1] - cam.y) * s;
      if (px < -cap || px > W + cap || py < -cap || py > H + cap) continue;
      const r = Math.min(cap, Math.max(0.6 * dpr, nodes[n + 3] * s));
      const path = dots[bucketOf(z) + (nodes[n + 4] > 0.5 ? 0 : BUCKETS)];
      path.moveTo(px + r, py);
      path.arc(px, py, r, 0, Math.PI * 2);
    }

    for (let b = 0; b < BUCKETS; b++) {
      const z = bucketDepth(b);
      const a = fog(z) * flash;
      if (a < 0.004) continue;
      ctx.lineWidth = Math.min(1.7, Math.max(0.55, 2.4 / z)) * dpr * 0.8;
      ctx.strokeStyle = `rgba(${rgb}, ${Math.min(1, a * 1.15)})`;
      ctx.stroke(strong[b]);
      ctx.strokeStyle = `rgba(${rgb}, ${Math.min(1, a * 0.4)})`;
      ctx.stroke(faint[b]);
      ctx.fillStyle = `rgba(${rgb}, ${Math.min(1, a * 1.4)})`;
      ctx.fill(dots[b]);
      ctx.fillStyle = `rgba(${rgb}, ${Math.min(1, a * 0.5)})`;
      ctx.fill(dots[b + BUCKETS]);
    }

    // Bloom: a quarter-size copy, blurred and screened over the frame by CSS.
    bctx.globalCompositeOperation = "copy";
    bctx.drawImage(canvas, 0, 0, bloom.width, bloom.height);

    if (readout && frame++ % 6 === 0) {
      readout.textContent = `${scene}  z ${camZ.toFixed(1).padStart(6, "0")}  ${(speed / BASE_SPEED + ctl.warp * 30).toFixed(1)}×`;
    }
  }

  function tick(now: number) {
    raf = requestAnimationFrame(tick);
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    const target = BASE_SPEED * (ctl.hover || ctl.active ? 2.6 : 1);
    speed += (target - speed) * (1 - Math.exp(-dt * 3));
    ctl.warp *= Math.exp(-dt * 1.8);
    camZ += (speed + ctl.warp * 16) * dt;
    const k = 1 - Math.exp(-dt * 3.5);
    cam.x += (ctl.tx * 0.9 - cam.x) * k;
    cam.y += (ctl.ty * 0.6 - cam.y) * k;
    draw();
  }

  function resize() {
    const rect = wrap.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.width = Math.max(1, Math.round(rect.width * dpr));
    H = canvas.height = Math.max(1, Math.round(rect.height * dpr));
    bloom.width = Math.max(1, Math.round(W / 4));
    bloom.height = Math.max(1, Math.round(H / 4));
    draw();
  }

  return {
    resize,
    setHover(on: boolean) {
      ctl.hover = on;
      if (!on) ctl.tx = ctl.ty = 0;
    },
    setActive(on: boolean) {
      ctl.active = on;
    },
    /** Aim the camera: x and y from -1 to 1, up is positive. */
    steer(x: number, y: number) {
      ctl.tx = x;
      ctl.ty = y;
    },
    warp() {
      ctl.warp = 1;
    },
    start() {
      if (raf || reduce) return;
      last = 0;
      raf = requestAnimationFrame(tick);
    },
    stop() {
      cancelAnimationFrame(raf);
      raf = 0;
    },
  };
}

/* ------------------------------------------------------------------------ */
/* Field                                                                     */
/* ------------------------------------------------------------------------ */

const GRAIN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";

const STYLES = `
@keyframes wf-grain { 0% { transform: translate(0, 0); } 25% { transform: translate(-3%, 2%); } 50% { transform: translate(2%, -3%); } 75% { transform: translate(-2%, -1%); } }
.wf-grain { animation: wf-grain 0.6s steps(1) infinite; }
@media (prefers-reduced-motion: reduce) { .wf-grain { animation: none; } }
`;

type WireframeFieldProps = {
  scene?: WireframeScene;
  tone?: WireframeTone;
  /** Speeds the flight up, as hover does. Use it for keyboard focus. */
  active?: boolean;
  /** Increment to warp forward. */
  pulse?: number;
  /** Show the live scene/depth/speed readout in the corner. */
  readout?: boolean;
  className?: string;
};

/** The live cover on its own: it fills its parent and reacts to the pointer. */
export function WireframeField({ scene = "lattice", tone = "mono", active = false, pulse = 0, readout = true, className = "" }: WireframeFieldProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bloomRef = useRef<HTMLCanvasElement>(null);
  const readoutRef = useRef<HTMLSpanElement>(null);
  const engine = useRef<ReturnType<typeof createEngine> | null>(null);
  const lastPulse = useRef(pulse);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const bloom = bloomRef.current;
    if (!wrap || !canvas || !bloom) return;
    const e = createEngine({ wrap, canvas, bloom, readout: readoutRef.current, scene, tone });
    engine.current = e;
    e.resize();
    const ro = new ResizeObserver(() => e.resize());
    ro.observe(wrap);
    const io = new IntersectionObserver(([entry]) => (entry.isIntersecting ? e.start() : e.stop()));
    io.observe(wrap);
    return () => {
      e.stop();
      ro.disconnect();
      io.disconnect();
      engine.current = null;
    };
  }, [scene, tone]);

  useEffect(() => {
    engine.current?.setActive(active);
  }, [active]);

  useEffect(() => {
    if (pulse === lastPulse.current) return;
    lastPulse.current = pulse;
    engine.current?.warp();
  }, [pulse]);

  return (
    <div
      ref={wrapRef}
      aria-hidden
      className={`overflow-hidden bg-black ${className}`}
      onPointerEnter={() => engine.current?.setHover(true)}
      onPointerLeave={() => engine.current?.setHover(false)}
      onPointerMove={(event) => {
        if (event.pointerType !== "mouse") return;
        const rect = event.currentTarget.getBoundingClientRect();
        engine.current?.steer(((event.clientX - rect.left) / rect.width) * 2 - 1, 1 - ((event.clientY - rect.top) / rect.height) * 2);
      }}
    >
      <style>{STYLES}</style>
      <canvas ref={canvasRef} className="absolute inset-0 size-full" />
      <canvas
        ref={bloomRef}
        className="absolute inset-0 size-full"
        style={{ filter: "blur(6px) brightness(1.7)", mixBlendMode: "screen", opacity: tones[tone].bloom }}
      />
      <div className="wf-grain absolute -inset-[10%] opacity-[0.07] mix-blend-screen" style={{ backgroundImage: GRAIN }} />
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center, transparent 50%, rgb(0 0 0 / 0.7) 100%)" }} />
      {readout && (
        <span
          ref={readoutRef}
          className="absolute left-3 top-3 whitespace-pre font-mono max-sm:hidden text-[10px] uppercase tracking-[0.14em] text-white/45 tabular-nums"
        />
      )}
    </div>
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
  /** The large card: shows its description under the title. */
  featured?: boolean;
  className?: string;
  style?: CSSProperties;
};

export function WireframeCard({ title, description, meta, scene = "lattice", tone = "mono", featured = false, className = "", style }: WireframeCardProps) {
  const [pulse, setPulse] = useState(0);
  const [focused, setFocused] = useState(false);

  return (
    <article className={`relative isolate overflow-hidden rounded-xl bg-black shadow-lg ${className}`} style={style}>
      <button
        type="button"
        onClick={() => setPulse((n) => n + 1)}
        onFocus={(e) => setFocused(e.currentTarget.matches(":focus-visible"))}
        onBlur={() => setFocused(false)}
        aria-label={`${title}: warp forward through the ${scene}`}
        className="absolute inset-0 cursor-pointer rounded-xl outline-offset-4 transition-[scale] duration-(--duration-exit) ease-out active:scale-[0.99]"
      >
        <WireframeField scene={scene} tone={tone} active={focused} pulse={pulse} className="absolute inset-0 rounded-xl" />
      </button>
      <span aria-hidden className="pointer-events-none absolute inset-0 rounded-xl shadow-[inset_0_0_0_1px_rgb(255_255_255/0.1)]" />
      <div className={`pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-black/85 via-black/35 to-transparent ${featured ? "p-5 pt-16" : "p-3.5 pt-10"}`}>
        <div className="flex items-baseline justify-between gap-3">
          <h3 className={`font-medium text-white ${featured ? "text-lead" : "text-body"}`}>{title}</h3>
          {meta && <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-white/50">{meta}</span>}
        </div>
        <p className={featured ? "mt-1 max-w-[34ch] text-body text-white/60 max-sm:sr-only" : "sr-only"}>{description}</p>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------------ */
/* Demo                                                                      */
/* ------------------------------------------------------------------------ */

export default function Demo() {
  return (
    <div className="grid w-full max-w-[720px] grid-cols-[1.35fr_1fr] grid-rows-2 gap-3">
      <WireframeCard
        featured
        title="Lattice"
        description="An endless mirrored grid. Hover to fly faster and steer, click to warp."
        meta="Mono"
        scene="lattice"
        tone="mono"
        className="row-span-2 animate-enter"
      />
      <WireframeCard
        title="Tunnel"
        description="A square tunnel with a ring every other layer."
        meta="Mono"
        scene="tunnel"
        tone="mono"
        className="aspect-[16/10] animate-enter"
        style={{ animationDelay: "var(--stagger)" }}
      />
      <WireframeCard
        title="Horizon"
        description="A floor and a ceiling meeting at the horizon."
        meta="Cobalt"
        scene="horizon"
        tone="cobalt"
        className="aspect-[16/10] animate-enter"
        style={{ animationDelay: "calc(2 * var(--stagger))" }}
      />
    </div>
  );
}
