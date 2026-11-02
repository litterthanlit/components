"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ComponentProps, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { focusQuietly } from "@/design-system";
import { hostTransport, play, type PlayOptions, type SoundName } from "@/lib/sound";

/*
 * An image strip that spools while it is held, after a projector's reel on
 * fast forward. Press the screen or the key and the frames run down past the
 * gate at one a second; the longer the hold, the faster the motor turns,
 * doubling every 0.8 s to a redline of 16 a second at 3.2 s. Past 2.5 a
 * second the strip starts to bend. The frames shrink to about a third of
 * their height, so more of them pass at once, and the strip curves in an
 * even arc, a parabola, to 60% of its width through the middle and 135% at
 * the ends, as if bent round a drum, darkening as it turns away from the
 * light. Each pixel streaks over 1/90 s of travel, and the gaps between
 * frames open from 12% to 38% so the streak never closes them. Let go and the reel coasts on to the next frame on a
 * critically damped spring, the bend relaxing as it slows.
 *
 * One frame loop is the mechanism: a small integrator for the motor and the
 * detent, raw WebGL2 for the screen, the speed lights, the LCD, and a click
 * for every frame that passes the gate, so what you hear matches what you
 * see. The frames sit in a texture array with mipmaps, so a narrowed frame
 * stays clean. Nothing re-renders while it runs; React hears when it stops.
 *
 * The screen is a slider over the frames: the arrows step one, Home and End
 * go to the first and last, and holding Space or Enter spools. `bare` drops
 * the deck for a page of its own: the screen alone, filling its box.
 */

const V0 = 1; // frames a second as the hold begins
const VMAX = 16; // the redline
const RAMP = 3.2; // s of holding to reach it
const GRIP = 7; // 1/s: how quickly the reel takes up the motor's speed
const WARP_FROM = 2.5; // frames a second where the strip starts to bend
const SHUTTER = 1 / 90; // s of travel each pixel streaks over, past WARP_FROM
const OMEGA = 7; // rad/s: the detent that lands it, critically damped
const STEP = 1 / 240; // s: the detent's integration step, as createSpring's
const REDUCED_STEP = 0.4; // s between frames under reduced motion, which jumps rather than slides
const LIGHTS = 6;

const TEXELS_MAX = 1024; // the longest side of a frame in the texture

export type SpoolFrame = { src: string; alt: string };

type SpoolProps = {
  /** Image URLs, cropped to `aspect`. They need CORS headers if they're on another origin. */
  frames: readonly SpoolFrame[];
  /** A frame's width over its height. */
  aspect?: number;
  /** Only the screen, filling its box, with the frame's number and title in a corner: for a page of its own. */
  bare?: boolean;
  /** The frame at the gate, from 0. */
  value: number;
  /** The reel has come to rest on a frame. */
  onChange: (value: number) => void;
  /** The strip's accessible name. */
  label: string;
  /** Show the gesture by itself until a hand works it: hold, spool up, let go, again. */
  rehearse?: boolean;
  className?: string;
};

type Mode = "ready" | "ghost" | "hand";

type Engine = {
  /** A hold begins. A hand takes over a ghost's hold at the speed it had reached. */
  press: (ghost: boolean) => void;
  release: () => void;
  /** Lets go only if the ghost is holding, never a hand. */
  releaseGhost: () => void;
  /** One frame on or back, by hand. */
  step: (delta: number) => void;
  /** Travel to a frame: by hand, or from outside on the motor. */
  seek: (frame: number, hand: boolean) => void;
  load: (frames: readonly SpoolFrame[]) => void;
};

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const mod = (a: number, n: number) => ((a % n) + n) % n;
const pad = (n: number) => String(n).padStart(2, "0");

/** The motor's speed after holding for `t` s: exponential, so each doubling takes as long as the last. */
const speedAt = (t: number) => V0 * Math.pow(VMAX / V0, Math.min(1, t / RAMP));
/** The hold that reaches `speed`, so a hand can take over from the ghost without a jolt. */
const holdFor = (speed: number) => (RAMP * Math.log(Math.max(V0, speed) / V0)) / Math.log(VMAX / V0);
/** Speed on the lights' scale, 0 → 1: logarithmic, as the ramp is. */
const level = (speed: number) => Math.min(1, Math.max(0, Math.log(Math.max(speed, 1e-3) / V0) / Math.log(VMAX / V0)));
/** How far the strip bends, 0 → 1: from WARP_FROM to the redline, eased at both ends. */
function warpAt(speed: number) {
  const k = Math.min(1, Math.max(0, (speed - WARP_FROM) / (VMAX - WARP_FROM)));
  return k * k * (3 - 2 * k);
}

/* --- The screen: raw WebGL2 ------------------------------------------------ */

const VERTEX = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

