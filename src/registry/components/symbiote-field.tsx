"use client";

import { useEffect, useEffectEvent, useImperativeHandle, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type Ref } from "react";
import {
  Color,
  DoubleSide,
  FloatType,
  HalfFloatType,
  InstancedBufferAttribute,
  InstancedMesh,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  Plane,
  PlaneGeometry,
  Raycaster,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from "three";
import { focusQuietly } from "@/design-system";
import { hostTransport, play } from "@/lib/sound";

/*
 * A symbiote you grow with the pointer, drawn in ink on isometric paper.
 *
 * Move over the page and a black, glossy mass wells up behind the pointer,
 * thicker wherever you linger. Hold the button down and it pumps up. Where
 * it is thick, needles break out of it; around its edge, veins creep out
 * across the paper, and toward the pointer when you hover near. Left alone
 * it keeps living: it spreads a little, breathes, and its veins wander.
 * Switch to repel and it stops growing: the pointer pushes the goo aside
 * like a finger through liquid, and the needles duck away from it.
 *
 * It is drawn as a comic draws Venom: solid black with hard white highlight
 * shapes, a hatched shadow on the paper, needles as single pen strokes with
 * a white gap round each so they read against the black, and every line
 * redrawn eight times a second with a slightly different wobble, so the ink
 * boils like hand-drawn animation. The camera stays in true isometric.
 *
 * The creature lives in a 256 × 256 float texture on the GPU, stepped 120
 * times a second: its mass (fed by the pointer, smoothed, spreading slowly,
 * carried along by the pointer's flow) and its territory, which diffuses out
 * from the mass and wells up under a hovering pointer. The veins are the
 * zero lines of warped simplex noise, drawn into the paper a pixel at a
 * time only as far as the territory has crept. The body is a plane
 * displaced by the mass in its vertex shader; the needles are one
 * InstancedMesh that reads the mass at each root. Each frame is a
 * function of its time and the pointer's path alone, so a scripted path
 * renders to the same video every time.
 */

/* --- Tunable constants ---------------------------------------------------- */

/** Needles that can grow. Only those on thick mass show. */
export const NEEDLES = 3200;

const WORLD = 9; // world units across the page the creature can live on
const SIZE = 256; // the simulation's texels a side
const STEPS_PER_SECOND = 120; // simulation steps a second of the clock
const MAX_STEPS = 16; // a frame catches up at most this many; a slow device drops the rest
const BODY_SEGMENTS = 220;

const INK = {
  ink: "#0a0a0a",
  paper: "#ffffff",
  dots: "#c9c9c9", // the notebook's isometric dots
  width: 1.6, // CSS pixels: a needle's pen at its root
  gap: 2.4, // and the white round it, as a multiple
  boil: 8, // redraws a second
};

const GROWTH = {
  brush: 0.3, // world units: the pointer's reach as it feeds (σ)
  feed: 0.8, // mass a second under a still pointer
  rush: 2.4, // and more, at full speed
  pump: 5, // and more again, while the button is held
  spread: 0.06, // how fast it grows by itself
  flow: 0.45, // world units a second it oozes toward the pointer (attract)
  shove: 1.4, // and is pushed away from it (repel)
};

const POINTER = {
  reach: 0.9, // world units: how far the needles' lean carries (σ)
  stiffness: 60, // the spring that carries the pointer's position
  notice: 3, // 1/s: how fast it notices a pointer arriving
  relax: 1.2, // 1/s: and lets go
  modeRate: 5, // 1/s: needles swinging from leaning in to ducking away
};

/* --- The ghost ------------------------------------------------------------ */

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The pointer that draws the first creature by itself, for its first five seconds: a loop that widens, held down once. */
export function ghost(time: number) {
  const presence = smoothstep(0.1, 0.5, time) * (1 - smoothstep(4.4, 5.2, time));
  const r = 0.25 + 0.75 * smoothstep(0.3, 4.2, time);
  const a = time * 2.1;
  return { x: r * Math.cos(a) + 0.2 * Math.sin(time * 3.3), z: r * Math.sin(a * 1.13) * 0.85, presence, pressed: time > 1.3 && time < 2.1 };
}

/* --- Shaders -------------------------------------------------------------- */

// Simplex noise in 3D after Ashima Arts and Stefan Gustavson (MIT): the veins.
const NOISE = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  vec3 ns = 0.142857142857 * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`;

const STATE = /* glsl */ `
uniform sampler2D uState; // r: mass; a: territory, where its veins may reach
uniform float uSize;
uniform float uWorld;
// Bilinear by hand: float textures aren't filterable everywhere.
vec4 state(vec2 uv) {
  vec2 x = uv * uSize - 0.5;
  vec2 i = floor(x);
  vec2 f = x - i;
  vec2 t = vec2(1.0 / uSize);
  vec2 b = (i + 0.5) * t;
  vec4 a = texture2D(uState, b);
  vec4 c = texture2D(uState, b + vec2(t.x, 0.0));
  vec4 d = texture2D(uState, b + vec2(0.0, t.y));
  vec4 e = texture2D(uState, b + t);
  return mix(mix(a, c, f.x), mix(d, e, f.x), f.y);
}
vec2 uvOf(vec2 p) { return p / uWorld + 0.5; }
float mass(vec2 p) { return state(uvOf(p)).r; }
`;

const SHARED = /* glsl */ `
uniform float uTime;
uniform float uBoil; // the time, held to the redraws
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
// Value noise that jumps to a new pattern on every redraw: the ink's boil.
float boil(vec2 p) {
  p += uBoil * vec2(17.0, 31.0);
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y) - 0.5;
}
// The body's height over the paper for a mass, breathing in a ring that travels out.
float height(float m, vec2 p) {
  float h = 0.5 * (1.0 - exp(-max(m - 0.12, 0.0) * 2.0));
  return h * (1.0 + 0.05 * sin(uTime * 1.5 - length(p) * 2.0));
}
const float EDGE = 0.15; // the mass where the body begins
`;

const QUAD_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const CLEAR_FRAGMENT = /* glsl */ `
void main() { gl_FragColor = vec4(0.0); }
`;

const STEP_FRAGMENT = /* glsl */ `
${STATE}
uniform vec3 uPointer;   // xy: on the floor (world x, z); z: presence
uniform vec2 uVelocity;  // world units a second
uniform float uPress;
uniform float uMode;
uniform float uDt;
uniform vec4 uGrowth;    // brush, feed, rush, pump
uniform vec3 uMotion;    // spread, flow, shove
varying vec2 vUv;

