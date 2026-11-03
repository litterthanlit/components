"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { focusQuietly } from "@/design-system";
import { hostTransport, play } from "@/lib/sound";

/*
 * A visualizer on a dot matrix, filling the plate behind a black bezel: a
 * round dot every 3 CSS px in the LCD's ink, each lit or not against a 4 × 4
 * ordered dither, over ghosts at 8%, so the grid itself always shows.
 *
 * Behind the dots is a scope in raw WebGL feedback: every frame warps and
 * fades the last under a fresh trace, and the dots show the trail. It plays
 * a beat of its own (a kick on every beat, a snare on two and four, hats on
 * the eighths, under a slow swell), and each scene has its own tempo: Halo,
 * a ring and a line pumping with the beat, at 104 BPM; Tunnel, hexagons
 * streaming outward, at 122; Prism, the trace folded six ways, at 92. A
 * press steps to the next scene and sends a ring through the trail, which
 * dissolves into the new scene rather than cutting to it. A hand backlights
 * the dots under it and quickens the beat; keyboard focus lights it from the
 * centre. The loop writes uniforms, never React state, runs only while the
 * screen is on the page, and holds a still under reduced motion.
 */

/* --- Shaders -------------------------------------------------------------- */

const VERTEX = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

/**
 * The scope, one channel of light, in red: each frame warps the last one, fades it by 7% less a step, and
 * draws a fresh trace of the beat over it, so a trail of the last second or so builds up. A ring from a
 * press is drawn into the trace, so it leaves a trail of its own.
 */
const FEEDBACK = `
precision mediump float;
uniform sampler2D uPrev;
uniform vec2 uRes;
uniform float uTime;
uniform float uKick;
uniform float uSnare;
uniform float uHat;
uniform float uEnv;
uniform float uScene;  // 0 halo, 1 tunnel, 2 prism
uniform float uDrive;  // how far the tunnel has travelled: it surges on the kick
uniform vec3 uRipple;  // xy = origin (px), z = age in seconds (<0: none)

const float TAU = 6.2831853;

mat2 turn(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

// A soft line d from its centre, never thinner than about a pixel and a half.
float glow(float d, float w) { w = max(w, 1.5 / uRes.y); return exp(-d * d / (w * w)); }

// Folds the plane into six mirrored wedges about the centre.
vec2 fold(vec2 p) {
  float sector = TAU / 6.0;
  float a = mod(atan(p.y, p.x), sector);
  a = abs(a - sector * 0.5);
  return vec2(cos(a), sin(a)) * length(p);
}

// The ring: its radius carries the music, a band per drum at its own count of lobes.
float ring(vec2 p, float base) {
  float a = atan(p.y, p.x);
  float lobes = uKick * 0.06 * sin(3.0 * a + uTime * 1.7)
              + uSnare * 0.045 * sin(7.0 * a - uTime * 4.3)
              + uHat * 0.03 * sin(19.0 * a + uTime * 8.1);
  return glow(length(p) - (base + 0.06 * uEnv + 0.05 * uKick + lobes), 0.008 + 0.006 * uKick);
}

// The line: the bands as a trace in time, quieter towards the ends.
float scope(vec2 p, float reach) {
  float y = (uKick * 0.5 * sin(p.x * 5.0 + uTime * 2.0) + uSnare * 0.3 * sin(p.x * 17.0 - uTime * 6.0) + uHat * 0.2 * sin(p.x * 41.0 + uTime * 13.0)) * 0.32;
  return glow(p.y - y, 0.007) * 0.6 * smoothstep(reach, reach * 0.4, abs(p.x));
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  // Units of the screen's shorter side, so a scene fits a tall phone's screen as it does a wide one.
  vec2 span = vec2(aspect, 1.0) / min(aspect, 1.0);
  vec2 p = (uv - 0.5) * span;
  float r = length(p);
  vec2 q;
  float trace;

  if (uScene < 0.5) {
    // Halo: the trail drifts outward, turns slowly, a little more on the snare, wavers, and pumps on the kick.
    q = turn(0.004 + 0.012 * sin(uTime * 0.21) + 0.05 * uSnare * (r - 0.25)) * p;
    q *= 0.982 - 0.03 * uKick;
    q += 0.0025 * vec2(sin(q.y * 11.0 + uTime * 1.1), cos(q.x * 9.0 - uTime * 1.3));
    trace = ring(p, 0.2) + scope(p, span.x * 0.42);
  } else if (uScene < 1.5) {
    // Tunnel: nested hexagons, evenly spaced in log radius so they read as depth, streaming outward as the
    // drive advances. Drawn, not grown from the feedback, which would smear them into a filled hexagon.
    q = turn(0.006 + 0.02 * uSnare) * p * 0.985;
    float side = TAU / 6.0;
    float a = atan(p.y, p.x) + uTime * 0.15 + uSnare * 0.2;
    float hex = cos(floor(0.5 + a / side) * side - a) * r;
    float depth = fract(log(max(hex, 0.001)) * 1.8 - uDrive);
    float shells = exp(-pow(min(depth, 1.0 - depth) / 0.045, 2.0)) * smoothstep(0.015, 0.1, hex);
    trace = shells * (0.3 + 0.9 * uKick) + glow(hex - (0.02 + 0.03 * uKick), 0.006) * uHat;
  } else {
    // Prism: the trace and its history folded six ways about the centre.
    vec2 f = fold(p);
    q = turn(0.01 + 0.03 * uSnare) * f * (0.975 - 0.025 * uKick);
    vec2 c = 0.22 * vec2(cos(uTime * 0.7), sin(uTime * 0.7));
    trace = ring(f - c, 0.04) + scope(turn(0.5) * f, 0.45);
  }
  trace *= 0.75 * (0.45 + 0.55 * uEnv);

  // A ring that widens and fades from a press.
  if (uRipple.z >= 0.0) {
    float rad = uRipple.z * uRes.y * 1.4;
    trace += smoothstep(uRes.y * 0.03, 0.0, abs(distance(gl_FragCoord.xy, uRipple.xy) - rad)) * exp(-uRipple.z * 2.2);
  }

  float last = texture2D(uPrev, q / span + 0.5).r;
  // 7% a frame, less a step, so an 8-bit trail fades all the way out instead of sticking at a glow. At 5%
  // the trail filled the screen edge to edge and the shapes were lost in it.
  last = max(0.0, last * 0.93 - 0.008);
  gl_FragColor = vec4(min(1.0, last + trace), 0.0, 0.0, 1.0);
}
`;