// Rows of the screen read the roll through a warp that depends only on where the row is, so the
// strip's outline is a fixed waist the frames pass through. Each row's width, and how much of the
// roll it covers, follow from the warp; the streak sums up to 12 taps along the roll.
const FRAGMENT = `#version 300 es
precision highp float;
precision highp sampler2DArray;

uniform vec2 uRes;      // the canvas, px
uniform float uPos;     // the roll at the gate, in frames, wrapped to [0, uCount)
uniform float uCount;
uniform float uWarp;    // 0 → 1
uniform float uStreak;  // frames of roll each pixel is exposed to
uniform vec2 uTexels;   // a frame's size in the texture
uniform float uAspect;  // a frame's width over its height
uniform sampler2DArray uFrames;
out vec4 colour;

const vec3 BLANK = vec3(0.16, 0.165, 0.175); // a frame still loading

// Where a row, in screen heights down from the centre, reads the roll. Faster, each row reads more of
// it, 2.2 times as much through the centre and 1.8 at the ends, so the frames shrink and more of them
// pass at once. squeeze() is its slope.
float bend(float y, float a) { return y + a * (1.2 * y - 0.5333 * y * y * y); }
float squeeze(float y, float a) { return 1.0 + a * (1.2 - 1.6 * y * y); }
// A frame's width on a row, against its width at rest: a parabola, 60% through the waist and 135% at
// the ends, so the sides curve evenly from top to bottom, as a strip bent round a cylinder would.
float girth(float y, float a) { return 1.0 - a * 0.4 + a * 3.0 * y * y; }

void main() {
  float h = uRes.y;
  float y = 0.5 - gl_FragCoord.y / h;
  float x = (gl_FragCoord.x - 0.5 * uRes.x) / h;
  float a = uWarp;
  // A frame's height at rest, in screen heights: 58%, or less where the screen is too narrow for its width.
  float tile = min(0.58, 0.62 * uRes.x / h / uAspect);
  float pitch = tile / 0.88; // from one frame to the next at rest

  float halfWidth = 0.5 * tile * uAspect * girth(y, a);
  float across = clamp((halfWidth - abs(x)) * h + 0.5, 0.0, 1.0);
  if (across <= 0.0) { colour = vec4(0.0); return; }
  float u = 0.5 + 0.5 * x / halfWidth;

  float s = squeeze(y, a);
  float perFrame = pitch * h / s;          // px this row's stretch of roll gives each frame
  float at = uPos - bend(y, a) / pitch;    // along the roll; later frames are further up
  // A frame's share of its pitch: 88% at rest, 62% at the redline, so the gaps stay open under the streak.
  float fill = 0.88 * (1.0 - 0.3 * a);
  // Mip level from the texels under a pixel, worked out here: derivatives are no use inside the loop.
  float lod = max(0.0, log2(max(uTexels.x / (2.0 * halfWidth * h), uTexels.y / (fill * perFrame))));
  int taps = int(clamp(ceil(uStreak * perFrame / 1.5), 1.0, 12.0));

  vec4 sum = vec4(0.0);
  for (int i = 0; i < 12; i++) {
    if (i >= taps) break;
    float c = at + uStreak * ((float(i) + 0.5) / float(taps) - 0.5);
    float f = floor(c + 0.5);
    float t = c - f;                        // across the frame's cell, -0.5 → 0.5, up positive
    float cover = clamp((0.5 * fill - abs(t)) * perFrame + 0.5, 0.0, 1.0);
    vec4 texel = textureLod(uFrames, vec3(u, 0.5 - t / fill, mod(f, uCount)), lod);
    sum += vec4(texel.a < 0.5 ? BLANK : texel.rgb, 1.0) * cover;
  }
  sum /= float(taps);

  // Through the waist the strip turns away from the light.
  float shade = 1.0 - a * 0.18 * (1.0 - 4.0 * y * y);
  colour = vec4(sum.rgb * shade, sum.a) * across;
}
`;

type Screen = {
  /** Room for `n` frames of `width` × `height` texels; whatever was there is dropped. */
  allocate: (n: number, width: number, height: number) => void;
  upload: (layer: number, source: TexImageSource) => void;
  resize: (width: number, height: number) => void;
  draw: (pos: number, warp: number, streak: number, aspect: number) => void;
  dispose: () => void;
};

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
}

