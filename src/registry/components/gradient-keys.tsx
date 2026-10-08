"use client";

import { useEffect, useEffectEvent, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { focusQuietly } from "@/design-system";
import { hostTransport, play } from "@/lib/sound";

/*
 * Project links as keys with a screen in each face, each screen showing a
 * long exposure: a camera swung through foliage, the shutter open. The
 * streaks fan out from a point below and left of the screen, so they run
 * steep on the left and flatten to the right, as a swing through an arc
 * would draw them.
 *
 * It is noise, not a picture. Across the streaks the noise is fine (8 cells
 * a radian); along them it is long (0.32 a unit), with a slow warp so they
 * waver. A second, much larger noise lays down the out-of-focus masses of
 * light and dark, and a third picks out a few thin glints. The sum runs
 * through the project's palette of five stops, blended in linear light so
 * the midtones stay luminous, then takes a little animated grain.
 *
 * The camera keeps panning, so it moves from the first frame. A hand
 * quickens the pan about fourfold and lifts the exposure under it; a press
 * sends a ring that pushes the streaks aside. The palettes are artwork, the
 * same in both themes, and keep clear of red, orange and the accent, so a
 * cover never reads as a signal. Raw WebGL drawn at the screen's size (up to
 * 1.5× for dense displays) and scaled smoothly; the loop writes uniforms,
 * never React state, and runs only while a screen is on the page.
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
uniform float uSeed;
uniform vec3 uPalette[5]; // dark to light, sRGB

const float ZOOM = 1.35; // field units across the screen's shorter side

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
// Three octaves only: a long exposure has no fine detail.
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { v += a * noise(p); p = p * 2.03 + 17.0; a *= 0.5; }
  return v / 0.875;
}
vec3 toLinear(vec3 c) { return pow(c, vec3(2.2)); }
vec3 toSrgb(vec3 c) { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }
vec3 ramp(float v) {
  float x = clamp(v, 0.0, 0.999) * 4.0;
  float f = smoothstep(0.0, 1.0, fract(x));
  if (x < 1.0) return mix(toLinear(uPalette[0]), toLinear(uPalette[1]), f);
  if (x < 2.0) return mix(toLinear(uPalette[1]), toLinear(uPalette[2]), f);
  if (x < 3.0) return mix(toLinear(uPalette[2]), toLinear(uPalette[3]), f);
  return mix(toLinear(uPalette[3]), toLinear(uPalette[4]), f);
}

void main() {
  vec2 px = gl_FragCoord.xy;
  float aspect = uRes.x / uRes.y;
  float unit = ZOOM / min(uRes.x, uRes.y); // field units per pixel
  vec2 p = (px - 0.5 * uRes) * unit;
  float t = uTime;

  // A press: a ring that widens and fades, pushing the streaks aside as it passes.
  float band = 0.0;
  if (uRipple.z >= 0.0) {
    vec2 dir = p - (uRipple.xy - 0.5 * uRes) * unit;
    float rad = uRipple.z * 1.4 * ZOOM;
    band = exp(-pow((length(dir) - rad) / (0.07 * ZOOM), 2.0)) * exp(-uRipple.z * 2.2);
    p += normalize(dir + 1e-4) * band * 0.09 * ZOOM;
  }

  // The fan: polar coordinates about a point below and left of the screen.
  vec2 d = p - vec2(-2.6, -1.4);
  float r = length(d);
  float a = atan(d.y, d.x);
  vec2 q = vec2(a * 8.0, r * 0.32 - t * 0.12);
  q.x += (fbm(vec2(a * 2.0, r * 0.35 - t * 0.04) + uSeed) - 0.5) * 1.4;
  float streak = fbm(q + uSeed * 3.1);
  float fine = fbm(vec2(a * 34.0, r * 0.5 - t * 0.2) + uSeed * 5.3);
  // Out-of-focus masses of light and dark, drifting slowly.
  float mass = fbm(p * 0.55 + vec2(t * 0.03, -t * 0.02) + uSeed * 7.0);
  // A few thin glints where the light caught a blade.
  float glint = smoothstep(0.68, 0.86, fbm(vec2(a * 70.0, r * 0.4 - t * 0.18) + uSeed * 9.7));
  float v = streak * 0.85 + fine * 0.25 + (mass - 0.5) * 0.85 - 0.04;
  v = smoothstep(0.08, 0.92, v) + glint * 0.18;

  // The hand lifts the exposure under it, toward the palette's lightest stop.
  float reach = 0.5 * min(uRes.x, uRes.y);
  float dm = distance(px, uMouse);
  float light = exp(-(dm * dm) / (reach * reach)) * uHover;
  v += light * 0.22 + band * 0.12;
  vec3 color = mix(ramp(v), toLinear(uPalette[4]), light * 0.18);

  color = toSrgb(color) + (hash(px + fract(uTime * 7.0) * 113.0) - 0.5) * 0.04;
  gl_FragColor = vec4(color, 1.0);
}
`;

/* --- Helpers -------------------------------------------------------------- */

/** Five sRGB hex stops, dark to light. Artwork, not tokens: the same in both themes. */
export type Palette = readonly [string, string, string, string, string];

const hexToRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
}