/**
 * The dots: each reads the light at its own centre and is lit or not against a 4 × 4 ordered dither, so
 * shades are drawn by how many dots are lit. Lit dots are the ink; unlit ones are ghosts at 8%, brighter
 * under the hand's light, as a lamp behind an LCD would make them. Between them the canvas is clear.
 */
const DOTS = `
precision mediump float;
uniform sampler2D uLight;
uniform vec2 uRes;
uniform float uPitch; // device px between dots
uniform vec3 uInk;
uniform vec2 uMouse;
uniform float uHover;

float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }

void main() {
  vec2 cell = floor(gl_FragCoord.xy / uPitch);
  vec2 centre = (cell + 0.5) * uPitch;
  float v = pow(texture2D(uLight, centre / uRes).r, 0.8);
  float lit = step(bayer4(cell) + 0.04, v);
  float r = uRes.y * 0.42;
  float m = distance(centre, uMouse);
  float light = exp(-(m * m) / (r * r)) * uHover;
  float d = length(gl_FragCoord.xy - centre);
  float disc = clamp(uPitch * 0.36 + 0.5 - d, 0.0, 1.0);
  float a = disc * mix(0.08 + 0.22 * light, 1.0, lit);
  gl_FragColor = vec4(uInk * a, a); // premultiplied
}
`;

/* --- Helpers -------------------------------------------------------------- */

const SCENES = { halo: 0, tunnel: 1, prism: 2 } as const;
export type VisualizerScene = keyof typeof SCENES;

/** Each scene's own tempo, so a change of scene is a change of groove. */
const BPM: Record<VisualizerScene, number> = { halo: 104, tunnel: 122, prism: 92 };
const WARM = 90; // frames of music run at mount, so a screen opens on a trail rather than a blank

