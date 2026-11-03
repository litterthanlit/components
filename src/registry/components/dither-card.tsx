"use client";

import { useEffect, useEffectEvent, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { focusQuietly } from "@/design-system";
import { hostTransport, play } from "@/lib/sound";

/*
 * Project links as keys with a screen in each face, after a launcher's LCD
 * keys. Each screen runs one of Now Playing's scopes (Halo, a ring and a line
 * pumping with the beat; Tunnel, hexagons streaming outward; Prism, the trace
 * folded six ways) on its dot matrix: a round dot every 3 CSS px, each lit
 * or not against a 4 × 4 ordered dither, over ghosts at 8%, so the grid
 * itself always shows.
 *
 * Each scope is raw WebGL feedback: every frame warps and fades the last
 * under a fresh trace, and the dots show the trail. There is no audio, so
 * each screen plays a beat of its own, a kick, a snare on two and four and
 * hats, at its own tempo (104, 122 and 92 BPM), so three screens side by
 * side never pulse together. It draws in the LCD's ink on a clear ground,
 * so the glass behind it shows through, and it stays monochrome like every
 * light on the body. A hand backlights the screen under it and quickens its
 * beat, a press sinks the key 2px with a click and sends a ring through the
 * trail, and keyboard focus lights it from the centre with a ring of its
 * own. The loop writes uniforms, never React state, runs only while a screen
 * is on the page, and holds a still under reduced motion.
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
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
  float r = length(p);
  vec2 q;
  float trace;

  if (uScene < 0.5) {
    // Halo: the trail drifts outward, turns slowly, a little more on the snare, wavers, and pumps on the kick.
    q = turn(0.004 + 0.012 * sin(uTime * 0.21) + 0.05 * uSnare * (r - 0.25)) * p;
    q *= 0.982 - 0.03 * uKick;
    q += 0.0025 * vec2(sin(q.y * 11.0 + uTime * 1.1), cos(q.x * 9.0 - uTime * 1.3));
    trace = ring(p, 0.2) + scope(p, aspect * 0.42);
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

  float last = texture2D(uPrev, q / vec2(aspect, 1.0) + 0.5).r;
  // 7% a frame, less a step, so an 8-bit trail fades all the way out instead of sticking at a glow. Faster
  // than Now Playing's 5%: on a small square screen a longer trail fills it edge to edge.
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
export type DitherScene = keyof typeof SCENES;

/** Each scene's own tempo, so three screens side by side never pulse together. */
const BPM: Record<DitherScene, number> = { halo: 104, tunnel: 122, prism: 92 };
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

/* --- DitherField ---------------------------------------------------------- */

type DitherFieldProps = {
  scene?: DitherScene;
  /** CSS px between the matrix's dots. */
  pitch?: number;
  /** Light the field from its centre without a hand on it: keyboard focus, a selection, a demo's ghost. Turning it on sends a ring. */
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
export function DitherField({ scene = "halo", pitch = 3, active = false, paused = false, className = "" }: DitherFieldProps) {
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
    const bpm = BPM[scene];
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
      gl.uniform1f(fb.scene, SCENES[scene]);
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
      const m = beat(state.time, bpm);
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
      if (ring && !reduced) state.ripple = [...centre(), 0];
      start();
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
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.remove();
    };
  }, [scene, pitch]);

  return <span ref={hostRef} aria-hidden className={`block size-full ${className}`} />;
}

/* --- DitherCard: a project key -------------------------------------------- */

type DitherCardProps = {
  title: string;
  /** Said to screen readers as the link's description. */
  description: string;
  meta?: string;
  href: string;
  scene?: DitherScene;
  /** Light the screen from its centre without a hand on it: a selection, or a demo's ghost. */
  active?: boolean;
  /** Hold the scope still. */
  paused?: boolean;
};

/**
 * A project link as a key with a screen in its face. The face sinks 2px onto
 * its base under the finger and clicks; the screen runs a scope on a dot
 * matrix in the LCD's ink. Keyboard focus lights the screen from the centre; focus that
 * followed a press doesn't.
 */
export function DitherCard({ title, description, meta, href, scene = "halo", active = false, paused = false }: DitherCardProps) {
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
      <span data-part="key" className="block w-full rounded-[0.7em] p-[0.32em] [background:var(--device-key-face)] shadow-(--device-key-shadow) transition-[transform,box-shadow] duration-(--duration-exit) ease-out group-active/key:translate-y-[2px] group-active/key:shadow-(--device-key-shadow-pressed) group-active/key:duration-75">
        {/* The screen set into the face: the field draws on a clear ground, so this is its glass. */}
        <span data-part="lcd" className="relative block aspect-square rounded-[0.4em] text-(--device-lcd-ink) [background:var(--device-lcd)]">
          <span className="absolute inset-0 overflow-hidden rounded-[inherit]">
            <DitherField scene={scene} active={focused || active} paused={paused} />
          </span>
          {/* The glass's edge, over the dots. */}
          <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-(--device-lcd-edge)" />
        </span>
      </span>
      <span data-part="lettering" className="flex max-w-full items-baseline gap-[0.6em] text-[0.6em] font-semibold uppercase leading-none tracking-[0.16em] [text-shadow:var(--device-engrave)]">
        <span className="min-w-0 truncate text-(--device-label)">{title}</span>
        {meta && <span className="shrink-0 tabular-nums text-(--device-label-quiet) drawn:opacity-70!">{meta}</span>}
      </span>
      <span id={descriptionId} hidden>
        {description}
      </span>
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

/* --- Demo: a launcher's keys, one project on each ------------------------- */

const PROJECTS: { title: string; description: string; year: string; href: string; scene: DitherScene }[] = [
  { title: "Wavr", description: "Shader code in, motion graphics out.", year: "2026", href: "https://litt.design", scene: "halo" },
  { title: "Carson", description: "Learn a layout by wrecking one.", year: "2026", href: "https://litt.design", scene: "tunnel" },
  { title: "litt.works", description: "Prints and long-form pieces.", year: "2024–26", href: "https://litt.design", scene: "prism" },
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
      <div data-part="plate" className="relative isolate animate-enter overflow-hidden rounded-[1.25em] p-[0.9em] text-[clamp(11px,4cqw,14px)] [background:var(--device-body)] shadow-[var(--device-body-edge),0_1px_2px_rgb(0_0_0/0.06),0_16px_32px_-18px_rgb(0_0_0/0.3)] @[26rem]:p-[1.1em]">
        <div aria-hidden className="device-grain pointer-events-none absolute inset-0 -z-10 rounded-[inherit]" />

        {/* The readout: the year and the project in a line, for the key under the hand or the ghost. */}
        <div
          aria-hidden
          data-part="lcd"
          className="flex h-[3.3em] flex-col justify-between overflow-hidden rounded-[0.7em] px-[0.8em] pb-[0.5em] pt-[0.55em] text-(--device-lcd-ink) [background:var(--device-lcd)] shadow-(--device-lcd-edge)"
        >
          <span data-part="chip" className="inline-flex items-center gap-[0.35em] self-start rounded-[0.4em] bg-white px-[0.42em] py-[0.24em] text-black">
            {/* Drawn, the ghost's pulse stays red, a signal; idle it is an unlit ring. */}
            <span className={ghost ? "size-[0.55em] animate-pulse rounded-full bg-(--device-rec) motion-reduce:animate-none drawn:bg-(--device-rec)!" : "size-[0.55em] rounded-full bg-black drawn:border"} />
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
              <DitherCard title={p.title} description={p.description} href={p.href} scene={p.scene} active={lit === i} paused={paused} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
