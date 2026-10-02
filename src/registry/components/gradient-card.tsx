"use client";

import { useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------------ */
/* Palettes                                                                  */
/* ------------------------------------------------------------------------ */

/** Artwork colours, not UI tokens: they look the same in both themes. */
export const palettes = [
  { name: "Lime", colors: ["#c2ff4d", "#1f8a70", "#0b2b26", "#f4f7e8"] },
  { name: "Dusk", colors: ["#ff8fb1", "#7a5cff", "#1b1446", "#ffd6a5"] },
  { name: "Glacier", colors: ["#b8e1ff", "#3a6df0", "#0a1a3a", "#eaf6ff"] },
  { name: "Ember", colors: ["#ffb347", "#ff4e2a", "#3b0a12", "#fff1d6"] },
] as const;

const hexToRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

/* ------------------------------------------------------------------------ */
/* Shader                                                                    */
/* ------------------------------------------------------------------------ */

const VERTEX = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

/**
 * A four-point mesh gradient: each colour sits on a point that drifts on its
 * own slow orbit, the field is domain-warped with fbm noise, and colours are
 * blended in linear light so midpoints stay luminous instead of muddy. The
 * pointer swirls and pinches the field around itself; a click sends a ring
 * outward. Grain on top hides banding.
 */
const FRAGMENT = `
precision highp float;

uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;    // 0–1, y up
uniform float uHover;
uniform vec3 uPulse;    // xy origin (0–1), z age in seconds (<0: none)
uniform float uSeed;
uniform vec3 uC0;
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uC3;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.02; a *= 0.5; }
  return v;
}
vec3 toLinear(vec3 c) { return pow(c, vec3(2.2)); }
vec3 toSrgb(vec3 c) { return pow(c, vec3(1.0 / 2.2)); }
float weight(vec2 p, vec2 c) { return 1.0 / (pow(distance(p, c), 2.4) + 0.015); }

void main() {
  float aspect = uRes.x / uRes.y;
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = vec2(uv.x * aspect, uv.y);
  vec2 m = vec2(uMouse.x * aspect, uMouse.y);

  // Pointer: swirl and pinch the field around the cursor.
  vec2 dm = p - m;
  float influence = exp(-dot(dm, dm) * 5.0) * uHover;
  float angle = influence * 1.4;
  dm = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * dm;
  p = m + dm * (1.0 - 0.3 * influence);

  // Click: a ring that pushes the field outward as it widens.
  if (uPulse.z >= 0.0) {
    vec2 o = vec2(uPulse.x * aspect, uPulse.y);
    vec2 dir = p - o;
    float r = uPulse.z * 1.3;
    float band = exp(-pow(length(dir) - r, 2.0) * 60.0) * exp(-uPulse.z * 2.4);
    p += normalize(dir + 1e-4) * band * 0.08;
  }

  float t = uTime * 0.16 + uSeed;
  vec2 q = vec2(fbm(p * 1.3 + t), fbm(p * 1.3 - t + 5.2));
  vec2 w = p + (q - 0.5) * 0.85;

  vec2 a = vec2(aspect * (0.22 + 0.16 * sin(t * 1.3)), 0.24 + 0.18 * cos(t * 1.1));
  vec2 b = vec2(aspect * (0.80 + 0.12 * cos(t * 0.9)), 0.30 + 0.20 * sin(t * 1.4));
  vec2 c = vec2(aspect * (0.30 + 0.20 * cos(t * 0.7 + 2.0)), 0.82 + 0.10 * sin(t));
  vec2 d = vec2(aspect * (0.76 + 0.14 * sin(t * 1.2 + 1.0)), 0.78 + 0.14 * cos(t * 0.8));

  float wa = weight(w, a), wb = weight(w, b), wc = weight(w, c), wd = weight(w, d);
  vec3 lin = (toLinear(uC0) * wa + toLinear(uC1) * wb + toLinear(uC2) * wc + toLinear(uC3) * wd) / (wa + wb + wc + wd);
  vec3 color = toSrgb(lin) + influence * 0.06;

  // Animated grain: hides banding and gives the surface some tooth.
  color += (hash(gl_FragCoord.xy + fract(uTime * 7.0) * 113.0) - 0.5) * 0.05;
  gl_FragColor = vec4(color, 1.0);
}
`;

/* ------------------------------------------------------------------------ */
/* GradientField                                                             */
/* ------------------------------------------------------------------------ */

type GradientFieldProps = {
  /** Four sRGB hex colours. Changing them crossfades over ~700ms. */
  colors: readonly string[];
  /** Offsets the motion so neighbouring cards don't move in sync. */
  seed?: number;
  /** Lights the field from the centre (keyboard focus). */
  active?: boolean;
  /** Increment to send a pulse from the centre (keyboard activation). */
  pulse?: number;
  className?: string;
};

/**
 * Raw WebGL, no library. Animates only while on screen; under reduced
 * motion it renders still frames on interaction and swaps colours
 * instantly. Pointer input is read from the parent element.
 */
export function GradientField({ colors, seed = 0, active = false, pulse = 0, className = "" }: GradientFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bridge = useRef({
    active,
    colors,
    pulse,
    onColors: () => {},
    onActive: () => {},
    onPulse: () => {},
  });

  useEffect(() => {
    bridge.current.active = active;
    bridge.current.onActive();
  }, [active]);

  useEffect(() => {
    bridge.current.colors = colors;
    bridge.current.onColors();
  }, [colors]);

  useEffect(() => {
    if (pulse === bridge.current.pulse) return;
    bridge.current.pulse = pulse;
    bridge.current.onPulse();
  }, [pulse]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, preserveDrawingBuffer: true });
    if (!gl) return;

    const shader = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, shader(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    gl.useProgram(program);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const u = (n: string) => gl.getUniformLocation(program, n);
    const uRes = u("uRes"), uTime = u("uTime"), uMouse = u("uMouse"), uHover = u("uHover");
    const uPulse = u("uPulse"), uSeed = u("uSeed");
    const uColors = [u("uC0"), u("uC1"), u("uC2"), u("uC3")];

    const link = bridge.current;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const toRgb = (list: readonly string[]) => list.map(hexToRgb);
    const state = {
      time: 0,
      hover: 0,
      pointer: false,
      mouse: [0.5, 0.5],
      pulse: [0.5, 0.5, -1] as number[],
      from: toRgb(bridge.current.colors),
      to: toRgb(bridge.current.colors),
      mix: 1,
      visible: false,
      raf: 0,
      last: 0,
    };

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      const scale = Math.min(window.devicePixelRatio || 1, 2) * 0.75;
      canvas!.width = Math.max(1, Math.round(rect.width * scale));
      canvas!.height = Math.max(1, Math.round(rect.height * scale));
      gl!.viewport(0, 0, canvas!.width, canvas!.height);
      gl!.uniform2f(uRes, canvas!.width, canvas!.height);
    }

    function draw() {
      // Ease-out cubic crossfade between palettes.
      const k = 1 - Math.pow(1 - state.mix, 3);
      uColors.forEach((loc, i) => {
        const a = state.from[i], b = state.to[i];
        gl!.uniform3f(loc, a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k);
      });
      gl!.uniform1f(uTime, state.time);
      gl!.uniform2fv(uMouse, state.mouse);
      gl!.uniform1f(uHover, state.hover);
      gl!.uniform3fv(uPulse, state.pulse);
      gl!.drawArrays(gl!.TRIANGLES, 0, 3);
    }

    function frame(now: number) {
      const dt = Math.min(0.05, (now - (state.last || now)) / 1000);
      state.last = now;
      const target = state.pointer || bridge.current.active ? 1 : 0;
      if (bridge.current.active && !state.pointer) state.mouse = [0.5, 0.5];
      state.hover += (target - state.hover) * (1 - Math.exp(-dt * (target > state.hover ? 8 : 4)));
      state.time += dt * (0.6 + state.hover * 1.2);
      state.mix = Math.min(1, state.mix + dt / 0.7);
      if (state.pulse[2] >= 0) {
        state.pulse[2] += dt;
        if (state.pulse[2] > 1.4) state.pulse[2] = -1;
      }
      draw();
      state.raf = state.visible ? requestAnimationFrame(frame) : 0;
    }

    function start() {
      if (reduced) return draw();
      if (!state.raf && state.visible) {
        state.last = 0;
        state.raf = requestAnimationFrame(frame);
      }
    }

    function sendPulse(x: number, y: number) {
      if (reduced) return;
      state.pulse = [x, y, 0];
    }

    const host = canvas.parentElement!;
    const local = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return [(e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height];
    };
    const onMove = (e: PointerEvent) => {
      state.mouse = local(e);
      state.pointer = true;
      if (reduced) {
        state.hover = 1;
        draw();
      }
    };
    const onLeave = () => {
      state.pointer = false;
      if (reduced) {
        state.hover = 0;
        draw();
      }
    };
    const onDown = (e: PointerEvent) => {
      const [x, y] = local(e);
      sendPulse(x, y);
    };
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    host.addEventListener("pointerdown", onDown);

    bridge.current.onColors = () => {
      const k = 1 - Math.pow(1 - state.mix, 3);
      // Start from wherever the current blend is, so rapid clicks stay smooth.
      state.from = state.from.map((a, i) => a.map((v, j) => v + (state.to[i][j] - v) * k));
      state.to = toRgb(bridge.current.colors);
      state.mix = reduced ? 1 : 0;
      if (reduced) draw();
      else start();
    };
    bridge.current.onActive = () => {
      if (!reduced) return start();
      state.hover = bridge.current.active ? 1 : 0;
      state.mouse = [0.5, 0.5];
      draw();
    };
    bridge.current.onPulse = () => sendPulse(0.5, 0.5);

    const resizeObserver = new ResizeObserver(() => {
      resize();
      draw();
    });
    resizeObserver.observe(canvas);
    const visibility = new IntersectionObserver(([entry]) => {
      state.visible = entry.isIntersecting;
      if (state.visible) start();
    });
    visibility.observe(canvas);

    gl.uniform1f(uSeed, seed * 7.31);
    resize();
    draw();

    return () => {
      cancelAnimationFrame(state.raf);
      state.visible = false;
      resizeObserver.disconnect();
      visibility.disconnect();
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      host.removeEventListener("pointerdown", onDown);
      link.onColors = link.onActive = link.onPulse = () => {};
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [seed]);

  return <canvas ref={canvasRef} aria-hidden className={`block size-full bg-panel ${className}`} />;
}