/**
 * The beat, t seconds in: a kick on every beat, a snare on two and four and hats on the eighths, each a pulse
 * that decays through its beat, under a slow swell, so the screens play a groove with no audio at all.
 */
function beat(t: number, bpm: number) {
  const env = 0.7 + 0.25 * Math.sin(t * 0.37);
  const b = (t * bpm) / 60;
  const phase = b % 1;
  return {
    env,
    kick: Math.exp(-phase * 7) * env,
    snare: Math.floor(b) % 2 === 1 ? Math.exp(-phase * 9) * env : 0,
    hat: Math.exp(-((b * 2) % 1) * 16) * env,
  };
}

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

/* --- Visualizer ----------------------------------------------------------- */

type VisualizerProps = {
  scene?: VisualizerScene;
  /** CSS px between the matrix's dots. */
  pitch?: number;
  /** Light the field from its centre without a hand on it: keyboard focus, a selection. Turning it on sends a ring. */
  active?: boolean;
  /** Hold the scope still. The light and a ring still play out over it. */
  paused?: boolean;
  className?: string;
};

/**
 * A scope on a dot matrix: WebGL feedback ping-ponging between two textures at the canvas's resolution (up
 * to 1.5× on dense displays), shown only through round dots. Raw WebGL, no library. It draws in its CSS
 * `color` on a clear ground: set the ink with a text colour, and whatever is behind it is the ground. It only
 * animates while on screen, holds a still under reduced motion, and follows theme changes.
 */
