"use client";

import { useEffect, useEffectEvent, useId, useRef, useState, type ComponentProps, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { focusQuietly } from "@/design-system";
import { hostTransport, play } from "@/lib/sound";

/*
 * A launcher's preview window over three keys. Each screen shows a long
 * exposure, a camera swung through foliage with the shutter open, in a
 * traditional Japanese palette: wakatake, the young-bamboo greens; ai,
 * indigo fading to asagi; sakura fading to gofun, the shell white.
 *
 * It is noise, not a picture. The streaks fan from a point below and left
 * of the screen, steep on the left and flatter to the right. Across them the
 * noise is fine (8 cells a radian); along them it is long (0.32 a unit),
 * warped so they waver. A second, larger noise lays down out-of-focus masses
 * of light and dark, and a third picks out thin glints. The fan keeps
 * turning (0.05 rad a unit of time) while the streaks flow along it, so the
 * screen moves across as well as along: a long streak sliding only along
 * itself reads as standing still. The sum runs through five stops in linear
 * light under a little animated grain.
 *
 * The selection steps from key to key every 2 s. The window sweeps into the
 * new palette over 600ms, the change running out along the streaks, and the
 * key's screen rings as its light comes on. A hand on the plate holds the
 * selection, and it carries on 2.5 s after the hand leaves, as the player's
 * tape does. The keys are radios. Given a link, the window opens the
 * project; without one, a press on it only sends a ring through the streaks.
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
uniform vec3 uFrom[5];  // the palette it is leaving, dark to light, sRGB
uniform vec3 uTo[5];    // the palette it is going to
uniform float uMix;     // 0 → 1 across a change

const float ZOOM = 1.35; // field units across the screen's shorter side

// A hash without sine, so it stays fine-grained however long the page is open.
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
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
// Uniform arrays only take constant indices here, hence one function a stop.
vec3 stop0(float m) { return mix(toLinear(uFrom[0]), toLinear(uTo[0]), m); }
vec3 stop1(float m) { return mix(toLinear(uFrom[1]), toLinear(uTo[1]), m); }
vec3 stop2(float m) { return mix(toLinear(uFrom[2]), toLinear(uTo[2]), m); }
vec3 stop3(float m) { return mix(toLinear(uFrom[3]), toLinear(uTo[3]), m); }
vec3 stop4(float m) { return mix(toLinear(uFrom[4]), toLinear(uTo[4]), m); }
vec3 ramp(float v, float m) {
  float x = clamp(v, 0.0, 0.999) * 4.0;
  float f = smoothstep(0.0, 1.0, fract(x));
  if (x < 1.0) return mix(stop0(m), stop1(m), f);
  if (x < 2.0) return mix(stop1(m), stop2(m), f);
  if (x < 3.0) return mix(stop2(m), stop3(m), f);
  return mix(stop3(m), stop4(m), f);
}

void main() {
  vec2 px = gl_FragCoord.xy;
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

  // The fan: polar coordinates about a point below and left of the screen. It keeps turning,
  // so the streaks sweep across the screen as well as flowing along it.
  vec2 d = p - vec2(-2.6, -1.4);
  float r = length(d);
  float a = atan(d.y, d.x) + t * 0.05;
  vec2 q = vec2(a * 8.0, r * 0.32 - t * 0.18);
  q.x += (fbm(vec2(a * 2.0, r * 0.35 - t * 0.1) + uSeed) - 0.5) * 1.4;
  float streak = fbm(q + uSeed * 3.1);
  float fine = fbm(vec2(a * 34.0, r * 0.5 - t * 0.29) + uSeed * 5.3);
  // Out-of-focus masses of light and dark, drifting.
  float mass = fbm(p * 0.55 + vec2(t * 0.08, -t * 0.05) + uSeed * 7.0);
  // A few thin glints where the light caught a blade.
  float glint = smoothstep(0.68, 0.86, fbm(vec2(a * 70.0, r * 0.4 - t * 0.25) + uSeed * 9.7));
  float v = streak * 0.85 + fine * 0.25 + (mass - 0.5) * 0.85 - 0.04;
  v = smoothstep(0.08, 0.92, v) + glint * 0.18;

  // A new palette runs out along the streaks, from the fan's root to its tips.
  float m = smoothstep(0.0, 1.0, clamp(uMix * 1.6 - clamp((r - 2.2) / 1.6, 0.0, 1.0) * 0.6, 0.0, 1.0));

  // The hand lifts the exposure under it, toward the palette's lightest stop.
  float reach = 0.5 * min(uRes.x, uRes.y);
  float dm = distance(px, uMouse);
  float light = exp(-(dm * dm) / (reach * reach)) * uHover;
  v += light * 0.22 + band * 0.12;
  vec3 color = mix(ramp(v, m), stop4(m), light * 0.18);

  color = toSrgb(color) + (hash(px + fract(uTime * 7.0) * 113.0) - 0.5) * 0.04;
  gl_FragColor = vec4(color, 1.0);
}
`;

/* --- Helpers -------------------------------------------------------------- */

/** Five sRGB hex stops, dark to light. Artwork, not tokens: the same in both themes. */
export type Palette = readonly [string, string, string, string, string];

const FADE = 0.6; // s for the window to sweep into a new palette

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
/** A detent's pitch, varied a little so repeated ticks never sound identical. */
const detent = () => 0.97 + Math.random() * 0.06;

/** Fifteen floats, the five stops as 0–1 RGB. */
const toStops = (key: string) => key.split(",").flatMap((hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255));

/** Where a fade stands, as one palette: mixed in linear light, as the shader mixes. */
function blend(from: number[], to: number[], m: number) {
  return from.map((c, i) => Math.pow(Math.pow(c, 2.2) * (1 - m) + Math.pow(to[i], 2.2) * m, 1 / 2.2));
}

/** The screen's own background: a still gradient of the palette, for when WebGL isn't there. */
const fallback = (palette: Palette) => `linear-gradient(60deg, ${palette.join(", ")})`;

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
}