void main() {
  vec2 p = (vUv - 0.5) * uWorld;
  vec2 toward = uPointer.xy - p;
  float d = length(toward);

  // The pointer's flow: the goo oozes toward it, or is shoved away, near it only.
  float near = uPointer.z * exp(-d * d / 0.8);
  vec2 flow = toward / max(d, 0.08) * near * (uMotion.y * max(uMode, 0.0) + uMotion.z * min(uMode, 0.0));
  // A shove also carries it along the way the pointer is moving.
  flow += uVelocity * near * 0.35 * max(-uMode, 0.0);
  vec2 from = vUv - flow * uDt / uWorld;

  vec2 t = vec2(1.0 / uSize);
  vec4 c = state(from);
  vec4 lap = state(from + vec2(t.x, 0.0)) + state(from - vec2(t.x, 0.0)) + state(from + vec2(0.0, t.y)) + state(from - vec2(0.0, t.y)) - 4.0 * c;
  float m = c.r, a = c.a;

  // The mass: fed by the pointer (attract only), smoothed, and growing by itself where it is already alive.
  float brush = exp(-dot(toward, toward) / (uGrowth.x * uGrowth.x * (1.0 + 1.5 * uPress)));
  float speed = clamp(length(uVelocity) / 4.0, 0.0, 1.0);
  m += uPointer.z * max(uMode, 0.0) * brush * (uGrowth.y + uGrowth.z * speed + uGrowth.w * uPress) * uDt;
  m += 0.09 * lap.r;
  m += uMotion.x * uDt * m * (1.0 - m / 1.1) * smoothstep(0.1, 0.3, m) * (1.0 - smoothstep(3.2, 4.2, length(p)));
  m -= 0.04 * uDt * (1.0 - smoothstep(0.08, 0.2, m)); // stray specks dry up, so the edge stays crisp
  m = clamp(m, 0.0, 1.8);

  // Territory: where the veins may reach. It spreads out from the mass on a wide stencil (three texels a
  // side, so it travels about a world unit in two seconds), and wells up wherever the pointer hovers, so
  // the veins creep toward it.
  vec4 wide = state(from + vec2(3.0 * t.x, 0.0)) + state(from - vec2(3.0 * t.x, 0.0)) + state(from + vec2(0.0, 3.0 * t.y)) + state(from - vec2(0.0, 3.0 * t.y)) - 4.0 * c;
  a += 0.24 * wide.a + uDt * (3.0 * smoothstep(0.1, 0.4, m) + 1.2 * brush * uPointer.z * max(uMode, 0.0) * smoothstep(0.05, 0.3, a)) * (1.0 - a) - uDt * 0.15 * a;

  gl_FragColor = vec4(m, 0.0, 0.0, clamp(a, 0.0, 1.0));
}
`;

const BODY_VERTEX = /* glsl */ `
${STATE}
${SHARED}
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
  vec2 p = position.xz;
  float e = uWorld / uSize;
  float m = mass(p);
  float h = height(m, p);
  float hx = height(mass(p + vec2(e, 0.0)), p);
  float hz = height(mass(p + vec2(0.0, e)), p);
  vNormal = normalize(vec3(h - hx, e, h - hz));
  // Off the body the plane sinks under the paper, so the paper's depth cuts its edge; the edge boils.
  float cover = smoothstep(EDGE - 0.01, EDGE + 0.01, m + boil(p * 7.0) * 0.04);
  vWorld = vec3(p.x, mix(-0.05, h, cover), p.y);
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}
`;

const BODY_FRAGMENT = /* glsl */ `
${SHARED}
uniform vec3 uInk;
uniform vec3 uPaper;
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(cameraPosition - vWorld);
  // Comic gloss: solid black, and hard white shapes where a light overhead would glint, their edges boiling.
  vec3 key = normalize(vec3(-0.45, 1.0, 0.2));
  float glint = dot(n, normalize(key + v)) + boil(vWorld.xz * 9.0) * 0.02;
  float rim = dot(n, normalize(vec3(0.7, 0.35, -0.6) + v));
  float white = max(step(0.993, glint), step(0.996, rim));
  gl_FragColor = vec4(mix(uInk, uPaper, white), 1.0);
}
`;

const PAPER_VERTEX = /* glsl */ `
varying vec3 vWorld;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}
`;

const PAPER_FRAGMENT = /* glsl */ `
${NOISE}
${STATE}
${SHARED}
uniform vec3 uInk;
uniform vec3 uPaper;
uniform vec3 uDots;
varying vec3 vWorld;
void main() {
  vec2 p = vWorld.xz;
  vec2 uv = uvOf(p);
  bool on = all(greaterThan(uv, vec2(0.0))) && all(lessThan(uv, vec2(1.0)));
  vec4 s = on ? state(uv) : vec4(0.0);

  // Notebook dots on the isometric lattice, fading toward the edges of the page.
  vec2 q = p / 0.5;
  float dot_ = length((fract(q) - 0.5) / max(fwidth(q), vec2(1e-4)));
  vec3 c = mix(uDots, uPaper, mix(smoothstep(0.9, 1.6, dot_), 1.0, smoothstep(3.5, 6.0, length(p))));

  // A hatched shadow, cast away from the light; the lines boil.
  float occ = on ? smoothstep(0.2, 0.6, mass(p + vec2(-0.32, 0.2))) : 0.0;
  float hatch = smoothstep(0.55, 0.62, fract(p.x * 11.0 + boil(p * 3.0) * 0.6));
  float ink = occ * hatch * 0.85;

  // The veins: the zero lines of warped noise, a network that wanders slowly, thicker near the body and
  // shown only as far as its territory has crept, behind a ragged front. Their edges boil.
  vec2 w = p + 0.3 * vec2(snoise(vec3(p * 0.8, 1.3)), snoise(vec3(p * 0.8, 7.9)));
  float n1 = snoise(vec3(w * 1.7, uTime * 0.03));
  float n2 = snoise(vec3(w * 3.9, 9.0 + uTime * 0.04));
  float reach = smoothstep(0.0, 0.08, s.a - 0.22 - 0.12 * snoise(vec3(p * 2.2, 4.0)));
  float thick = mix(0.25, 1.0, smoothstep(0.2, 0.8, s.a)) * (1.0 + boil(p * 12.0) * 0.5);
  float v1 = 1.0 - smoothstep(0.0, max(0.05 * thick, fwidth(n1)), abs(n1));
  float v2 = (1.0 - smoothstep(0.0, max(0.045 * thick, fwidth(n2)), abs(n2))) * smoothstep(0.6, 0.9, s.a); // twigs only close in
  ink = max(ink, max(v1, v2) * reach * (1.0 - smoothstep(0.1, 0.15, s.r)));
  gl_FragColor = vec4(mix(c, uInk, ink), 1.0);
}
`;

const NEEDLE_VERTEX = /* glsl */ `
${STATE}
${SHARED}
uniform vec3 uPointer;
uniform float uMode;
uniform float uReach;
uniform float uWidth;   // device pixels
uniform float uGap;     // 1 for the ink, wider for the white round it
uniform vec2 uRes;      // device pixels
attribute vec4 aRoot;   // xy: where it stands; zw: two random numbers of its own