export function Visualizer({ scene = "halo", pitch = 3, active = false, paused = false, className = "" }: VisualizerProps) {
  const hostRef = useRef<HTMLSpanElement>(null);
  // Bridges from React props into the render loop, so a change never restarts it.
  const activeRef = useRef(active);
  const pausedRef = useRef(paused);
  const sceneRef = useRef(scene);
  const wakeRef = useRef<(ring: boolean) => void>(() => {});
  const resceneRef = useRef<() => void>(() => {});

  useEffect(() => {
    pausedRef.current = paused;
    wakeRef.current(false);
  }, [paused]);

  // A new scene takes over the running trail, so it dissolves in rather than cutting.
  useEffect(() => {
    if (scene === sceneRef.current) return;
    sceneRef.current = scene;
    resceneRef.current();
  }, [scene]);

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
    // Drawn, the dots keep the LCD's light ink whichever finish the study is in (so switching finish
    // never leaves them the drawing's dark ink on dark glass), and the canvas flips them to dark ink on
    // the light ground; in dark they stay light. A touch more than the generic half opacity, as they are the screen's content.
    canvas.className = "block size-full drawn:text-(--device-lcd-ink)! drawn:opacity-70! drawn:invert! drawn:dark:invert-0!";
    host.append(canvas);
    const context = canvas.getContext("webgl", { antialias: false, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
    if (!context) return () => canvas.remove(); // Whatever is behind shows through as a quiet fallback.
    const gl = context;

    function link(fragment: string) {
      const program = gl.createProgram()!;
      gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
      gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragment));
      gl.bindAttribLocation(program, 0, "aPos");
      gl.linkProgram(program);
      return program;
    }
    const feedback = link(FEEDBACK);
    const dots = link(DOTS);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const f = (name: string) => gl.getUniformLocation(feedback, name);
    const fb = { prev: f("uPrev"), res: f("uRes"), time: f("uTime"), kick: f("uKick"), snare: f("uSnare"), hat: f("uHat"), env: f("uEnv"), scene: f("uScene"), drive: f("uDrive"), ripple: f("uRipple") };
    const d = (name: string) => gl.getUniformLocation(dots, name);
    const dp = { light: d("uLight"), res: d("uRes"), pitch: d("uPitch"), ink: d("uInk"), mouse: d("uMouse"), hover: d("uHover") };

    // The trail ping-pongs between two textures the size of the canvas.
    let targets: { texture: WebGLTexture; buffer: WebGLFramebuffer }[] = [];
    let read = 0;

    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const state = {
      time: 0,
      drive: 0,
      hover: 0,
      hoverTarget: 0,
      mouse: [0, 0] as [number, number],
      ripple: [0, 0, -1] as [number, number, number],
      visible: false,
      raf: 0,
      last: 0,
    };
    const centre = (): [number, number] => [canvas.width / 2, canvas.height / 2];

    const setInk = () => {
      gl.useProgram(dots);
      gl.uniform3fv(dp.ink, readColor(canvas, "color", [0.96, 0.96, 0.96]));
    };

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const density = Math.min(devicePixelRatio, 1.5);
      canvas.width = Math.max(1, Math.round(rect.width * density));
      canvas.height = Math.max(1, Math.round(rect.height * density));
      targets.forEach((t) => {
        gl.deleteTexture(t.texture);
        gl.deleteFramebuffer(t.buffer);
      });
      targets = [0, 1].map(() => {
        const texture = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const buffer = gl.createFramebuffer()!;
        gl.bindFramebuffer(gl.FRAMEBUFFER, buffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        return { texture, buffer };
      });
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(feedback);
      gl.uniform2f(fb.res, canvas.width, canvas.height);
      gl.uniform1i(fb.prev, 0);
      gl.useProgram(dots);
      gl.uniform2f(dp.res, canvas.width, canvas.height);
      gl.uniform1f(dp.pitch, pitch * density);
      gl.uniform1i(dp.light, 0);
      if (!state.hoverTarget) state.mouse = centre();
      // Open on a trail: a second and a half of music, run at once.
      for (let i = 0; i < WARM; i++) advance(1 / 60);
    }

    /** One step of the music and the trail. */
    function advance(dt: number) {
      state.time += dt * (1 + state.hover * 0.8); // a hand quickens the beat
      const m = beat(state.time, BPM[sceneRef.current]);
      state.drive += dt * (0.3 + 1.6 * m.kick);
      const write = 1 - read;
      gl.useProgram(feedback);
      gl.bindFramebuffer(gl.FRAMEBUFFER, targets[write].buffer);
      gl.bindTexture(gl.TEXTURE_2D, targets[read].texture);
      gl.uniform1f(fb.time, state.time);
      gl.uniform1f(fb.kick, m.kick);
      gl.uniform1f(fb.snare, m.snare);
      gl.uniform1f(fb.hat, m.hat);
      gl.uniform1f(fb.env, m.env);
      gl.uniform1f(fb.drive, state.drive);
      gl.uniform1f(fb.scene, SCENES[sceneRef.current]);
      gl.uniform3fv(fb.ripple, state.ripple);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      read = write;
    }

    /** The dots, over whatever the trail holds now. */
    function show() {
      gl.useProgram(dots);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, targets[read].texture);
      gl.uniform2fv(dp.mouse, state.mouse);
      gl.uniform1f(dp.hover, state.hover);
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
      if (state.ripple[2] >= 0) {
        state.ripple[2] += dt;
        if (state.ripple[2] > 1.6) state.ripple[2] = -1;
      }
      // Held, the trail stays as it is; the light still eases over it.
      if (!pausedRef.current) advance(dt);
      show();
      const settled = pausedRef.current && Math.abs(target - state.hover) < 0.002 && state.ripple[2] < 0;
      if (settled) state.hover = target;
      state.raf = state.visible && !settled ? requestAnimationFrame(frame) : 0;
    }

    /** Reduced motion: no loop, just the light on or off over the still. */
    function still() {
      state.hover = state.hoverTarget || activeRef.current ? 1 : 0;
      if (activeRef.current && !state.hoverTarget) state.mouse = centre();
      show();
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
      show();
    });
    resizeObserver.observe(canvas);

    const visibility = new IntersectionObserver(([entry]) => {
      state.visible = entry.isIntersecting;
      if (state.visible) start();
    });
    visibility.observe(canvas);

    const themeObserver = new MutationObserver(() => {
      setInk();
      show();
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    wakeRef.current = (ring) => {
      if (ring && !reduced && state.ripple[2] < 0) state.ripple = [...centre(), 0];
      start();
    };
    // Under reduced motion there is no loop to carry the new scene in: build its still at once.
    resceneRef.current = () => {
      if (reduced) for (let i = 0; i < WARM; i++) advance(1 / 60);
      wakeRef.current(true);
    };

    setInk();
    resize();
    show();

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
      resceneRef.current = () => {};
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.remove();
    };
    // The scene is read through its ref, so a change never rebuilds the context or drops the trail.
  }, [pitch]);

  return <span ref={hostRef} aria-hidden className={`block size-full ${className}`} />;
}