/* --- StreakField ---------------------------------------------------------- */

type StreakFieldProps = {
  /** A new palette sweeps in over 600ms rather than restarting the field. */
  palette: Palette;
  /** Picks the exposure: the same seed always opens on the same frame. */
  seed?: number;
  /** Light the field from its centre without a hand on it: keyboard focus, a selection. Turning it on sends a ring. */
  active?: boolean;
  /** Hold the motion. The light, a ring and a palette change still play out. */
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
  // The stops as one string, so a new array with the same colours is no change.
  const stops = palette.join(",");
  const stopsRef = useRef(stops);
  const wakeRef = useRef<(ring: boolean) => void>(() => {});
  const recolourRef = useRef<(stops: string) => void>(() => {});

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
    if (stops === stopsRef.current) return;
    stopsRef.current = stops;
    recolourRef.current(stops);
  }, [stops]);

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
    const uRipple = u("uRipple"), uSeed = u("uSeed"), uFrom = u("uFrom"), uTo = u("uTo"), uMix = u("uMix");

    const reduced = reducedMotion();
    const first = toStops(stopsRef.current);
    const state = {
      time: 0,
      hover: 0,
      hoverTarget: 0,
      mouse: [0, 0] as [number, number],
      ripple: [0, 0, -1] as [number, number, number],
      from: first,
      to: first,
      mix: 1,
      visible: false,
      raf: 0,
      last: 0,
    };
    const centre = (): [number, number] => [canvas.width / 2, canvas.height / 2];
    const eased = () => state.mix * state.mix * (3 - 2 * state.mix);

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
      gl.uniform3fv(uFrom, state.from);
      gl.uniform3fv(uTo, state.to);
      gl.uniform1f(uMix, state.mix);
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
      if (state.mix < 1) state.mix = Math.min(1, state.mix + dt / FADE);
      // Held, the loop runs only until the light has settled, the ring has gone and the colours have landed.
      const settled = pausedRef.current && Math.abs(target - state.hover) < 0.002 && state.ripple[2] < 0 && state.mix === 1;
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
    // A new palette sweeps in from wherever the last change had got to.
    recolourRef.current = (next) => {
      state.from = blend(state.from, state.to, eased());
      state.to = toStops(next);
      state.mix = reduced ? 1 : 0;
      start();
    };

    gl.uniform1f(uSeed, seed);
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
      recolourRef.current = () => {};
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.remove();
    };
  }, [seed]);

  return <span ref={hostRef} aria-hidden className={`block size-full ${className}`} />;
}

