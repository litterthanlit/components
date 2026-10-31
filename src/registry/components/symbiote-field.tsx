"use client";

import { useEffect, useEffectEvent, useImperativeHandle, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type Ref } from "react";
import { Color, DoubleSide, InstancedBufferAttribute, InstancedMesh, OrthographicCamera, Plane, PlaneGeometry, Raycaster, Scene, ShaderMaterial, Vector2, Vector3, WebGLRenderer } from "three";
import { focusQuietly } from "@/design-system";
import { hostTransport, play } from "@/lib/sound";

/*
 * Needle Field, alive, drawn in ink. Blank paper in true isometric (35.264°
 * up, 45° round), and then a needle springs up at the centre, then a ring
 * round it, then the next, until a mound of bristles stands on the page.
 * It breathes. A wave runs across it. And it notices you: the needles lean
 * toward the pointer and reach for it (attract), or bend away and duck
 * (repel), and settle back slowly when it leaves.
 *
 * It is drawn as a cartoon is: every needle one pen stroke, tapering to a
 * point, a little bent, and redrawn eight times a second with a slightly
 * different wobble, so the lines boil the way hand-drawn animation does.
 * Nothing else is on the page: no floor, no shading, black on white.
 *
 * Each frame is a pure function of its time, the awakening's progress (0 to
 * 1), the pointer on the floor and the mode. The component keeps only the
 * clock and the pointer's spring, so the same frame can be scrubbed, played
 * on scroll or rendered offline to video, identically every time.
 *
 * All of it runs on the GPU. The needles are one InstancedMesh of ribbons;
 * each instance finds its height, its bend, its lean and its spring in the
 * vertex shader, projects its curve and widens it in screen pixels, so the
 * pen keeps its width at any size. Reduced motion skips the awakening and
 * holds one drawing of it awake; the needles still lean for a pointer.
 */

/* --- Tunable constants ---------------------------------------------------- */

/** Seconds the awakening takes, from the blank page to the last needle landing. */
export const DURATION = 6;
/** Needles on the page by default. More reads as fur; fewer, as a doodle. */
export const NEEDLES = 1200;

const RADIUS = 3.2; // world units: how far the bristles spread
const SEGMENTS = 6; // along each stroke, enough for its bend to read as a curve

const INK = {
  ink: "#0a0a0a",
  paper: "#ffffff",
  width: 1.7, // CSS pixels at the root; strokes taper to a point
  boil: 8, // redraws a second
  wobble: 0.022, // world units each redraw can move a tip or a bend
};

const POINTER = {
  reach: 0.85, // world units: how far the lean carries (σ of a Gaussian)
  stiffness: 34, // the spring that carries its position: a little under a second to arrive
  notice: 2.4, // 1/s: how fast it notices a pointer arriving
  relax: 0.9, // 1/s: and how slowly it lets go
  modeRate: 5, // 1/s: from leaning in to ducking away
};

/** A frame of reduced motion: awake, mid-breath. */
const STILL_TIME = 9.3;

/* --- The timeline --------------------------------------------------------- */

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const span = (p: number, from: number, to: number) => clamp01((p - from) / (to - from));
const smooth = (x: number) => x * x * (3 - 2 * x);

/** The awakening's phases at one point of its progress, each 0 to 1. */
export function awakening(progress: number) {
  const p = clamp01(progress);
  return {
    /** How far out the waves of needles have travelled. Each needle springs up as its wave arrives. */
    sprout: span(p, 0.05, 0.85),
    /** The mound rising in the middle as it fills in. */
    swell: smooth(span(p, 0.2, 1)),
  };
}

/* --- Shaders -------------------------------------------------------------- */

const NEEDLE_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uBoil;      // the time, held to the redraws
uniform float uSprout;
uniform float uSwell;
uniform float uSeconds;   // the awakening's length, for the springs
uniform vec3 uPointer;    // xy: the pointer on the floor (world x, z); z: how present it is
uniform float uMode;      // 1 attract, −1 repel, between while it swings
uniform float uReach;
uniform float uWobble;
uniform float uWidth;     // device pixels
uniform vec2 uRes;        // device pixels
attribute vec4 aRoot;     // xy: where it stands; zw: two random numbers of its own

float hash(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}
vec3 jitter(float salt) {
  vec3 k = vec3(aRoot.z * 91.7, aRoot.w * 53.3, uBoil * 8.0 + salt);
  return vec3(hash(k), hash(k + 17.0), hash(k + 41.0)) - 0.5;
}

