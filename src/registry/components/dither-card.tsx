"use client";

import { useEffect, useEffectEvent, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { focusQuietly } from "@/design-system";
import { hostTransport, play } from "@/lib/sound";

/*
 * Project links as keys with a screen in each face, after a launcher's LCD
 * keys. Each screen runs a creature (a butterfly that flaps, a jellyfish that
 * pulses, a flower that turns) in three-tone ordered dither: a Bayer 8×8
 * threshold resolves every cell to the glass, a mid tone or the ink, which
 * doubles the steps a two-tone dither can show.
 *
 * The field is raw WebGL drawn a cell per 2 CSS px and scaled up pixel for
 * pixel, so a screen costs a few thousand fragments a frame. It draws in the
 * LCD's ink on a clear ground, so the glass behind it shows through, and it
 * stays monochrome like every light on the body. A hand lights the screen
 * under it and quickens the creature about fourfold, a press sinks the key
 * 2px with a click and sends a ring through the dots, and keyboard focus
 * lights it from the centre with a ring of its own. The loop writes uniforms,
 * never React state, runs only while a screen is on the page, and holds a
 * still frame under reduced motion.
 */

/* --- Shader --------------------------------------------------------------- */

const VERTEX = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

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

// hair: half a cell in these units. No stroke is drawn finer, so a small screen keeps its antennae.
float butterfly(vec2 p, float t, float hair) {
  p.y -= sin(t * 0.9) * 0.025;
  // Wings fold toward the body and open again; foreshortening fakes the flap.
  float flap = 0.3 + 0.7 * abs(cos(t * 2.4));
  vec2 q = vec2(abs(p.x) / flap, p.y);
  float v = max(wing(q, vec2(0.15, 0.08), vec2(0.17, 0.12), -0.5, vec2(0.2, 0.12)),
                wing(q, vec2(0.11, -0.1), vec2(0.11, 0.085), 0.6, vec2(0.13, -0.12)));
  // Body and antennae stay full width and full ink.
  float body = step(abs(p.x), max(0.016, hair)) * step(-0.17, p.y) * step(p.y, 0.15);
  vec2 a = vec2(abs(p.x), p.y - 0.15);
  float antenna = step(abs(a.x - a.y * 0.55), max(0.006, hair)) * step(0.0, a.y) * step(a.y, 0.12);
  float tip = step(length(a - vec2(0.066, 0.12)), max(0.014, hair * 1.5));
  return max(v, max(body, max(antenna, tip)));
}

float jellyfish(vec2 p, float t, float hair) {
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
    float width = max(mix(0.009, 0.003, clamp(y / len, 0.0, 1.0)), hair);
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
  // Fit the creature to the screen's shorter side.
  float fit = min(aspect, 1.0) * 1.3;
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0) / fit;
  float hair = 0.5 / (uRes.y * fit);
  // A faint drifting ground so the dither never goes flat.
  float ground = smoothstep(0.45, 0.9, fbm(uv * 3.0 + t * 0.05)) * 0.22;
  float shape = uPattern < 0.5 ? butterfly(p, t, hair) : uPattern < 1.5 ? jellyfish(p, t, hair) : bloom(p, t);
  return max(ground, shape);
}