/** The strip on a canvas, or null without WebGL2. The canvas is clear where there's no frame, so the glass shows. */
function createScreen(canvas: HTMLCanvasElement): Screen | null {
  const context = canvas.getContext("webgl2", { alpha: true, antialias: false, premultipliedAlpha: true });
  if (!context) return null;
  const gl = context;
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);

  // One triangle that covers the screen.
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const u = (name: string) => gl.getUniformLocation(program, name);
  const uRes = u("uRes"), uPos = u("uPos"), uCount = u("uCount"), uWarp = u("uWarp"), uStreak = u("uStreak");
  const uTexels = u("uTexels"), uAspect = u("uAspect");
  gl.uniform1i(u("uFrames"), 0);
  gl.clearColor(0, 0, 0, 0);

  let texture: WebGLTexture | null = null;
  let count = 0;
  let size = [1, 1];
  return {
    allocate(n, width, height) {
      if (texture) gl.deleteTexture(texture);
      count = n;
      size = [width, height];
      texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
      gl.uniform2f(uTexels, width, height);
      // WebGL zeroes new storage, and the shader draws a clear texel as a frame still loading.
      const levels = 1 + Math.floor(Math.log2(Math.max(width, height)));
      gl.texStorage3D(gl.TEXTURE_2D_ARRAY, levels, gl.RGBA8, width, height, Math.max(1, n));
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    },
    upload(layer, source) {
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, layer, size[0], size[1], 1, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    },
    resize(width, height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
      gl.uniform2f(uRes, width, height);
    },
    draw(pos, warp, streak, aspect) {
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (!count) return;
      gl.uniform1f(uAspect, aspect);
      gl.uniform1f(uPos, pos);
      gl.uniform1f(uCount, count);
      gl.uniform1f(uWarp, warp);
      gl.uniform1f(uStreak, streak);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}

/* --- Spool ------------------------------------------------------------------ */

const REHEARSAL = { first: 450, hold: 2900, rest: 2400 }; // ms: after mount, held, then coasting and still

export function Spool({ frames, value, onChange, label, aspect = 3 / 4, bare = false, rehearse = false, className }: SpoolProps) {
  const [mode, setMode] = useState<Mode>("ready");
  const [pressed, setPressed] = useState(false);
  const hintId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLSpanElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);
  const titleRef = useRef<HTMLSpanElement>(null);
  const engine = useRef<Engine | null>(null);
  const touched = useRef(false); // a hand has worked it: the rehearsal is over for good
  const visible = useRef(false);
  const holder = useRef<number | "key" | null>(null); // the pointer, or the keyboard, holding it
  // Props the loop reads when it fires, rather than when it was made.
  const props = useRef({ frames, value, onChange, aspect });
  useLayoutEffect(() => {
    props.current = { frames, value, onChange, aspect };
  });

  const n = frames.length;
  const at = n ? Math.min(n - 1, Math.max(0, value)) : 0;
  // The roll's identity: a new array of the same images is no change.
  const roll = frames.map((f) => f.src).join("\n");

  // The mechanism. `p` is the roll's position at the gate in frames, `v` its speed. Held, the motor's
  // speed climbs with the hold and the reel takes it up through GRIP; let go, a critically damped
  // spring lands it on a frame. One update draws the screen, the lights and the LCD and clicks.
  useLayoutEffect(() => {
    const root = rootRef.current!;
    const host = hostRef.current!;
    const lights = [...root.querySelectorAll<HTMLElement>("[data-light]")];
    const fallback = host.querySelector<HTMLElement>("[data-fallback]")!;
    const reduced = reducedMotion();

    // Made here rather than rendered: the cleanup loses its context for good, so every mount
    // (StrictMode's second one included) needs a canvas of its own.
    const canvas = document.createElement("canvas");
    canvas.className = "absolute inset-0 block size-full";
    host.append(canvas);
    const screen = createScreen(canvas);
    fallback.hidden = !!screen;
    const stage = document.createElement("canvas");
    const pen = stage.getContext("2d")!;

    let p = 0;
    let v = 0;
    let held = false;
    let heldAt = 0;
    let stepped = 0; // s since the last frame, under reduced motion
    let ghost = false;
    let byHand = false; // what's moving it is the viewer's, so it always sounds
    let target: number | null = null; // the frame the detent is landing on
    let placed = false;
    let shownGate: number | null = null;
    let shownLit = -1;
    let loading = 0;
    let raf = 0;
    let last = 0;

    const sound = (name: SoundName, options?: PlayOptions) => {
      if (byHand || hostTransport(root) === "play") play(name, options);
    };

    function write(gate: number) {
      const { frames } = props.current;
      if (!frames.length) {
        counterRef.current!.textContent = "";
        titleRef.current!.textContent = "";
        return;
      }
      const i = mod(gate, frames.length);
      counterRef.current!.textContent = `${pad(i + 1)} / ${pad(frames.length)}`;
      titleRef.current!.textContent = frames[i].alt;
      if (!screen) fallback.style.backgroundImage = `url(${JSON.stringify(frames[i].src)})`;
    }

    function render() {
      const n = props.current.frames.length;
      const speed = Math.abs(v);
      const warp = reduced ? 0 : warpAt(speed);
      screen?.draw(n ? mod(p, n) : 0, warp, warp ? (speed - WARP_FROM) * SHUTTER : 0, props.current.aspect);

      // The speed lights: one as soon as it moves, the last, red, at the redline.
      const lit = held || target !== null ? Math.max(1, Math.ceil(level(speed) * LIGHTS - 0.05)) : 0;
      if (lit !== shownLit) {
        lights.forEach((light, i) => light.toggleAttribute("data-on", i < lit));
        shownLit = lit;
      }

      // A click for every frame that passes the gate, higher and quieter as it speeds up.
      const gate = Math.round(p);
      if (gate !== shownGate) {
        if (shownGate !== null && n) sound("tick", { gain: 0.6 - 0.25 * level(speed), pitch: 0.92 + 0.22 * level(speed) });
        shownGate = gate;
        write(gate);
      }
    }

    function settle() {
      setMode("ready");
      const { frames, value, onChange } = props.current;
      if (!frames.length) return;
      // At rest, bring the position back onto the roll's first lap; nothing on screen moves.
      p = mod(Math.round(p), frames.length);
      shownGate = p;
      if (p !== value) onChange(p);
    }

    function frame(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (held && reduced) {
        stepped += dt;
        if (stepped >= REDUCED_STEP) {
          stepped -= REDUCED_STEP;
          p = Math.round(p) + 1;
        }
      } else if (held) {
        v += (speedAt((now - heldAt) / 1000) - v) * (1 - Math.exp(-dt * GRIP));
        p += v * dt;
      } else if (target !== null) {
        for (let left = dt; left > 0; left -= STEP) {
          const h = Math.min(STEP, left);
          v += (-OMEGA * OMEGA * (p - target) - 2 * OMEGA * v) * h;
          p += v * h;
        }
        if (Math.abs(p - target) < 0.004 && Math.abs(v) < 0.03) {
          p = target;
          v = 0;
          target = null;
        }
      }
      render();
      if (held || target !== null) {
        raf = requestAnimationFrame(frame);
      } else {
        raf = 0;
        settle();
      }
    }

    function run() {
      if (raf) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }

    function release() {
      if (!held) return;
      held = false;
      ghost = false;
      setPressed(false);
      sound("release");
      // Coast on to the frame it's about to reach: where a damped spring would carry it, rounded on,
      // unless the gate has only just passed one. Rounding on rather than to the nearest keeps the
      // landing going forward: it never runs past and comes back.
      target = Math.max(Math.round(p), Math.ceil(p + Math.max(0, v) / OMEGA - 0.3));
      run();
    }

    engine.current = {
      press(byGhost) {
        if (!props.current.frames.length) return;
        if (held) {
          if (ghost && !byGhost) {
            ghost = false;
            byHand = true;
            setMode("hand");
            sound("press");
          }
          return;
        }
        held = true;
        ghost = byGhost;
        byHand = !byGhost;
        target = null;
        heldAt = performance.now() - holdFor(v) * 1000;
        setPressed(true);
        setMode(byGhost ? "ghost" : "hand");
        sound("press");
        if (reduced) {
          stepped = 0;
          p = Math.round(p) + 1;
        }
        run();
      },
      release,
      releaseGhost() {
        if (ghost) release();
      },
      step(delta) {
        if (!props.current.frames.length || held) return;
        byHand = true;
        target = (target ?? Math.round(p)) + delta;
        if (reduced) p = target;
        run();
      },
      seek(i, hand) {
        const n = props.current.frames.length;
        if (!n || held) return;
        const to = Math.min(n - 1, Math.max(0, i));
        if (!placed) {
          placed = true;
          p = to;
          render();
          return;
        }
        // The shortest way round the roll.
        const from = target ?? Math.round(p);
        let d = mod(to - from, n);
        if (!d) return;
        if (d > n / 2) d -= n;
        byHand = hand;
        target = from + d;
        if (reduced) p = target;
        run();
      },
      load(frames) {
        const generation = ++loading;
        // The frames go into the texture at the size the screen draws them at rest, as the shader works
        // it out, up to 1024 texels on their longest side: a small study holds small frames.
        const { aspect } = props.current;
        const density = Math.min(devicePixelRatio, 2);
        const tall = Math.max(64, Math.min(0.58 * host.clientHeight, (0.62 * host.clientWidth) / aspect) * density);
        const fit = Math.min(1, TEXELS_MAX / Math.max(tall, tall * aspect));
        const width = Math.round(tall * aspect * fit);
        const height = Math.round(tall * fit);
        stage.width = width;
        stage.height = height;
        screen?.allocate(frames.length, width, height);
        shownGate = null;
        render();
        if (!screen) return;
        frames.forEach(({ src }, layer) => {
          const image = new Image();
          image.crossOrigin = "anonymous";
          image.src = src;
          image.decode().then(
            () => {
              if (generation !== loading) return;
              // Cover the frame: crop to its aspect about the centre.
              const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
              const w = image.naturalWidth * scale;
              const h = image.naturalHeight * scale;
              pen.fillStyle = "#000";
              pen.fillRect(0, 0, width, height);
              pen.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
              try {
                screen.upload(layer, stage);
              } catch {
                return; // another origin without CORS: the frame stays blank
              }
              if (!raf) render();
            },
            () => {}, // an image that won't load stays blank
          );
        });
      },
    };

    const resizer = new ResizeObserver(([entry]) => {
      const density = Math.min(devicePixelRatio, 2);
      screen?.resize(Math.max(1, Math.round(entry.contentRect.width * density)), Math.max(1, Math.round(entry.contentRect.height * density)));
      render();
    });
    resizer.observe(canvas);
    const visibility = new IntersectionObserver(([entry]) => {
      visible.current = entry.isIntersecting;
    });
    visibility.observe(canvas);

    return () => {
      cancelAnimationFrame(raf);
      resizer.disconnect();
      visibility.disconnect();
      engine.current = null;
      screen?.dispose();
      canvas.remove();
    };
  }, []);

  useEffect(() => {
    engine.current?.load(props.current.frames);
  }, [roll, aspect]);

  // A new value: from outside it travels on the motor; the reel's own landings are already there.
  useLayoutEffect(() => {
    engine.current?.seek(value, false);
  }, [value, n]);

  // The rehearsal: hold for 2.9 s, so it spools past the bend, let go, rest, and again, until a hand
  // works it. It follows the host's tape: not while it's stopped, and from the moment PLAY goes down.
  const ready = n > 0;
  useEffect(() => {
    if (!rehearse || !ready || reducedMotion()) return;
    const root = rootRef.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running = false;
    const cycle = () => {
      if (touched.current) return;
      if (visible.current) engine.current?.press(true);
      timer = setTimeout(() => {
        engine.current?.releaseGhost();
        timer = setTimeout(cycle, REHEARSAL.rest);
      }, REHEARSAL.hold);
    };
    const begin = () => {
      if (running || touched.current || hostTransport(root) === "stop") return;
      running = true;
      timer = setTimeout(cycle, REHEARSAL.first);
    };
    begin();
    const host = root?.closest("[data-transport]");
    const observer = new MutationObserver(() => hostTransport(root) === "play" && begin());
    if (host) observer.observe(host, { attributes: true, attributeFilter: ["data-transport"] });
    return () => {
      clearTimeout(timer);
      observer.disconnect();
      engine.current?.releaseGhost();
    };
  }, [rehearse, ready]);

  /** A hand arrives: the rehearsal is over. A press that holds takes the ghost's hold over; anything else ends it. */
  function touch(target: EventTarget, holds: boolean) {
    touched.current = true;
    if (!(holds && target instanceof Element && target.closest("[data-hold]"))) engine.current?.releaseGhost();
  }

  // The screen and the key both hold it. Focus goes to the screen, the slider, so the keys carry on from the hand.
  const hold = {
    onPointerDown(e: PointerEvent<HTMLElement>) {
      if (e.button !== 0 || holder.current !== null) return;
      e.preventDefault();
      focusQuietly(screenRef.current);
      e.currentTarget.setPointerCapture(e.pointerId);
      holder.current = e.pointerId;
      engine.current?.press(false);
    },
    onPointerUp: letGo,
    onPointerCancel: letGo,
    onLostPointerCapture: letGo,
    onContextMenu: (e: MouseEvent<HTMLElement>) => e.preventDefault(),
  };
  function letGo(e: PointerEvent<HTMLElement>) {
    if (holder.current !== e.pointerId) return;
    holder.current = null;
    engine.current?.release();
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (e.repeat || holder.current !== null) return;
      holder.current = "key";
      engine.current?.press(false);
      return;
    }
    const delta = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key];
    if (delta) engine.current?.step(delta);
    else if (e.key === "Home") engine.current?.seek(0, true);
    else if (e.key === "End") engine.current?.seek(n - 1, true);
    else return;
    e.preventDefault();
  }
  function onKeyUp(e: KeyboardEvent<HTMLDivElement>) {
    if ((e.key === " " || e.key === "Enter") && holder.current === "key") {
      holder.current = null;
      engine.current?.release();
    }
  }

  // The screen is the slider, on the deck or bare.
  const slider: ComponentProps<"div"> = {
    ref: screenRef,
    role: "slider",
    tabIndex: 0,
    "aria-label": label,
    "aria-orientation": "vertical",
    "aria-valuemin": 1,
    "aria-valuemax": Math.max(1, n),
    "aria-valuenow": at + 1,
    "aria-valuetext": n ? `${frames[at].alt}, ${at + 1} of ${n}` : undefined,
    "aria-describedby": hintId,
    ...hold,
    onKeyDown,
    onKeyUp,
    onBlur() {
      if (holder.current !== "key") return;
      holder.current = null;
      engine.current?.release();
    },
  };
  const canvasHost = (
    <span ref={hostRef} className="absolute inset-0 overflow-hidden rounded-[inherit]">
      {/* Without WebGL2, the frame at the gate, still. */}
      <span data-fallback hidden className="absolute left-1/2 top-1/2 h-[58%] max-w-[62%] -translate-x-1/2 -translate-y-1/2 bg-cover bg-center" style={{ aspectRatio: aspect }} />
    </span>
  );
  const hint = (
    <span id={hintId} className="sr-only">
      Hold Space to spool; the longer the hold, the faster it runs. The arrows step one frame.
    </span>
  );
  const capture = {
    onPointerDownCapture: (e: PointerEvent<HTMLDivElement>) => touch(e.target, e.button === 0),
    onKeyDownCapture: (e: KeyboardEvent<HTMLDivElement>) => touch(e.target, e.key === " " || e.key === "Enter"),
  };

  if (bare) {
    return (
      <div ref={rootRef} {...capture} className={cx("relative size-full select-none", className)}>
        <div {...slider} data-hold className="absolute inset-0 cursor-pointer touch-none outline-offset-[-4px] [background:var(--device-window)] [-webkit-touch-callout:none]">
          {canvasHost}
        </div>
        {/* The frame at the gate, as the deck's LCD has it: its number and title, quiet in a corner. */}
        <p aria-hidden className="pointer-events-none absolute bottom-6 left-6 flex items-baseline gap-3 text-[13px] leading-none text-(--device-lcd-ink)">
          <span ref={counterRef} className="tabular-nums text-(--device-lcd-dim)" />
          <span ref={titleRef} />
        </p>
        {hint}
      </div>
    );
  }

  // Height is what a stage is short of, and the frames are a share of the screen's height. So on a
  // stage 36rem wide or more, the LCD and the key stand in a column beside the screen, not under it,
  // and the screen takes the deck's whole height, widening to 16:9 for landscape frames. Not on the
  // player: there the screen's ground is gone, the column would stand apart from the frames across
  // empty glass, so the deck stacks under a 16:9 screen instead.
  return (
    <div ref={rootRef} {...capture} className={cx("flex flex-col gap-[0.7em] @[36rem]:not-player:flex-row", className)}>
      <div data-part="bezel" className="min-w-0 rounded-[0.7em] @[36rem]:not-player:flex-1 bg-(--device-rim) p-[0.3em] shadow-[0_1px_0_rgb(255_255_255/0.7),inset_0_1px_2px_rgb(0_0_0/0.6)] dark:shadow-[0_1px_0_rgb(255_255_255/0.06),inset_0_1px_2px_rgb(0_0_0/0.6)]">
        <div
          {...slider}
          data-hold
          data-part="screen"
          className="relative block aspect-[4/3] @[36rem]:aspect-[16/9] cursor-pointer touch-none rounded-[0.45em] outline-offset-2 [background:var(--device-window)] [-webkit-touch-callout:none]"
        >
          {canvasHost}
          {/* The glass: a sheen where the light catches it, and its edge. */}
          <span aria-hidden data-part="glass" className="pointer-events-none absolute inset-0 rounded-[inherit] [background:var(--screen-glass)] shadow-(--device-lcd-edge)" />
        </div>
      </div>

      <div className="flex items-stretch gap-[0.55em] @[36rem]:not-player:w-[10em] @[36rem]:not-player:shrink-0 @[36rem]:not-player:flex-col">
        {/* The LCD: the loop writes the frame at the gate, so it counts through the frames with the clicks. */}
        <div
          aria-hidden
          data-part="lcd"
          className="flex h-[3.3em] min-w-0 flex-1 flex-col @[36rem]:not-player:h-auto justify-between overflow-hidden rounded-[0.7em] px-[0.8em] pb-[0.5em] pt-[0.55em] text-(--device-lcd-ink) [background:var(--device-lcd)] shadow-(--device-lcd-edge)"
        >
          <span className="flex items-center justify-between gap-[0.5em]">
            <span data-part="chip" className="inline-flex items-center gap-[0.35em] rounded-[0.4em] bg-white px-[0.42em] py-[0.24em] text-black">
              <span
                className={cx(
                  "size-[0.55em] rounded-full",
                  // Drawn, the dot keeps red while the reel runs by itself; a hand's orange and ready's black are ink.
                  mode === "ghost" ? "animate-pulse bg-(--device-rec) drawn:bg-(--device-rec)!" : mode === "hand" ? "bg-(--device-hold) drawn:bg-(--device-draw-ink)!" : "bg-black drawn:bg-(--device-draw-ink)!",
                )}
              />
              <span className="text-[0.58em] font-semibold uppercase leading-none tracking-[0.02em]">{mode === "ready" ? "Ready" : "FF"}</span>
            </span>
            <span ref={counterRef} className="text-[0.62em] leading-none tabular-nums text-(--device-lcd-dim)" />
          </span>
          <span ref={titleRef} className="truncate text-[1.05em] font-light leading-none tracking-[-0.01em] @[36rem]:not-player:line-clamp-5 @[36rem]:not-player:whitespace-normal @[36rem]:not-player:text-[0.95em] @[36rem]:not-player:leading-[1.2]" />
        </div>

        {/* The key: a second place to hold it, with the speed lights across its top. The screen is the control, so the key is the hand's alone. */}
        <div aria-hidden data-hold data-pressed={pressed || undefined} {...hold} data-part="key" className="group/key w-[4.6em] shrink-0 @[36rem]:not-player:h-[3.3em] @[36rem]:not-player:w-full cursor-pointer touch-none rounded-[0.7em] [-webkit-touch-callout:none]">
          <span className="relative grid h-full place-items-center rounded-[0.7em] text-(--device-key-ink) [background:var(--device-key-face)] shadow-(--device-key-shadow) transition-[transform,box-shadow] duration-(--duration-exit) ease-out group-data-pressed/key:translate-y-[2px] group-data-pressed/key:shadow-(--device-key-shadow-pressed) group-data-pressed/key:duration-75">
            <span className="absolute inset-x-[20%] top-[0.5em] flex h-[0.24em] gap-[0.16em]">
              {Array.from({ length: LIGHTS }, (_, i) => (
                <span
                  key={i}
                  data-light
                  data-part="light"
                  className={cx(
                    "h-full flex-1 rounded-full bg-(--device-meter-off) transition-[background-color,box-shadow] duration-(--duration-exit) data-on:duration-0",
                    // Drawn: lit is filled ink, the redline keeps its red, unlit is the part's hairline alone.
                    i === LIGHTS - 1
                      ? "data-on:bg-(--device-rec) data-on:shadow-[0_0_0.45em_var(--device-rec)] drawn:data-on:bg-(--device-rec)!"
                      : "data-on:bg-(--device-meter-on) drawn:data-on:bg-(--device-draw-ink)!",
                  )}
                />
              ))}
            </span>
            <span data-part="lettering" className="mt-[0.55em] text-[0.8em] font-medium uppercase leading-none tracking-[0.03em] [text-shadow:var(--device-engrave)]">
              Hold
            </span>
          </span>
        </div>
      </div>

      {hint}
    </div>
  );
}

