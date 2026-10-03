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
 * Three-tone ordered (Bayer 8×8) dithering of an animated creature — a
 * butterfly, a jellyfish or a flower — over a faint drifting ground. Each cell
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
// Signed distance to an ellipse, in units of its radii: <0 inside, 0 on the edge.
float ellipse(vec2 p, vec2 c, vec2 r) { return length((p - c) / r) - 1.0; }
mat2 rot(float a) { float s = sin(a), c = cos(a); return mat2(c, -s, s, c); }

// A wing: tinted inside, inked along the rim, with an eyespot.
float wing(vec2 q, vec2 c, vec2 r, float tilt, vec2 eye) {
  vec2 w = rot(tilt) * (q - c);
  float d = length(w / r) - 1.0;
  if (d > 0.0) return 0.0;
  float veins = contour(atan(q.y, q.x) * 0.9, 3.0, 24.0) * 0.25;
  float rim = smoothstep(-0.28, -0.16, d);
  float e = length(q - eye);
  float spot = smoothstep(0.045, 0.035, e) - smoothstep(0.025, 0.017, e) * 0.85;
  return clamp(0.36 + veins + rim * 0.62 + spot * 0.6, 0.0, 1.0);
}

float butterfly(vec2 p, float t) {
  p.y -= sin(t * 0.9) * 0.025;
  // Wings fold toward the body and open again; foreshortening fakes the flap.
  float flap = 0.3 + 0.7 * abs(cos(t * 2.4));
  vec2 q = vec2(abs(p.x) / flap, p.y);
  float v = max(wing(q, vec2(0.15, 0.08), vec2(0.17, 0.12), -0.5, vec2(0.2, 0.12)),
                wing(q, vec2(0.11, -0.1), vec2(0.11, 0.085), 0.6, vec2(0.13, -0.12)));
  // Body and antennae stay full width and full ink.
  float body = step(abs(p.x), 0.016) * step(-0.17, p.y) * step(p.y, 0.15);
  vec2 a = vec2(abs(p.x), p.y - 0.15);
  float antenna = step(abs(a.x - a.y * 0.55), 0.006) * step(0.0, a.y) * step(a.y, 0.12);
  float tip = step(length(a - vec2(0.066, 0.12)), 0.014);
  return max(v, max(body, max(antenna, tip)));
}

float jellyfish(vec2 p, float t) {
  float pulse = sin(t * 2.2);
  p.y -= 0.04 + pulse * 0.02;
  // The bell squeezes as it pushes, widening again as it relaxes.
  vec2 c = vec2(0.0, 0.08);
  vec2 r = vec2(0.24 - pulse * 0.025, 0.2 + pulse * 0.02);
  float hem = c.y - 0.02 + 0.012 * sin(p.x * 70.0);
  float d = ellipse(p, c, r);
  float bell = 0.0;
  if (d < 0.0 && p.y > hem) {
    float depth = (p.y - hem) / r.y;
    bell = 0.32 + contour(d, 4.0, 10.0) * 0.4 + smoothstep(-0.18, -0.06, d) * 0.5 + (1.0 - depth) * 0.12;
  }
  // Tentacles trail and sway, thinning toward their tips.
  float tent = 0.0;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float x0 = -0.17 + fi * 0.068;
    float len = 0.34 + 0.08 * sin(fi * 2.3);
    float y = hem - p.y;
    float sway = sin(y * 16.0 - t * 2.6 + fi * 1.7) * 0.03 * smoothstep(0.0, 0.2, y);
    float width = mix(0.009, 0.003, clamp(y / len, 0.0, 1.0));
    tent = max(tent, step(abs(p.x - x0 - sway), width) * step(0.0, y) * step(y, len));
  }
  return clamp(max(bell, tent), 0.0, 1.0);
}

