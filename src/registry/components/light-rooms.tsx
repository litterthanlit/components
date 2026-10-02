"use client";

import { useEffect, useEffectEvent, useRef, useState, type RefObject } from "react";

/* ------------------------------------------------------------------------ */
/* Light                                                                     */
/* ------------------------------------------------------------------------ */

/**
 * Light sequences: a room cycles through these four colours slowly, the way
 * a skyspace drifts through dusk. Artwork colours, not UI tokens, so they
 * look the same in both themes.
 */
export const sequences = [
  { name: "Twilight", colors: ["#2b1dff", "#8a2cff", "#ff2f8e", "#ff7b47"] },
  { name: "Blue Hour", colors: ["#0a2bff", "#2f8dff", "#a7d4ff", "#5a33ff"] },
  { name: "Ember", colors: ["#ff3a1c", "#ff8a1f", "#ff2a6a", "#a3104a"] },
  { name: "Rose", colors: ["#ff5fa8", "#ffb8cc", "#b85cff", "#ff4560"] },
] as const;

/**
 * Room types after James Turrell's: an opening onto light with no surface,
 * a sky aperture, receding rings, and a projected cube in a corner.
 */
export const forms = ["Ganzfeld", "Skyspace", "Oculus", "Afrum"] as const;
export type Form = (typeof forms)[number];

/**
 * What each room spills onto the wall outside it: which point in the
 * sequence dominates the frame, and how strongly it glows.
 */
const SPILL: Record<Form, { offset: number; strength: number; white: number }> = {
  Ganzfeld: { offset: 0.25, strength: 0.9, white: 0 },
  Skyspace: { offset: 0.5, strength: 0.75, white: 0 },
  Oculus: { offset: 0.2, strength: 0.85, white: 0 },
  Afrum: { offset: 0.25, strength: 0.42, white: 0.35 },
};

