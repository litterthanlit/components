"use client";

import { useEffect, useEffectEvent, useImperativeHandle, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type Ref } from "react";
import {
  ACESFilmicToneMapping,
  Color,
  ConeGeometry,
  HalfFloatType,
  InstancedBufferAttribute,
  InstancedMesh,
  Mesh,
  PerspectiveCamera,
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
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { focusQuietly } from "@/design-system";
import { hostTransport, play } from "@/lib/sound";

/*
 * Needle Field, alive. An empty floor seen in true isometric (35.264° up,
 * 45° round), a faint grid and nothing else, until a dark glossy mass seeps
 * up through the middle of it. It breathes as it grows, its skin rippling on
 * slow simplex noise. Veins crawl out across the grid ahead of it, and then
 * needles break out of the surface in waves, ring after ring from the centre.
 * As it wakes the camera eases out of the isometric drawing into a freer
 * perspective and starts to orbit: the diagram becomes a creature.
 *
 * Everything on screen is a pure function of one frame: the time, the
 * awakening's progress (0 to 1), the pointer on the floor and the mode. The
 * component only keeps the clock and the pointer's springs, so the same frame
 * can be scrubbed, played on scroll or rendered offline to video, and comes
 * out identical each time.
 *
 * All motion runs on the GPU. The body is a 320 × 320 plane displaced in its
 * vertex shader: a lobed edge that breathes and reaches toward the pointer, a
 * meniscus profile, two octaves of ripple and a slow ring travelling out. The
 * veins are ridged noise in warped coordinates, revealed by a noise-edged
 * front. The needles are one InstancedMesh of open cones; each instance reads
 * the same field at its root, stands on the surface normal, leans toward the
 * pointer (attract) or away (repel) and rises out of the skin when its wave
 * arrives. 24,000 by default; 60,000 still holds 60 fps on a laptop GPU.
 *
 * Light comes from an analytic studio: a softbox overhead, a hard strip
 * behind for the specular rim, one wide violet strip low on the far side, and
 * a violet-to-blue thin-film sheen at grazing angles, so the black reads as
 * oily rather than matte. Bloom, a little chromatic aberration, a vignette
 * and 24 fps grain finish it. Reduced motion skips the awakening and holds a
 * still frame of the creature awake; the needles still lean for a pointer.
 */

/* --- Tunable constants ---------------------------------------------------- */

/** Seconds the awakening takes, from the empty floor to the first idle breath. */
export const DURATION = 7.2;
/** Needles in the field by default. Each costs ten vertices; 60,000 is fine. */
export const NEEDLES = 24_000;

const SEGMENTS = 320; // the body's plane, a side: 103,041 vertices
const EXTENT = 10.8; // world units across the floor and the body's plane
const EPS = 0.02; // world units between the samples a normal is taken from

const PALETTE = {
  rim: "#6d4dff", // the one cold accent: violet, clear of the screen's blue
  sheen: "#2f6fd6", // the far end of the thin film's shift, used only at grazing angles
  floor: "#0b0b0e", // the canvas
  grid: "#2a2b33", // its lines
};

const CAMERA = {
  isoElevation: 35.264, // degrees: atan(1 / √2), true isometric
  isoAzimuth: 45,
  isoFov: 0.6, // degrees: so narrow it is orthographic to within 0.3%
  freeElevation: 27,
  freeFov: 34,
  orbit: 18, // degrees it swings round as it wakes
  sway: 9, // degrees it drifts either side of that, once awake
  swayRate: 0.07, // radians a second
};

const POST = {
  bloom: { strength: 0.62, radius: 0.55, threshold: 0.62 },
  aberration: 0.012, // UV offset at the corners
  vignette: 0.55, // how dark the corners go, 0 to 1
  grain: 0.035,
};

const POINTER = {
  reach: 0.78, // world units: how far the needles' lean carries (σ of a Gaussian)
  stiffness: 34, // the spring that carries its position: a little under a second to arrive
  notice: 2.4, // 1/s: how fast the creature notices a pointer arriving
  relax: 0.9, // 1/s: and how slowly it lets go
  modeRate: 5, // 1/s: needles swinging from leaning in to recoiling
};

/** A frame of reduced motion: the creature awake, mid-breath. */
const STILL_TIME = 11.4;

/* --- The timeline --------------------------------------------------------- */

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const span = (p: number, from: number, to: number) => clamp01((p - from) / (to - from));
const smooth = (x: number) => x * x * (3 - 2 * x);
const smoother = (x: number) => x * x * x * (x * (x * 6 - 15) + 10);
const easeOut = (x: number) => 1 - (1 - x) ** 3;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** The awakening's phases at one point of its progress, each 0 to 1. They overlap, so it reads as one movement. */
export function awakening(progress: number) {
  const p = clamp01(progress);
  const grow = smooth(span(p, 0.18, 0.72));
  return {
    /** The blob seeping up through the floor. */
    seep: smooth(span(p, 0.06, 0.3)),
    /** Growing to full size. */
    grow,
    /** It breathes hardest while it grows. */
    breath: 0.035 + 0.05 * Math.sin(Math.PI * grow),
    /** The vein front crawling out across the grid. */
    tendril: easeOut(span(p, 0.26, 0.94)),
    /** The needles' waves: the shader staggers them from the centre out. */
    erupt: span(p, 0.42, 1),
    /** The camera, from the isometric drawing to the creature. */
    camera: smoother(span(p, 0.38, 1)),
  };
}

/* --- Shaders -------------------------------------------------------------- */

// Simplex noise in 3D after Ashima Arts and Stefan Gustavson (MIT).
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

// The creature, as a height field over the floor. Shared by the body, the needles and the floor's shadow.
const FIELD = /* glsl */ `
uniform float uTime;
uniform float uSeep;
uniform float uGrow;
uniform float uBreath;
uniform float uTendril;
uniform vec3 uPointer; // xy: the pointer on the floor (world x, z); z: how present it is, 0 to 1
uniform float uMode;   // 1 attract, −1 repel, and anything between while it swings

// The body's edge in one direction: lobed, breathing, and reaching toward the pointer (or shying from it).
float bodyRadius(vec2 dir) {
  float size = 0.42 * uSeep + 1.22 * uGrow;
  float lobes = snoise(vec3(dir * 1.2, uTime * 0.09)) * 0.2 + snoise(vec3(dir * 2.8 + 5.0, uTime * 0.17)) * 0.08;
  float breath = 1.0 + uBreath * (sin(uTime * 1.35) + 0.4 * sin(uTime * 2.3 + 1.7));
  float r = size * breath * (1.0 + lobes);
  float dp = length(uPointer.xy);
  float aim = pow(max(dot(dir, uPointer.xy / max(dp, 1e-3)), 0.0), 10.0);
  float want = uPointer.z * uGrow * aim * clamp(dp - r * 0.7, 0.0, 1.7);
  return r + want * (0.75 * max(uMode, 0.0) - 0.5 * max(-uMode, 0.0));
}

// x: height above the floor; y: how far inside the edge (world units, negative outside).
vec2 bodyField(vec2 p) {
  float len = length(p);
  float inside = bodyRadius(p / max(len, 1e-4)) - len;
  float soft = log(1.0 + exp(inside * 16.0)) / 16.0; // the edge, rounded like a meniscus
  float height = 0.5 * uSeep * (0.45 + 0.55 * uGrow);
  float h = height * (1.0 - exp(-soft * 3.2)) + 0.18 * uGrow * smoothstep(0.0, 1.6, inside);
  float wet = smoothstep(0.0, 0.4, inside);
  h += wet * (snoise(vec3(p * 1.15, uTime * 0.22)) * 0.07 + snoise(vec3(p * 2.7 + 9.0, uTime * 0.37)) * 0.022);
  h += wet * 0.02 * sin(len * 4.6 - uTime * 1.45); // a slow ring, travelling out
  vec2 dq = p - uPointer.xy;
  float near = uPointer.z * exp(-dot(dq, dq) / 0.3);
  h += near * smoothstep(-0.3, 0.3, inside) * (0.16 * max(uMode, 0.0) - 0.12 * max(-uMode, 0.0));
  return vec2(h, inside);
}

// The veins: the zero lines of noise wrapped round a cylinder, stretched along the radius so they run out from the
// body and fork as they go. Each is a fixed width in world units, thinning toward its tip, and a front with a noisy
// edge reveals them.
float veinField(vec2 p) {
  float len = length(p);
  vec2 dir = p / max(len, 1e-4);
  vec2 w = dir + 0.12 * vec2(snoise(vec3(p * 0.7, 1.3)), snoise(vec3(p * 0.7, 8.1))); // a waver
  float taper = 1.0 - smoothstep(1.2, 4.8, len);
  float main = abs(snoise(vec3(w * 2.1, len * 0.42 + 2.0 + uTime * 0.01)));
  float twig = abs(snoise(vec3(w * 4.6, len * 0.95 + 6.0 + uTime * 0.015)));
  // Noise units per world unit across a vein shrink with the radius, so divide it back out.
  float across = max(len, 0.6);
  float a = 1.0 - smoothstep(0.0, (0.03 + 0.045 * taper) * 2.1 / across, main);
  float b = (1.0 - smoothstep(0.0, (0.018 + 0.028 * taper) * 4.6 / across, twig)) * smoothstep(0.1, 0.5, snoise(vec3(p * 0.6, 4.0)) + 0.3);
  float front = uTendril * 4.9 * (1.0 + 0.22 * snoise(vec3(dir * 1.6, 3.0)));
  return max(a, b * 0.8) * smoothstep(0.0, 0.45, front - len) * (1.0 - smoothstep(3.6, 5.2, len));
}

const float VEIN_HEIGHT = 0.06;
`;

// An analytic studio, so the black has something to reflect.
const LIGHT = /* glsl */ `
uniform vec3 uRim;
uniform vec3 uSheen;
const vec3 KEY = vec3(-0.33, 0.92, 0.22);

vec3 env(vec3 r) {
  vec3 c = vec3(0.004, 0.0045, 0.006) + vec3(0.018, 0.019, 0.024) * smoothstep(-0.1, 0.9, r.y);
  c += vec3(6.0) * smoothstep(0.93, 0.975, dot(r, normalize(KEY)));                         // the softbox overhead
  c += vec3(3.4, 3.6, 4.0) * smoothstep(0.965, 0.99, dot(r, normalize(vec3(0.9, 0.35, -0.75)))); // a hard strip behind: the rim
  c += uRim * 1.5 * smoothstep(0.93, 0.99, dot(r, normalize(vec3(-0.8, -0.04, -0.9))));    // the accent, on the far horizon: only silhouettes see it
  c += vec3(0.05, 0.052, 0.065) * exp(-abs(r.y - 0.02) * 40.0);                              // a horizon
  return c;
}

vec3 shade(vec3 n, vec3 v, float ao) {
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float grazing = 1.0 - ndv;
  float fresnel = 0.045 + 0.955 * pow(grazing, 5.0);
  vec3 spec = env(reflect(-v, n)) * fresnel;
  // A thin film: oil on black, its hue shifting with the angle, only where the surface turns away.
  vec3 film = mix(uRim, uSheen, 0.5 + 0.5 * sin(ndv * 14.0 + n.x * 3.0 + n.z * 2.0));
  vec3 sheen = film * pow(grazing, 3.0) * 0.14;
  vec3 rim = uRim * pow(grazing, 6.0) * 0.35;
  vec3 diffuse = vec3(0.006, 0.006, 0.008) * (0.3 + 0.7 * max(dot(n, normalize(KEY)), 0.0));
  return (diffuse + spec + sheen + rim) * ao;
}
`;

const BODY_VERTEX = /* glsl */ `
${NOISE}
${FIELD}
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
  vec2 p = position.xz;
  vec2 f = bodyField(p);
  float hx = bodyField(p + vec2(${EPS}, 0.0)).x;
  float hz = bodyField(p + vec2(0.0, ${EPS})).x;
  vNormal = normalize(vec3(f.x - hx, ${EPS}, f.x - hz));
  // Off the body, the plane sinks under the floor, so the floor's depth cuts its edge cleanly.
  vWorld = vec3(p.x, mix(-0.06, f.x, smoothstep(-0.04, 0.0, f.y)), p.y);
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}
`;

const BODY_FRAGMENT = /* glsl */ `
${LIGHT}
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(cameraPosition - vWorld);
  float ao = mix(0.5, 1.0, smoothstep(0.0, 0.22, vWorld.y)); // darker in the creases, against the floor
  gl_FragColor = vec4(shade(n, v, ao), 1.0);
}
`;

const NEEDLE_VERTEX = /* glsl */ `
${NOISE}
${FIELD}
uniform float uErupt;
uniform float uReach;
attribute vec4 aRoot; // xy: where it stands on the floor; zw: two random numbers of its own
varying vec3 vWorld;
varying vec3 vNormal;
varying float vAlong;
void main() {
  vec2 p = aRoot.xy;
  float len = length(p);
  vec2 body = bodyField(p);
  float vein = veinField(p);
  float onBody = smoothstep(0.03, 0.3, body.y);
  float onVein = smoothstep(0.35, 0.75, vein) * step(0.55, aRoot.w);
  float cover = max(onBody, onVein * 0.45);
  if (cover < 0.002) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; } // not grown here: off the screen

  float h = max(body.x, VEIN_HEIGHT * vein);
  float hx = bodyField(p + vec2(${EPS}, 0.0)).x;
  float hz = bodyField(p + vec2(0.0, ${EPS})).x;
  vec3 skin = normalize(vec3(body.x - hx, ${EPS}, body.x - hz));

  // The waves: ring after ring from the centre, each needle a little late or early within its ring.
  float ring = floor(len * 2.2) / 2.2;
  float arrive = mix(len, ring, 0.6) / 4.6 * 0.72 + aRoot.z * 0.12;
  float rise = smoothstep(arrive, arrive + 0.14, uErupt);

  // Mostly short bristle, and one in thirty a spike.
  float spike = step(0.967, fract(aRoot.z * 13.7));
  float length_ = (0.07 + 0.16 * pow(aRoot.w, 2.5) + spike * 0.5) * cover * (0.55 + 0.45 * smoothstep(0.0, 1.2, body.y));
  float wave = sin(dot(p, vec2(0.83, 0.56)) * 2.6 - uTime * 1.1); // the bristle wave that crosses it, idle
  length_ *= 1.0 + 0.12 * wave * onBody;

  // The pointer: lean in and reach (attract), or lean away and shrink back (repel).
  vec2 toward = uPointer.xy - p;
  float d = length(toward);
  float near = uPointer.z * exp(-d * d / (uReach * uReach));
  length_ *= 1.0 + near * (0.35 * max(uMode, 0.0) - 0.55 * max(-uMode, 0.0));
  vec3 axis = normalize(skin + vec3(0.0, 0.35, 0.0) + vec3(p.x, 0.0, p.y) / max(len, 0.3) * 0.3 * onBody); // fanned out, like an urchin's
  axis += vec3(toward.x, 0.0, toward.y) / max(d, 1e-3) * near * smoothstep(0.0, 0.25, d) * (1.6 * max(uMode, 0.0) + 2.2 * min(uMode, 0.0));
  axis.xz += 0.08 * vec2(sin(uTime * 0.9 + aRoot.z * 40.0), cos(uTime * 0.7 + aRoot.w * 40.0)) + 0.1 * wave * vec2(0.83, 0.56);
  axis = normalize(axis);

  // It rises out of the skin: the root starts below the surface and the needle slides up along itself.
  float shown = length_ * (0.55 + 0.45 * rise);
  vec3 root = vec3(p.x, h, p.y) - axis * (shown * (1.0 - rise) + 0.01);
  vec3 side = normalize(cross(axis, abs(axis.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 front = cross(side, axis);
  float width = (0.013 + 0.009 * aRoot.w + spike * 0.02) * (0.6 + 0.4 * rise);

  vWorld = root + axis * position.y * shown + (side * position.x + front * position.z) * width;
  vNormal = normalize(side * normal.x + axis * normal.y + front * normal.z); // the cone's own normal, turned onto the needle
  vAlong = position.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}
`;

const NEEDLE_FRAGMENT = /* glsl */ `
${LIGHT}
varying vec3 vWorld;
varying vec3 vNormal;
varying float vAlong;
void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(cameraPosition - vWorld);
  // Each needle is a cylinder with a grazing edge somewhere, so held darker than the skin: black spikes, not grey hair.
  gl_FragColor = vec4(shade(n, v, mix(0.15, 0.6, vAlong * vAlong)), 1.0);
}
`;

const FLOOR_VERTEX = /* glsl */ `
varying vec3 vWorld;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}
`;

const FLOOR_FRAGMENT = /* glsl */ `
${NOISE}
${FIELD}
${LIGHT}
uniform vec3 uFloor;
uniform vec3 uGrid;
varying vec3 vWorld;
// Antialiased lines, fading out where they get closer together than a few pixels, so the far floor never turns grey.
float lines(vec2 p, float every) {
  vec2 q = p / every;
  vec2 width = fwidth(q);
  vec2 g = abs(fract(q - 0.5) - 0.5) / width;
  return (1.0 - min(min(g.x, g.y), 1.0)) * (1.0 - smoothstep(0.15, 0.45, max(width.x, width.y)));
}
void main() {
  vec2 p = vWorld.xz;
  float len = length(p);
  float fade = 1.0 - smoothstep(1.6, 5.2, len);
  // Before it wakes, something under the floor: a faint ring passing out through the grid.
  float pulse = exp(-pow(len - mod(uTime * 1.1, 6.0), 2.0) * 3.0) * (1.0 - uGrow) * 0.9;
  vec3 c = uFloor * (1.0 - 0.45 * smoothstep(0.0, 5.5, len) + 0.45 * smoothstep(7.0, 14.0, len)); // dark round the creature, the canvas at the horizon
  c += uGrid * (lines(p, 0.5) * 0.45 + lines(p, 2.5) * 0.55) * fade * (1.0 + pulse);
  // The creature's shadow on the floor around it.
  float inside = bodyRadius(p / max(len, 1e-4)) - len;
  c *= 1.0 - 0.85 * smoothstep(-0.6, 0.05, inside) * uSeep;
  // The veins, drawn into the floor a pixel at a time so they stay fine and unbroken at any distance,
  // in the body's own material, lit by a normal taken across them.
  float vein = veinField(p);
  float edge = fwidth(vein);
  float cover = smoothstep(0.3 - edge, 0.3 + edge, vein);
  if (cover > 0.0) {
    float hx = veinField(p + vec2(0.006, 0.0));
    float hz = veinField(p + vec2(0.0, 0.006));
    vec3 n = normalize(vec3((vein - hx) * VEIN_HEIGHT, 0.009, (vein - hz) * VEIN_HEIGHT)); // a little softer than true, so they catch less of the rim
    c = mix(c, shade(n, normalize(cameraPosition - vWorld), 0.85), cover);
  }
  gl_FragColor = vec4(c, 1.0);
}
`;

const FINISH = {
  uniforms: {
    tDiffuse: { value: null },
    uRes: { value: new Vector2(1, 1) },
    uTime: { value: 0 },
    uAberration: { value: POST.aberration },
    uVignette: { value: POST.vignette },
    uGrain: { value: POST.grain },
  },
  vertexShader: /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`,
  fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uRes;
uniform float uTime;
uniform float uAberration;
uniform float uVignette;
uniform float uGrain;
varying vec2 vUv;
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
void main() {
  vec2 c = vUv - 0.5;
  vec2 shift = c * dot(c, c) * uAberration * 4.0;
  vec3 col = vec3(texture2D(tDiffuse, vUv + shift).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - shift).b);
  float r = length(c * vec2(uRes.x / uRes.y, 1.0));
  col *= mix(1.0 - uVignette, 1.0, smoothstep(0.95, 0.2, r));
  // Grain at 24 fps, from the frame's time, so a render to video comes out the same every time.
  float n = hash(vUv * uRes + floor(uTime * 24.0) * vec2(37.0, 17.0)) - 0.5;
  col += n * uGrain * (0.06 + col);
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
`,
};

/* --- The engine ----------------------------------------------------------- */

/** Everything a frame depends on. The same frame always renders the same picture. */
export type SymbioteFrame = {
  /** Seconds on the field's clock: noise, breathing, the orbit and the grain all run on it. */
  time: number;
  /** Where the awakening stands, 0 (the empty floor) to 1 (awake). */
  progress: number;
  /** The pointer on the floor, in world units, and how present it is (0 gone, 1 here). */
  pointer: { x: number; z: number; presence: number };
  /** 1 attract, −1 repel; values between swing the needles from one to the other. */
  mode: number;
};

export type SymbioteEngine = {
  render: (frame: SymbioteFrame) => void;
  /** Sizes the canvas's drawing buffer, in CSS pixels at a density. */
  resize: (width: number, height: number, density: number) => void;
  /** The floor point under a position on the canvas (−1 to 1 each way), through the last frame's camera. */
  pick: (x: number, y: number) => { x: number; z: number } | null;
  dispose: () => void;
};

/** Seeded, so every field grows the same needles in the same places. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Roots on two sunflower spirals: four in five on the body, the rest out along the veins. */
function roots(count: number) {
  const random = mulberry32(7);
  const data = new Float32Array(count * 4);
  const golden = Math.PI * (3 - Math.sqrt(5));
  const inner = Math.round(count * 0.8);
  for (let i = 0; i < count; i++) {
    const onBody = i < inner;
    const k = onBody ? i : i - inner;
    const n = onBody ? inner : count - inner;
    const radius = (onBody ? 2.05 : 4.7) * Math.sqrt((k + 0.5) / n);
    const angle = k * golden + (onBody ? 0 : 1.3);
    const jitter = 0.35 * (onBody ? 2.05 : 4.7) / Math.sqrt(n);
    data[i * 4] = radius * Math.cos(angle) + (random() - 0.5) * jitter;
    data[i * 4 + 1] = radius * Math.sin(angle) + (random() - 0.5) * jitter;
    data[i * 4 + 2] = random();
    data[i * 4 + 3] = random();
  }
  return data;
}

/** Where the camera stands for a frame: the isometric drawing, easing into an orbiting perspective as it wakes. */
function placeCamera(camera: PerspectiveCamera, time: number, wake: number, aspect: number) {
  const rad = Math.PI / 180;
  const fov = lerp(CAMERA.isoFov, CAMERA.freeFov, wake);
  const elevation = (lerp(CAMERA.isoElevation, CAMERA.freeElevation, wake) + wake * 2.5 * Math.sin(time * 0.13)) * rad;
  const azimuth = (CAMERA.isoAzimuth + wake * (CAMERA.orbit + CAMERA.sway * Math.sin(time * CAMERA.swayRate))) * rad;
  // The half-height of the view at the target, wide enough that the floor fills a narrow screen too.
  const half = Math.max(lerp(2.35, 2.1, wake), lerp(3.7, 3.2, wake) / aspect);
  // A dolly zoom: as the lens widens the camera comes in, so the creature stays the same size on screen.
  const distance = half / Math.tan((fov * rad) / 2);
  const target = new Vector3(0, lerp(0, 0.22, wake), 0);
  camera.fov = fov;
  camera.aspect = aspect;
  camera.near = Math.max(0.1, distance - 14);
  camera.far = distance + 48;
  camera.position.set(
    target.x + distance * Math.cos(elevation) * Math.cos(azimuth),
    target.y + distance * Math.sin(elevation),
    target.z + distance * Math.cos(elevation) * Math.sin(azimuth),
  );
  camera.lookAt(target);
  camera.updateProjectionMatrix();
}

/**
 * Plain Three.js, no React: the field on a canvas you give it. Each call to
 * `render` draws one frame from its inputs alone, so it can run live,
 * scrubbed or offline, a frame at a time, to video.
 */
export function createSymbiote(canvas: HTMLCanvasElement, { needles = NEEDLES } = {}): SymbioteEngine {
  const renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" });
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(new Color(PALETTE.floor), 1);

  const uniforms = {
    uTime: { value: 0 },
    uSeep: { value: 0 },
    uGrow: { value: 0 },
    uBreath: { value: 0 },
    uTendril: { value: 0 },
    uErupt: { value: 0 },
    uPointer: { value: new Vector3() },
    uMode: { value: 1 },
    uReach: { value: POINTER.reach },
    uRim: { value: new Color(PALETTE.rim) },
    uSheen: { value: new Color(PALETTE.sheen) },
    uFloor: { value: new Color(PALETTE.floor) },
    uGrid: { value: new Color(PALETTE.grid) },
  };
  // One uniforms object for every material, so a frame is written once.
  const material = (vertexShader: string, fragmentShader: string) => new ShaderMaterial({ uniforms, vertexShader, fragmentShader });

  const scene = new Scene();
  const camera = new PerspectiveCamera();

  const floorGeometry = new PlaneGeometry(EXTENT * 8, EXTENT * 8).rotateX(-Math.PI / 2); // past the horizon, so it has no edge
  const floor = new Mesh(floorGeometry, material(FLOOR_VERTEX, FLOOR_FRAGMENT));
  floor.position.y = -0.004;

  const bodyGeometry = new PlaneGeometry(EXTENT, EXTENT, SEGMENTS, SEGMENTS).rotateX(-Math.PI / 2);
  const body = new Mesh(bodyGeometry, material(BODY_VERTEX, BODY_FRAGMENT));

  // An open cone, root at 0 and tip at 1: ten vertices a needle.
  const needleGeometry = new ConeGeometry(1, 1, 4, 1, true).translate(0, 0.5, 0);
  needleGeometry.setAttribute("aRoot", new InstancedBufferAttribute(roots(needles), 4));
  const bristle = new InstancedMesh(needleGeometry, material(NEEDLE_VERTEX, NEEDLE_FRAGMENT), needles);

  // Every vertex is placed in a shader, so the CPU's bounds mean nothing.
  for (const mesh of [floor, body, bristle]) {
    mesh.frustumCulled = false;
    scene.add(mesh);
  }

  const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  const bloom = new UnrealBloomPass(new Vector2(1, 1), POST.bloom.strength, POST.bloom.radius, POST.bloom.threshold);
  const finish = new ShaderPass(FINISH);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(bloom);
  composer.addPass(finish);
  composer.addPass(new OutputPass());

  let size = { width: 1, height: 1 };
  const raycaster = new Raycaster();
  const surface = new Plane(new Vector3(0, 1, 0), -0.25); // about the height of the body's skin

  return {
    render({ time, progress, pointer, mode }) {
      const phase = awakening(progress);
      uniforms.uTime.value = time;
      uniforms.uSeep.value = phase.seep;
      uniforms.uGrow.value = phase.grow;
      uniforms.uBreath.value = phase.breath;
      uniforms.uTendril.value = phase.tendril;
      uniforms.uErupt.value = phase.erupt;
      // The pointer means nothing to it until it has grown.
      uniforms.uPointer.value.set(pointer.x, pointer.z, pointer.presence * phase.grow);
      uniforms.uMode.value = Math.max(-1, Math.min(1, mode));
      finish.uniforms.uTime.value = time;
      placeCamera(camera, time, phase.camera, size.width / size.height);
      composer.render();
    },
    resize(width, height, density) {
      size = { width: Math.max(1, width), height: Math.max(1, height) };
      renderer.setPixelRatio(density);
      renderer.setSize(size.width, size.height, false);
      composer.setPixelRatio(density);
      composer.setSize(size.width, size.height);
      finish.uniforms.uRes.value.set(size.width * density, size.height * density);
    },
    pick(x, y) {
      raycaster.setFromCamera(new Vector2(x, y), camera);
      const hit = raycaster.ray.intersectPlane(surface, new Vector3());
      return hit ? { x: hit.x, z: hit.z } : null;
    },
    dispose() {
      for (const mesh of [floor, body, bristle]) (mesh.material as ShaderMaterial).dispose();
      floorGeometry.dispose();
      bodyGeometry.dispose();
      needleGeometry.dispose();
      bristle.dispose();
      composer.dispose();
      target.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

/* --- SymbioteField: the component ----------------------------------------- */

export type SymbioteMode = "attract" | "repel";

export type SymbioteHandle = {
  /** Back to the empty floor, and the awakening plays again. */
  replay: () => void;
  /** Jump the awakening to a point (0 to 1) and play on from there. */
  seek: (progress: number) => void;
};

type SymbioteFieldProps = {
  /** Needles lean toward the pointer and the mass reaches for it, or both shy away. */
  mode?: SymbioteMode;
  /** Where the awakening stands, 0 to 1: set it to scrub, or to drive it from scroll. Leave it out and it plays by itself. */
  progress?: number;
  /** Uncontrolled, it holds the empty floor until this turns true. */
  awake?: boolean;
  /** Hold the clock. The pointer is still felt. */
  paused?: boolean;
  /** Skip the awakening and hold a still frame of it awake. Defaults to the viewer's setting. */
  reducedMotion?: boolean;
  needles?: number;
  /** The awakening has played through by itself. */
  onAwake?: () => void;
  /** Every frame, with its progress and time. For writing a readout, never for React state. */
  onFrame?: (progress: number, time: number) => void;
  /** Said to screen readers; nothing is printed on the canvas. */
  label?: string;
  ref?: Ref<SymbioteHandle>;
  className?: string;
};

/**
 * The field, live: a canvas the size of its box (at up to 1.5× for dense
 * displays) that keeps the clock and the pointer's springs and hands each
 * frame to the engine. It only runs while on screen.
 */
export function SymbioteField({
  mode = "attract",
  progress,
  awake = true,
  paused = false,
  reducedMotion,
  needles = NEEDLES,
  onAwake,
  onFrame,
  label = "A dark, glossy mass that wakes on an empty floor, spreads its veins and grows needles that follow the pointer.",
  ref,
  className = "",
}: SymbioteFieldProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  // Bridges from React props into the frame loop, so a change never restarts it.
  const live = useRef({ mode, progress, awake, paused, reducedMotion, onAwake, onFrame });
  const kick = useRef(() => {});
  const seek = useRef((progress: number) => void progress);

  useEffect(() => {
    live.current = { mode, progress, awake, paused, reducedMotion, onAwake, onFrame };
    kick.current();
  });

  useImperativeHandle(ref, () => ({ replay: () => seek.current(0), seek: (p) => seek.current(p) }), []);

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
      return () => canvas.remove(); // no WebGL: the host's own background shows
    }

    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const s = {
      clock: 0,
      wokeAt: null as number | null, // the clock when the awakening began
      told: false,
      // The pointer on the floor and its spring.
      x: 0, z: 0, vx: 0, vz: 0, tx: 0, tz: 0,
      presence: 0, present: 0,
      mode: live.current.mode === "repel" ? -1 : 1,
      visible: false,
      raf: 0,
      last: 0,
    };
    const reduced = () => live.current.reducedMotion ?? media.matches;

    function step(dt: number) {
      const L = live.current;
      const still = reduced();
      if (!L.paused && !still) s.clock += dt;
      // The pointer's spring, in fixed steps so it is the same at any frame rate.
      const k = POINTER.stiffness, c = 2 * Math.sqrt(k);
      for (let left = dt; left > 0; left -= 1 / 240) {
        const h = Math.min(left, 1 / 240);
        s.vx += (k * (s.tx - s.x) - c * s.vx) * h;
        s.vz += (k * (s.tz - s.z) - c * s.vz) * h;
        s.x += s.vx * h;
        s.z += s.vz * h;
      }
      s.presence += (s.present - s.presence) * (1 - Math.exp(-dt * (s.present > s.presence ? POINTER.notice : POINTER.relax)));
      const want = L.mode === "repel" ? -1 : 1;
      s.mode += (want - s.mode) * (1 - Math.exp(-dt * POINTER.modeRate));
    }

    function progressNow() {
      const L = live.current;
      if (L.progress !== undefined) return clamp01(L.progress);
      if (reduced()) return 1;
      if (!L.awake) {
        s.wokeAt = null;
        s.told = false;
        return 0;
      }
      s.wokeAt ??= s.clock;
      const p = clamp01((s.clock - s.wokeAt) / DURATION);
      if (p === 1 && !s.told) {
        s.told = true;
        L.onAwake?.();
      }
      return p;
    }

    function draw() {
      const p = progressNow();
      const time = reduced() ? STILL_TIME : s.clock;
      engine.render({ time, progress: p, pointer: { x: s.x, z: s.z, presence: s.presence }, mode: s.mode });
      live.current.onFrame?.(p, time);
    }

    /** Still, or paused: the loop runs only until the pointer's springs have settled. */
    function settled() {
      if (!reduced() && !live.current.paused) return false;
      return Math.abs(s.present - s.presence) < 0.002 && Math.hypot(s.vx, s.vz) < 0.002 && Math.abs(s.tx - s.x) + Math.abs(s.tz - s.z) < 0.002 && Math.abs(Math.abs(s.mode) - 1) < 0.002;
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
    seek.current = (to) => {
      s.wokeAt = s.clock - clamp01(to) * DURATION;
      s.told = to >= 1;
      start();
    };

    function aim(e: PointerEvent) {
      const rect = canvas.getBoundingClientRect();
      const hit = engine.pick(((e.clientX - rect.left) / rect.width) * 2 - 1, -(((e.clientY - rect.top) / rect.height) * 2 - 1));
      if (!hit) return;
      // Arriving, it is noticed where it is, not dragged in from wherever it last left.
      if (s.presence < 0.05) {
        s.x = hit.x;
        s.z = hit.z;
        s.vx = s.vz = 0;
      }
      s.tx = hit.x;
      s.tz = hit.z;
      s.present = 1;
      start();
    }
    const leave = () => {
      s.present = 0;
      start();
    };
    host.addEventListener("pointermove", aim);
    host.addEventListener("pointerdown", aim);
    host.addEventListener("pointerleave", leave);
    host.addEventListener("pointercancel", leave);

    const resize = new ResizeObserver(() => {
      const rect = host.getBoundingClientRect();
      engine.resize(rect.width, rect.height, Math.min(devicePixelRatio, 1.5));
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
      seek.current = () => {};
      resize.disconnect();
      visibility.disconnect();
      host.removeEventListener("pointermove", aim);
      host.removeEventListener("pointerdown", aim);
      host.removeEventListener("pointerleave", leave);
      host.removeEventListener("pointercancel", leave);
      engine.dispose();
      canvas.remove();
    };
  }, [needles]);

  return <div ref={hostRef} role="img" aria-label={label} className={`block size-full touch-pan-y bg-[#0b0b0e] ${className}`} />;
}

/* --- Demo: the creature behind glass, its readout and three keys ---------- */

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");
const sink = "group-active/key:translate-y-[2px] group-active/key:shadow-(--device-key-shadow-pressed) group-active/key:duration-75";
const face = "relative grid h-[2.75em] place-items-center rounded-[0.7em] text-(--device-key-ink) [background:var(--device-key-face)] shadow-(--device-key-shadow) transition-[transform,box-shadow] duration-(--duration-exit) ease-out";
const legend = "mt-[0.4em] text-[0.72em] font-medium uppercase leading-none tracking-[0.03em] [text-shadow:var(--device-engrave)]";
const MODES: { value: SymbioteMode; name: string }[] = [
  { value: "attract", name: "Attract" },
  { value: "repel", name: "Repel" },
];
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Writes seconds into the clock as seconds and frames at 25 fps, touching only the figures that change. */
function paintClock(el: HTMLElement | null, seconds: number) {
  if (!el) return;
  const frames = Math.floor(seconds * 25);
  const figures = el.querySelectorAll("[data-figure]");
  [Math.floor(frames / 25) % 100, frames % 25].forEach((n, i) => {
    const text = String(n).padStart(2, "0");
    if (figures[i] && figures[i].textContent !== text) figures[i].textContent = text;
  });
}

type Phase = "asleep" | "waking" | "awake";

export default function Demo() {
  const [mode, setMode] = useState<SymbioteMode>("attract");
  const [phase, setPhase] = useState<Phase>("asleep");
  const [said, setSaid] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<HTMLParagraphElement>(null);
  const field = useRef<SymbioteHandle>(null);

  // Power up: it wakes by itself unless the host's tape is stopped; then it waits for PLAY.
  // Reduced motion skips the awakening, so it is awake from the first frame.
  const powerUp = useEffectEvent(() => {
    if (phase !== "asleep") return;
    if (reducedMotion()) return setPhase("awake");
    if (hostTransport(rootRef.current) === "stop") return;
    setPhase("waking");
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

  function wake() {
    if (reducedMotion()) return;
    field.current?.replay();
    setPhase("waking");
    setSaid("Waking");
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
  const word = { asleep: "Asleep", waking: "Waking", awake: "Awake" }[phase];

  return (
    <div ref={rootRef} className="@container w-full max-w-[480px] select-none">
      <div data-part="plate" className="relative isolate animate-enter overflow-hidden rounded-[1.25em] p-[0.9em] text-[clamp(11px,4cqw,14px)] [background:var(--device-body)] shadow-[var(--device-body-edge),0_1px_2px_rgb(0_0_0/0.06),0_16px_32px_-18px_rgb(0_0_0/0.3)] @[26rem]:p-[1.1em]">
        <div aria-hidden className="device-grain pointer-events-none absolute inset-0 -z-10 rounded-[inherit]" />

        {/* The window: the creature behind black glass. */}
        <div data-part="bezel" className="rounded-[0.7em] bg-(--device-rim) p-[0.3em] shadow-[0_1px_0_rgb(255_255_255/0.7),inset_0_1px_2px_rgb(0_0_0/0.6)] dark:shadow-[0_1px_0_rgb(255_255_255/0.06),inset_0_1px_2px_rgb(0_0_0/0.6)]">
          <div data-part="screen" className="relative aspect-[4/3] rounded-[0.45em] bg-[#0b0b0e] @[26rem]:aspect-[16/10]">
            <span className="absolute inset-0 overflow-hidden rounded-[inherit]">
              <SymbioteField ref={field} mode={mode} awake={phase !== "asleep"} onAwake={() => setPhase("awake")} onFrame={(p) => paintClock(clockRef.current, p * DURATION)} />
            </span>
            <span aria-hidden data-part="glass" className="pointer-events-none absolute inset-0 rounded-[inherit] [background:var(--screen-glass)] shadow-(--device-lcd-edge)" />
          </div>
        </div>

        {/* Narrow, the readout takes a row of its own; wider, it shares one with the keys. */}
        <div className="mt-[0.7em] grid grid-cols-[minmax(0,1fr)_auto] items-center gap-[0.55em] @[26rem]:grid-cols-[minmax(0,1fr)_auto_auto]">
          {/* The readout: the state, and how far into the awakening it is. */}
          <div data-part="well" className="col-span-2 rounded-[1.05em] bg-(--device-well) p-[0.35em] shadow-(--device-recess) @[26rem]:col-span-1">
            <div aria-hidden data-part="lcd" className="flex h-[2.05em] items-center justify-between gap-[0.6em] rounded-[0.7em] px-[0.6em] text-(--device-lcd-ink) [background:var(--device-lcd)] shadow-(--device-lcd-edge)">
              <span data-part="chip" className="inline-flex shrink-0 items-center gap-[0.35em] rounded-[0.4em] bg-white px-[0.42em] py-[0.24em] text-black">
                {phase === "waking" ? (
                  <span className="size-[0.55em] animate-pulse rounded-full bg-(--device-rec) motion-reduce:animate-none drawn:bg-(--device-rec)!" />
                ) : phase === "awake" ? (
                  <span className="size-[0.55em] rounded-full bg-black drawn:bg-(--device-draw-ink)!" />
                ) : (
                  <span className="size-[0.5em] rounded-[1px] bg-current drawn:bg-(--device-draw-ink)!" />
                )}
                <span className="text-[0.58em] font-semibold uppercase leading-none tracking-[0.02em]">{word}</span>
              </span>
              <p ref={clockRef} className="flex items-baseline whitespace-nowrap text-[1.25em] font-light leading-none tracking-[-0.03em] tabular-nums">
                <span data-figure>00</span>
                <span className="ml-[0.1em] mr-[0.45em] text-[0.42em] font-normal text-(--device-lcd-dim)">S</span>
                <span data-figure>00</span>
                <span className="ml-[0.1em] text-[0.42em] font-normal text-(--device-lcd-dim)">F</span>
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

          {/* Wake: back to the empty floor, and it wakes again. Its light fires while it does. */}
          <button type="button" data-sound="key" data-part="key" onPointerDown={quiet} onClick={wake} className="group/key w-[4.6em] min-w-0 rounded-[0.7em] outline-offset-2">
            <span className={cx(face, sink)}>
              <span
                aria-hidden
                data-part="light"
                className={cx(
                  "absolute left-1/2 top-[0.42em] h-[0.22em] w-[1.9em] -translate-x-1/2 rounded-full transition-[background-color]",
                  phase === "waking" ? "bg-(--device-rec) shadow-[0_0_0.45em_var(--device-rec)] duration-0 drawn:bg-(--device-rec)!" : "bg-(--device-meter-off) duration-(--duration-exit)",
                )}
              />
              <span data-part="lettering" className={legend}>
                Wake
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