/* --- GradientPreview: the window ------------------------------------------ */

type GradientPreviewProps = {
  /** The screen's accessible name; nothing is printed on the glass. */
  title: string;
  /** Said to screen readers after the name. */
  description: string;
  /** Makes the screen the project's link. Without one it only shows the project. */
  href?: string;
  palette: Palette;
  seed?: number;
  /** Hold the motion. */
  paused?: boolean;
};

/**
 * A screen behind a black bezel showing a project's long exposure large,
 * with nothing printed over it. Given an `href` the screen is the project's
 * link; without one it is a picture of the project, and a press on it sends
 * a ring through the streaks with a soft click.
 */
export function GradientPreview({ title, description, href, palette, seed = 0, paused = false }: GradientPreviewProps) {
  const descriptionId = useId();
  const screen = "relative block aspect-[2/1] rounded-[0.45em] [-webkit-touch-callout:none]";
  const glass = (
    <>
      <span className="absolute inset-0 overflow-hidden rounded-[inherit]">
        <StreakField palette={palette} seed={seed} paused={paused} />
      </span>
      {/* The glass: a sheen where the light catches it, and its edge. */}
      <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit] [background:var(--screen-glass)] shadow-(--device-lcd-edge)" />
    </>
  );

  return (
    <div className="rounded-[0.7em] bg-(--device-rim) p-[0.3em] shadow-[0_1px_0_rgb(255_255_255/0.7),inset_0_1px_2px_rgb(0_0_0/0.6)] dark:shadow-[0_1px_0_rgb(255_255_255/0.06),inset_0_1px_2px_rgb(0_0_0/0.6)]">
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          draggable={false}
          aria-label={`${title} (opens in a new tab)`}
          aria-describedby={descriptionId}
          onPointerDown={(e) => e.button === 0 && focusQuietly(e.currentTarget)}
          onClick={() => play("open", { gain: 0.6 })}
          className={cx(screen, "outline-offset-2")}
          style={{ background: fallback(palette) }}
        >
          {glass}
          <span id={descriptionId} hidden>
            {description}
          </span>
        </a>
      ) : (
        <div role="img" aria-label={`${title}: ${description}`} data-sound="soft" className={screen} style={{ background: fallback(palette) }}>
          {glass}
        </div>
      )}
    </div>
  );
}

/* --- GradientKey: a selector key ------------------------------------------ */

type GradientKeyProps = Omit<ComponentProps<"button">, "children" | "title"> & {
  /** The key's accessible name. */
  title: string;
  palette: Palette;
  seed?: number;
  /** Its light is on, its screen is lit, and it rings as it comes on. */
  selected?: boolean;
  /** Hold the motion. */
  paused?: boolean;
};

/**
 * A key with a screen in its face and a light across its foot. The face
 * sinks 2px onto its base under the finger and clicks. When it's selected
 * the light comes on and the screen lights; otherwise the screen dims. It
 * is a button: give it a radio's role and `aria-checked` in a radio group.
 */