vec3 jitter(float salt) {
  vec2 k = aRoot.zw * vec2(91.7, 53.3) + uBoil * 8.0 + salt;
  return vec3(hash(k), hash(k + 17.0), hash(k + 41.0)) - 0.5;
}

void main() {
  vec2 p = aRoot.xy;
  float e = uWorld / uSize;
  float m = mass(p);
  float grow = smoothstep(0.35, 0.75, m);
  if (grow < 0.01) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; } // no needle here yet: off the page

  float h = height(m, p);
  vec3 skin = normalize(vec3(h - height(mass(p + vec2(e, 0.0)), p), e, h - height(mass(p + vec2(0.0, e)), p)));

  // Mostly short bristle, and one in twenty a spike; taller where the mass is thick.
  float spike = step(0.95, fract(aRoot.z * 13.7));
  float length_ = (0.08 + 0.14 * pow(aRoot.w, 2.0) + spike * 0.32) * grow * (0.6 + 0.6 * smoothstep(0.6, 1.5, m));

  // A wave across it, and a sway of its own.
  float wave = sin(dot(p, vec2(0.83, 0.56)) * 2.4 - uTime * 1.2);
  vec2 lean = vec2(skin.x, skin.z) * 0.9 + vec2(0.83, 0.56) * wave * 0.12 + 0.06 * vec2(sin(uTime * 0.9 + aRoot.z * 40.0), cos(uTime * 0.7 + aRoot.w * 40.0));

  // The pointer: lean in and reach, or bend away and duck.
  vec2 toward = uPointer.xy - p;
  float d = length(toward);
  float near = uPointer.z * exp(-d * d / (uReach * uReach));
  lean += toward / max(d, 1e-3) * near * smoothstep(0.0, 0.25, d) * (1.3 * max(uMode, 0.0) + 1.7 * min(uMode, 0.0));
  length_ *= 1.0 + near * (0.4 * max(uMode, 0.0) - 0.55 * max(-uMode, 0.0));

  // The stroke: up out of the skin, then over toward its tip; each redraw a little different.
  float wobble = 0.018;
  vec3 root = vec3(p.x, h - 0.01, p.y);
  vec3 tip = root + vec3(lean.x, 1.0, lean.y) * length_ + jitter(2.0) * wobble;
  vec3 bend = root + vec3(lean.x * 0.2, 0.6, lean.y * 0.2) * length_ + jitter(3.0) * wobble * 0.8;
  float s = position.y + 0.5;
  float s2 = min(s + 0.02, 1.0);
  vec3 at = mix(mix(root, bend, s), mix(bend, tip, s), s);
  vec3 ahead = s2 > s ? mix(mix(root, bend, s2), mix(bend, tip, s2), s2) : at + (tip - bend);

  // Widened in screen pixels across its own direction, so the pen is the same at any size.
  vec4 clip = projectionMatrix * viewMatrix * vec4(at, 1.0);
  vec4 next = projectionMatrix * viewMatrix * vec4(ahead, 1.0);
  vec2 dir = (next.xy / next.w - clip.xy / clip.w) * uRes;
  dir = length(dir) > 1e-5 ? normalize(dir) : vec2(0.0, 1.0);
  float pen = uWidth * (1.0 - 0.8 * pow(s, 1.6)) * (0.85 + 0.3 * hash(aRoot.zw * 13.0 + uBoil));
  pen = uGap > 1.0 ? pen * uGap + uWidth * 0.6 : pen;
  clip.xy += vec2(-dir.y, dir.x) * position.x * pen / uRes * 2.0 * clip.w;
  // The white gap sits a hair behind its own ink, and in front of whatever is behind it.
  clip.z += uGap > 1.0 ? 0.0004 * clip.w : 0.0;
  gl_Position = clip;
}
`;

const FLAT_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
void main() { gl_FragColor = vec4(uColor, 1.0); }
`;