float bloom(vec2 p, float t) {
  float breathe = 1.0 + sin(t * 1.3) * 0.04;
  p /= breathe;
  float r = length(p), a = atan(p.y, p.x);
  float spin = t * 0.25;
  // Two rings of five petals, the inner one offset and turning the other way.
  float outer = 0.3 * (0.45 + 0.55 * pow(abs(cos(a * 2.5 + spin)), 0.7));
  float inner = 0.19 * (0.5 + 0.5 * pow(abs(cos(a * 2.5 - spin * 1.4 + 0.63)), 0.7));
  float v = 0.0;
  if (r < outer) v = 0.3 + smoothstep(outer - 0.05, outer - 0.015, r) * 0.6 + contour(a * 0.8 + spin * 0.32, 4.0, 30.0) * 0.12;
  if (r < inner) v = 0.5 + smoothstep(inner - 0.04, inner - 0.01, r) * 0.5;
  // A seeded centre.
  if (r < 0.065) v = 0.55 + 0.45 * step(0.5, fract(r * 40.0 - t * 0.3 + sin(a * 8.0) * 0.1));
  return v;
}

float field(vec2 uv, float t) {
  float aspect = uRes.x / uRes.y;
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
  // Fit the creature to the card's shorter side.
  p /= min(aspect, 1.0) * 1.3;
  // A faint drifting ground so the dither never goes flat.
  float ground = smoothstep(0.45, 0.9, fbm(uv * 3.0 + t * 0.05)) * 0.22;
  float shape = uPattern < 0.5 ? butterfly(p, t) : uPattern < 1.5 ? jellyfish(p, t) : bloom(p, t);
  return max(ground, shape);
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

const PATTERNS = { butterfly: 0, jellyfish: 1, bloom: 2 } as const;
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
export function DitherField({ pattern = "butterfly", pixel = 2, active = false, className = "" }: DitherFieldProps) {
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
export function DitherCard({ title, description, meta, href, pattern = "butterfly" }: DitherCardProps) {
  const [focused, setFocused] = useState(false);

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onFocus={(e) => setFocused(e.currentTarget.matches(":focus-visible"))}
      onBlur={() => setFocused(false)}
      className="@container flex flex-col rounded-xl outline-offset-4 transition-transform duration-(--duration-exit) ease-out active:scale-[0.98]"
    >
      <div className="relative aspect-[4/5] overflow-hidden rounded-xl">
        <DitherField pattern={pattern} active={focused} />
        <div aria-hidden className="pointer-events-none absolute inset-0 rounded-xl shadow-[inset_0_0_0_1px_var(--line)]" />
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-3 px-0.5">
        <h3 className="text-body font-medium text-ink">{title}</h3>
        {meta && <span className="hidden shrink-0 text-meta tabular-nums text-muted @min-[10rem]:inline">{meta}</span>}
      </div>
      {/* Narrow cards keep just the title; the cover carries them. */}
      <p className="mt-0.5 hidden px-0.5 text-body text-muted @min-[10rem]:block">{description}</p>
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

/* ------------------------------------------------------------------------ */
/* Demo                                                                      */
/* ------------------------------------------------------------------------ */

const projects: (DitherCardProps & { pattern: DitherPattern })[] = [
  { title: "Wavr", description: "Shader code in, motion graphics out.", meta: "2026", href: "https://litt.design", pattern: "butterfly" },
  { title: "Carson", description: "Learn a layout by wrecking one.", meta: "2026", href: "https://litt.design", pattern: "jellyfish" },
  { title: "litt.works", description: "Prints and long-form pieces.", meta: "2024–26", href: "https://litt.design", pattern: "bloom" },
];

export default function Demo() {
  return (
    <div className="grid w-full max-w-3xl grid-cols-3 gap-3 sm:gap-5">
      {projects.map((project, i) => (
        <div key={project.title} className="animate-enter" style={{ animationDelay: `calc(${i} * var(--stagger))` }}>
          <DitherCard {...project} />
        </div>
      ))}
    </div>
  );
}