export function GradientKey({ title, palette, seed = 0, selected = false, paused = false, className, ...rest }: GradientKeyProps) {
  return (
    <button type="button" data-sound="key" aria-label={title} className={cx("group/key block w-full min-w-0 rounded-[0.7em] outline-offset-2", className)} {...rest}>
      {/* Only the face sinks, so the hit area never moves under the finger. */}
      <span className="flex flex-col items-center gap-[0.32em] rounded-[0.7em] p-[0.32em] pb-[0.4em] [background:var(--device-key-face)] shadow-(--device-key-shadow) transition-[transform,box-shadow] duration-(--duration-exit) ease-out group-active/key:translate-y-[2px] group-active/key:shadow-(--device-key-shadow-pressed) group-active/key:duration-75">
        <span className="relative block aspect-[2/1] w-full rounded-[0.4em]" style={{ background: fallback(palette) }}>
          <span className="absolute inset-0 overflow-hidden rounded-[inherit]">
            <StreakField palette={palette} seed={seed} active={selected} paused={paused} />
            {/* Off the selection, the backlight dims. */}
            <span
              aria-hidden
              className={cx(
                "pointer-events-none absolute inset-0 bg-black/40 transition-opacity ease-out",
                selected ? "opacity-0 duration-(--duration-enter)" : "opacity-100 duration-(--duration-exit)",
              )}
            />
          </span>
          {/* The glass: a sheen where the light catches it, and its edge. */}
          <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit] [background:var(--screen-glass)] shadow-(--device-lcd-edge)" />
        </span>
        {/* The selection light: on at once, off at the exit duration. */}
        <span
          aria-hidden
          className={cx(
            "h-[0.24em] w-[30%] rounded-full transition-[background-color]",
            selected ? "bg-(--device-meter-on) duration-0" : "bg-(--device-meter-off) duration-(--duration-exit)",
          )}
        />
      </span>
    </button>
  );
}

/* --- Demo: a launcher, its window and three keys -------------------------- */

const PROJECTS: { title: string; description: string; palette: Palette; seed: number }[] = [
  {
    title: "Wavr",
    description: "Shader code in, motion graphics out.",
    palette: ["#264d35", "#3b6e4e", "#6da47a", "#a9cba3", "#e1ecdc"], // 若竹 wakatake: young bamboo
    seed: 3,
  },
  {
    title: "Carson",
    description: "Learn a layout by wrecking one.",
    palette: ["#16213d", "#1f2f54", "#3f5f8f", "#7fa6c2", "#c9dde6"], // 藍 ai, indigo, to 浅葱 asagi
    seed: 1,
  },
  {
    title: "litt.works",
    description: "Prints and long-form pieces.",
    palette: ["#b06e7c", "#d796a6", "#e9b5c1", "#f5d8de", "#fbf2ee"], // 桜 sakura to 胡粉 gofun, shell white
    seed: 5,
  },
];
const STEP = 2000; // ms on each key before the selection steps on
const RESUME = 2500; // ms after the hand leaves before it steps on again, as the player's tape waits
const WINDOW_SEED = 2;