void main() {
  vec2 px = gl_FragCoord.xy;
  vec2 uv = px / uRes;
  float v = field(uv, uTime) * 0.86;

  // The light under the hand.
  float r = uRes.y * 0.42;
  float d = distance(px, uMouse);
  float light = exp(-(d * d) / (r * r)) * uHover;

  // A ring that widens and fades from a press.
  float ring = 0.0;
  if (uRipple.z >= 0.0) {
    float rad = uRipple.z * uRes.y * 1.4;
    float rd = abs(distance(px, uRipple.xy) - rad);
    ring = smoothstep(uRes.y * 0.03, 0.0, rd) * exp(-uRipple.z * 2.2);
  }

  float threshold = bayer8(px);
  float level = clamp(v + light * 0.55 + ring, 0.0, 1.0);
  // Three tones: 0 glass, 1 mid, 2 ink.
  float scaled = level * 2.0;
  float tone = min(2.0, floor(scaled) + step(threshold, fract(scaled)));
  // The ink is solid; the mid tone is a tint of it that the light brightens, so a solid run of it
  // still reads as a tint; and the light backs the glass faintly, as a lamp behind an LCD would.
  float alpha = tone > 1.5 ? 1.0 : tone > 0.5 ? mix(0.3, 0.55, max(light, ring)) : light * 0.07;
  gl_FragColor = vec4(uInk * alpha, alpha); // premultiplied
}
`;

/* --- Helpers -------------------------------------------------------------- */

const PATTERNS = { butterfly: 0, jellyfish: 1, bloom: 2 } as const;
export type DitherPattern = keyof typeof PATTERNS;

/**
 * Where each creature's clock starts: a frame worth holding still, the same
 * on every mount, so a remount, a capture and reduced motion all show it. The
 * butterfly's wings are open (t = kπ / 2.4) and the jellyfish's bell is
 * relaxed (sin 2.2t = −1).
 */
const START: Record<DitherPattern, number> = {
  butterfly: (4 * Math.PI) / 2.4,
  jellyfish: (3.5 * Math.PI) / 2.2,
  bloom: 3,
};

let swatch: CanvasRenderingContext2D | null = null;

/**
 * Reads a CSS colour as 0–1 RGB for the shader. Painting it into a 1×1
 * canvas accepts any CSS colour (#111, #111111, rgb(), oklch()…), so a
 * minifier rewriting a token can't break it.
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

/* --- DitherField ---------------------------------------------------------- */

type DitherFieldProps = {
  pattern?: DitherPattern;
  /** Size of one dither cell in CSS px. */
  pixel?: number;
  /** Light the field from its centre without a hand on it: keyboard focus, a selection, a demo's ghost. Turning it on sends a ring. */
  active?: boolean;
  /** Hold the creature still. The light and a ring still play out. */
  paused?: boolean;
  className?: string;
};

/**
 * A dither field on a canvas drawn at 1/`pixel` resolution and scaled up with
 * `image-rendering: pixelated`, so even a large screen costs only tens of
 * thousands of fragments a frame. Raw WebGL, no library. It draws in its CSS
 * `color` on a clear ground: set the ink with a text colour, and whatever is
 * behind it is the ground. It only animates while on screen, holds still
 * under reduced motion, and follows theme changes.
 */
export function DitherField({ pattern = "butterfly", pixel = 2, active = false, paused = false, className = "" }: DitherFieldProps) {
  const hostRef = useRef<HTMLSpanElement>(null);
  // Bridges from React props into the render loop, so a change never restarts it.
  const activeRef = useRef(active);
  const pausedRef = useRef(paused);
  const wakeRef = useRef<(ring: boolean) => void>(() => {});

  useEffect(() => {
    pausedRef.current = paused;
    wakeRef.current(false);
  }, [paused]);

  useEffect(() => {
    const rising = active && !activeRef.current;
    activeRef.current = active;
    wakeRef.current(rising);
  }, [active]);

  useEffect(() => {
    const host = hostRef.current!;
    // Made here rather than rendered: the cleanup loses its context for good, so every mount
    // (StrictMode's second one included) needs a canvas of its own.
    const canvas = document.createElement("canvas");
    canvas.className = "block size-full [image-rendering:pixelated]";
    host.append(canvas);
    const context = canvas.getContext("webgl", { antialias: false, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
    if (!context) return () => canvas.remove(); // Whatever is behind shows through as a quiet fallback.
    const gl = context;

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
    const uRipple = u("uRipple"), uPattern = u("uPattern"), uInk = u("uInk");

    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const state = {
      time: START[pattern],
      hover: 0,
      hoverTarget: 0,
      mouse: [0, 0] as [number, number],
      ripple: [0, 0, -1] as [number, number, number],
      visible: false,
      raf: 0,
      last: 0,
    };
    const centre = (): [number, number] => [canvas.width / 2, canvas.height / 2];

    const setInk = () => gl.uniform3fv(uInk, readColor(canvas, "color", [0.96, 0.96, 0.96]));

    function resize() {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width / pixel));
      canvas.height = Math.max(1, Math.round(rect.height / pixel));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      if (!state.hoverTarget) state.mouse = centre();
    }

    function draw() {
      gl.uniform1f(uTime, state.time);
      gl.uniform2fv(uMouse, state.mouse);
      gl.uniform1f(uHover, state.hover);
      gl.uniform3fv(uRipple, state.ripple);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    function frame(now: number) {
      const dt = Math.min(0.05, (now - (state.last || now)) / 1000);
      state.last = now;
      const target = Math.max(state.hoverTarget, activeRef.current ? 1 : 0);
      // Light from outside comes from the centre.
      if (activeRef.current && !state.hoverTarget) state.mouse = centre();
      // Exponential ease toward the target: fast in, slightly slower out.
      state.hover += (target - state.hover) * (1 - Math.exp(-dt * (target > state.hover ? 10 : 5)));
      if (!pausedRef.current) state.time += dt * (0.35 + state.hover * 1.1);
      if (state.ripple[2] >= 0) {
        state.ripple[2] += dt;
        if (state.ripple[2] > 1.6) state.ripple[2] = -1;
      }
      // Held, the loop runs only until the light has settled and the ring has gone.
      const settled = pausedRef.current && Math.abs(target - state.hover) < 0.002 && state.ripple[2] < 0;
      if (settled) state.hover = target;
      draw();
      state.raf = state.visible && !settled ? requestAnimationFrame(frame) : 0;
    }

    /** Reduced motion: no loop, just the light on or off over the still frame. */
    function still() {
      state.hover = state.hoverTarget || activeRef.current ? 1 : 0;
      if (activeRef.current && !state.hoverTarget) state.mouse = centre();
      draw();
    }

    function start() {
      if (reduced) return still();
      if (!state.raf && state.visible) {
        state.last = 0;
        state.raf = requestAnimationFrame(frame);
      }
    }

    function toLocal(event: PointerEvent): [number, number] {
      const rect = canvas.getBoundingClientRect();
      return [
        ((event.clientX - rect.left) / rect.width) * canvas.width,
        (1 - (event.clientY - rect.top) / rect.height) * canvas.height,
      ];
    }

    const onMove = (e: PointerEvent) => {
      state.mouse = toLocal(e);
      state.hoverTarget = 1;
      start();
    };
    const onLeave = () => {
      state.hoverTarget = 0;
      start();
    };
    const onDown = (e: PointerEvent) => {
      if (reduced) return;
      state.ripple = [...toLocal(e), 0];
      start();
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
      setInk();
      draw();
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    wakeRef.current = (ring) => {
      if (ring && !reduced) state.ripple = [...centre(), 0];
      start();
    };

    gl.uniform1f(uPattern, PATTERNS[pattern]);
    setInk();
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
      canvas.remove();
    };
  }, [pattern, pixel]);

  return <span ref={hostRef} aria-hidden className={`block size-full ${className}`} />;
}

/* --- DitherCard: a project key -------------------------------------------- */

type DitherCardProps = {
  title: string;
  /** Said to screen readers as the link's description. */
  description: string;
  meta?: string;
  href: string;
  pattern?: DitherPattern;
  /** Light the screen from its centre without a hand on it: a selection, or a demo's ghost. */
  active?: boolean;
  /** Hold the creature still. */
  paused?: boolean;
};

/**
 * A project link as a key with a screen in its face. The face sinks 2px onto
 * its base under the finger and clicks; the screen runs a dither field in the
 * LCD's ink. Keyboard focus lights the screen from the centre; focus that
 * followed a press doesn't.
 */
export function DitherCard({ title, description, meta, href, pattern = "butterfly", active = false, paused = false }: DitherCardProps) {
  const [focused, setFocused] = useState(false);
  const descriptionId = useId();
  // Checked again on key up: the first key after a quiet press brings the ring back.
  const checkFocus = (el: HTMLElement) => setFocused(el.matches(":focus-visible") && !el.hasAttribute("data-quiet"));

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      draggable={false}
      data-sound="key"
      aria-describedby={descriptionId}
      onPointerDown={(e) => e.button === 0 && focusQuietly(e.currentTarget)}
      onFocus={(e) => checkFocus(e.currentTarget)}
      onKeyUp={(e) => checkFocus(e.currentTarget)}
      onBlur={() => setFocused(false)}
      className="group/key flex min-w-0 flex-col items-center gap-[0.6em] rounded-[0.7em] outline-offset-2 [-webkit-touch-callout:none]"
    >
      {/* The key. Only its face sinks, so the hit area never moves under the finger. */}
      <span className="block w-full rounded-[0.7em] p-[0.32em] [background:var(--device-key-face)] shadow-(--device-key-shadow) transition-[transform,box-shadow] duration-(--duration-exit) ease-out group-active/key:translate-y-[2px] group-active/key:shadow-(--device-key-shadow-pressed) group-active/key:duration-75">
        {/* The screen set into the face: the field draws on a clear ground, so this is its glass. */}
        <span className="relative block aspect-square rounded-[0.4em] text-(--device-lcd-ink) [background:var(--device-lcd)]">
          <span className="absolute inset-0 overflow-hidden rounded-[inherit]">
            <DitherField pattern={pattern} active={focused || active} paused={paused} />
          </span>
          {/* The glass's edge, over the dots. */}
          <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-(--device-lcd-edge)" />
        </span>
      </span>
      <span className="flex max-w-full items-baseline gap-[0.6em] text-[0.6em] font-semibold uppercase leading-none tracking-[0.16em] [text-shadow:var(--device-engrave)]">
        <span className="min-w-0 truncate text-(--device-label)">{title}</span>
        {meta && <span className="shrink-0 tabular-nums text-(--device-label-quiet)">{meta}</span>}
      </span>
      <span id={descriptionId} hidden>
        {description}
      </span>
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

/* --- Demo: a launcher's keys, one project on each ------------------------- */

const PROJECTS: { title: string; description: string; year: string; href: string; pattern: DitherPattern }[] = [
  { title: "Wavr", description: "Shader code in, motion graphics out.", year: "2026", href: "https://litt.design", pattern: "butterfly" },
  { title: "Carson", description: "Learn a layout by wrecking one.", year: "2026", href: "https://litt.design", pattern: "jellyfish" },
  { title: "litt.works", description: "Prints and long-form pieces.", year: "2024–26", href: "https://litt.design", pattern: "bloom" },
];
const FIRST = 350; // ms from power-up to the ghost's first key
const STEP = 1400; // ms on each key after that, so all three are lit inside 4 s

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function Demo() {
  const [at, setAt] = useState(0); // the project on the readout
  const [lit, setLit] = useState(-1); // the key the ghost is on
  const [ghost, setGhost] = useState(false);
  const [paused, setPaused] = useState(true); // the screens hold their first frame until power-up
  const rootRef = useRef<HTMLDivElement>(null);
  const touched = useRef(false); // a hand has been here: the ghost doesn't come back

  /** Real input takes over from the ghost, for good, and wakes the screens. */
  function takeOver() {
    if (touched.current) return;
    touched.current = true;
    setGhost(false);
    setLit(-1);
    setPaused(false);
  }

  /** A hand on a key. Chrome also sends moves as the study slides in under a resting cursor; those don't count. */
  function onKeyMove(e: ReactPointerEvent<HTMLLIElement>, i: number) {
    if (e.pointerType === "mouse" && !e.movementX && !e.movementY) return;
    takeOver();
    setAt(i);
  }

  // Power up: the screens run and the ghost walks the keys, unless the host's tape is stopped; then follow its PLAY.
  // Under reduced motion each screen holds its first frame and there is no ghost.
  const powerUp = useEffectEvent(() => {
    if (touched.current || hostTransport(rootRef.current) === "stop") return;
    setPaused(false);
    if (!reducedMotion()) setGhost(true);
  });
  useEffect(() => {
    const root = rootRef.current;
    const start = requestAnimationFrame(powerUp);
    const host = root?.closest("[data-transport]");
    const observer = new MutationObserver(() => hostTransport(root) === "play" && powerUp());
    if (host) observer.observe(host, { attributes: true, attributeFilter: ["data-transport"] });
    return () => {
      cancelAnimationFrame(start);
      observer.disconnect();
    };
  }, []);

  // The ghost: a beat after power-up it lights the first key, then each next one in turn, and each
  // screen rings as it lands. A quiet tick for each, while the host's tape plays.
  useEffect(() => {
    if (!ghost) return;
    const root = rootRef.current;
    const id = setTimeout(
      () => {
        const next = (lit + 1) % PROJECTS.length;
        setLit(next);
        setAt(next);
        if (hostTransport(root) === "play") play("tick", { gain: 0.4, pitch: 0.94 + next * 0.06 });
      },
      lit === -1 ? FIRST : STEP,
    );
    return () => clearTimeout(id);
  }, [ghost, lit]);

  const project = PROJECTS[at];

  return (
    <div ref={rootRef} onPointerDownCapture={takeOver} onKeyDownCapture={takeOver} onFocusCapture={takeOver} className="@container w-full max-w-[480px] select-none">
      <div className="relative isolate animate-enter overflow-hidden rounded-[1.25em] p-[0.9em] text-[clamp(11px,4cqw,14px)] [background:var(--device-body)] shadow-[var(--device-body-edge),0_1px_2px_rgb(0_0_0/0.06),0_16px_32px_-18px_rgb(0_0_0/0.3)] @[26rem]:p-[1.1em]">
        <div aria-hidden className="device-grain pointer-events-none absolute inset-0 -z-10 rounded-[inherit]" />

        {/* The readout: the year and the project in a line, for the key under the hand or the ghost. */}
        <div
          aria-hidden
          className="flex h-[3.3em] flex-col justify-between overflow-hidden rounded-[0.7em] px-[0.8em] pb-[0.5em] pt-[0.55em] text-(--device-lcd-ink) [background:var(--device-lcd)] shadow-(--device-lcd-edge)"
        >
          <span className="inline-flex items-center gap-[0.35em] self-start rounded-[0.4em] bg-white px-[0.42em] py-[0.24em] text-black">
            <span className={ghost ? "size-[0.55em] animate-pulse rounded-full bg-(--device-rec) motion-reduce:animate-none" : "size-[0.55em] rounded-full bg-black"} />
            <span className="text-[0.58em] font-semibold uppercase leading-none tracking-[0.02em] tabular-nums">{project.year}</span>
          </span>
          <span key={at} className="animate-enter truncate text-[1.05em] font-light leading-none tracking-[-0.01em]">
            {project.description}
          </span>
        </div>

        {/* The keys, one project on each. */}
        <ul aria-label="Projects" className="mt-[0.8em] grid grid-cols-3 gap-[0.55em]">
          {PROJECTS.map((p, i) => (
            <li key={p.title} className="min-w-0" onPointerMove={(e) => onKeyMove(e, i)} onFocus={() => setAt(i)}>
              <DitherCard title={p.title} description={p.description} href={p.href} pattern={p.pattern} active={lit === i} paused={paused} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