/* --- The engine ----------------------------------------------------------- */

/** The pointer on the floor, in world units. */
export type SymbiotePointer = { x: number; z: number; presence: number; pressed?: boolean };

/** Everything a frame depends on, besides the frames before it. */
export type SymbioteFrame = {
  /** Seconds since the page was blank. The simulation steps up to it; earlier than the last frame starts over. */
  time: number;
  pointer: SymbiotePointer;
  /** 1 attract (it grows toward the pointer), −1 repel (the pointer pushes it); values between swing the needles. */
  mode: number;
};

export type SymbioteEngine = {
  render: (frame: SymbioteFrame) => void;
  /** A blank page again, its clock starting from `time`. */
  clear: (time?: number) => void;
  /** Sizes the canvas's drawing buffer, in CSS pixels at a density. */
  resize: (width: number, height: number, density: number) => void;
  /** The floor point under a position on the canvas (−1 to 1 each way). */
  pick: (x: number, y: number) => { x: number; z: number } | null;
  dispose: () => void;
};

/** Seeded, so every page grows its needles in the same places. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Roots on a sunflower spiral over the whole page, nudged off it so the rows don't show. */
function roots(count: number) {
  const random = mulberry32(7);
  const data = new Float32Array(count * 4);
  const golden = Math.PI * (3 - Math.sqrt(5));
  const reach = WORLD * 0.47;
  const spacing = reach / Math.sqrt(count);
  for (let i = 0; i < count; i++) {
    const radius = reach * Math.sqrt((i + 0.5) / count);
    data[i * 4] = radius * Math.cos(i * golden) + (random() - 0.5) * spacing * 0.8;
    data[i * 4 + 1] = radius * Math.sin(i * golden) + (random() - 0.5) * spacing * 0.8;
    data[i * 4 + 2] = random();
    data[i * 4 + 3] = random();
  }
  return data;
}

/**
 * Plain Three.js, no React: the creature on a canvas you give it. `render`
 * steps the simulation up to the frame's time, at 120 steps a second, with
 * that frame's pointer, then draws; so a scripted path renders to the same
 * film every time.
 */