/** sRGB hex → OKLab, so hue changes travel the short, even way round. */
function hexToOklab(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** OKLab → linear sRGB, the CPU twin of the shader's conversion. */
function oklabToLinear([L, a, b]: number[]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((c) => Math.max(0, c));
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The light at a point in the sequence, as the shader's `light()` computes it. */
function lightAt(stops: number[][], x: number) {
  const y = (((x % 1) + 1) % 1) * 4;
  const i = Math.floor(y);
  const f = smooth(0.15, 0.85, y - i);
  const a = stops[i % 4], b = stops[(i + 1) % 4];
  return oklabToLinear(a.map((v, j) => v + (b[j] - v) * f));
}

const toSrgb = (c: number) => Math.round(255 * Math.min(1, c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055));

/* ------------------------------------------------------------------------ */
/* Shader                                                                    */
/* ------------------------------------------------------------------------ */

const VERTEX = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

/**
 * Every room is two lights from the same sequence a quarter to half a cycle
 * apart, so the field and the opening are always different colours and each
 * makes the other look deeper. Colours are mixed in OKLab, lit in linear
 * light and tone mapped so bright cores bloom toward white instead of
 * clipping. Edges are knife edges, anti-aliased to the pixel. A ±1/255
 * dither (invisible) removes banding without grain.
 */
const FRAGMENT = `
precision highp float;

uniform vec2 uRes;
uniform float uTime;    // position in the sequence, in cycles
uniform float uClock;   // seconds, for breathing
uniform float uLit;     // 0–1, the lights coming up
uniform float uForm;    // 0 Ganzfeld, 1 Skyspace, 2 Oculus, 3 Afrum
uniform vec2 uView;     // eased pointer offset from centre, -0.5–0.5
uniform float uHover;
uniform vec3 uPulse;    // xy origin (0–1), z age in seconds (<0: none)
uniform vec3 uC0;       // OKLab
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
  for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}

vec3 oklabToLinear(vec3 c) {
  float l = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
  float m = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
  float s = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
  l = l * l * l; m = m * m * m; s = s * s * s;
  return max(vec3(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  ), 0.0);
}

vec3 stop(float i) {
  i = mod(i, 4.0);
  if (i < 0.5) return uC0;
  if (i < 1.5) return uC1;
  if (i < 2.5) return uC2;
  return uC3;
}

// The light at a point in the sequence: eased holds on each colour, long
// even crossings between them.
vec3 light(float x) {
  x = fract(x) * 4.0;
  float i = floor(x);
  float f = smoothstep(0.15, 0.85, fract(x));
  return oklabToLinear(mix(stop(i), stop(i + 1.0), f));
}

float roundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

mat2 inverse2(mat2 m) {
  return mat2(m[1][1], -m[0][1], -m[1][0], m[0][0]) / (m[0][0] * m[1][1] - m[0][1] * m[1][0]);
}

// A knife-edged opening in a dark wall onto light with no surface: no
// corners, no horizon, nothing for the eye to focus on, so it reads as
// either a flat plane or infinite depth. The light breathes, slowly.
vec3 ganzfeld(vec2 p, float aspect, vec2 view, float aa) {
  vec3 field = light(uTime);
  vec3 core = light(uTime + 0.25);
  float breathe = 1.0 + 0.1 * sin(uClock * 0.698);
  vec2 size = vec2(0.3 * min(aspect, 1.0), 0.33);
  vec2 o = p - vec2(0.0, -0.02) + view * 0.06;
  float d = roundBox(o, size, 0.012);
  float inside = 1.0 - smoothstep(-aa, aa, d);
  // Beyond: brightest low down, where light seems to pool, cooler above,
  // and a glowing fringe just inside the edge where the eye loses the wall.
  vec2 q = o / size;
  vec3 deep = mix(core, field, 0.3 * smoothstep(-0.3, 1.0, q.y));
  float pool = 1.0 + 1.6 * pow(smoothstep(0.7, -1.0, q.y), 1.6);
  float fringe = exp(min(d, 0.0) / 0.018);
  vec3 beyond = deep * (pool + 0.8 * fringe) * breathe;
  // The near room is lit only by what comes through, most of it on the floor.
  float spill = exp(-max(d, 0.0) * 11.0);
  float floorSpill = smoothstep(-0.2, -0.5, p.y) * exp(-max(d, 0.0) * 4.0);
  vec3 near = field * (0.025 + 0.1 * spill) + core * (spill * 0.22 + floorSpill * 0.3) * breathe;
  return mix(near, beyond, inside);
}

// Looking up from the bench: the ceiling in perspective, nearer toward the
// top of the frame, cut by a knife-edged aperture. Move and the aperture
// slides while the sky behind it stays put, because the sky is infinitely
// far; the ceiling, lit from the bench line in another hue, makes the sky
// look painted onto it.
vec3 skyspace(vec2 p, float aspect, vec2 view, float aa) {
  vec3 ceiling = light(uTime + 0.5);
  vec3 sky = light(uTime);
  float z = 3.0 / (p.y + 3.0);
  vec2 c = vec2(p.x * z + view.x * 0.3, (z - 1.0) * 3.0 + view.y * 0.2);
  float d = roundBox(c, vec2(0.235), 0.004);
  float inside = 1.0 - smoothstep(-aa * z, aa * z, d);
  vec2 r = abs(c) / 0.72;
  float edge = pow(pow(r.x, 4.0) + pow(r.y, 4.0), 0.25);
  vec3 ceil = ceiling * (0.08 + 1.2 * pow(clamp(edge, 0.0, 1.3), 2.3));
  float haze = fbm(p * 2.4 + vec2(uTime * 1.2, uTime * 0.5));
  vec3 skyColor = sky * (0.6 + 0.55 * smoothstep(0.45, -0.45, p.y)) * (0.94 + 0.12 * haze);
  return mix(ceil, skyColor, inside);
}

// Rings recede toward an oculus, each lit by a cove light along its inner
// rim and running a step behind the next, so colour travels inward.
float ring(vec2 p, float k, float aspect, vec2 view) {
  float depth = k / 6.0;
  float scale = 1.1 * pow(1.0 - depth * 0.84, 1.25);
  vec2 c = vec2(0.0, 0.13 * depth) - view * 0.16 * depth;
  // Rings stay wider than tall, as when looking up, even in a portrait frame.
  return length((p - c) / (vec2(max(aspect, 1.15) * 0.62, 0.66) * scale));
}
vec3 oculus(vec2 p, float aspect, vec2 view, float aa) {
  vec3 color = light(uTime + 0.5) * 0.06;
  for (int i = 0; i < 7; i++) {
    float k = float(i);
    float outer = ring(p, k, aspect, view);
    float inner = ring(p, k + 1.0, aspect, view);
    float band = clamp((1.0 - outer) / max((1.0 - outer) + (inner - 1.0), 1e-4), 0.0, 1.0);
    float cove = exp(-(1.0 - band) / 0.035);
    vec3 c = i == 6
      ? light(uTime + 0.4) * (2.9 - outer * 1.4)
      : light(uTime + k * 0.07) * (0.42 + 0.85 * pow(band, 1.7) + 0.7 * cove);
    float w = aa * (k + 1.0) * 1.3;
    color = mix(color, c, 1.0 - smoothstep(1.0 - w, 1.0 + w, outer));
  }
  return color;
}

// How much of a parallelogram (origin o, edges a and b) covers p, with a
// soft projector edge of width e.
float face(vec2 p, vec2 o, vec2 a, vec2 b, float e) {
  vec2 st = inverse2(mat2(a, b)) * (p - o);
  vec2 w = e / vec2(length(a), length(b));
  vec2 lo = smoothstep(-w, w, st), hi = smoothstep(-w, w, 1.0 - st);
  return lo.x * lo.y * hi.x * hi.y;
}

// One beam into a dark corner, shaped so the light on two walls reads as a
// solid cube standing out of the corner. Move off-axis and it leans and
// flattens, the way the illusion gives way in the room.
vec3 afrum(vec2 p, float aspect, vec2 view, float aa) {
  vec3 room = light(uTime);
  vec3 beam = mix(light(uTime + 0.25), vec3(1.0), 0.35);
  vec2 c = vec2(-view.x * 0.08, 0.04 - view.y * 0.04);
  // Walls meet at a vertical seam; the floor and ceiling run away from it.
  float side = p.x - c.x;
  float wall = side < 0.0 ? 0.05 : 0.032;
  float floorY = -0.36 - abs(side) * 0.32;
  float ceilY = 0.42 + abs(side) * 0.26;
  float seam = exp(-abs(side) / aa * 0.6) * 0.01;
  float shade = p.y < floorY ? 0.018 : p.y > ceilY ? 0.024 : wall - seam;
  // The cube, corner-on: three faces meet at its near vertex.
  float s = 0.2, lean = view.x * 0.45;
  vec2 v = c;
  vec2 left = vec2(-s * 0.87 * (1.0 + lean), s * 0.5);
  vec2 right = vec2(s * 0.87 * (1.0 - lean), s * 0.5);
  vec2 down = vec2(0.0, -s * (1.0 + view.y * 0.3));
  float e = aa * 1.2;
  float top = face(p, v, left, right, e);
  float lf = face(p, v, left, down, e);
  float rf = face(p, v, right, down, e);
  float cube = max(top, max(lf, rf));
  // Spill on the walls, and a faint glare in the air around the cube.
  vec2 dv = p - v - vec2(0.0, 0.02);
  float spill = exp(-length(dv * vec2(0.9, 1.2)) * 5.0);
  float glare = exp(-dot(dv, dv) * 40.0);
  vec3 color = room * (shade + spill * 0.26) + beam * (spill * 0.035 + glare * 0.08);
  // Faces fall off slightly toward their far edges, as projected light does.
  float falloff = 1.0 - 0.12 * smoothstep(0.0, 0.3, length(p - v));
  vec3 lit = beam * falloff * (top * 2.3 + lf * 1.25 + rf * 0.72) / max(top + lf + rf, 1e-4);
  return mix(color, lit, cube);
}

void main() {
  float aspect = uRes.x / uRes.y;
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
  vec2 view = uView * vec2(aspect, 1.0);
  float aa = 1.2 / uRes.y;

  vec3 lin = uForm < 0.5 ? ganzfeld(p, aspect, view, aa)
    : uForm < 1.5 ? skyspace(p, aspect, view, aa)
    : uForm < 2.5 ? oculus(p, aspect, view, aa)
    : afrum(p, aspect, view, aa);

  // Click: the light swells from the point and settles, like a slow flash.
  if (uPulse.z >= 0.0) {
    vec2 o = (uPulse.xy - 0.5) * vec2(aspect, 1.0);
    float spread = 0.04 + uPulse.z * 0.5;
    float swell = (1.0 - exp(-uPulse.z * 10.0)) * exp(-uPulse.z * 1.8);
    lin *= 1.0 + 0.9 * swell * exp(-dot(p - o, p - o) / spread);
  }

  // Eyes adjust: the room brightens a touch while you look at it. And the
  // lights come up when the room is first seen.
  lin *= (1.0 + uHover * 0.14) * uLit;
  vec3 color = 1.0 - exp(-lin * 1.7);
  color = pow(color, vec3(1.0 / 2.2));
  color += (hash(gl_FragCoord.xy) + hash(gl_FragCoord.yx + 17.0) - 1.0) / 255.0;
  gl_FragColor = vec4(color, 1.0);
}
`;

/* ------------------------------------------------------------------------ */
/* LightField                                                                */
/* ------------------------------------------------------------------------ */

type LightFieldProps = {
  form?: Form;
  /** Four sRGB hex colours, cycled in order. Changing them crossfades over ~2s. */
  colors: readonly string[];
  /** Offsets the sequence, and the lights coming up, so works aren't in step. */
  seed?: number;
  /** Lights the field as if looked at (keyboard focus). */
  active?: boolean;
  /** Increment to swell the light from the centre (keyboard activation). */
  pulse?: number;
  /** An element to light with what the room spills: its background and opacity are written each few frames. */
  glow?: RefObject<HTMLElement | null>;
  className?: string;
};

/** One full trip through a sequence, in seconds. Turrell's run for an hour; this is a page. */
const CYCLE = 40;
/** How long the lights take to come up, and the delay between works. */
const LIGHTS_UP = 1.3;
const LIGHTS_STAGGER = 0.1;

/**
 * Raw WebGL, no library. Animates only while on screen; under reduced
 * motion it renders still frames and swaps light instantly. Pointer input
 * is read from the parent element and tilts the view, so the opening
 * shifts against the room as if you moved your head.
 */
export function LightField({ form = "Ganzfeld", colors, seed = 0, active = false, pulse = 0, glow, className = "" }: LightFieldProps) {
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
    const uRes = u("uRes"), uTime = u("uTime"), uClock = u("uClock"), uLit = u("uLit");
    const uForm = u("uForm"), uView = u("uView"), uHover = u("uHover"), uPulse = u("uPulse");
    const uColors = [u("uC0"), u("uC1"), u("uC2"), u("uC3")];

    const link = bridge.current;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const spill = SPILL[form];
    const toLab = (list: readonly string[]) => list.map(hexToOklab);
    const state = {
      // Phase in cycles; the seed spreads works around the sequence.
      time: (seed * 0.29) % 1,
      clock: seed * 2.1,
      // Seconds since first seen; -1 until then. Reduced motion starts lit.
      seen: reduced ? Infinity : -1,
      lit: reduced ? 1 : 0,
      hover: 0,
      pointer: false,
      mouse: [0, 0],
      view: [0, 0],
      pulse: [0.5, 0.5, -1] as number[],
      from: toLab(bridge.current.colors),
      to: toLab(bridge.current.colors),
      mix: 1,
      visible: false,
      raf: 0,
      last: 0,
      frames: 0,
    };

    // Ease-in-out cubic: light should arrive and settle, never snap.
    const ease = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
    const stops = () => {
      const k = ease(state.mix);
      return state.from.map((a, i) => a.map((v, j) => v + (state.to[i][j] - v) * k));
    };

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      // Full resolution: knife edges need every pixel.
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = Math.max(1, Math.round(rect.width * scale));
      canvas!.height = Math.max(1, Math.round(rect.height * scale));
      gl!.viewport(0, 0, canvas!.width, canvas!.height);
      gl!.uniform2f(uRes, canvas!.width, canvas!.height);
    }

    // Light the wall outside the frame with what the room is showing now.
    function paintGlow(current: number[][]) {
      const el = glow?.current;
      if (!el) return;
      let rgb = lightAt(current, state.time + spill.offset);
      if (spill.white) rgb = rgb.map((c) => c + (1 - c) * spill.white);
      const [r, g, b] = rgb.map(toSrgb);
      const age = state.pulse[2];
      const swell = age >= 0 ? (1 - Math.exp(-age * 10)) * Math.exp(-age * 1.8) : 0;
      el.style.background = `radial-gradient(closest-side, rgb(${r} ${g} ${b}), rgb(${r} ${g} ${b} / 0.4) 42%, rgb(${r} ${g} ${b} / 0.1) 72%, transparent)`;
      el.style.opacity = String(state.lit * (spill.strength + state.hover * 0.18 + swell * 0.3));
    }

    function draw() {
      const current = stops();
      uColors.forEach((loc, i) => gl!.uniform3f(loc, current[i][0], current[i][1], current[i][2]));
      gl!.uniform1f(uTime, state.time);
      gl!.uniform1f(uClock, state.clock);
      gl!.uniform1f(uLit, state.lit);
      gl!.uniform2fv(uView, state.view);
      gl!.uniform1f(uHover, state.hover);
      gl!.uniform3fv(uPulse, state.pulse);
      gl!.drawArrays(gl!.TRIANGLES, 0, 3);
      // The wall changes slowly; a few times a second is plenty.
      if (reduced || state.frames++ % 3 === 0) paintGlow(current);
    }

    function frame(now: number) {
      const dt = Math.min(0.05, (now - (state.last || now)) / 1000);
      state.last = now;
      state.clock += dt;
      if (state.seen >= 0) {
        state.seen += dt;
        state.lit = ease(Math.min(1, Math.max(0, (state.seen - seed * LIGHTS_STAGGER) / LIGHTS_UP)));
      }
      const looking = state.pointer || bridge.current.active;
      const target = looking ? 1 : 0;
      state.hover += (target - state.hover) * (1 - Math.exp(-dt * (target > state.hover ? 3 : 1.5)));
      // The view eases after the pointer slowly, like a head turning.
      const aim = state.pointer ? state.mouse : [0, 0];
      const follow = 1 - Math.exp(-dt * 2.5);
      state.view = state.view.map((v, i) => v + (aim[i] - v) * follow);
      // Looking quickens the light a little, so it reads as alive.
      state.time += (dt / CYCLE) * (1 + state.hover * 1.5);
      state.mix = Math.min(1, state.mix + dt / 2);
      if (state.pulse[2] >= 0) {
        state.pulse[2] += dt;
        if (state.pulse[2] > 3) state.pulse[2] = -1;
      }
      draw();
      state.raf = state.visible ? requestAnimationFrame(frame) : 0;
    }

    function start() {
      if (reduced) return draw();
      if (state.seen < 0) state.seen = 0;
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
    const local = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      return [(e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height];
    };
    const onMove = (e: PointerEvent) => {
      const [x, y] = local(e);
      state.mouse = [x - 0.5, y - 0.5];
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
    // Mouse and pen swell on press; touch waits for the tap, so swiping a
    // row of works doesn't flash every one it passes.
    let touch = false;
    const onDown = (e: PointerEvent) => {
      touch = e.pointerType === "touch";
      if (!touch) sendPulse(...(local(e) as [number, number]));
    };
    const onTap = (e: MouseEvent) => {
      if (touch && e.detail > 0) sendPulse(...(local(e) as [number, number]));
    };
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    host.addEventListener("pointerdown", onDown);
    host.addEventListener("click", onTap);

    link.onColors = () => {
      // Start from wherever the current blend is, so rapid clicks stay smooth.
      state.from = stops();
      state.to = toLab(link.colors);
      state.mix = reduced ? 1 : 0;
      if (reduced) draw();
      else start();
    };
    link.onActive = () => {
      if (!reduced) return start();
      state.hover = link.active ? 1 : 0;
      draw();
    };
    link.onPulse = () => sendPulse(0.5, 0.5);

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

    gl.uniform1f(uForm, forms.indexOf(form));
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
      host.removeEventListener("click", onTap);
      link.onColors = link.onActive = link.onPulse = () => {};
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [seed, form, glow]);

  return <canvas ref={canvasRef} aria-hidden className={`block size-full bg-black ${className}`} />;
}

/* ------------------------------------------------------------------------ */
/* LightWork                                                                 */
/* ------------------------------------------------------------------------ */

export type Inspected = { number?: string; title: string; light: string };

type LightWorkProps = {
  title: string;
  year: string;
  /** Which room this work is. */
  form?: Form;
  /** Roman numeral or catalogue number, read out with the title. */
  number?: string;
  /** CSS aspect ratio of the work, e.g. "4 / 5". */
  ratio?: string;
  /** Index into `sequences` to start from. */
  light?: number;
  seed?: number;
  /** Classes for the figure. */
  className?: string;
  /** Classes for the work itself; it fills its width by default. */
  artClassName?: string;
  /** Reports the work while it's hovered or focused, and null when it isn't. */
  onInspect?: (work: Inspected | null) => void;
};

/**
 * One work in the exhibition: a room of light that spills its colour onto
 * the wall around it, with no label on the wall. Hover tilts the view and
 * the light brightens; clicking (or Enter/Space) swells it and drifts into
 * the next sequence.
 */
export function LightWork({
  title,
  year,
  form = "Ganzfeld",
  number,
  ratio = "4 / 5",
  light = 0,
  seed = 0,
  className = "",
  artClassName = "w-full",
  onInspect,
}: LightWorkProps) {
  const glowRef = useRef<HTMLSpanElement>(null);
  const [index, setIndex] = useState(light % sequences.length);
  const [focused, setFocused] = useState(false);
  const [looking, setLooking] = useState(false);
  const [pulse, setPulse] = useState(0);
  const current = sequences[index];
  const next = sequences[(index + 1) % sequences.length];
  const inspected = looking || focused;
  const report = useEffectEvent((work: Inspected | null) => onInspect?.(work));

  useEffect(() => {
    report(inspected ? { number, title, light: current.name } : null);
  }, [inspected, number, title, current.name]);

  return (
    <figure className={`relative m-0 ${className}`}>
      {/* The wall outside the frame, lit by the room. Painted by LightField. */}
      <span
        ref={glowRef}
        aria-hidden
        className="pointer-events-none absolute -inset-[30%] -z-10 opacity-0 mix-blend-screen @xl:-inset-[48%]"
      />
      <button
        type="button"
        onClick={(e) => {
          setIndex((i) => (i + 1) % sequences.length);
          // Pointer clicks swell from the cursor; keyboard clicks (detail 0) from the centre.
          if (e.detail === 0) setPulse((n) => n + 1);
        }}
        onPointerEnter={() => setLooking(true)}
        onPointerLeave={() => setLooking(false)}
        onFocus={(e) => setFocused(e.currentTarget.matches(":focus-visible"))}
        onBlur={() => setFocused(false)}
        aria-label={`${number ? `${number}. ` : ""}${title}, ${year}. ${form}, in ${current.name} light. Switch to ${next.name}`}
        style={{ aspectRatio: ratio }}
        className={`relative block cursor-pointer overflow-hidden rounded-[2px] outline-offset-[6px] transition-[scale] duration-(--duration-exit) ease-out active:scale-[0.99] ${artClassName}`}
      >
        <LightField form={form} colors={current.colors} seed={seed} active={focused} pulse={pulse} glow={glowRef} />
      </button>
      <figcaption className="sr-only">
        {title}, {year}. {form}. Light, variable dimensions.
      </figcaption>
      <span className="sr-only" role="status">
        {title} in {current.name} light
      </span>
    </figure>
  );
}

/* ------------------------------------------------------------------------ */
/* Demo                                                                      */
/* ------------------------------------------------------------------------ */

/** Hung at different sizes on a shared centre line, the way a gallery wall is. */
const works = [
  { number: "I", title: "Held Breath", form: "Ganzfeld", ratio: "4 / 5", light: 0 },
  { number: "II", title: "Open Ceiling", form: "Skyspace", ratio: "1 / 1", light: 1 },
  { number: "III", title: "Inward", form: "Oculus", ratio: "3 / 4", light: 2 },
  { number: "IV", title: "Solid Air", form: "Afrum", ratio: "5 / 4", light: 3 },
] as const;

export default function Demo() {
  const [inspected, setInspected] = useState<Inspected | null>(null);

  return (
    // A darkened gallery in either theme: the light is the only thing lit.
    <section
      aria-labelledby="light-rooms-title"
      className="@container relative isolate w-full max-w-4xl overflow-hidden rounded-2xl bg-[#060608] px-5 pb-6 pt-5 @md:px-8 @md:pb-8 @md:pt-7 @xl:px-12 @xl:pb-16 @xl:pt-10"
    >
      {/* The floor: the faintest lift toward the bottom, so the room has a ground. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 -z-20 h-2/5 bg-linear-to-t from-white/[0.04] to-transparent" />
      <header className="mb-4 flex items-baseline justify-between gap-6 @md:mb-6 @xl:mb-14">
        <h2 id="light-rooms-title" className="text-body font-medium text-white/90 @xl:text-lead">
          Rooms of Light
        </h2>
        {/* Names whichever work you're looking at, like a gallery guide. The works carry their own labels for assistive tech. */}
        <p aria-hidden className="hidden truncate text-meta text-white/55 @md:block">
          {inspected ? (
            <span key={`${inspected.title}-${inspected.light}`} className="animate-enter">
              <span className="tabular-nums">{inspected.number}</span>
              <span className="mx-2 text-white/25">—</span>
              <span className="text-white/90">{inspected.title}</span>
              <span className="mx-2 text-white/25">·</span>
              {inspected.light}
            </span>
          ) : (
            <span key="intro" className="animate-enter">
              Four works after James Turrell
            </span>
          )}
        </p>
      </header>
      {/* Wide: one wall, works centred on a line. Narrow: a swipeable row at one height. */}
      <ol className="-mx-2 -my-10 flex snap-x snap-mandatory scroll-px-2 items-center gap-6 overflow-x-auto px-2 py-10 [scrollbar-width:none] @xl:m-0 @xl:grid @xl:grid-cols-4 @xl:gap-10 @xl:overflow-visible @xl:p-0">
        {works.map((work, i) => (
          <li key={work.title} className="shrink-0 snap-start">
            <LightWork
              {...work}
              year="2026"
              seed={i}
              onInspect={(w) => setInspected((prev) => (w ? w : prev?.title === work.title ? null : prev))}
              artClassName="h-30 w-auto @md:h-48 @xl:h-auto @xl:w-full"
            />
          </li>
        ))}
      </ol>
    </section>
  );
}