export default function Demo() {
  const [at, setAt] = useState(0); // the selected project
  const [cycling, setCycling] = useState(false);
  const [paused, setPaused] = useState(true); // the screens hold their first frame until power-up
  const rootRef = useRef<HTMLDivElement>(null);
  // A hand on the plate holds the selection: a pointer over it, or keyboard focus in it.
  const pointerHold = useRef(false);
  const focusHold = useRef(false);
  const resume = useRef<ReturnType<typeof setTimeout>>(undefined);

  /** A hand arrives: hold the selection where it is, and wake the screens. */
  function hold() {
    clearTimeout(resume.current);
    setCycling(false);
    setPaused(false);
  }

  /** A hand leaves: once nothing holds it, step on again after the tape's wait, unless the tape is stopped. */
  function release() {
    if (pointerHold.current || focusHold.current) return;
    clearTimeout(resume.current);
    resume.current = setTimeout(() => {
      if (hostTransport(rootRef.current) !== "stop" && !reducedMotion()) setCycling(true);
    }, RESUME);
  }

  // Power up: the screens run and the selection steps by itself, unless the host's tape is stopped;
  // then follow its PLAY. Under reduced motion each screen holds its first frame and nothing steps.
  const powerUp = useEffectEvent(() => {
    if (hostTransport(rootRef.current) === "stop" || pointerHold.current || focusHold.current) return;
    setPaused(false);
    if (!reducedMotion()) setCycling(true);
  });
  useEffect(() => {
    const root = rootRef.current;
    const start = requestAnimationFrame(powerUp);
    const host = root?.closest("[data-transport]");
    const observer = new MutationObserver(() => hostTransport(root) === "play" && powerUp());
    if (host) observer.observe(host, { attributes: true, attributeFilter: ["data-transport"] });
    const pending = resume;
    return () => {
      cancelAnimationFrame(start);
      observer.disconnect();
      clearTimeout(pending.current);
    };
  }, []);

  // The cycle: the next key every 2 s, a quiet detent for each while the host's tape plays.
  useEffect(() => {
    if (!cycling) return;
    const root = rootRef.current;
    const id = setTimeout(() => {
      setAt((i) => (i + 1) % PROJECTS.length);
      if (hostTransport(root) === "play") play("tick", { gain: 0.4, pitch: detent() });
    }, STEP);
    return () => clearTimeout(id);
  }, [cycling, at]);

  /** A real move of the hand. Chrome also sends moves as the study slides in under a resting cursor; those don't count. */
  const moved = (e: ReactPointerEvent) => e.pointerType !== "mouse" || e.movementX !== 0 || e.movementY !== 0;

  /** The keys are one radio group: the arrows move along it. */
  function onKeyKeyDown(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const next = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: PROJECTS.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    if (next < 0 || next >= PROJECTS.length || next === i) return play("bump", { gain: 0.6 });
    play("tick", { pitch: detent() });
    setAt(next);
    rootRef.current?.querySelector<HTMLElement>(`[data-key="${next}"]`)?.focus();
  }

  const project = PROJECTS[at];

  return (
    <div
      ref={rootRef}
      onPointerMove={(e) => {
        if (pointerHold.current || !moved(e)) return;
        pointerHold.current = true;
        hold();
      }}
      onPointerDownCapture={() => {
        pointerHold.current = true;
        hold();
      }}
      onPointerLeave={() => {
        pointerHold.current = false;
        release();
      }}
      onKeyDownCapture={() => {
        focusHold.current = true;
        hold();
      }}
      // Focus that followed a press is the pointer's; only keyboard focus holds by itself.
      onFocusCapture={(e) => {
        if (e.target.hasAttribute("data-quiet")) return;
        focusHold.current = true;
        hold();
      }}
      onBlurCapture={(e) => {
        if (e.currentTarget.contains(e.relatedTarget)) return;
        focusHold.current = false;
        release();
      }}
      className="@container w-full max-w-[480px] select-none"
    >
      <div className="relative isolate animate-enter overflow-hidden rounded-[1.25em] p-[0.9em] text-[clamp(11px,4cqw,14px)] [background:var(--device-body)] shadow-[var(--device-body-edge),0_1px_2px_rgb(0_0_0/0.06),0_16px_32px_-18px_rgb(0_0_0/0.3)] @[26rem]:p-[1.1em]">
        <div aria-hidden className="device-grain pointer-events-none absolute inset-0 -z-10 rounded-[inherit]" />

        <GradientPreview
          title={project.title}
          description={project.description}
          palette={project.palette}
          seed={WINDOW_SEED}
          paused={paused}
        />

        {/* The keys: each puts its project in the window. A small row, centred, so the window leads. */}
        <div role="radiogroup" aria-label="Projects" className="mx-auto mt-[0.7em] grid w-[60%] grid-cols-3 gap-[0.45em]">
          {PROJECTS.map((p, i) => (
            <GradientKey
              key={p.title}
              role="radio"
              aria-checked={i === at}
              tabIndex={i === at ? 0 : -1}
              data-key={i}
              title={p.title}
              palette={p.palette}
              seed={p.seed}
              selected={i === at}
              paused={paused}
              onPointerDown={(e) => e.button === 0 && focusQuietly(e.currentTarget)}
              onPointerMove={(e) => moved(e) && setAt(i)}
              onClick={() => setAt(i)}
              onKeyDown={(e) => onKeyKeyDown(e, i)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