/* --- Demo: a roll of ten landscapes ----------------------------------------- */

// The roll is painted here rather than loaded, so the study stays one file: ten small landscapes in
// muted palettes, clear of the body's red, orange and blue, each with a vignette and film grain,
// encoded once as JPEGs and handed to Spool as ordinary image URLs.

type Pen = CanvasRenderingContext2D;
type Scene = { alt: string; paint: (g: Pen, rand: () => number) => void };

/** The frame being painted: its width and height. Every scene is laid out in fractions of these. */
const size = (g: Pen) => [g.canvas.width, g.canvas.height] as const;

/** A seeded generator (mulberry32), so the roll is the same every visit. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A smooth random line across the frame, 0 → 1: three octaves of value noise. */
function contour(rand: () => number, points: number) {
  const octaves = [points, points * 2.3, points * 5.1].map((k, i) => ({ k, amp: 0.5 ** i, v: Array.from({ length: Math.ceil(k) + 2 }, rand) }));
  const total = octaves.reduce((s, o) => s + o.amp, 0);
  return (x: number) => {
    let sum = 0;
    for (const { k, amp, v } of octaves) {
      const f = x * k;
      const i = Math.floor(f);
      const e = (1 - Math.cos((f - i) * Math.PI)) / 2;
      sum += (v[i] * (1 - e) + v[i + 1] * e) * amp;
    }
    return sum / total;
  };
}