/* --- StreakField ---------------------------------------------------------- */

type StreakFieldProps = {
  palette: Palette;
  /** Picks the exposure: the same seed always opens on the same frame. */
  seed?: number;
  /** Light the field from its centre without a hand on it: keyboard focus, a selection, a demo's ghost. Turning it on sends a ring. */
  active?: boolean;
  /** Hold the pan. The light and a ring still play out. */
  paused?: boolean;
  className?: string;
};

/**
 * A long-exposure field on a canvas the size of its box (up to 1.5× for
 * dense displays), scaled smoothly. Raw WebGL, no library. It only animates
 * while on screen and holds a still frame under reduced motion. Without
 * WebGL, whatever is behind it shows through.
 */
export function StreakField({ palette, seed = 0, active = false, paused = false, className = "" }: StreakFieldProps) {
  const hostRef = useRef<HTMLSpanElement>(null);
  // Bridges from React props into the render loop, so a change never restarts it.
  const activeRef = useRef(active);
  const pausedRef = useRef(paused);
  const wakeRef = useRef<(ring: boolean) => void>(() => {});
  // The stops as one string, so a new array with the same colours doesn't restart the field.
  const stops = palette.join(",");

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
    canvas.className = "block size-full";
    host.append(canvas);
    const context = canvas.getContext("webgl", { antialias: false, alpha: false, preserveDrawingBuffer: true });
    if (!context) return () => canvas.remove();
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
    const uRipple = u("uRipple"), uSeed = u("uSeed"), uPalette = u("uPalette");

    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const state = {
      time: 0,
      hover: 0,
      hoverTarget: 0,
      mouse: [0, 0] as [number, number],
      ripple: [0, 0, -1] as [number, number, number],
      visible: false,
      raf: 0,
      last: 0,
    };
    const centre = (): [number, number] => [canvas.width / 2, canvas.height / 2];

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const density = Math.min(devicePixelRatio, 1.5);
      canvas.width = Math.max(1, Math.round(rect.width * density));
      canvas.height = Math.max(1, Math.round(rect.height * density));
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

    wakeRef.current = (ring) => {
      if (ring && !reduced) state.ripple = [...centre(), 0];
      start();
    };

    gl.uniform1f(uSeed, seed);
    gl.uniform3fv(uPalette, new Float32Array(stops.split(",").flatMap(hexToRgb)));
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
      wakeRef.current = () => {};
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.remove();
    };
  }, [stops, seed]);

  return <span ref={hostRef} aria-hidden className={`block size-full ${className}`} />;
}

/* --- GradientKey: a project key ------------------------------------------- */

type GradientKeyProps = {
  title: string;
  /** Said to screen readers as the link's description. */
  description: string;
  meta?: string;
  href: string;
  palette: Palette;
  seed?: number;
  /** Light the screen from its centre without a hand on it: a selection, or a demo's ghost. */
  active?: boolean;
  /** Hold the pan. */
  paused?: boolean;
};

/**
 * A project link as a key with a screen in its face. The face sinks 2px onto
 * its base under the finger and clicks; the screen shows the project's long
 * exposure under glass. Keyboard focus lights it from the centre; focus that
 * followed a press doesn't.
 */
export function GradientKey({ title, description, meta, href, palette, seed = 0, active = false, paused = false }: GradientKeyProps) {
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
        {/* The screen set into the face. Without WebGL its own gradient stands in for the exposure. */}
        <span className="relative block aspect-square rounded-[0.4em]" style={{ background: `linear-gradient(60deg, ${palette.join(", ")})` }}>
          <span className="absolute inset-0 overflow-hidden rounded-[inherit]">
            <StreakField palette={palette} seed={seed} active={focused || active} paused={paused} />
          </span>
          {/* The glass: a sheen where the light catches it, and its edge. */}
          <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit] [background:var(--screen-glass)] shadow-(--device-lcd-edge)" />
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

const PROJECTS: { title: string; description: string; year: string; href: string; palette: Palette; seed: number }[] = [
  {
    title: "Wavr",
    description: "Shader code in, motion graphics out.",
    year: "2026",
    href: "https://litt.design",
    palette: ["#36621f", "#55843a", "#86a95a", "#a6bf9f", "#c6d9dc"], // leaves against a pale sky
    seed: 2,
  },
  {
    title: "Carson",
    description: "Learn a layout by wrecking one.",
    year: "2026",
    href: "https://litt.design",
    palette: ["#2b3346", "#525d78", "#8a8db0", "#bfc0d8", "#e3e5ee"], // dusk: slate, lilac, mist
    seed: 0,
  },
  {
    title: "litt.works",
    description: "Prints and long-form pieces.",
    year: "2024–26",
    href: "https://litt.design",
    palette: ["#5a4a2e", "#8f7746", "#c2ab78", "#ddd0b0", "#f1ebdf"], // paper: ochre, sand, bone
    seed: 7,
  },
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
              <GradientKey title={p.title} description={p.description} href={p.href} palette={p.palette} seed={p.seed} active={lit === i} paused={paused} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