export function createSymbiote(canvas: HTMLCanvasElement, { needles = NEEDLES } = {}): SymbioteEngine {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setClearColor(new Color(INK.paper), 1);

  // The simulation, ping-ponged between two float textures (half floats where full ones can't be drawn to).
  const type = renderer.extensions.has("EXT_color_buffer_float") ? FloatType : HalfFloatType;
  const target = () => new WebGLRenderTarget(SIZE, SIZE, { type, minFilter: NearestFilter, magFilter: NearestFilter, depthBuffer: false });
  let read = target();
  let write = target();
  const quad = new PlaneGeometry(2, 2);
  const stepUniforms = {
    uState: { value: read.texture },
    uSize: { value: SIZE },
    uWorld: { value: WORLD },
    uPointer: { value: new Vector3() },
    uVelocity: { value: new Vector2() },
    uPress: { value: 0 },
    uMode: { value: 1 },
    uDt: { value: 1 / STEPS_PER_SECOND },
    uGrowth: { value: [GROWTH.brush, GROWTH.feed, GROWTH.rush, GROWTH.pump] },
    uMotion: { value: [GROWTH.spread, GROWTH.flow, GROWTH.shove] },
  };
  const stepMaterial = new ShaderMaterial({ uniforms: stepUniforms, vertexShader: QUAD_VERTEX, fragmentShader: STEP_FRAGMENT, depthTest: false });
  const clearMaterial = new ShaderMaterial({ vertexShader: QUAD_VERTEX, fragmentShader: CLEAR_FRAGMENT, depthTest: false });
  const simScene = new Scene();
  const simQuad = new Mesh(quad, stepMaterial);
  simQuad.frustumCulled = false;
  simScene.add(simQuad);
  const simCamera = new OrthographicCamera();

  // The page: one set of uniforms for the paper, the body and the needles.
  const uniforms = {
    uState: { value: read.texture },
    uSize: { value: SIZE },
    uWorld: { value: WORLD },
    uTime: { value: 0 },
    uBoil: { value: 0 },
    uPointer: { value: new Vector3() },
    uMode: { value: 1 },
    uReach: { value: POINTER.reach },
    uWidth: { value: INK.width },
    uRes: { value: new Vector2(1, 1) },
    uInk: { value: new Color(INK.ink) },
    uPaper: { value: new Color(INK.paper) },
    uDots: { value: new Color(INK.dots) },
  };

  const scene = new Scene();
  const paperGeometry = new PlaneGeometry(WORLD * 6, WORLD * 6).rotateX(-Math.PI / 2);
  const paper = new Mesh(paperGeometry, new ShaderMaterial({ uniforms, vertexShader: PAPER_VERTEX, fragmentShader: PAPER_FRAGMENT }));
  const bodyGeometry = new PlaneGeometry(WORLD, WORLD, BODY_SEGMENTS, BODY_SEGMENTS).rotateX(-Math.PI / 2);
  const body = new Mesh(bodyGeometry, new ShaderMaterial({ uniforms, vertexShader: BODY_VERTEX, fragmentShader: BODY_FRAGMENT }));

  // Needles in two passes over the same roots: a wide white stroke, then the ink inside it.
  const needleGeometry = new PlaneGeometry(1, 1, 1, 6);
  needleGeometry.setAttribute("aRoot", new InstancedBufferAttribute(roots(needles), 4));
  const needlePass = (gap: number, color: string, order: number) => {
    const material = new ShaderMaterial({
      uniforms: { ...uniforms, uGap: { value: gap }, uColor: { value: new Color(color) } },
      vertexShader: NEEDLE_VERTEX,
      fragmentShader: FLAT_FRAGMENT,
      side: DoubleSide, // widening in screen space mirrors the ribbon's winding
    });
    const mesh = new InstancedMesh(needleGeometry, material, needles);
    mesh.renderOrder = order;
    return mesh;
  };
  const gaps = needlePass(INK.gap, INK.paper, 1);
  const strokes = needlePass(1, INK.ink, 2);
  for (const mesh of [paper, body, gaps, strokes]) {
    mesh.frustumCulled = false; // every vertex is placed in a shader
    scene.add(mesh);
  }

  // True isometric: an orthographic camera down the diagonal, 35.264° up and 45° round.
  const camera = new OrthographicCamera();
  camera.position.set(20, 20, 20);
  camera.lookAt(0, 0.25, 0);
  camera.near = 1;
  camera.far = 90;

  let size = { width: 1, height: 1 };
  let simTime = 0;
  let last = { time: 0, x: 0, z: 0 };
  const raycaster = new Raycaster();
  const floor = new Plane(new Vector3(0, 1, 0), 0);

  function clear(time = 0) {
    simQuad.material = clearMaterial;
    for (const t of [read, write]) {
      renderer.setRenderTarget(t);
      renderer.render(simScene, simCamera);
    }
    simQuad.material = stepMaterial;
    renderer.setRenderTarget(null);
    simTime = time;
    last = { time, x: 0, z: 0 };
  }
  clear();

  return {
    render({ time, pointer, mode }) {
      if (time < simTime - 1e-6) clear(time);
      const m = Math.max(-1, Math.min(1, mode));
      const elapsed = Math.max(time - last.time, 1e-3);
      const velocity = pointer.presence > 0.01 ? [(pointer.x - last.x) / elapsed, (pointer.z - last.z) / elapsed] : [0, 0];
      last = { time, x: pointer.x, z: pointer.z };
      stepUniforms.uPointer.value.set(pointer.x, pointer.z, pointer.presence);
      stepUniforms.uVelocity.value.set(velocity[0], velocity[1]).clampLength(0, 8);
      stepUniforms.uPress.value = pointer.pressed ? 1 : 0;
      stepUniforms.uMode.value = m;

      let steps = Math.floor((time - simTime) * STEPS_PER_SECOND + 1e-6);
      if (steps > MAX_STEPS) {
        simTime = time - MAX_STEPS / STEPS_PER_SECOND; // too far behind: drop the backlog rather than stall
        steps = MAX_STEPS;
      }
      for (let i = 0; i < steps; i++) {
        stepUniforms.uState.value = read.texture;
        renderer.setRenderTarget(write);
        renderer.render(simScene, simCamera);
        [read, write] = [write, read];
        simTime += 1 / STEPS_PER_SECOND;
      }
      renderer.setRenderTarget(null);

      uniforms.uState.value = read.texture;
      uniforms.uTime.value = time;
      uniforms.uBoil.value = Math.floor(time * INK.boil) / INK.boil;
      uniforms.uPointer.value.set(pointer.x, pointer.z, pointer.presence);
      uniforms.uMode.value = m;
      renderer.render(scene, camera);
    },
    clear,
    resize(width, height, density) {
      size = { width: Math.max(1, width), height: Math.max(1, height) };
      renderer.setPixelRatio(density);
      renderer.setSize(size.width, size.height, false);
      uniforms.uRes.value.set(size.width * density, size.height * density);
      uniforms.uWidth.value = INK.width * density;
      const aspect = size.width / size.height;
      const half = Math.max(2.6, 4.4 / aspect);
      camera.left = -half * aspect;
      camera.right = half * aspect;
      camera.top = half;
      camera.bottom = -half;
      camera.updateProjectionMatrix();
    },
    pick(x, y) {
      raycaster.setFromCamera(new Vector2(x, y), camera);
      const hit = raycaster.ray.intersectPlane(floor, new Vector3());
      return hit ? { x: hit.x, z: hit.z } : null;
    },
    dispose() {
      for (const mesh of [paper, body, gaps, strokes]) (mesh.material as ShaderMaterial).dispose();
      stepMaterial.dispose();
      clearMaterial.dispose();
      for (const g of [quad, paperGeometry, bodyGeometry, needleGeometry]) g.dispose();
      gaps.dispose();
      strokes.dispose();
      read.dispose();
      write.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

/* --- SymbioteField: the component ----------------------------------------- */

export type SymbioteMode = "attract" | "repel";
/** Who is drawing it: the ghost's intro, a hand, or nobody. */
export type SymbioteActivity = "ghost" | "hand" | "rest";

export type SymbioteHandle = {
  /** A blank page again. */
  clear: () => void;
};

type SymbioteFieldProps = {
  /** Attract: it grows where the pointer goes and reaches for it. Repel: the pointer pushes it around. */
  mode?: SymbioteMode;
  /** A ghost draws the first creature for five seconds, until a hand arrives. */
  autoplay?: boolean;
  /** Hold the clock until a hand arrives. */
  paused?: boolean;
  /** No ghost, and the loop stops a few seconds after the hand leaves. It still grows under a hand. Defaults to the viewer's setting. */
  reducedMotion?: boolean;
  needles?: number;
  /** Who is drawing it, each time that changes. */
  onActivity?: (activity: SymbioteActivity) => void;
  /** Every frame, with the seconds since the page was blank. For writing a readout, never for React state. */
  onFrame?: (time: number) => void;
  /** Said to screen readers; nothing is printed on the canvas. */
  label?: string;
  ref?: Ref<SymbioteHandle>;
  className?: string;
};

/**
 * The creature, live: a canvas the size of its box (at up to 2× for dense
 * displays) that keeps the clock and the pointer's spring and hands each
 * frame to the engine. It only runs while on screen.
 */
export function SymbioteField({
  mode = "attract",
  autoplay = true,
  paused = false,
  reducedMotion,
  needles = NEEDLES,
  onActivity,
  onFrame,
  label = "An ink symbiote that grows wherever the pointer moves: a black mass that thickens, sprouts needles and creeps veins across the page.",
  ref,
  className = "",
}: SymbioteFieldProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  // Bridges from React props into the frame loop, so a change never restarts it.
  const live = useRef({ mode, autoplay, paused, reducedMotion, onActivity, onFrame });
  const kick = useRef(() => {});
  const clear = useRef(() => {});

  useEffect(() => {
    live.current = { mode, autoplay, paused, reducedMotion, onActivity, onFrame };
    kick.current();
  });

  useImperativeHandle(ref, () => ({ clear: () => clear.current() }), []);

  useEffect(() => {
    const host = hostRef.current!;
    // Made here rather than rendered: disposing loses its context for good, so every mount needs its own canvas.
    const canvas = document.createElement("canvas");
    canvas.className = "block size-full drawn:opacity-60!";
    host.append(canvas);
    let engine: SymbioteEngine;
    try {
      engine = createSymbiote(canvas, { needles });
    } catch {
      return () => canvas.remove(); // no WebGL: the host's paper shows
    }

    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const s = {
      clock: 0,
      touched: false, // a hand has arrived: the ghost is gone for good
      // The pointer on the floor and its spring.
      x: 0, z: 0, vx: 0, vz: 0, tx: 0, tz: 0,
      presence: 0, present: 0, pressed: false,
      mode: live.current.mode === "repel" ? -1 : 1,
      activity: "rest" as SymbioteActivity,
      quietSince: 0,
      visible: false,
      raf: 0,
      last: 0,
    };
    const reduced = () => live.current.reducedMotion ?? media.matches;
    const ghosting = () => live.current.autoplay && !s.touched && !reduced() && s.clock < 5.2;

    function step(dt: number) {
      const L = live.current;
      if (!L.paused || s.present) s.clock += dt; // a hand always works it
      const k = POINTER.stiffness, c = 2 * Math.sqrt(k);
      for (let left = dt; left > 0; left -= 1 / 240) {
        const h = Math.min(left, 1 / 240);
        s.vx += (k * (s.tx - s.x) - c * s.vx) * h;
        s.vz += (k * (s.tz - s.z) - c * s.vz) * h;
        s.x += s.vx * h;
        s.z += s.vz * h;
      }
      s.presence += (s.present - s.presence) * (1 - Math.exp(-dt * (s.present > s.presence ? POINTER.notice : POINTER.relax)));
      s.mode += ((L.mode === "repel" ? -1 : 1) - s.mode) * (1 - Math.exp(-dt * POINTER.modeRate));
      const activity: SymbioteActivity = ghosting() ? "ghost" : s.present ? "hand" : "rest";
      if (activity !== s.activity) {
        s.activity = activity;
        L.onActivity?.(activity);
      }
      if (s.present || ghosting()) s.quietSince = s.clock;
    }

    function draw() {
      const pointer = ghosting() ? ghost(s.clock) : { x: s.x, z: s.z, presence: s.presence, pressed: s.pressed };
      engine.render({ time: s.clock, pointer, mode: s.mode });
      live.current.onFrame?.(s.clock);
    }

    /** Paused, or under reduced motion, the loop stops once no hand has been on it for 3 s. */
    function settled() {
      if (s.present || s.clock - s.quietSince < 3) return false;
      return live.current.paused || reduced();
    }

    function frame(now: number) {
      const dt = Math.min(0.05, (now - (s.last || now)) / 1000);
      s.last = now;
      step(dt);
      draw();
      s.raf = s.visible && !settled() ? requestAnimationFrame(frame) : 0;
    }

    function start() {
      if (!s.raf && s.visible) {
        s.last = 0;
        s.raf = requestAnimationFrame(frame);
      }
    }
    kick.current = start;
    clear.current = () => {
      s.clock = 0;
      s.quietSince = 0;
      engine.clear(0);
      start();
    };

    function aim(e: PointerEvent) {
      const rect = canvas.getBoundingClientRect();
      const hit = engine.pick(((e.clientX - rect.left) / rect.width) * 2 - 1, -(((e.clientY - rect.top) / rect.height) * 2 - 1));
      if (!hit) return;
      // Arriving, it is felt where it is, not dragged in from wherever it last left.
      if (s.presence < 0.05) {
        s.x = hit.x;
        s.z = hit.z;
        s.vx = s.vz = 0;
      }
      s.tx = hit.x;
      s.tz = hit.z;
      s.present = 1;
      s.touched = true;
      start();
    }
    const down = (e: PointerEvent) => {
      aim(e);
      s.pressed = true;
    };
    const up = () => (s.pressed = false);
    const leave = () => {
      s.present = 0;
      s.pressed = false;
      start();
    };
    host.addEventListener("pointermove", aim);
    host.addEventListener("pointerdown", down);
    host.addEventListener("pointerup", up);
    host.addEventListener("pointerleave", leave);
    host.addEventListener("pointercancel", leave);

    const resize = new ResizeObserver(() => {
      const rect = host.getBoundingClientRect();
      engine.resize(rect.width, rect.height, Math.min(devicePixelRatio, 2));
      draw();
    });
    resize.observe(host);

    const visibility = new IntersectionObserver(([entry]) => {
      s.visible = entry.isIntersecting;
      if (s.visible) start();
    });
    visibility.observe(host);

    return () => {
      cancelAnimationFrame(s.raf);
      s.visible = false;
      kick.current = () => {};
      clear.current = () => {};
      resize.disconnect();
      visibility.disconnect();
      host.removeEventListener("pointermove", aim);
      host.removeEventListener("pointerdown", down);
      host.removeEventListener("pointerup", up);
      host.removeEventListener("pointerleave", leave);
      host.removeEventListener("pointercancel", leave);
      engine.dispose();
      canvas.remove();
    };
  }, [needles]);

  return <div ref={hostRef} role="img" aria-label={label} className={`block size-full cursor-crosshair touch-none bg-white ${className}`} />;
}

/* --- Demo: the page behind glass, its readout and three keys -------------- */

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");
const sink = "group-active/key:translate-y-[2px] group-active/key:shadow-(--device-key-shadow-pressed) group-active/key:duration-75";
const face = "relative grid h-[2.75em] place-items-center rounded-[0.7em] text-(--device-key-ink) [background:var(--device-key-face)] shadow-(--device-key-shadow) transition-[transform,box-shadow] duration-(--duration-exit) ease-out";
const legend = "mt-[0.4em] text-[0.72em] font-medium uppercase leading-none tracking-[0.03em] [text-shadow:var(--device-engrave)]";
const MODES: { value: SymbioteMode; name: string }[] = [
  { value: "attract", name: "Attract" },
  { value: "repel", name: "Repel" },
];

/** Writes seconds into the clock as minutes and seconds, touching only the figures that change. */
function paintClock(el: HTMLElement | null, seconds: number) {
  if (!el) return;
  const figures = el.querySelectorAll("[data-figure]");
  [Math.floor(seconds / 60) % 100, Math.floor(seconds) % 60].forEach((n, i) => {
    const text = String(n).padStart(2, "0");
    if (figures[i] && figures[i].textContent !== text) figures[i].textContent = text;
  });
}

export default function Demo() {
  const [mode, setMode] = useState<SymbioteMode>("attract");
  const [activity, setActivity] = useState<SymbioteActivity>("rest");
  const [running, setRunning] = useState(false); // the ghost waits for power-up
  const [said, setSaid] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<HTMLParagraphElement>(null);
  const field = useRef<SymbioteHandle>(null);

  // Power up: the ghost draws unless the host's tape is stopped; then it waits for PLAY.
  const powerUp = useEffectEvent(() => {
    if (hostTransport(rootRef.current) !== "stop") setRunning(true);
  });
  useEffect(() => {
    const root = rootRef.current;
    const first = requestAnimationFrame(powerUp);
    const host = root?.closest("[data-transport]");
    const observer = new MutationObserver(() => hostTransport(root) === "play" && powerUp());
    if (host) observer.observe(host, { attributes: true, attributeFilter: ["data-transport"] });
    return () => {
      cancelAnimationFrame(first);
      observer.disconnect();
    };
  }, []);

  function clearPage() {
    field.current?.clear();
    setRunning(true);
    setSaid("Cleared");
  }

  function choose(next: SymbioteMode) {
    if (next === mode) return;
    setMode(next);
    setSaid(next === "attract" ? "Attract" : "Repel");
  }

  /** The two mode keys are one radio group: the arrows move along it. */
  function onModeKeyDown(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const next = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: MODES.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    if (next < 0 || next >= MODES.length || next === i) return play("bump", { gain: 0.6 });
    play("tick");
    choose(MODES[next].value);
    rootRef.current?.querySelector<HTMLElement>(`[data-mode="${MODES[next].value}"]`)?.focus();
  }

  const quiet = (e: ReactPointerEvent<HTMLElement>) => e.button === 0 && focusQuietly(e.currentTarget);
  const word = activity === "ghost" ? "Growing" : activity === "hand" ? (mode === "attract" ? "Feeding" : "Pushing") : "Resting";

  return (
    <div ref={rootRef} className="@container w-full max-w-[480px] select-none">
      <div data-part="plate" className="relative isolate animate-enter overflow-hidden rounded-[1.25em] p-[0.9em] text-[clamp(11px,4cqw,14px)] [background:var(--device-body)] shadow-[var(--device-body-edge),0_1px_2px_rgb(0_0_0/0.06),0_16px_32px_-18px_rgb(0_0_0/0.3)] @[26rem]:p-[1.1em]">
        <div aria-hidden className="device-grain pointer-events-none absolute inset-0 -z-10 rounded-[inherit]" />

        {/* The window: the page behind glass. */}
        <div data-part="bezel" className="rounded-[0.7em] bg-(--device-rim) p-[0.3em] shadow-[0_1px_0_rgb(255_255_255/0.7),inset_0_1px_2px_rgb(0_0_0/0.6)] dark:shadow-[0_1px_0_rgb(255_255_255/0.06),inset_0_1px_2px_rgb(0_0_0/0.6)]">
          <div data-part="screen" className="relative aspect-[4/3] rounded-[0.45em] bg-white @[26rem]:aspect-[16/10]">
            <span className="absolute inset-0 overflow-hidden rounded-[inherit]">
              <SymbioteField ref={field} mode={mode} autoplay={running} paused={!running} onActivity={setActivity} onFrame={(t) => paintClock(clockRef.current, t)} />
            </span>
            <span aria-hidden data-part="glass" className="pointer-events-none absolute inset-0 rounded-[inherit] [background:var(--screen-glass)] shadow-(--device-lcd-edge)" />
          </div>
        </div>

        {/* Narrow, the readout takes a row of its own; wider, it shares one with the keys. */}
        <div className="mt-[0.7em] grid grid-cols-[minmax(0,1fr)_auto] items-center gap-[0.55em] @[26rem]:grid-cols-[minmax(0,1fr)_auto_auto]">
          {/* The readout: who is drawing it, and how long it has been alive. */}
          <div data-part="well" className="col-span-2 rounded-[1.05em] bg-(--device-well) p-[0.35em] shadow-(--device-recess) @[26rem]:col-span-1">
            <div aria-hidden data-part="lcd" className="flex h-[2.05em] items-center justify-between gap-[0.6em] rounded-[0.7em] px-[0.6em] text-(--device-lcd-ink) [background:var(--device-lcd)] shadow-(--device-lcd-edge)">
              <span data-part="chip" className="inline-flex shrink-0 items-center gap-[0.35em] rounded-[0.4em] bg-white px-[0.42em] py-[0.24em] text-black">
                {activity === "ghost" ? (
                  <span className="size-[0.55em] animate-pulse rounded-full bg-(--device-rec) motion-reduce:animate-none drawn:bg-(--device-rec)!" />
                ) : activity === "hand" ? (
                  <span className="size-[0.55em] rounded-full bg-(--device-hold) drawn:bg-(--device-draw-ink)!" />
                ) : (
                  <span className="size-[0.55em] rounded-full bg-black drawn:bg-(--device-draw-ink)!" />
                )}
                <span className="text-[0.58em] font-semibold uppercase leading-none tracking-[0.02em]">{word}</span>
              </span>
              <p ref={clockRef} className="flex items-baseline whitespace-nowrap text-[1.25em] font-light leading-none tracking-[-0.03em] tabular-nums">
                <span data-figure>00</span>
                <span className="ml-[0.1em] mr-[0.45em] text-[0.42em] font-normal text-(--device-lcd-dim)">M</span>
                <span data-figure>00</span>
                <span className="ml-[0.1em] text-[0.42em] font-normal text-(--device-lcd-dim)">S</span>
              </p>
            </div>
          </div>

          {/* The mode: two keys, one radio group. */}
          <div role="radiogroup" aria-label="Pointer" className="grid grid-cols-2 gap-[0.45em] @[26rem]:w-[11em]">
            {MODES.map((m, i) => (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={mode === m.value}
                tabIndex={mode === m.value ? 0 : -1}
                data-mode={m.value}
                data-sound="key"
                data-part="key"
                onPointerDown={quiet}
                onClick={() => choose(m.value)}
                onKeyDown={(e) => onModeKeyDown(e, i)}
                className="group/key min-w-0 rounded-[0.7em] outline-offset-2"
              >
                <span className={cx(face, sink)}>
                  <span
                    aria-hidden
                    data-part="light"
                    className={cx(
                      "absolute left-1/2 top-[0.42em] h-[0.22em] w-[1.9em] -translate-x-1/2 rounded-full transition-[background-color]",
                      mode === m.value ? "bg-(--device-meter-on) duration-0 drawn:bg-(--device-draw-ink)!" : "bg-(--device-meter-off) duration-(--duration-exit)",
                    )}
                  />
                  <span data-part="lettering" className={legend}>
                    {m.name}
                  </span>
                </span>
              </button>
            ))}
          </div>

          {/* Clear: a blank page again. */}
          <button type="button" data-sound="key" data-part="key" onPointerDown={quiet} onClick={clearPage} className="group/key w-[4.6em] min-w-0 rounded-[0.7em] outline-offset-2">
            <span className={cx(face, sink)}>
              <span data-part="lettering" className={legend}>
                Clear
              </span>
            </span>
          </button>
        </div>

        <p aria-live="polite" className="sr-only">
          {said}
        </p>
      </div>
    </div>
  );
}