function mix(a: string, b: string, t: number) {
  const c = [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t));
  return `rgb(${c.join(" ")})`;
}

function linear(g: Pen, stops: string[], from = 0, to = g.canvas.height) {
  const gradient = g.createLinearGradient(0, from, 0, to);
  stops.forEach((c, i) => gradient.addColorStop(i / (stops.length - 1), c));
  return gradient;
}

function band(g: Pen, style: string | CanvasGradient, top = 0, bottom = g.canvas.height) {
  const [W] = size(g);
  g.fillStyle = style;
  g.fillRect(0, top, W, bottom - top);
}

/** A sun or a moon, in a halo. */
function disc(g: Pen, x: number, y: number, r: number, colour: string, halo: number) {
  const [W, H] = size(g);
  const glow = g.createRadialGradient(x, y, r, x, y, r * 7);
  glow.addColorStop(0, `rgb(255 255 255 / ${halo})`);
  glow.addColorStop(1, "rgb(255 255 255 / 0)");
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);
  g.fillStyle = colour;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

/** A silhouette across the frame, filled down to the bottom; `crest` lights its top edge. */
function ridge(g: Pen, rand: () => number, base: number, amp: number, colour: string, points: number, crest?: string) {
  const [W, H] = size(g);
  const line = contour(rand, points);
  g.beginPath();
  for (let x = 0; x <= W; x += 4) g.lineTo(x, base + (line(x / W) - 0.5) * amp);
  if (crest) {
    g.strokeStyle = crest;
    g.lineWidth = 1.5;
    g.stroke();
  }
  g.lineTo(W, H);
  g.lineTo(0, H);
  g.closePath();
  g.fillStyle = colour;
  g.fill();
}

