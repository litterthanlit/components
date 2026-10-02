"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

/*
 * Project cards with a live wireframe cover: a perspective camera flying
 * through an endless 3D lattice of hairlines, with glowing nodes where the
 * lines meet and dust hanging in the air. The look comes from real-time
 * graphics tools like TouchDesigner: additive light on black, depth fog,
 * feedback trails, bloom and a filmic tone curve.
 *
 * Raw WebGL 2, no libraries. The whole world is uploaded once; every frame
 * the vertex shaders wrap it around the camera, clip it at the lens and
 * project it, so the CPU only sets a few uniforms. Lines are screen-space
 * quads, nodes are point sprites that defocus near the lens. Light adds up
 * in half-float buffers, then passes for trails, a two-level bloom and a
 * composite (tone curve, lens fringing, vignette, grain) finish the frame.
 * Hover speeds the flight up and steers; a click warps forward. It stops
 * off-screen and renders one still frame under reduced motion.
 */

export type WireframeScene = "lattice" | "tunnel" | "ring" | "horizon" | "wormhole";
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
  } else if (scene === "ring") {
    // A round tunnel. Its rails twist a little each layer, a whole number of
    // rail steps per loop, so the spin wraps around seamlessly.
    const R = 3;
    const SEGMENTS = 48;
    const RAILS = 24;
    const twist = (Math.PI * 2 * 3) / (RAILS * LOOP);
    const at = (a: number, r = R) => [Math.cos(a) * r, Math.sin(a) * r] as const;
    for (let k = 0; k < LOOP; k++) {
      for (let s = 0; s < SEGMENTS; s++) {
        const a0 = (s / SEGMENTS) * Math.PI * 2;
        const a1 = ((s + 1) / SEGMENTS) * Math.PI * 2;
        const full = k % 2 === 0;
        // Odd layers only keep a few arcs, chosen in runs of six segments.
        if (full || rand(s >> 3, 0, k, 1) < 0.4) line(...at(a0), k, ...at(a1), k, full ? 1 : 0.6);
        if (k % 6 === 0) line(...at(a0, R * 0.94), k + 0.1, ...at(a1, R * 0.94), k + 0.1, 0.3);
      }
      for (let r = 0; r < RAILS; r++) {
        const a = (r / RAILS) * Math.PI * 2 + twist * k;
        if (rand(r, 0, k, 3) < 0.7) {
          const len = 0.4 + rand(r, 0, k, 7) * 0.6;
          line(...at(a), k, ...at(a + twist * len), k + len, r % 3 === 0 ? 1 : 0.4);
        }
        if (r % 2 === 0 && rand(r, 0, k, 4) < 0.6) node(...at(a), k, 0.03 + rand(r, 0, k, 5) * 0.03, 1);
      }
    }
  } else if (scene === "wormhole") {
    // A tube woven from dots: staggered rings, a whole number of them per
    // loop so it wraps seamlessly. Every sixth ring is brighter, so the tube
    // reads as bands. The shader bends, twists and ripples it.
    const R = 2.6;
    const AROUND = 72;
    const RINGS = 128;
    for (let k = 0; k < RINGS; k++) {
      const z = (k / RINGS) * LOOP;
      const bright = k % 6 === 0;
      for (let a = 0; a < AROUND; a++) {
        const t = ((a + (k % 2) * 0.5) / AROUND) * Math.PI * 2;
        node(Math.cos(t) * R, Math.sin(t) * R, z, bright ? 0.026 : 0.02, bright ? 1 : 0.45);
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
const BASE_SPEED = 0.55;

/**
 * The path tunnels follow. The camera sits on it looking down its tangent,
 * so whatever lies ahead swings left, right, up and down as you fly.
 * Mirrored in GLSL below; keep the two in step.
 */
const path = (z: number) => [
  Math.sin(z * 0.13) * 3 + Math.sin(z * 0.05 + 1.3) * 4,
  Math.sin(z * 0.1 + 0.7) * 2.2 + Math.cos(z * 0.04) * 3,
];

/** How each scene moves: path bend, surface ripple and twist per unit of depth. */
const motion: Record<WireframeScene, { bend: number; ripple: number; twist: number }> = {
  lattice: { bend: 0, ripple: 0, twist: 0 },
  tunnel: { bend: 1, ripple: 0, twist: 0 },
  ring: { bend: 0.85, ripple: 0, twist: 0 },
  horizon: { bend: 0, ripple: 0, twist: 0 },
  wormhole: { bend: 1.1, ripple: 1, twist: 0.035 },
};

const WARP = /* glsl */ `
uniform float uBend;
uniform float uRipple;
uniform float uTwist;
uniform float uTime;
uniform float uRoll;
uniform vec2 uPath0;
uniform vec2 uPathD;
vec2 path(float z) {
  return vec2(sin(z * 0.13) * 3.0 + sin(z * 0.05 + 1.3) * 4.0, sin(z * 0.1 + 0.7) * 2.2 + cos(z * 0.04) * 3.0);
}
// p.z is depth from the camera. Twist and ripple the tube around its axis,
// then bend it along the path, minus the camera's own position and heading.
vec3 warp(vec3 p) {
  float za = uCamZ + p.z;
  vec2 xy = p.xy;
  if (uRipple > 0.0 || uTwist != 0.0) {
    float r = length(xy);
    float a = atan(xy.y, xy.x) + uTwist * za;
    r *= 1.0 + uRipple * (0.12 * sin(3.0 * a + za * 0.6 - uTime * 0.9) + 0.06 * sin(7.0 * a - za * 1.3 + uTime * 1.7));
    xy = vec2(cos(a), sin(a)) * r;
  }
  xy += uBend * (path(za) - uPath0 - uPathD * p.z);
  return vec3(xy, p.z);
}
// The camera banks into turns.
vec2 roll(vec2 p) {
  float c = cos(uRoll);
  float s = sin(uRoll);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}
`;

const FOG = /* glsl */ `
uniform float uLoop;
uniform float uNear;
// Brightness by depth: fade in from the lens, fog out into the distance.
float fog(float z) {
  return smoothstep(uNear, uNear + 1.1, z) * exp(-z * 2.0 / uLoop) * (1.0 - smoothstep(uLoop * 0.72, uLoop, z));
}
`;

/**
 * Lines are quads expanded in screen space, so they stay hairline-thin at
 * any distance. Each vertex carries both ends of its segment; the shader
 * wraps depth around the loop, clips at the lens and projects.
 */
const LINE_VS = /* glsl */ `#version 300 es
layout(location = 0) in vec3 aA;
layout(location = 1) in vec3 aB;
layout(location = 2) in float aW;
layout(location = 3) in vec2 aCorner;
uniform vec2 uRes;
uniform vec2 uCam;
uniform float uCamZ;
uniform float uF;
uniform float uDpr;
${FOG}
${WARP}
out float vAlpha;
out float vDist;
out float vHalf;
void main() {
  float z1 = mod(aA.z - uCamZ, uLoop);
  vec3 a = vec3(aA.xy, z1);
  vec3 b = vec3(aB.xy, z1 + aB.z - aA.z);
  vAlpha = 0.0; vDist = 0.0; vHalf = 1.0;
  if (b.z < uNear) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
  if (a.z < uNear) a = mix(a, b, (uNear - a.z) / (b.z - a.z));
  a = warp(a);
  b = warp(b);
  vec2 pa = roll((a.xy - uCam) * uF / a.z);
  vec2 pb = roll((b.xy - uCam) * uF / b.z);
  vec2 d = pb - pa;
  float len = length(d);
  vec2 dir = len > 1e-3 ? d / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  float zm = 0.5 * (a.z + b.z);
  float w = clamp(2.4 / zm, 0.55, 1.7) * uDpr * 0.8;
  float wpx = max(w, 1.0);
  vHalf = wpx * 0.5;
  float ext = vHalf + 1.0;
  vec2 p = mix(pa, pb, aCorner.x) + nrm * aCorner.y * ext + dir * (aCorner.x * 2.0 - 1.0) * 0.5;
  vDist = aCorner.y * ext;
  // Sub-pixel lines keep a 1px footprint and lose brightness instead.
  vAlpha = fog(zm) * mix(0.4, 1.15, smoothstep(0.3, 0.8, aW)) * (w / wpx);
  gl_Position = vec4(p / (0.5 * uRes), 0.0, 1.0);
}`;

const LINE_FS = /* glsl */ `#version 300 es
precision highp float;
in float vAlpha;
in float vDist;
in float vHalf;
uniform vec3 uColor;
uniform float uGain;
out vec4 o;
void main() {
  float coverage = clamp(vHalf + 0.5 - abs(vDist), 0.0, 1.0);
  o = vec4(uColor * vAlpha * coverage * uGain, 1.0);
}`;

/** Nodes and dust are point sprites; close to the lens they defocus into bokeh. */
const POINT_VS = /* glsl */ `#version 300 es
layout(location = 0) in vec3 aP;
layout(location = 1) in float aR;
layout(location = 2) in float aW;
uniform vec2 uRes;
uniform vec2 uCam;
uniform float uCamZ;
uniform float uF;
uniform float uDpr;
uniform float uMaxPoint;
${FOG}
${WARP}
out float vAlpha;
out float vR;
out float vSoft;
out float vSize;
void main() {
  float z = mod(aP.z - uCamZ, uLoop);
  vAlpha = 0.0; vR = 0.0; vSoft = 1.0; vSize = 1.0;
  if (z < uNear + 0.05) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  vec2 p = roll((warp(vec3(aP.xy, z)).xy - uCam) * uF / z);
  float r = clamp(aR * uF / z, 0.6 * uDpr, 5.0 * uDpr);
  float blur = smoothstep(1.8, 0.45, z);
  float R = r * (1.0 + blur * 1.8);
  vSoft = 0.75 + blur * R * 0.7;
  vSize = min(uMaxPoint, 2.0 * (R + vSoft + 1.0));
  vR = R;
  // A defocused disc spreads the same light over a larger area.
  vAlpha = fog(z) * (aW > 0.5 ? 1.4 : 0.5) * mix(1.0, max(0.25, (r * r) / (R * R)), blur);
  gl_PointSize = vSize;
  gl_Position = vec4(p / (0.5 * uRes), 0.0, 1.0);
}`;

const POINT_FS = /* glsl */ `#version 300 es
precision highp float;
in float vAlpha;
in float vR;
in float vSoft;
in float vSize;
uniform vec3 uColor;
uniform float uGain;
out vec4 o;
void main() {
  float d = length(gl_PointCoord - 0.5) * vSize;
  float c = 1.0 - smoothstep(vR - vSoft, vR + 0.5, d);
  o = vec4(uColor * vAlpha * c * uGain, 1.0);
}`;

const QUAD_VS = /* glsl */ `#version 300 es
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

/** Feedback: the last frame, zoomed a touch toward you, fades into this one. */
const FEEDBACK_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uPrev;
uniform float uKeep;
uniform float uZoom;
out vec4 o;
void main() {
  vec2 prev = (vUv - 0.5) * uZoom + 0.5;
  o = texture(uScene, vUv) + texture(uPrev, prev) * uKeep;
}`;

/** A 2× downsample that averages four bilinear taps. */
const DOWN_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uTexel;
out vec4 o;
void main() {
  vec2 h = uTexel * 0.5;
  o = 0.25 * (texture(uTex, vUv + vec2(-h.x, -h.y)) + texture(uTex, vUv + vec2(h.x, -h.y)) +
              texture(uTex, vUv + vec2(-h.x, h.y)) + texture(uTex, vUv + vec2(h.x, h.y)));
}`;

/** A 9-tap Gaussian in five fetches, using bilinear filtering between taps. */
const BLUR_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uDir;
out vec4 o;
void main() {
  vec2 o1 = uDir * 1.3846153846;
  vec2 o2 = uDir * 3.2307692308;
  o = texture(uTex, vUv) * 0.2270270270
    + (texture(uTex, vUv + o1) + texture(uTex, vUv - o1)) * 0.3162162162
    + (texture(uTex, vUv + o2) + texture(uTex, vUv - o2)) * 0.0702702703;
}`;

/** Bloom, a filmic shoulder for highlights, lens fringing, vignette and grain. */
const COMPOSITE_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uAcc;
uniform sampler2D uBloomA;
uniform sampler2D uBloomB;
uniform float uBloom;
uniform float uExposure;
uniform float uFringe;
uniform float uTime;
out vec4 o;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 c = vUv - 0.5;
  float r2 = dot(c, c);
  vec2 off = c * r2 * uFringe;
  vec3 col = vec3(texture(uAcc, vUv - off).r, texture(uAcc, vUv).g, texture(uAcc, vUv + off).b);
  col += (texture(uBloomA, vUv).rgb * 0.7 + texture(uBloomB, vUv).rgb * 0.9) * uBloom;
  col = 1.0 - exp(-col * uExposure);
  col *= mix(1.0, 0.28, smoothstep(0.12, 0.5, r2));
  col += (hash(gl_FragCoord.xy + fract(uTime) * 91.7) - 0.5) * 0.035;
  o = vec4(max(col, 0.0), 1.0);
}`;

type Target = { tex: WebGLTexture; fb: WebGLFramebuffer; w: number; h: number };

function compile(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const program = gl.createProgram()!;
  for (const [type, source] of [
    [gl.VERTEX_SHADER, vs],
    [gl.FRAGMENT_SHADER, fs],
  ] as const) {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? "shader");
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "link");
  const uniforms: Record<string, WebGLUniformLocation | null> = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
  for (let n = 0; n < count; n++) {
    const name = gl.getActiveUniform(program, n)!.name;
    uniforms[name] = gl.getUniformLocation(program, name);
  }
  return { program, u: uniforms };
}

/** Upload the world into vertex arrays: four vertices per line, one per node. */
function upload(gl: WebGL2RenderingContext, world: World) {
  const { lines, nodes } = world;
  const lineCount = lines.length / 7;
  const verts = new Float32Array(lineCount * 4 * 9);
  const index = new Uint32Array(lineCount * 6);
  const corners = [0, -1, 0, 1, 1, -1, 1, 1];
  for (let l = 0; l < lineCount; l++) {
    for (let c = 0; c < 4; c++) {
      const v = (l * 4 + c) * 9;
      verts.set(lines.subarray(l * 7, l * 7 + 7), v);
      verts[v + 7] = corners[c * 2];
      verts[v + 8] = corners[c * 2 + 1];
    }
    index.set([0, 1, 2, 2, 1, 3].map((n) => l * 4 + n), l * 6);
  }

  const lineVao = gl.createVertexArray();
  gl.bindVertexArray(lineVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
  const stride = 9 * 4;
  [3, 3, 1, 2].reduce((offset, size, loc) => {
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset * 4);
    return offset + size;
  }, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, index, gl.STATIC_DRAW);

  const pointVao = gl.createVertexArray();
  gl.bindVertexArray(pointVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, nodes, gl.STATIC_DRAW);
  [3, 1, 1].reduce((offset, size, loc) => {
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 5 * 4, offset * 4);
    return offset + size;
  }, 0);

  const quadVao = gl.createVertexArray();
  gl.bindVertexArray(quadVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  return { lineVao, pointVao, quadVao, lineIndices: index.length, pointCount: nodes.length / 5 };
}

type EngineOptions = {
  wrap: HTMLElement;
  canvas: HTMLCanvasElement;
  readout: HTMLElement | null;
  scene: WireframeScene;
  tone: WireframeTone;
};

/** Returns null when WebGL 2 isn't available; the card then stays a black frame. */
export function createEngine({ wrap, canvas, readout, scene, tone }: EngineOptions) {
  const maybe = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false, premultipliedAlpha: false });
  if (!maybe || maybe.isContextLost()) return null;
  const gl: WebGL2RenderingContext = maybe;

  const ctl = { hover: false, active: false, tx: 0, ty: 0, warp: 0 };
  const world = build(scene);
  const move = motion[scene];
  const color = tones[tone].rgb.split(",").map((n) => Number(n) / 255);
  const bloomGain = tones[tone].bloom;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let W = 1;
  let H = 1;
  let dpr = 1;
  let raf = 0;
  let last = 0;
  let frame = 0;
  let time = 0;
  let camZ = 3.3;
  let speed = BASE_SPEED;
  let running = false;
  // Render scale, lowered step by step if the GPU can't hold ~35fps.
  let quality = 1;
  let slow = 0;
  const cam = { x: 0, y: 0 };

  type Resources = ReturnType<typeof setup>;
  let res: Resources | null = null;
  let targets: Record<"scene" | "accA" | "accB" | "halfA" | "halfB" | "quarterA" | "quarterB", Target> | null = null;

  function setup() {
    // Half-float targets let crossings add up past white, so bloom and the
    // tone curve have real highlights to work with. 8-bit is the fallback.
    const hdr = !!gl.getExtension("EXT_color_buffer_float");
    const programs = {
      line: compile(gl, LINE_VS, LINE_FS),
      point: compile(gl, POINT_VS, POINT_FS),
      feedback: compile(gl, QUAD_VS, FEEDBACK_FS),
      down: compile(gl, QUAD_VS, DOWN_FS),
      blur: compile(gl, QUAD_VS, BLUR_FS),
      composite: compile(gl, QUAD_VS, COMPOSITE_FS),
    };
    const range = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as Float32Array;
    return { hdr, programs, geometry: upload(gl, world), maxPoint: range[1] };
  }

  function makeTarget(w: number, h: number, hdr: boolean): Target {
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, hdr ? gl.RGBA16F : gl.RGBA8, w, h, 0, gl.RGBA, hdr ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex, fb, w, h };
  }

  function makeTargets() {
    if (!res) return;
    for (const t of Object.values(targets ?? {})) {
      gl.deleteTexture(t.tex);
      gl.deleteFramebuffer(t.fb);
    }
    const half = [Math.max(1, W >> 1), Math.max(1, H >> 1)] as const;
    const quarter = [Math.max(1, W >> 2), Math.max(1, H >> 2)] as const;
    targets = {
      scene: makeTarget(W, H, res.hdr),
      accA: makeTarget(W, H, res.hdr),
      accB: makeTarget(W, H, res.hdr),
      halfA: makeTarget(...half, res.hdr),
      halfB: makeTarget(...half, res.hdr),
      quarterA: makeTarget(...quarter, res.hdr),
      quarterB: makeTarget(...quarter, res.hdr),
    };
  }

  /** Run a full-screen pass from the given textures into a target (or the canvas). */
  function pass(p: ReturnType<typeof compile>, out: Target | null, textures: Record<string, WebGLTexture>, set?: () => void) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, out ? out.fb : null);
    gl.viewport(0, 0, out ? out.w : W, out ? out.h : H);
    gl.useProgram(p.program);
    Object.entries(textures).forEach(([name, tex], unit) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(p.u[name], unit);
    });
    set?.();
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function blur(src: Target, tmp: Target) {
    if (!res) return;
    const { blur: b } = res.programs;
    pass(b, tmp, { uTex: src.tex }, () => gl.uniform2f(b.u.uDir, 1 / src.w, 0));
    pass(b, src, { uTex: tmp.tex }, () => gl.uniform2f(b.u.uDir, 0, 1 / src.h));
  }

  function draw() {
    if (!res || !targets || gl.isContextLost()) return;
    const { programs, geometry, maxPoint } = res;
    const t = targets;
    const f = Math.min(W, H) * 0.95;
    const gain = 1 + ctl.warp * 0.6;

    // Where the path is under the camera, which way it heads, and how hard it
    // turns (the camera banks into the turn).
    const h = 0.05;
    const p0 = path(camZ);
    const pa = path(camZ - h);
    const pb = path(camZ + h);
    const pd = [(pb[0] - pa[0]) / (2 * h), (pb[1] - pa[1]) / (2 * h)];
    const roll = Math.max(-0.35, Math.min(0.35, -((pb[0] - 2 * p0[0] + pa[0]) / (h * h)) * move.bend * 6));

    // 1. The scene: additive lines, then nodes.
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.scene.fb);
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    for (const [p, vao, drawCall] of [
      [programs.line, geometry.lineVao, () => gl.drawElements(gl.TRIANGLES, geometry.lineIndices, gl.UNSIGNED_INT, 0)],
      [programs.point, geometry.pointVao, () => gl.drawArrays(gl.POINTS, 0, geometry.pointCount)],
    ] as const) {
      gl.useProgram(p.program);
      gl.uniform2f(p.u.uRes, W, H);
      gl.uniform2f(p.u.uCam, cam.x, cam.y);
      gl.uniform1f(p.u.uCamZ, camZ);
      gl.uniform1f(p.u.uF, f);
      gl.uniform1f(p.u.uDpr, dpr);
      gl.uniform1f(p.u.uLoop, LOOP);
      gl.uniform1f(p.u.uNear, NEAR);
      gl.uniform3f(p.u.uColor, color[0], color[1], color[2]);
      gl.uniform1f(p.u.uGain, gain);
      gl.uniform1f(p.u.uBend, move.bend);
      gl.uniform1f(p.u.uRipple, move.ripple);
      gl.uniform1f(p.u.uTwist, move.twist);
      gl.uniform1f(p.u.uTime, time);
      gl.uniform1f(p.u.uRoll, roll);
      gl.uniform2f(p.u.uPath0, p0[0], p0[1]);
      gl.uniform2f(p.u.uPathD, pd[0], pd[1]);
      if (p.u.uMaxPoint) gl.uniform1f(p.u.uMaxPoint, maxPoint);
      gl.bindVertexArray(vao);
      drawCall();
    }
    gl.disable(gl.BLEND);
    gl.bindVertexArray(geometry.quadVao);

    // 2. Feedback trails while warping.
    pass(programs.feedback, t.accB, { uScene: t.scene.tex, uPrev: t.accA.tex }, () => {
      gl.uniform1f(programs.feedback.u.uKeep, Math.min(0.82, ctl.warp * 0.9));
      gl.uniform1f(programs.feedback.u.uZoom, 1 - ctl.warp * 0.025);
    });
    [t.accA, t.accB] = [t.accB, t.accA];

    // 3. Bloom at half and quarter resolution.
    pass(programs.down, t.halfA, { uTex: t.accA.tex }, () => gl.uniform2f(programs.down.u.uTexel, 1 / W, 1 / H));
    blur(t.halfA, t.halfB);
    pass(programs.down, t.quarterA, { uTex: t.halfA.tex }, () => gl.uniform2f(programs.down.u.uTexel, 1 / t.halfA.w, 1 / t.halfA.h));
    blur(t.quarterA, t.quarterB);
    blur(t.quarterA, t.quarterB);

    // 4. Composite to the canvas.
    pass(programs.composite, null, { uAcc: t.accA.tex, uBloomA: t.halfA.tex, uBloomB: t.quarterA.tex }, () => {
      const u = programs.composite.u;
      gl.uniform1f(u.uBloom, bloomGain * (1 + ctl.warp));
      gl.uniform1f(u.uExposure, 1.9);
      gl.uniform1f(u.uFringe, 0.006 + ctl.warp * 0.1);
      gl.uniform1f(u.uTime, time);
    });
    gl.bindVertexArray(null);

    if (readout && frame++ % 6 === 0) {
      readout.textContent = `${scene}  z ${camZ.toFixed(1).padStart(6, "0")}  ${(speed / BASE_SPEED + ctl.warp * 30).toFixed(1)}×`;
    }
  }

  function tick(now: number) {
    raf = requestAnimationFrame(tick);
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    time += dt;
    slow = dt > 1 / 35 ? slow + 1 : Math.max(0, slow - 2);
    if (slow > 45 && quality > 0.5) {
      quality *= 0.8;
      slow = 0;
      resize();
    }
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
    dpr = Math.min(window.devicePixelRatio || 1, 2) * quality;
    W = canvas.width = Math.max(1, Math.round(rect.width * dpr));
    H = canvas.height = Math.max(1, Math.round(rect.height * dpr));
    makeTargets();
    draw();
  }

  function start() {
    running = true;
    if (raf || reduce || !res) return;
    last = 0;
    raf = requestAnimationFrame(tick);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
    raf = 0;
  }

  const onLost = (event: Event) => {
    event.preventDefault();
    const wasRunning = running;
    stop();
    running = wasRunning;
    res = null;
    targets = null;
  };
  const onRestored = () => {
    try {
      res = setup();
    } catch {
      return;
    }
    resize();
    if (running) start();
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);

  try {
    res = setup();
  } catch (error) {
    console.warn("WireframeField: WebGL setup failed", error);
    return null;
  }

  return {
    resize,
    start,
    stop,
    destroy() {
      stop();
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
    },
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
  };
}

/* ------------------------------------------------------------------------ */
/* Field                                                                     */
/* ------------------------------------------------------------------------ */

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
  const readoutRef = useRef<HTMLSpanElement>(null);
  const engine = useRef<ReturnType<typeof createEngine>>(null);
  const lastPulse = useRef(pulse);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const e = createEngine({ wrap, canvas, readout: readoutRef.current, scene, tone });
    if (!e) return;
    engine.current = e;
    e.resize();
    const ro = new ResizeObserver(() => e.resize());
    ro.observe(wrap);
    const io = new IntersectionObserver(([entry]) => (entry.isIntersecting ? e.start() : e.stop()));
    io.observe(wrap);
    return () => {
      ro.disconnect();
      io.disconnect();
      e.destroy();
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
      <canvas ref={canvasRef} className="absolute inset-0 size-full" />
      {readout && (
        <span
          ref={readoutRef}
          className="absolute left-3 top-3 whitespace-pre font-mono text-[10px] uppercase tracking-[0.14em] text-white/45 tabular-nums max-sm:hidden"
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
  /** Below the sm breakpoint, show the cover alone (the caption stays for screen readers). */
  compact?: boolean;
  className?: string;
  style?: CSSProperties;
};

export function WireframeCard({ title, description, meta, scene = "lattice", tone = "mono", featured = false, compact = false, className = "", style }: WireframeCardProps) {
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
      <div className={`pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-black/85 via-black/35 to-transparent ${featured ? "p-5 pt-16" : "p-3.5 pt-10"} ${compact ? "max-sm:sr-only" : ""}`}>
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

const covers: (Omit<WireframeCardProps, "className" | "style"> & { layout: string })[] = [
  {
    featured: true,
    title: "Lattice",
    description: "An endless mirrored grid. Hover to fly faster and steer, click to warp.",
    meta: "Mono",
    scene: "lattice",
    tone: "mono",
    layout: "col-span-4 aspect-[21/10] sm:row-span-2 sm:aspect-auto",
  },
  { title: "Tunnel", description: "A square tunnel that winds as you fly.", meta: "Mono", scene: "tunnel", tone: "mono", layout: "aspect-square sm:col-span-2 sm:aspect-[16/10]" },
  { title: "Ring", description: "A round tunnel that bends and banks into its turns.", meta: "Ice", scene: "ring", tone: "ice", layout: "aspect-square sm:col-span-2 sm:aspect-[16/10]" },
  { title: "Horizon", description: "A floor and a ceiling meeting at the horizon.", meta: "Cobalt", scene: "horizon", tone: "cobalt", layout: "aspect-square sm:col-span-3 sm:aspect-[5/2]" },
  { title: "Wormhole", description: "A winding tube of dots that ripples as you fly.", meta: "Mono", scene: "wormhole", tone: "mono", layout: "aspect-square sm:col-span-3 sm:aspect-[5/2]" },
];

export default function Demo() {
  return (
    <div className="grid w-full max-w-[720px] grid-cols-4 gap-2 sm:grid-cols-6 sm:gap-3">
      {covers.map(({ layout, ...cover }, n) => (
        <WireframeCard key={cover.title} {...cover} compact={!cover.featured} className={`animate-enter ${layout}`} style={{ animationDelay: `calc(${n} * var(--stagger))` }} />
      ))}
    </div>
  );
}