/* ------------------------------------------------------------------------ */
/* GradientCard                                                              */
/* ------------------------------------------------------------------------ */

type GradientCardProps = {
  title: string;
  description: string;
  meta?: string;
  /** Index into `palettes` to start from. */
  palette?: number;
  seed?: number;
};

/**
 * A project card whose cover is a live mesh gradient. Hover swirls the
 * colours around the cursor; clicking (or Enter/Space) sends a pulse and
 * crossfades to the next palette, named on a frosted chip.
 */
export function GradientCard({ title, description, meta, palette = 0, seed = 0 }: GradientCardProps) {
  const [index, setIndex] = useState(palette % palettes.length);
  const [focused, setFocused] = useState(false);
  const [pulse, setPulse] = useState(0);
  const current = palettes[index];
  const next = palettes[(index + 1) % palettes.length];

  return (
    <article className="flex flex-col">
      <button
        type="button"
        onClick={(e) => {
          setIndex((i) => (i + 1) % palettes.length);
          // Pointer clicks pulse from the cursor; keyboard clicks (detail 0) from the centre.
          if (e.detail === 0) setPulse((n) => n + 1);
        }}
        onFocus={(e) => setFocused(e.currentTarget.matches(":focus-visible"))}
        onBlur={() => setFocused(false)}
        aria-label={`${title} cover, ${current.name} palette. Switch to ${next.name}`}
        className="group/gradient relative aspect-[4/3] cursor-pointer overflow-hidden rounded-xl outline-offset-4 transition-[scale] duration-(--duration-exit) ease-out active:scale-[0.98]"
      >
        <GradientField colors={current.colors} seed={seed} active={focused} pulse={pulse} />
        <span aria-hidden className="pointer-events-none absolute inset-0 rounded-xl shadow-[inset_0_0_0_1px_rgb(0_0_0/0.08)]" />
        <span
          aria-hidden
          className="absolute bottom-2.5 left-2.5 flex items-center gap-2 rounded-full bg-surface/70 py-1 pl-1.5 pr-2.5 text-meta font-medium text-ink shadow-sm backdrop-blur-md backdrop-saturate-150"
        >
          <span className="flex -space-x-1">
            {current.colors.map((c) => (
              <span
                key={c}
                className="size-3 rounded-full shadow-[0_0_0_1.5px_var(--surface)] transition-colors duration-(--duration-move)"
                style={{ background: c }}
              />
            ))}
          </span>
          <span key={current.name} className="animate-enter">
            {current.name}
          </span>
        </span>
      </button>
      <div className="mt-3 flex items-baseline justify-between gap-3 px-0.5">
        <h3 className="text-body font-medium text-ink">{title}</h3>
        {meta && <span className="shrink-0 text-meta tabular-nums text-muted">{meta}</span>}
      </div>
      <p className="mt-0.5 px-0.5 text-body text-muted">{description}</p>
      <span className="sr-only" role="status">
        {current.name} palette
      </span>
    </article>
  );
}

/* ------------------------------------------------------------------------ */
/* Demo                                                                      */
/* ------------------------------------------------------------------------ */

const projects = [
  { title: "Wavr", description: "Shader code in, motion graphics out.", meta: "2026", palette: 0 },
  { title: "Studio OS", description: "References in, shipped UI out.", meta: "2026", palette: 1 },
  { title: "Houston-MD", description: "A Markdown reader built for reading.", meta: "2026", palette: 2 },
];

export default function Demo() {
  return (
    <div className="grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-3">
      {projects.map((project, i) => (
        <div key={project.title} className="animate-enter" style={{ animationDelay: `calc(${i} * var(--stagger))` }}>
          <GradientCard {...project} seed={i} />
        </div>
      ))}
    </div>
  );
}