const SCENES: Scene[] = [
  {
    alt: "Dusk over the bay",
    paint(g, rand) {
      const [W, H] = size(g);
      band(g, linear(g, ["#252b46", "#4b4f75", "#8e89a7", "#d8c6ce", "#efe2de"], 0, H * 0.62));
      disc(g, W * 0.5, H * 0.55, 20, "#fff7f1", 0.4);
      band(g, linear(g, ["#5b5c7d", "#2b2e48", "#1b1d31"], H * 0.62, H), H * 0.62);
      // The sun's path on the water, breaking up toward the shore.
      for (let y = H * 0.63; y < H; y += 4) {
        const k = (y - H * 0.63) / (H * 0.37);
        const half = 5 + k * 46 * rand();
        g.fillStyle = `rgb(255 240 232 / ${(0.6 * (1 - k) * (0.4 + 0.6 * rand())).toFixed(2)})`;
        g.fillRect(W * 0.5 - half + (rand() - 0.5) * 12, y, half * 2, 1.5);
      }
    },
  },
  {
    alt: "Ridges in mist",
    paint(g, rand) {
      const [W, H] = size(g);
      band(g, linear(g, ["#f1f2ee", "#dfe4df", "#cdd5cf"]));
      disc(g, W * 0.7, H * 0.2, 24, "#fbfbf7", 0.3);
      for (let i = 0; i < 6; i++) ridge(g, rand, H * (0.36 + i * 0.11), 120 - i * 12, mix("#c3ccc6", "#232e29", i / 5), 3 + i);
    },
  },
  {
    alt: "Bamboo at noon",
    paint(g, rand) {
      const [W, H] = size(g);
      const light = g.createLinearGradient(0, 0, W, 0);
      ["#7da373", "#c4dab3", "#e7efda", "#a9c79c"].forEach((c, i) => light.addColorStop(i / 3, c));
      band(g, light);
      const stalks = Array.from({ length: 15 }, () => ({ x: rand() * W, depth: rand() })).sort((a, b) => a.depth - b.depth);
      for (const { x, depth } of stalks) {
        const w = 5 + depth * 24;
        const colour = mix("#b5cea6", "#2a4e37", depth);
        g.fillStyle = colour;
        g.fillRect(x, 0, w, H);
        g.fillStyle = "rgb(255 255 255 / 0.14)";
        g.fillRect(x + w * 0.18, 0, w * 0.14, H);
        for (let y = rand() * 90; y < H; y += 80 + rand() * 60) {
          g.fillStyle = mix("#e6f0d8", "#2a4e37", depth * 0.6);
          g.fillRect(x - 1, y, w + 2, 3);
          g.fillStyle = "rgb(0 0 0 / 0.18)";
          g.fillRect(x - 1, y + 3, w + 2, 1);
        }
      }
    },
  },
  {
    alt: "Moon over the pass",
    paint(g, rand) {
      const [W, H] = size(g);
      band(g, linear(g, ["#0e1322", "#1b2236", "#333c57"], 0, H * 0.8));
      for (let i = 0; i < 90; i++) {
        g.fillStyle = `rgb(255 255 255 / ${(0.15 + rand() * 0.6).toFixed(2)})`;
        g.fillRect(rand() * W, rand() * H * 0.6, rand() < 0.85 ? 1 : 1.6, 1);
      }
      disc(g, W * 0.68, H * 0.24, 22, "#eef0f4", 0.28);
      ridge(g, rand, H * 0.62, 110, "#1d2336", 4);
      ridge(g, rand, H * 0.76, 80, "#0b0e16", 3);
    },
  },
  {
    alt: "Snowfield, low sun",
    paint(g, rand) {
      const [W, H] = size(g);
      band(g, linear(g, ["#c3cfd9", "#e3e9ee", "#f3f5f6"], 0, H * 0.56));
      disc(g, W * 0.18, H * 0.4, 16, "#ffffff", 0.45);
      ridge(g, rand, H * 0.55, 18, "#a9b4be", 6);
      band(g, "#f2f3f1", H * 0.565);
      for (let i = 0; i < 46; i++) {
        const x = rand() * W;
        const tall = 6 + rand() * 14;
        g.fillStyle = "#56606a";
        g.beginPath();
        g.moveTo(x, H * 0.566 - tall);
        g.lineTo(x + tall * 0.3, H * 0.566);
        g.lineTo(x - tall * 0.3, H * 0.566);
        g.fill();
      }
      // Long shadows, raking in from the low sun.
      for (let i = 0; i < 7; i++) {
        const y = H * 0.6 + i * 34 + rand() * 12;
        g.fillStyle = "rgb(190 203 214 / 0.55)";
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(W, y + 40 + rand() * 30);
        g.lineTo(W, y + 48 + rand() * 30);
        g.lineTo(0, y + 6);
        g.fill();
      }
    },
  },
  {
    alt: "Tide pool from above",
    paint(g, rand) {
      const [W, H] = size(g);
      const water = g.createLinearGradient(0, 0, W, H);
      ["#204855", "#3f7a87", "#7fb2b6"].forEach((c, i) => water.addColorStop(i / 2, c));
      band(g, water);
      for (let k = 0; k < 3; k++) {
        const x = W * (0.2 + rand() * 0.6);
        const y = H * (0.2 + rand() * 0.6);
        for (let r = 8; r < 240; r += 12) {
          g.strokeStyle = `rgb(230 245 245 / ${(0.32 * (1 - r / 240)).toFixed(2)})`;
          g.lineWidth = 1.5;
          g.beginPath();
          g.arc(x, y, r, 0, Math.PI * 2);
          g.stroke();
        }
      }
      for (let i = 0; i < 44; i++) {
        g.fillStyle = mix("#1b3840", "#cfe0db", rand());
        g.beginPath();
        g.ellipse(rand() * W, rand() * H, 3 + rand() * 10, 2 + rand() * 7, rand() * Math.PI, 0, Math.PI * 2);
        g.fill();
      }
    },
  },
  {
    alt: "Rain on the river",
    paint(g, rand) {
      const [W, H] = size(g);
      band(g, linear(g, ["#5a686b", "#8a9696", "#b8c0bd"], 0, H * 0.46));
      ridge(g, rand, H * 0.44, 36, "#3a4641", 5);
      band(g, linear(g, ["#7a8888", "#4a5657", "#2f393a"], H * 0.47, H), H * 0.47);
      for (let i = 0; i < 36; i++) {
        g.strokeStyle = "rgb(220 230 230 / 0.25)";
        g.lineWidth = 1;
        g.beginPath();
        const r = 4 + rand() * 14;
        g.ellipse(rand() * W, H * (0.5 + rand() * 0.5), r, r * 0.25, 0, 0, Math.PI * 2);
        g.stroke();
      }
      for (let i = 0; i < 520; i++) {
        const x = rand() * W * 1.2;
        const y = rand() * H;
        const len = 14 + rand() * 18;
        g.strokeStyle = `rgb(235 242 242 / ${(0.1 + rand() * 0.24).toFixed(2)})`;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x - len * 0.22, y + len);
        g.stroke();
      }
    },
  },
  {
    alt: "Dunes, late light",
    paint(g, rand) {
      const [, H] = size(g);
      band(g, linear(g, ["#e9e5dc", "#d8d1c3"], 0, H * 0.4));
      const lit = ["#e2d5bf", "#d3c3a6", "#c6b392"];
      const shade = ["#b5a283", "#a28e6f", "#8d7a5d"];
      for (let i = 0; i < 6; i++) {
        const k = Math.floor(i / 2);
        ridge(g, rand, H * (0.36 + i * 0.12), 90, i % 2 ? shade[k] : lit[k], 2 + i, "rgb(250 245 235 / 0.7)");
      }
    },
  },
  {
    alt: "Fields after rain",
    paint(g, rand) {
      const [W, H] = size(g);
      band(g, linear(g, ["#c1ccc8", "#e4e9e2"], 0, H * 0.5));
      ridge(g, rand, H * 0.49, 14, "#8f9e94", 5);
      const colours = ["#a6bd7b", "#d9d9a3", "#7a9a62", "#c3cd91", "#5e8051", "#b6c788", "#466540", "#9db574"];
      let y = H * 0.5;
      colours.forEach((c, i) => {
        ridge(g, rand, y, 6 + i * 3, c, 3);
        y += 8 * Math.pow(1.38, i);
      });
      // One tree on the rise.
      g.fillStyle = "#3a3a33";
      g.fillRect(W * 0.68 - 2, H * 0.46, 4, 32);
      for (let i = 0; i < 14; i++) {
        g.fillStyle = i % 2 ? "#3d5838" : "#4d6b45";
        g.beginPath();
        g.arc(W * 0.68 + (rand() - 0.5) * 34, H * 0.445 + (rand() - 0.5) * 22, 8 + rand() * 9, 0, Math.PI * 2);
        g.fill();
      }
    },
  },
  {
    alt: "Wave crests",
    paint(g) {
      const [W, H] = size(g);
      band(g, "#1d3049");
      // Rows of concentric arcs, each row overlapping the one behind it.
      const rings = ["#e8efee", "#2c4a68", "#e8efee", "#5d8aa0", "#e8efee", "#22394f"];
      for (let row = -1; row < H / 18 + 2; row++) {
        for (let x = -64 + (row % 2) * 32; x < W + 64; x += 64) {
          rings.forEach((c, i) => {
            g.fillStyle = c;
            g.beginPath();
            g.arc(x, row * 18, 34 - i * 5.5, Math.PI, 0);
            g.fill();
          });
        }
      }
    },
  },
];

