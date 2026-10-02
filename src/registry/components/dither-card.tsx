"use client";

import { useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------------ */
/* Shader                                                                    */
/* ------------------------------------------------------------------------ */

const VERTEX = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

/**
 * Three-tone ordered (Bayer 8×8) dithering of an animated field: each cell
 * resolves to the ground, a mid tone or the ink, which doubles the tonal steps
 * a two-tone dither can show. Near the pointer the field brightens and lit
 * cells switch to the accent. A click sends a ring outward.
 */
const FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;
uniform float uHover;
uniform vec3 uRipple;   // xy = origin (px), z = age in seconds (<0: none)
uniform float uPattern;
uniform vec3 uInk;
uniform vec3 uBg;
uniform vec3 uAccent;

float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 6; i++) { v += a * noise(p); p = p * 2.03 + 17.0; a *= 0.5; }
  return v;
}
// Thin bright bands where x crosses a multiple of 1/n — contour lines.
float contour(float x, float n, float sharp) { return pow(abs(cos(x * n * 3.14159)), sharp); }

float field(vec2 uv, float t) {
  float aspect = uRes.x / uRes.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  if (uPattern < 0.5) {
    // Flow: domain-warped fbm read as terrain, with contour lines.
    vec2 q = vec2(fbm(p * 2.2 + t * 0.12), fbm(p * 2.2 - t * 0.09 + 3.1));
    float h = fbm(p * 2.4 + q * 1.6);
    float base = smoothstep(0.2, 0.85, h);
    return base * 0.8 + contour(h, 9.0, 18.0) * 0.35 * smoothstep(0.25, 0.6, h);
  } else if (uPattern < 1.5) {
    // Orbit: rings breathing out of a soft centre, warped and finely engraved.
    vec2 c = p - vec2(aspect * 0.5, 0.5);
    float a = atan(c.y, c.x);
    float d = length(c) + (fbm(vec2(a * 1.6, t * 0.2)) - 0.5) * 0.05;
    float rings = 0.5 + 0.5 * sin(d * 26.0 - t * 1.6);
    float fine = contour(d - t * 0.02, 22.0, 6.0);
    return (rings * 0.8 + fine * 0.3) * smoothstep(0.78, 0.04, d);
  }
  // Dunes: interfering diagonal waves with a fine wind ripple and grain.
  float w = sin(p.x * 9.0 + sin(p.y * 5.0 + t * 0.7) * 1.4 + t * 0.5);
  w += 0.6 * sin((p.x + p.y) * 13.0 - t * 0.8);
  float crest = smoothstep(-0.9, 1.6, w);
  float ripple = contour((p.x * 0.35 - p.y) * 1.0 + w * 0.06 - t * 0.03, 11.0, 4.0);
  float grain = fbm(p * 7.0 + t * 0.05);
  return (crest * 0.85 + ripple * (0.15 + crest * 0.3) + (grain - 0.5) * 0.12) * (0.35 + 0.65 * uv.y);
}