/* --- Demo: the visualizer, filling the plate ------------------------------ */

const ORDER: VisualizerScene[] = ["halo", "tunnel", "prism"];
const NAMES: Record<VisualizerScene, string> = { halo: "Halo", tunnel: "Tunnel", prism: "Prism" };

export default function Demo() {
  const [at, setAt] = useState(0);
  const [paused, setPaused] = useState(true); // the screen holds its first frame until power-up
  const [focused, setFocused] = useState(false);
  const [said, setSaid] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  // Checked again on key up: the first key after a quiet press brings the ring back.
  const checkFocus = (el: HTMLElement) => setFocused(el.matches(":focus-visible") && !el.hasAttribute("data-quiet"));

  // Power up: the screen runs unless the host's tape is stopped; then it follows the host's PLAY. A hand wakes it too.
  const powerUp = useEffectEvent(() => {
    if (hostTransport(rootRef.current) !== "stop") setPaused(false);
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

  function next() {
    const n = (at + 1) % ORDER.length;
    play("toggle");
    setAt(n);
    setSaid(NAMES[ORDER[n]]);
  }

  return (
    // On the player the visualizer is the whole screen: it fills the stage's padded box, and the Slab takes away
    // its plate, its bezel's rim and its glass, so the dots sit straight on the player's own glass.
    <div ref={rootRef} onPointerDownCapture={() => setPaused(false)} className="@container w-full max-w-[480px] select-none player:absolute player:inset-6 player:w-auto player:max-w-none">
      <div data-part="plate" className="relative isolate animate-enter overflow-hidden rounded-[1.25em] p-[0.9em] player:h-full player:p-0 text-[clamp(11px,4cqw,14px)] [background:var(--device-body)] shadow-[var(--device-body-edge),0_1px_2px_rgb(0_0_0/0.06),0_16px_32px_-18px_rgb(0_0_0/0.3)]">
        <div aria-hidden className="device-grain pointer-events-none absolute inset-0 -z-10 rounded-[inherit]" />

        {/* The display: the whole plate, behind a black bezel; on the player, the whole screen. A press steps to the next scene. */}
        <div data-part="bezel" className="rounded-[1.05em] bg-(--device-rim) p-[0.3em] player:h-full player:p-0 shadow-[0_1px_0_rgb(255_255_255/0.7),inset_0_1px_2px_rgb(0_0_0/0.6)] dark:shadow-[0_1px_0_rgb(255_255_255/0.06),inset_0_1px_2px_rgb(0_0_0/0.6)]">
          <button
            type="button"
            aria-label={`Visualizer, ${NAMES[ORDER[at]]}. Change scene`}
            onPointerDown={(e) => e.button === 0 && focusQuietly(e.currentTarget)}
            onFocus={(e) => checkFocus(e.currentTarget)}
            onKeyUp={(e) => checkFocus(e.currentTarget)}
            onBlur={() => setFocused(false)}
            onClick={next}
            data-part="screen"
            // On the player the dots take the page's ink, as the Slab's readout does, so they read on its pale glass.
            className="relative block aspect-[4/3] w-full cursor-pointer rounded-[0.75em] text-(--device-lcd-ink) outline-offset-2 [background:var(--device-lcd)] [-webkit-touch-callout:none] player:aspect-auto player:h-full player:text-ink"
          >
            <span className="absolute inset-0 overflow-hidden rounded-[inherit]">
              <Visualizer scene={ORDER[at]} active={focused} paused={paused} />
            </span>
            {/* The glass: its sheen and its edge, over the dots. */}
            <span aria-hidden data-part="glass" className="pointer-events-none absolute inset-0 rounded-[inherit] [background:var(--screen-glass)] shadow-(--device-lcd-edge)" />
          </button>
        </div>
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {said}
      </p>
    </div>
  );
}