/** Finishes a frame as a print: a vignette and film grain. */
function finish(g: Pen, rand: () => number) {
  const [W, H] = size(g);
  const vignette = g.createRadialGradient(W / 2, H * 0.45, H * 0.22, W / 2, H * 0.45, H * 0.78);
  vignette.addColorStop(0, "rgb(0 0 0 / 0)");
  vignette.addColorStop(1, "rgb(0 0 0 / 0.24)");
  g.fillStyle = vignette;
  g.fillRect(0, 0, W, H);
  const image = g.getImageData(0, 0, W, H);
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    const grain = (rand() - 0.5) * 14;
    d[i] += grain;
    d[i + 1] += grain;
    d[i + 2] += grain;
  }
  g.putImageData(image, 0, 0);
}

const developed = new Map<number, Promise<SpoolFrame[]>>();

/**
 * Paints and encodes the roll at an aspect, once a visit, however often it mounts: 512 px tall for
 * portrait frames, 576 for landscape, so the scenes' fixed sizes (a sun, a stalk, a crest) read the same.
 */
function develop(aspect: number) {
  const height = aspect < 1 ? 512 : 576;
  const roll =
    developed.get(aspect) ??
    Promise.all(
      SCENES.map(
        ({ alt, paint }, i) =>
          new Promise<SpoolFrame>((resolve) => {
            const canvas = document.createElement("canvas");
            canvas.width = Math.round(height * aspect);
            canvas.height = height;
            const g = canvas.getContext("2d")!;
            const rand = seeded(i * 7919 + 4);
            paint(g, rand);
            finish(g, rand);
            canvas.toBlob((blob) => resolve({ src: blob ? URL.createObjectURL(blob) : canvas.toDataURL(), alt }), "image/jpeg", 0.88);
          }),
      ),
    );
  developed.set(aspect, roll);
  return roll;
}