void main() {
  vec2 p = aRoot.xy;
  float len = length(p);
  float edge = len / ${RADIUS.toFixed(1)};

  // The waves: ring after ring from the centre, each needle a little early or late in its ring.
  float ring = floor(len * 2.6) / 2.6;
  float arrive = mix(len, ring, 0.7) / ${RADIUS.toFixed(1)} + aRoot.z * 0.05;
  float since = (uSprout - arrive) * uSeconds * 0.8; // seconds since its wave arrived
  if (since <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; } // not up yet: off the page
  // A cartoon spring: it shoots up past its height, and wobbles down onto it.
  float rise = 1.0 - exp(-5.5 * since) * cos(13.0 * since);

  // The mound: tall in the middle, short at the edge, breathing in a ring that travels out.
  float mound = pow(1.0 - smoothstep(0.0, 1.0, edge), 1.2);
  float height = (0.07 + 0.07 * aRoot.w + (0.12 + 0.95 * mound) * uSwell) * (1.0 - 0.3 * smoothstep(0.85, 1.0, edge));
  height *= 1.0 + 0.07 * sin(uTime * 1.3 - len * 1.4);

  // The idle wave that crosses it, and a sway of its own.
  vec2 across = vec2(0.83, 0.56);
  float wave = sin(dot(p, across) * 2.4 - uTime * 1.1);
  vec2 lean = across * wave * 0.12 + 0.05 * vec2(sin(uTime * 0.9 + aRoot.z * 40.0), cos(uTime * 0.7 + aRoot.w * 40.0));
  lean += p / max(len, 0.3) * 0.18 * edge; // the edge splays out a little, like a brush

  // The pointer: lean in and reach for it, or bend away and duck.
  vec2 toward = uPointer.xy - p;
  float d = length(toward);
  float near = uPointer.z * exp(-d * d / (uReach * uReach));
  lean += toward / max(d, 1e-3) * near * smoothstep(0.0, 0.25, d) * (1.3 * max(uMode, 0.0) + 1.6 * min(uMode, 0.0));
  height *= 1.0 + near * (0.4 * max(uMode, 0.0) - 0.5 * max(-uMode, 0.0));
  height *= rise;

  // The stroke: a curve from the root, up, then over toward its tip, each redraw a little different.
  vec3 root = vec3(p.x, 0.0, p.y) + jitter(1.0) * vec3(1.0, 0.0, 1.0) * uWobble * 0.4;
  vec3 tip = root + vec3(lean.x, 1.0, lean.y) * height + jitter(2.0) * uWobble;
  vec3 bend = root + vec3(lean.x * 0.15, 0.62, lean.y * 0.15) * height + jitter(3.0) * uWobble * 0.8;

  float s = position.y + 0.5;
  float s2 = min(s + 0.02, 1.0);
  vec3 at = mix(mix(root, bend, s), mix(bend, tip, s), s);
  vec3 ahead = mix(mix(root, bend, s2), mix(bend, tip, s2), s2);
  if (s2 == s) ahead = at + (tip - bend);

  // Widen it in screen pixels, across its own direction on the page, so the pen is the same at any size.
  vec4 clip = projectionMatrix * viewMatrix * vec4(at, 1.0);
  vec4 next = projectionMatrix * viewMatrix * vec4(ahead, 1.0);
  vec2 dir = (next.xy / next.w - clip.xy / clip.w) * uRes;
  dir = length(dir) > 1e-5 ? normalize(dir) : vec2(0.0, 1.0);
  float pen = uWidth * (1.0 - 0.8 * pow(s, 1.6)) * (0.85 + 0.3 * hash(vec3(aRoot.zw * 13.0, uBoil)));
  clip.xy += vec2(-dir.y, dir.x) * position.x * pen / uRes * 2.0 * clip.w;
  gl_Position = clip;
}
`;

const NEEDLE_FRAGMENT = /* glsl */ `
uniform vec3 uInk;
void main() { gl_FragColor = vec4(uInk, 1.0); }
`;

/* --- The engine ----------------------------------------------------------- */

/** Everything a frame depends on. The same frame always draws the same picture. */
export type SymbioteFrame = {
  /** Seconds on the field's clock: breathing, the wave, the sway and the boil all run on it. */
  time: number;
  /** Where the awakening stands, 0 (the blank page) to 1 (awake). */
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
  /** The floor point under a position on the canvas (−1 to 1 each way). */
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

/** Roots on a sunflower spiral, nudged off it so the rows don't read as a pattern. */
function roots(count: number) {
  const random = mulberry32(7);
  const data = new Float32Array(count * 4);
  const golden = Math.PI * (3 - Math.sqrt(5));
  const spacing = RADIUS / Math.sqrt(count);
  for (let i = 0; i < count; i++) {
    const radius = RADIUS * Math.sqrt((i + 0.5) / count);
    const angle = i * golden;
    data[i * 4] = radius * Math.cos(angle) + (random() - 0.5) * spacing * 0.7;
    data[i * 4 + 1] = radius * Math.sin(angle) + (random() - 0.5) * spacing * 0.7;
    data[i * 4 + 2] = random();
    data[i * 4 + 3] = random();
  }
  return data;
}

/**
 * Plain Three.js, no React: the field on a canvas you give it. Each call to
 * `render` draws one frame from its inputs alone, so it can run live,
 * scrubbed or offline, a frame at a time, to video.
 */
export function createSymbiote(canvas: HTMLCanvasElement, { needles = NEEDLES } = {}): SymbioteEngine {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setClearColor(new Color(INK.paper), 1);

  const uniforms = {
    uTime: { value: 0 },
    uBoil: { value: 0 },
    uSprout: { value: 0 },
    uSwell: { value: 0 },
    uSeconds: { value: DURATION },
    uPointer: { value: new Vector3() },
    uMode: { value: 1 },
    uReach: { value: POINTER.reach },
    uWobble: { value: INK.wobble },
    uWidth: { value: INK.width },
    uRes: { value: new Vector2(1, 1) },
    uInk: { value: new Color(INK.ink) },
  };

  // True isometric: an orthographic camera down the diagonal, 35.264° up and 45° round.
  const camera = new OrthographicCamera();
  camera.position.set(20, 20, 20);
  camera.lookAt(0, 0.35, 0);
  camera.near = 1;
  camera.far = 80;

  // A ribbon, its spine along y from −0.5 (root) to 0.5 (tip), widened in the shader.
  const geometry = new PlaneGeometry(1, 1, 1, SEGMENTS);
  geometry.setAttribute("aRoot", new InstancedBufferAttribute(roots(needles), 4));
  const material = new ShaderMaterial({ uniforms, vertexShader: NEEDLE_VERTEX, fragmentShader: NEEDLE_FRAGMENT, side: DoubleSide, depthTest: false, depthWrite: false });
  const strokes = new InstancedMesh(geometry, material, needles);
  strokes.frustumCulled = false; // every vertex is placed in the shader
  const scene = new Scene();
  scene.add(strokes);

  let size = { width: 1, height: 1 };
  const raycaster = new Raycaster();
  const floor = new Plane(new Vector3(0, 1, 0), 0);

  return {
    render({ time, progress, pointer, mode }) {
      const phase = awakening(progress);
      uniforms.uTime.value = time;
      uniforms.uBoil.value = Math.floor(time * INK.boil) / INK.boil;
      uniforms.uSprout.value = phase.sprout;
      uniforms.uSwell.value = phase.swell;
      // The pointer means nothing to it until it has grown.
      uniforms.uPointer.value.set(pointer.x, pointer.z, pointer.presence * phase.swell);
      uniforms.uMode.value = Math.max(-1, Math.min(1, mode));
      renderer.render(scene, camera);
    },
    resize(width, height, density) {
      size = { width: Math.max(1, width), height: Math.max(1, height) };
      renderer.setPixelRatio(density);
      renderer.setSize(size.width, size.height, false);
      uniforms.uRes.value.set(size.width * density, size.height * density);
      uniforms.uWidth.value = INK.width * density;
      // Frame the field: wide enough for its diamond, tall enough for the mound, whatever the shape of the box.
      const aspect = size.width / size.height;
      const half = Math.max(2.7, 4.9 / aspect);
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
      geometry.dispose();
      material.dispose();
      strokes.dispose();
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
 * The field, live: a canvas the size of its box (at up to 2× for dense
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
  label = "Ink needles that spring up on a blank page in waves, breathe, and lean toward the pointer.",
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

  return <div ref={hostRef} role="img" aria-label={label} className={`block size-full touch-pan-y bg-white ${className}`} />;
}

/* --- Demo: the field behind glass, its readout and three keys ---------- */

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

        {/* The window: the page of needles behind glass. */}
        <div data-part="bezel" className="rounded-[0.7em] bg-(--device-rim) p-[0.3em] shadow-[0_1px_0_rgb(255_255_255/0.7),inset_0_1px_2px_rgb(0_0_0/0.6)] dark:shadow-[0_1px_0_rgb(255_255_255/0.06),inset_0_1px_2px_rgb(0_0_0/0.6)]">
          <div data-part="screen" className="relative aspect-[4/3] rounded-[0.45em] bg-white @[26rem]:aspect-[16/10]">
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
