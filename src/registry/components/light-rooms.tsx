"use client";

import { useEffect, useRef, useState } from "react";

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
 * Room types after James Turrell's: an edgeless field, a sky aperture,
 * receding rings, and a projected cube that floats in a corner.
 */
export const forms = ["Ganzfeld", "Skyspace", "Oculus", "Afrum"] as const;
export type Form = (typeof forms)[number];

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

/* ------------------------------------------------------------------------ */
/* Shader                                                                    */
/* ------------------------------------------------------------------------ */

const VERTEX = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

/**
 * Every form is two lights from the same sequence a quarter to half a cycle
 * apart, so the field and the opening are always different colours and each
 * makes the other look deeper. Colours are mixed in OKLab, lit in linear
 * light and tone mapped so bright cores bloom toward white instead of
 * clipping. A ±1/255 dither (invisible) removes banding without grain.
 */
const FRAGMENT = `
precision highp float;

uniform vec2 uRes;
uniform float uTime;    // position in the sequence, in cycles
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

// The opening dissolves into the field: no edge, no horizon, no depth cue.
vec3 ganzfeld(vec2 p, float aspect, vec2 view) {
  vec3 field = light(uTime);
  vec3 core = light(uTime + 0.25);
  float room = 0.22 + 0.85 * exp(-dot(p * vec2(0.8, 1.0), p * vec2(0.8, 1.0)) * 3.2);
  vec2 o = p + view * 0.1 - vec2(0.0, 0.02);
  float d = roundBox(o, vec2(0.27 * aspect, 0.22), 0.16);
  float inside = 1.0 - smoothstep(-0.035, 0.05, d);
  float halo = exp(-max(d, 0.0) * 6.0);
  // The opening is brightest low down, where the light seems to pool.
  float lift = 0.9 + 0.5 * smoothstep(0.22, -0.22, o.y);
  vec3 glow = core * (inside * 2.6 * lift + halo * 0.5);
  return field * room * (1.0 - inside * 0.7) + glow;
}

// A knife-edged aperture in a ceiling lit from the rim. The sky reads as a
// flat, painted plane because the ceiling around it is lit in another hue.
vec3 skyspace(vec2 p, float aspect, vec2 view, float aa) {
  vec3 ceiling = light(uTime + 0.5);
  vec3 sky = light(uTime);
  vec2 rim = abs(p) / vec2(aspect * 0.5, 0.5);
  // A soft-cornered norm, so the cove light has no diagonal seams.
  float edge = pow(pow(rim.x, 5.0) + pow(rim.y, 5.0), 0.2);
  vec2 o = p + view * 0.06;
  float d = roundBox(o, vec2(0.24), 0.006);
  float lit = 0.14 + 1.05 * pow(clamp(edge, 0.0, 1.2), 2.2);
  float inside = 1.0 - smoothstep(-aa, aa, d);
  vec2 s = o + view * 0.12; // the sky sits further away than the opening
  float haze = fbm(s * 3.2 + vec2(uTime * 1.4, uTime * 0.6));
  vec3 skyColor = sky * (0.7 + 0.38 * smoothstep(-0.25, 0.25, s.y)) * (0.92 + 0.16 * haze);
  return mix(ceiling * lit, skyColor, inside);
}

// Rings recede toward an oculus, each lit from its inner rim and running a
// step behind the next, so colour travels inward.
float ring(vec2 p, float k, float aspect, vec2 view) {
  float depth = k / 6.0;
  // Rings close up as they recede and climb, like looking up an atrium.
  float scale = 1.1 * pow(1.0 - depth * 0.84, 1.25);
  vec2 c = vec2(0.0, 0.13 * depth) - view * 0.16 * depth;
  // Rings stay wider than tall, as when looking up, even in a portrait frame.
  return length((p - c) / (vec2(max(aspect, 1.15) * 0.62, 0.66) * scale));
}
vec3 oculus(vec2 p, float aspect, vec2 view, float aa) {
  vec3 color = light(uTime + 0.5) * 0.12;
  for (int i = 0; i < 7; i++) {
    float k = float(i);
    float outer = ring(p, k, aspect, view);
    float inner = ring(p, k + 1.0, aspect, view);
    float band = clamp((1.0 - outer) / max((1.0 - outer) + (inner - 1.0), 1e-4), 0.0, 1.0);
    vec3 c = i == 6
      ? light(uTime + 0.4) * (2.6 - outer * 1.2)
      : light(uTime + k * 0.07) * (0.7 + 0.8 * pow(band, 1.6));
    color = mix(color, c, 1.0 - smoothstep(1.0 - aa * (k + 1.0), 1.0 + aa * (k + 1.0), outer));
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
  float wall = side < 0.0 ? 0.06 : 0.04;
  float floorY = -0.36 - abs(side) * 0.32;
  float ceilY = 0.42 + abs(side) * 0.26;
  float seam = exp(-abs(side) / aa * 0.6) * 0.012;
  float shade = p.y < floorY ? 0.022 : p.y > ceilY ? 0.03 : wall - seam;
  // The cube, corner-on: three faces meet at its near vertex.
  float s = 0.2, lean = view.x * 0.45;
  vec2 v = c;
  vec2 left = vec2(-s * 0.87 * (1.0 + lean), s * 0.5);
  vec2 right = vec2(s * 0.87 * (1.0 - lean), s * 0.5);
  vec2 down = vec2(0.0, -s * (1.0 + view.y * 0.3));
  float e = aa * 1.4;
  float top = face(p, v, left, right, e);
  float lf = face(p, v, left, down, e);
  float rf = face(p, v, right, down, e);
  float cube = max(top, max(lf, rf));
  // Spill: the beam lights the walls around the cube, more on the near side.
  float spill = exp(-length((p - v - vec2(0.0, 0.02)) * vec2(0.9, 1.2)) * 5.5);
  vec3 color = room * (shade + spill * 0.28) + beam * spill * 0.04;
  vec3 lit = beam * (top * 2.2 + lf * 1.25 + rf * 0.75) / max(top + lf + rf, 1e-4);
  return mix(color, lit, cube);
}

void main() {
  float aspect = uRes.x / uRes.y;
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
  vec2 view = uView * vec2(aspect, 1.0);
  float aa = 1.5 / uRes.y;

  vec3 lin = uForm < 0.5 ? ganzfeld(p, aspect, view)
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

  // Eyes adjust: the room brightens a touch while you look at it.
  lin *= 1.0 + uHover * 0.14;
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
  /** Offsets the sequence so neighbouring cards aren't in step. */
  seed?: number;
  /** Lights the field as if looked at (keyboard focus). */
  active?: boolean;
  /** Increment to swell the light from the centre (keyboard activation). */
  pulse?: number;
  className?: string;
};

/** One full trip through a sequence, in seconds. Turrell's run for an hour; this is a card. */
const CYCLE = 40;

/**
 * Raw WebGL, no library. Animates only while on screen; under reduced
 * motion it renders still frames and swaps light instantly. Pointer input
 * is read from the parent element and tilts the view, so the opening
 * shifts against the room as if you moved your head.
 */
export function LightField({ form = "Ganzfeld", colors, seed = 0, active = false, pulse = 0, className = "" }: LightFieldProps) {
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
    const uRes = u("uRes"), uTime = u("uTime"), uForm = u("uForm"), uView = u("uView");
    const uHover = u("uHover"), uPulse = u("uPulse");
    const uColors = [u("uC0"), u("uC1"), u("uC2"), u("uC3")];

    const link = bridge.current;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const toLab = (list: readonly string[]) => list.map(hexToOklab);
    const state = {
      // Phase in cycles; the seed spreads cards around the sequence.
      time: (seed * 0.29) % 1,
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
    };

    // Ease-in-out cubic: light should arrive and settle, never snap.
    const blend = () => (state.mix < 0.5 ? 4 * state.mix ** 3 : 1 - (-2 * state.mix + 2) ** 3 / 2);

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      const scale = Math.min(window.devicePixelRatio || 1, 2) * 0.75;
      canvas!.width = Math.max(1, Math.round(rect.width * scale));
      canvas!.height = Math.max(1, Math.round(rect.height * scale));
      gl!.viewport(0, 0, canvas!.width, canvas!.height);
      gl!.uniform2f(uRes, canvas!.width, canvas!.height);
    }

    function draw() {
      const k = blend();
      uColors.forEach((loc, i) => {
        const a = state.from[i], b = state.to[i];
        gl!.uniform3f(loc, a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k);
      });
      gl!.uniform1f(uTime, state.time);
      gl!.uniform2fv(uView, state.view);
      gl!.uniform1f(uHover, state.hover);
      gl!.uniform3fv(uPulse, state.pulse);
      gl!.drawArrays(gl!.TRIANGLES, 0, 3);
    }

    function frame(now: number) {
      const dt = Math.min(0.05, (now - (state.last || now)) / 1000);
      state.last = now;
      const looking = state.pointer || bridge.current.active;
      const target = looking ? 1 : 0;
      state.hover += (target - state.hover) * (1 - Math.exp(-dt * (target > state.hover ? 3 : 1.5)));
      // The view eases after the pointer slowly, like a head turning.
      const aim = state.pointer ? state.mouse : [0, 0];
      const ease = 1 - Math.exp(-dt * 2.5);
      state.view = state.view.map((v, i) => v + (aim[i] - v) * ease);
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
    // row of cards doesn't flash every one it passes.
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
      const k = blend();
      // Start from wherever the current blend is, so rapid clicks stay smooth.
      state.from = state.from.map((a, i) => a.map((v, j) => v + (state.to[i][j] - v) * k));
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
  }, [seed, form]);

  return <canvas ref={canvasRef} aria-hidden className={`block size-full bg-panel ${className}`} />;
}

/* ------------------------------------------------------------------------ */
/* LightWork                                                                 */
/* ------------------------------------------------------------------------ */

type LightWorkProps = {
  title: string;
  year: string;
  /** Which room this work is. */
  form?: Form;
  /** Roman numeral or catalogue number shown on the wall label. */
  number?: string;
  /** CSS aspect ratio of the work, e.g. "4 / 5". */
  ratio?: string;
  /** Index into `sequences` to start from. */
  light?: number;
  seed?: number;
  /** Classes for the figure, e.g. to hang the label beside the work. */
  className?: string;
  /** Classes for the work itself; it fills its width by default. */
  artClassName?: string;
};

/**
 * One work in the exhibition: a room of light with a wall label beneath it.
 * Hover tilts the view and the light brightens; clicking (or Enter/Space)
 * swells it and drifts into the next sequence, named on the label.
 */
export function LightWork({ title, year, form = "Ganzfeld", number, ratio = "4 / 5", light = 0, seed = 0, className = "", artClassName = "w-full" }: LightWorkProps) {
  const [index, setIndex] = useState(light % sequences.length);
  const [focused, setFocused] = useState(false);
  const [pulse, setPulse] = useState(0);
  const current = sequences[index];
  const next = sequences[(index + 1) % sequences.length];

  return (
    <figure className={`m-0 ${className}`}>
      <button
        type="button"
        onClick={(e) => {
          setIndex((i) => (i + 1) % sequences.length);
          // Pointer clicks swell from the cursor; keyboard clicks (detail 0) from the centre.
          if (e.detail === 0) setPulse((n) => n + 1);
        }}
        onFocus={(e) => setFocused(e.currentTarget.matches(":focus-visible"))}
        onBlur={() => setFocused(false)}
        aria-label={`${title}, ${form}, in ${current.name} light. Switch to ${next.name}`}
        style={{ aspectRatio: ratio }}
        className={`relative block cursor-pointer overflow-hidden rounded-md outline-offset-4 transition-[scale] duration-(--duration-exit) ease-out active:scale-[0.985] ${artClassName}`}
      >
        <LightField form={form} colors={current.colors} seed={seed} active={focused} pulse={pulse} />
        <span aria-hidden className="pointer-events-none absolute inset-0 rounded-md shadow-[inset_0_0_0_1px_rgb(0_0_0/0.08)]" />
      </button>
      {/* A wall label: number, title and year, then the room and its light. */}
      <figcaption className="mt-4 grid grid-cols-1 gap-x-1 text-meta @xl:grid-cols-[1.5rem_1fr]">
        <span className="tabular-nums text-muted">{number}</span>
        <span className="text-body font-medium text-ink">
          <cite className="not-italic">{title}</cite>
          <span className="font-normal text-muted">, {year}</span>
        </span>
        <span className="mt-0.5 text-muted @xl:col-start-2">
          {form}. Light<span className="hidden @xl:inline">, variable dimensions</span>.
        </span>
        <span className="mt-1.5 flex items-center @xl:col-start-2 gap-1.5 text-muted">
          <span aria-hidden className="flex -space-x-0.5">
            {current.colors.map((c, i) => (
              <span
                key={i}
                className="size-2 rounded-full shadow-[0_0_0_1px_var(--panel)] transition-colors duration-(--duration-move)"
                style={{ background: c }}
              />
            ))}
          </span>
          <span key={current.name} className="animate-enter">
            {current.name}
          </span>
        </span>
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
  return (
    <section aria-labelledby="light-rooms-title" className="@container w-full max-w-3xl">
      <header className="mb-5 flex @xl:mb-8 flex-wrap items-end justify-between gap-x-6 gap-y-1">
        <div>
          <p className="text-meta text-muted">Exhibition · Four rooms</p>
          <h2 id="light-rooms-title" className="mt-1 text-title font-medium text-ink">
            Rooms of Light
          </h2>
        </div>
        <p className="hidden text-meta text-muted @xl:block">After James Turrell. Click a room to change its light.</p>
      </header>
      {/* Wide: one wall, works centred on a line with labels aligned below.
          Narrow: a swipeable row of works at one height, labels beside them. */}
      <ol className="-m-2 flex snap-x snap-mandatory scroll-px-2 gap-6 overflow-x-auto p-2 [scrollbar-width:none] @xl:grid @xl:grid-cols-4 @xl:grid-rows-[auto_auto] @xl:gap-y-0 @xl:overflow-visible">
        {works.map((work, i) => (
          <li
            key={work.title}
            className="shrink-0 snap-start animate-enter @xl:row-span-2 @xl:grid @xl:grid-rows-subgrid"
            style={{ animationDelay: `calc(${i} * var(--stagger))` }}
          >
            <LightWork
              {...work}
              year="2026"
              seed={i}
              artClassName="h-32 w-auto shrink-0 self-end @xl:h-auto @xl:w-full @xl:self-center"
              className="flex gap-3 [&>figcaption]:mt-0 [&>figcaption]:w-32 [&>figcaption]:self-end @xl:row-span-2 @xl:grid @xl:grid-rows-subgrid @xl:gap-0 @xl:[&>figcaption]:mt-4 @xl:[&>figcaption]:w-auto @xl:[&>figcaption]:self-start"
            />
          </li>
        ))}
      </ol>
    </section>
  );
}