/**
 * The roll on a page of its own: the screen fills the window and a hold anywhere spools it. It plays
 * `frames` if it's given any, and the painted roll at `aspect` if not.
 */
export function SpoolFullscreen({ frames: own = [], aspect = 16 / 9 }: { frames?: readonly SpoolFrame[]; aspect?: number }) {
  const [painted, setPainted] = useState<SpoolFrame[]>([]);
  const [value, setValue] = useState(0);
  const mine = own.length > 0;

  useEffect(() => {
    if (mine) return;
    let live = true;
    develop(aspect).then((roll) => live && setPainted(roll));
    return () => {
      live = false;
    };
  }, [mine, aspect]);

  return (
    <div className="fixed inset-0">
      <Spool bare label="Roll 04" aspect={aspect} frames={mine ? own : painted} value={value} onChange={setValue} rehearse />
    </div>
  );
}

/** Where the deck sets its LCD and key beside the screen, and the screen turns landscape: 36rem. */
const WIDE = 576;

/**
 * The study on its plate. It plays `frames` if it's given any, and the painted roll if not: portrait
 * frames on a narrow stage, landscape ones where the deck is wide.
 */
export default function Demo({ frames: own = [] }: { frames?: readonly SpoolFrame[] }) {
  const rootRef = useRef<HTMLDivElement>(null);
  // Unknown until measured, so the frames aren't cropped to one shape and then the other.
  const [wide, setWide] = useState<boolean | null>(null);
  const [painted, setPainted] = useState<SpoolFrame[]>([]);
  const [value, setValue] = useState(0);
  const mine = own.length > 0;
  const aspect = wide ? 16 / 9 : 3 / 4;

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWide(entry.contentRect.width >= WIDE));
    observer.observe(rootRef.current!);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (mine || wide === null) return;
    let live = true;
    develop(aspect).then((roll) => live && setPainted(roll));
    return () => {
      live = false;
    };
  }, [mine, wide, aspect]);

  // Stacked, the deck is held to 380px: any wider and it's too tall for the stages, until there's
  // room to set the LCD and the key beside the screen.
  return (
    <div ref={rootRef} className="@container w-full max-w-[760px] select-none">
      <div data-part="plate" className="relative isolate @max-[36rem]:mx-auto @max-[36rem]:max-w-[380px] @[36rem]:player:mx-auto @[36rem]:player:max-w-[520px] animate-enter overflow-hidden rounded-[1.25em] p-[0.9em] text-[clamp(11px,4cqw,14px)] [background:var(--device-body)] shadow-[var(--device-body-edge),0_1px_2px_rgb(0_0_0/0.06),0_16px_32px_-18px_rgb(0_0_0/0.3)]">
        <div aria-hidden className="device-grain pointer-events-none absolute inset-0 -z-10 rounded-[inherit]" />
        <Spool label="Roll 04" aspect={aspect} frames={wide === null ? [] : mine ? own : painted} value={value} onChange={setValue} rehearse />
      </div>
    </div>
  );
}