void main() {
  vec2 px = gl_FragCoord.xy;
  vec2 uv = px / uRes;
  float v = field(uv, uTime) * 0.86;

  // Pointer light.
  float r = uRes.y * 0.42;
  float d = distance(px, uMouse);
  float light = exp(-(d * d) / (r * r)) * uHover;

  // Click ripple: a ring that widens and fades.
  float ring = 0.0;
  if (uRipple.z >= 0.0) {
    float rad = uRipple.z * uRes.y * 1.4;
    float rd = abs(distance(px, uRipple.xy) - rad);
    ring = smoothstep(uRes.y * 0.03, 0.0, rd) * exp(-uRipple.z * 2.2);
  }

  float threshold = bayer8(px);
  float level = clamp(v + light * 0.55 + ring, 0.0, 1.0);
  // Three tones: 0 ground, 1 mid, 2 ink.
  float scaled = level * 2.0;
  float tone = min(2.0, floor(scaled) + step(threshold, fract(scaled)));
  // The mid tone stays light so even a solid run of it reads as a tint under the ink.
  vec3 color = tone > 1.5 ? uInk : tone > 0.5 ? mix(uBg, uInk, 0.24) : uBg;
  if (tone > 0.5 && light * 0.9 + ring > threshold) color = tone > 1.5 ? uAccent : mix(uBg, uAccent, 0.4);
  gl_FragColor = vec4(color, 1.0);
}
`;

/* ------------------------------------------------------------------------ */
/* Helpers                                                                   */
/* ------------------------------------------------------------------------ */

const PATTERNS = { flow: 0, orbit: 1, dunes: 2 } as const;
export type DitherPattern = keyof typeof PATTERNS;

let swatch: CanvasRenderingContext2D | null = null;

/**
 * Reads a design token as 0–1 RGB for the shader. Painting it into a 1×1
 * canvas accepts any CSS colour (#111, #111111, rgb(), oklch()…), so a
 * minifier rewriting the token can't break it.
 */
function readColor(el: Element, name: string, fallback: [number, number, number]) {
  const raw = getComputedStyle(el).getPropertyValue(name).trim();
  swatch ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!raw || !swatch) return fallback;
  swatch.clearRect(0, 0, 1, 1);
  swatch.fillStyle = "#000";
  swatch.fillStyle = raw;
  swatch.fillRect(0, 0, 1, 1);
  const [r, g, b] = swatch.getImageData(0, 0, 1, 1).data;
  return [r / 255, g / 255, b / 255] as [number, number, number];
}

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
}

/* ------------------------------------------------------------------------ */
/* DitherField                                                               */
/* ------------------------------------------------------------------------ */

type DitherFieldProps = {
  pattern?: DitherPattern;
  /** Size of one dither pixel in CSS px. */
  pixel?: number;
  /** Set by a parent to light the field without a pointer (e.g. on focus). */
  active?: boolean;
  className?: string;
};

/**
 * A canvas rendered at 1/`pixel` resolution and scaled up with
 * `image-rendering: pixelated`, so even a large card costs only tens of thousands of fragments a frame.
 * Raw WebGL, no library. It only animates while on screen, holds still under
 * reduced motion, and takes its colours from the `--ink`, `--panel` and
 * `--accent-strong` tokens, following theme changes.
 */
export function DitherField({ pattern = "flow", pixel = 2, active = false, className = "" }: DitherFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Bridge from React props into the render loop without restarting it.
  const activeRef = useRef(active);
  const wakeRef = useRef<() => void>(() => {});

  useEffect(() => {
    activeRef.current = active;
    wakeRef.current();
  }, [active]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, preserveDrawingBuffer: true });
    if (!gl) return; // The panel background shows through as a quiet fallback.

    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const u = (name: string) => gl.getUniformLocation(program, name);
    const uRes = u("uRes"), uTime = u("uTime"), uMouse = u("uMouse"), uHover = u("uHover");
    const uRipple = u("uRipple"), uPattern = u("uPattern"), uInk = u("uInk"), uBg = u("uBg"), uAccent = u("uAccent");

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const state = {
      time: Math.random() * 100,
      hover: 0,
      hoverTarget: 0,
      mouse: [0, 0] as [number, number],
      ripple: [0, 0, -1] as [number, number, number],
      visible: false,
      raf: 0,
      last: 0,
    };

    function setColors() {
      gl!.uniform3fv(uInk, readColor(canvas!, "--ink", [0.04, 0.04, 0.04]));
      gl!.uniform3fv(uBg, readColor(canvas!, "--panel", [0.96, 0.96, 0.96]));
      gl!.uniform3fv(uAccent, readColor(canvas!, "--accent-strong", [0.22, 0.31, 0.8]));
    }

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      canvas!.width = Math.max(1, Math.round(rect.width / pixel));
      canvas!.height = Math.max(1, Math.round(rect.height / pixel));
      gl!.viewport(0, 0, canvas!.width, canvas!.height);
      gl!.uniform2f(uRes, canvas!.width, canvas!.height);
      if (!state.hoverTarget) state.mouse = [canvas!.width / 2, canvas!.height / 2];
    }

    function draw() {
      gl!.uniform1f(uTime, state.time);
      gl!.uniform2fv(uMouse, state.mouse);
      gl!.uniform1f(uHover, state.hover);
      gl!.uniform3fv(uRipple, state.ripple);
      gl!.drawArrays(gl!.TRIANGLES, 0, 3);
    }

    function frame(now: number) {
      const dt = Math.min(0.05, (now - (state.last || now)) / 1000);
      state.last = now;
      const target = Math.max(state.hoverTarget, activeRef.current ? 1 : 0);
      // Keyboard focus lights the field from the centre.
      if (activeRef.current && !state.hoverTarget) state.mouse = [canvas!.width / 2, canvas!.height / 2];
      // Exponential ease toward the target: fast in, slightly slower out.
      state.hover += (target - state.hover) * (1 - Math.exp(-dt * (target > state.hover ? 10 : 5)));
      state.time += dt * (0.35 + state.hover * 1.1);
      if (state.ripple[2] >= 0) {
        state.ripple[2] += dt;
        if (state.ripple[2] > 1.6) state.ripple[2] = -1;
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

    function toLocal(event: PointerEvent): [number, number] {
      const rect = canvas!.getBoundingClientRect();
      return [
        ((event.clientX - rect.left) / rect.width) * canvas!.width,
        (1 - (event.clientY - rect.top) / rect.height) * canvas!.height,
      ];
    }

    const host = canvas.parentElement!;
    const onMove = (e: PointerEvent) => {
      state.mouse = toLocal(e);
      state.hoverTarget = 1;
      if (reduced) {
        state.hover = 1;
        draw();
      }
    };
    const onLeave = () => {
      state.hoverTarget = 0;
      if (reduced) {
        state.hover = 0;
        draw();
      }
    };
    const onDown = (e: PointerEvent) => {
      if (reduced) return;
      const [x, y] = toLocal(e);
      state.ripple = [x, y, 0];
    };
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    host.addEventListener("pointerdown", onDown);

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

    const themeObserver = new MutationObserver(() => {
      setColors();
      draw();
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    wakeRef.current = () => {
      if (!reduced) return start();
      state.hover = activeRef.current || state.hoverTarget ? 1 : 0;
      if (activeRef.current && !state.hoverTarget) state.mouse = [canvas.width / 2, canvas.height / 2];
      draw();
    };

    gl.uniform1f(uPattern, PATTERNS[pattern]);
    setColors();
    resize();
    draw();

    return () => {
      cancelAnimationFrame(state.raf);
      state.visible = false;
      resizeObserver.disconnect();
      visibility.disconnect();
      themeObserver.disconnect();
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      host.removeEventListener("pointerdown", onDown);
      wakeRef.current = () => {};
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [pattern, pixel]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`block size-full bg-panel [image-rendering:pixelated] ${className}`}
    />
  );
}

/* ------------------------------------------------------------------------ */
/* DitherCard                                                                */
/* ------------------------------------------------------------------------ */

type DitherCardProps = {
  title: string;
  description: string;
  meta?: string;
  href: string;
  pattern?: DitherPattern;
};

/**
 * A project card whose cover is a live dither field. Hover lights the field
 * under the cursor and speeds it up, a click sends a ripple, and keyboard
 * focus lights it from the centre.
 */
export function DitherCard({ title, description, meta, href, pattern = "flow" }: DitherCardProps) {
  const [focused, setFocused] = useState(false);

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onFocus={(e) => setFocused(e.currentTarget.matches(":focus-visible"))}
      onBlur={() => setFocused(false)}
      className="flex flex-col rounded-xl outline-offset-4 transition-transform duration-(--duration-exit) ease-out active:scale-[0.98]"
    >
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl">
        <DitherField pattern={pattern} active={focused} />
        <div aria-hidden className="pointer-events-none absolute inset-0 rounded-xl shadow-[inset_0_0_0_1px_var(--line)]" />
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-3 px-0.5">
        <h3 className="text-body font-medium text-ink">{title}</h3>
        {meta && <span className="shrink-0 text-meta tabular-nums text-muted">{meta}</span>}
      </div>
      <p className="mt-0.5 px-0.5 text-body text-muted">{description}</p>
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

/* ------------------------------------------------------------------------ */
/* Demo                                                                      */
/* ------------------------------------------------------------------------ */

const projects: (DitherCardProps & { pattern: DitherPattern })[] = [
  { title: "Wavr", description: "Shader code in, motion graphics out.", meta: "2026", href: "https://litt.design", pattern: "flow" },
  { title: "Carson", description: "Learn a layout by wrecking one.", meta: "2026", href: "https://litt.design", pattern: "orbit" },
  { title: "litt.works", description: "Prints and long-form pieces.", meta: "2024–26", href: "https://litt.design", pattern: "dunes" },
];

export default function Demo() {
  return (
    <div className="grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-3">
      {projects.map((project, i) => (
        <div key={project.title} className="animate-enter" style={{ animationDelay: `calc(${i} * var(--stagger))` }}>
          <DitherCard {...project} />
        </div>
      ))}
    </div>
  );
}
