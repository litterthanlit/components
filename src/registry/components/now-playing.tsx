"use client";

import { useEffect, useEffectEvent, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { createSpring, focusQuietly, type Spring } from "@/design-system";
import { hostTransport, play, type SoundName } from "@/lib/sound";

/*
 * A music player's now-playing strip, built from the player's own parts: the
 * track on an LCD, its waveform pressed into a well as a scrubber with a red
 * playhead, and a transport of two keys round a cap seated in a collar.
 *
 * Time belongs to the media clock, not to React. With a `src`, a track plays
 * through a real <audio> element and its currentTime is the clock; without
 * one, a monotonic clock stands in, so the strip previews a queue before any
 * audio loads. A frame loop reads the clock and drives one spring, in
 * permille of the track, and that one update draws the playhead, lights the
 * bars it has passed, writes the clock on the glass and sets the slider's
 * value, so nothing re-renders while a track plays.
 *
 * The hand's seeks land at once and click through each bar they cross; seeks
 * from the keys, and the rewind to the top of a new track, travel on the
 * spring and click as they go. The bars are forty small springs in one loop:
 * they rise from flat as the strip powers up and re-form, left to right, into
 * the next track's waveform when the queue moves on.
 *
 * Above it, a scope plays the music on a screen behind a bezel, in raw
 * WebGL. Each frame warps the last one (it drifts outward, turns and wavers,
 * and pumps inward on the kick), fades it by 5%, and draws a fresh trace
 * over it: a ring whose radius carries a band per drum, and a line across
 * the screen. What builds up is the trail of the last second or so of music.
 * The screen keeps one channel of light, mapped through the track's own
 * palette as it is shown, so a new track recolours the whole trail over
 * 600 ms. The music is the waveform's envelope under the track's own beat:
 * a kick on every beat, a snare on two and four and hats on the eighths, at
 * a tempo seeded from its title. Each band rises at once and falls away, as
 * a meter's bar does; the bar under the playhead lifts with the level and
 * the playhead's glow swells. Paused, the trail fades out and the loop
 * stops; under reduced motion the screen holds a still of the music.
 *
 * The waveform is one tab stop: arrows seek 5 s, Page Up and Down 30 s, Home
 * and End go to either end, and Space plays or pauses.
 */

export type Track = {
  title: string;
  artist: string;
  /** Seconds. With a `src`, the audio's own duration takes over once it loads. */
  duration: number;
  src?: string;
  /** Levels from 0 to 1, any number of them; drawn as forty bars. Seeded from the title when left out. */
  peaks?: number[];
  /** The scope's colours, dark to light, as hex. Picked from the title when left out. */
  palette?: [string, string, string];
};

type NowPlayingProps = {
  tracks: Track[];
  /** The index of the track loaded. */
  track: number;
  onTrackChange: (index: number) => void;
  playing: boolean;
  onPlayingChange: (playing: boolean) => void;
  /** Starts playing on the first frame, unless the viewer prefers less motion or a host's tape is stopped. */
  autoPlay?: boolean;
  /** Seconds into the first track loaded. */
  startAt?: number;
  className?: string;
};

const BARS = 40;
const BAR_WIDTH = 0.014; // of the waveform's width
const BAR_STAGGER = 10; // ms between one bar re-forming and the next: 400 ms across
const BAR_SPRING = { stiffness: 300, damping: 22 }; // a little overshoot, as a meter's bar has
const HEAD_SPRING = { stiffness: 170, damping: 26 }; // the playhead, in permille: critically damped, so a rewind never overshoots the top
const FPS = 25;
const SEEK = 5; // s per arrow
const PAGE = 30; // s per Page Up or Down
const RESTART = 3; // s into a track past which Previous restarts it rather than going back
const BAND_FALL = 3.5; // a band's level drops by this much a second: a meter's bar, not a gate
const FADE_OUT = 1.6; // s the scope runs on after a pause, until its trail has gone
const RECOLOUR = 0.6; // s a new palette takes to sweep in

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");
const now = () => performance.now();
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const pad = (n: number) => String(n).padStart(2, "0");

/** FNV-1a over a title: the seed for a track's waveform and its tempo. */
function seed(title: string) {
  let h = 2166136261;
  for (const ch of title) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** A track's tempo, 84 to 131 BPM, the same every time it plays. */
const bpmOf = (track: Track) => 84 + (seed(track.title) % 48);

/**
 * The music at t seconds into a track: the waveform's envelope, read between its bars' centres, and a band
 * per drum, each a pulse that decays through its beat. A kick on every beat, a snare on two and four, hats on
 * the eighths.
 */
function bandsAt(t: number, duration: number, peaks: number[], bpm: number) {
  const x = Math.min(BARS - 1, Math.max(0, (t / duration) * (BARS - 1)));
  const i = Math.floor(x);
  const env = peaks[i] + (peaks[Math.min(BARS - 1, i + 1)] - peaks[i]) * (x - i);
  const beat = (t * bpm) / 60;
  const phase = beat % 1;
  return {
    env,
    kick: Math.exp(-phase * 7) * env,
    snare: Math.floor(beat) % 2 === 1 ? Math.exp(-phase * 9) * env : 0,
    hat: Math.exp(-((beat * 2) % 1) * 16) * env,
  };
}

/**
 * The scope's palettes: the work behind the glass, so they keep their colours in both themes, and they stay
 * clear of red, orange and the accent's blue, so the screen never reads as a signal.
 */
const PALETTES: [string, string, string][] = [
  ["#0d4a43", "#3fd6a8", "#effcd9"], // aurora: deep teal, mint, a pale lime
  ["#2c1457", "#9a6bff", "#f3ecff"], // ultraviolet
  ["#063244", "#27c4d9", "#e3fcff"], // tide
  ["#22340f", "#a6d94e", "#f8ffdc"], // moss
];
const paletteOf = (track: Track) => track.palette ?? PALETTES[seed(track.title) % PALETTES.length];
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

/** Minutes and seconds, as a screen reader says them. */
const spoken = (s: number) => `${Math.floor(s / 60)}:${pad(Math.floor(s % 60))}`;

/** How many bars the playhead has passed at f. */
const passed = (f: number) => Math.max(0, Math.min(BARS, Math.floor(((f - BAR_WIDTH / 2) / (1 - BAR_WIDTH)) * (BARS - 1)) + 1));

/** A track's forty bars: its own peaks, binned by their loudest, or a signature seeded from its title. */
function peaksOf(track: Track): number[] {
  const { peaks } = track;
  if (peaks?.length) {
    return Array.from({ length: BARS }, (_, i) => {
      const from = Math.floor((i * peaks.length) / BARS);
      const to = Math.max(from + 1, Math.floor(((i + 1) * peaks.length) / BARS));
      return Math.round(Math.min(1, Math.max(0, ...peaks.slice(from, to))) * 100) / 100;
    });
  }
  // The title seeds a small xorshift, so the same track always draws the same waveform, on the server too.
  let h = seed(track.title) | 1;
  const next = () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return (h >>> 0) / 4294967296;
  };
  const raw = Array.from({ length: BARS }, (_, i) => {
    const x = i / (BARS - 1);
    // An intro and an outro, a lift through the middle for the chorus, and the track's own grain.
    const shape = 0.35 + 0.4 * Math.sin(Math.PI * x) ** 0.5 + (x > 0.55 && x < 0.8 ? 0.15 : 0);
    return shape * (0.55 + 0.45 * next());
  });
  return raw.map((v, i) => {
    const smooth = (v * 2 + (raw[i - 1] ?? v) + (raw[i + 1] ?? v)) / 4;
    return Math.round(Math.min(1, Math.max(0.12, smooth)) * 100) / 100;
  });
}

/* --- The scope: raw WebGL, two passes ------------------------------------------ */

const VERTEX = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

/** Feedback: the last frame, warped and faded, under a fresh trace. One channel of light, in red. */
const FEEDBACK = `
precision mediump float;
uniform sampler2D uPrev;
uniform vec2 uRes;
uniform float uTime;
uniform float uKick;
uniform float uSnare;
uniform float uHat;
uniform float uEnv;
uniform float uOn;

mat2 turn(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

// A soft line d from its centre, never thinner than about a pixel and a half.
float glow(float d, float w) { w = max(w, 1.5 / uRes.y); return exp(-d * d / (w * w)); }

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
  float r = length(p);

  // The warp. Reading from nearer the centre carries the trail outward; it turns slowly, a little more
  // on the snare, wavers, and pumps on the kick.
  vec2 q = turn(0.004 + 0.012 * sin(uTime * 0.21) + 0.05 * uSnare * (r - 0.25)) * p;
  q *= 0.982 - 0.03 * uKick;
  q += 0.0025 * vec2(sin(q.y * 11.0 + uTime * 1.1), cos(q.x * 9.0 - uTime * 1.3));
  float last = texture2D(uPrev, q / vec2(aspect, 1.0) + 0.5).r;
  // 5% a frame, less a step, so an 8-bit trail fades all the way out instead of sticking at a glow.
  last = max(0.0, last * 0.95 - 0.006);

  // The ring: its radius carries the music, a band per drum at its own count of lobes.
  float a = atan(p.y, p.x);
  float lobes = uKick * 0.06 * sin(3.0 * a + uTime * 1.7)
              + uSnare * 0.045 * sin(7.0 * a - uTime * 4.3)
              + uHat * 0.03 * sin(19.0 * a + uTime * 8.1);
  float ring = glow(r - (0.17 + 0.06 * uEnv + 0.05 * uKick + lobes), 0.006 + 0.006 * uKick);

  // The line across: the same bands as a trace in time, quieter towards the ends.
  float x = p.x;
  float y = (uKick * 0.5 * sin(x * 5.0 + uTime * 2.0) + uSnare * 0.3 * sin(x * 17.0 - uTime * 6.0) + uHat * 0.2 * sin(x * 41.0 + uTime * 13.0)) * 0.32;
  float line = glow(p.y - y, 0.005) * 0.6 * smoothstep(aspect * 0.5, aspect * 0.2, abs(x));

  float trace = uOn * (ring + line) * (0.45 + 0.55 * uEnv);
  gl_FragColor = vec4(min(1.0, last + trace), 0.0, 0.0, 1.0);
}
`;

/** Present: the light through the palette, from black, with the tube's falloff toward the corners. */
const PRESENT = `
precision mediump float;
uniform sampler2D uLight;
uniform vec2 uRes;
uniform vec3 uFrom[3];
uniform vec3 uTo[3];
uniform float uMix;
uniform float uKick;

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float v = texture2D(uLight, uv).r;
  float m = uMix * uMix * (3.0 - 2.0 * uMix);
  vec3 c0 = mix(uFrom[0], uTo[0], m);
  vec3 c1 = mix(uFrom[1], uTo[1], m);
  vec3 c2 = mix(uFrom[2], uTo[2], m);
  vec3 col = v < 0.3 ? mix(vec3(0.0), c0, v / 0.3) : v < 0.7 ? mix(c0, c1, (v - 0.3) / 0.4) : mix(c1, c2, (v - 0.7) / 0.3);
  // The backlight thumps a little with the kick.
  col += c0 * 0.08 * uKick;
  vec2 e = (uv - 0.5) * vec2(1.0, 1.7);
  col *= 1.0 - 0.55 * dot(e, e);
  gl_FragColor = vec4(col, 1.0);
}
`;

type Frame = { time: number; kick: number; snare: number; hat: number; env: number; on: number; from: number[]; to: number[]; mix: number };

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
}

function link(gl: WebGLRenderingContext, fragment: string) {
  const program = gl.createProgram()!;
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragment));
  gl.bindAttribLocation(program, 0, "aPos");
  gl.linkProgram(program);
  const at = (name: string) => gl.getUniformLocation(program, name);
  return { program, at };
}

/**
 * A scope on a canvas the size of its box (up to 1.5× on dense displays). Feedback ping-pongs between two
 * textures; the present pass maps the light to colour. Returns null without WebGL, and the screen stays black.
 */
function createScope(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("webgl", { antialias: false, alpha: false, preserveDrawingBuffer: true });
  if (!context) return null;
  const gl = context;
  const feedback = link(gl, FEEDBACK);
  const present = link(gl, PRESENT);
  const fb = { prev: feedback.at("uPrev"), res: feedback.at("uRes"), time: feedback.at("uTime"), kick: feedback.at("uKick"), snare: feedback.at("uSnare"), hat: feedback.at("uHat"), env: feedback.at("uEnv"), on: feedback.at("uOn") };
  const pr = { light: present.at("uLight"), res: present.at("uRes"), from: present.at("uFrom"), to: present.at("uTo"), mix: present.at("uMix"), kick: present.at("uKick") };

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  let targets: { texture: WebGLTexture; buffer: WebGLFramebuffer }[] = [];
  let read = 0;

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
  }

  function frame(f: Frame) {
    if (!targets.length) return;
    const write = 1 - read;
    gl.useProgram(feedback.program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, targets[write].buffer);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, targets[read].texture);
    gl.uniform1i(fb.prev, 0);
    gl.uniform2f(fb.res, canvas.width, canvas.height);
    gl.uniform1f(fb.time, f.time);
    gl.uniform1f(fb.kick, f.kick);
    gl.uniform1f(fb.snare, f.snare);
    gl.uniform1f(fb.hat, f.hat);
    gl.uniform1f(fb.env, f.env);
    gl.uniform1f(fb.on, f.on);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.useProgram(present.program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, targets[write].texture);
    gl.uniform1i(pr.light, 0);
    gl.uniform2f(pr.res, canvas.width, canvas.height);
    gl.uniform3fv(pr.from, f.from);
    gl.uniform3fv(pr.to, f.to);
    gl.uniform1f(pr.mix, f.mix);
    gl.uniform1f(pr.kick, f.kick);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    read = write;
  }

  return {
    resize,
    frame,
    dispose: () => gl.getExtension("WEBGL_lose_context")?.loseContext(),
  };
}

/** Focus that follows the hand: no ring, and the keys pick up where the hand left off. */
const focusOnPress = (e: PointerEvent<HTMLElement>) => {
  if (e.button === 0) focusQuietly(e.currentTarget);
};

/** A raised key's face, sinking 2px onto its base. */
const face =
  "grid size-full place-items-center rounded-[0.7em] text-(--device-key-ink) [background:var(--device-key-face)] shadow-(--device-key-shadow) transition-[transform,box-shadow] duration-(--duration-exit) ease-out group-active/key:translate-y-[2px] group-active/key:shadow-(--device-key-shadow-pressed) group-active/key:duration-75";

/** Previous and next: a bar and a triangle, printed on the key. */
function SkipGlyph({ back }: { back?: boolean }) {
  return (
    <svg aria-hidden data-part="lettering" viewBox="0 0 16 16" className={cx("size-[1.05em] fill-current [filter:var(--device-engrave-glyph)] drawn:fill-(--device-draw-ink)!", back && "-scale-x-100")}>
      <path d="M3 3.2 10.6 8 3 12.8z" />
      <rect x="11.2" y="3.2" width="1.9" height="9.6" rx="0.4" />
    </svg>
  );
}

export function NowPlaying({ tracks, track, onTrackChange, playing, onPlayingChange, autoPlay = false, startAt = 0, className }: NowPlayingProps) {
  const [announcement, setAnnouncement] = useState("");
  const ids = useId();
  const current = tracks[track];
  const peaks = peaksOf(current);

  const rootRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const barsRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<HTMLSpanElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const head = useRef<Spring | null>(null);
  const reform = useRef<((to: number[], instant: boolean) => void) | null>(null);
  /** Where the media clock stood at `since`, and whether it is running; read only without a `src`. */
  const clock = useRef({ pos: 0, since: 0, running: false });
  const loaded = useRef(-1); // the track the clock is on
  const gliding = useRef(false); // the playhead is travelling on the spring, not riding the clock
  const dragging = useRef<number | null>(null); // the pointer scrubbing the waveform
  const visible = useRef(true);
  const wake = useRef<(() => void) | null>(null); // restarts the frame loop when the strip scrolls back into view
  const wakeScope = useRef<(() => void) | null>(null); // and the scope's
  const screenRef = useRef<HTMLSpanElement>(null);
  const touched = useRef(false); // a hand has worked it: it may sound while the host is paused
  // Props the loops and the spring read when they fire, rather than when they were made.
  const props = useRef({ tracks, track, onTrackChange, onPlayingChange, startAt });
  useLayoutEffect(() => {
    props.current = { tracks, track, onTrackChange, onPlayingChange, startAt };
  });

  /** What the strip does by itself sounds only while the host plays, or once a hand has worked it. */
  function sound(name: SoundName, options?: { gain?: number; pitch?: number }) {
    if (touched.current || hostTransport(rootRef.current) === "play") play(name, options);
  }

  function duration() {
    const { tracks, track } = props.current;
    const a = audioRef.current;
    return a && tracks[track].src && Number.isFinite(a.duration) && a.duration > 0 ? a.duration : tracks[track].duration;
  }

  /** Seconds into the track, from whichever clock is running it. */
  function position() {
    const a = audioRef.current;
    if (a && props.current.tracks[props.current.track].src) return a.currentTime;
    const c = clock.current;
    return Math.min(duration(), c.running ? c.pos + (now() - c.since) / 1000 : c.pos);
  }

  // The playhead's spring, in permille of the track. Its one update draws everything that tells the
  // time: the playhead, the bars it has passed, the clock on the glass and the slider's value.
  useLayoutEffect(() => {
    const root = rootRef.current!;
    const slider = sliderRef.current!;
    const bars = [...barsRef.current!.querySelectorAll<HTMLElement>("[data-bar]")];
    let lit = 0;
    let frame = -1;
    let second = -1;
    const s = createSpring(0, HEAD_SPRING, (permille) => {
      const f = Math.min(1, Math.max(0, permille / 1000));
      root.style.setProperty("--p", `${(f * 100).toFixed(3)}%`);

      const n = passed(f);
      if (n !== lit) {
        for (let i = Math.min(n, lit); i < Math.max(n, lit); i++) bars[i].toggleAttribute("data-played", i < n);
        // Crossing a bar under the hand, or on the spring, clicks: pitched with where it is in the track.
        if (dragging.current !== null || gliding.current) sound("tick", { gain: 0.45, pitch: 0.9 + f * 0.25 });
        lit = n;
      }

      const t = f * duration();
      const frames = Math.floor(t * FPS);
      if (frames !== frame && clockRef.current) {
        frame = frames;
        const [m, sec, fr] = clockRef.current.querySelectorAll<HTMLElement>("[data-figure]");
        m.textContent = pad(Math.floor(t / 60));
        sec.textContent = pad(Math.floor(t % 60));
        fr.textContent = pad(frames % FPS);
      }
      if (Math.floor(t) !== second) {
        second = Math.floor(t);
        slider.setAttribute("aria-valuenow", String(second));
        slider.setAttribute("aria-valuemax", String(Math.round(duration())));
        slider.setAttribute("aria-valuetext", `${spoken(t)} of ${spoken(duration())}`);
      }
    });
    head.current = s;
    return () => s.stop();
  }, []);

  // The bars: forty small springs, integrated in one loop in the same fixed steps as createSpring, each
  // starting BAR_STAGGER after its neighbour, so a new waveform sweeps in from the left.
  useLayoutEffect(() => {
    const els = [...barsRef.current!.querySelectorAll<HTMLElement>("[data-bar]")];
    const bars = els.map(() => ({ h: 0, v: 0, to: 0, at: 0 }));
    const write = (i: number) => els[i].style.setProperty("--h", Math.max(0, bars[i].h).toFixed(3));
    let raf = 0;
    let last = 0;

    function step(t: number) {
      let dt = Math.min(0.064, last ? (t - last) / 1000 : 1 / 240);
      last = t;
      let moving = false;
      while (dt > 0) {
        const h = Math.min(1 / 240, dt);
        for (const b of bars) {
          if (t < b.at) continue;
          b.v += (-BAR_SPRING.stiffness * (b.h - b.to) - BAR_SPRING.damping * b.v) * h;
          b.h += b.v * h;
        }
        dt -= h;
      }
      bars.forEach((b, i) => {
        if (t >= b.at && Math.abs(b.v) < 0.005 && Math.abs(b.h - b.to) < 0.002) {
          b.h = b.to;
          b.v = 0;
        } else moving = true;
        write(i);
      });
      if (moving) raf = requestAnimationFrame(step);
      else {
        raf = 0;
        last = 0;
      }
    }

    reform.current = (to, instant) => {
      const start = now();
      bars.forEach((b, i) => {
        b.to = to[i];
        b.at = start + i * BAR_STAGGER;
        if (instant) {
          b.h = b.to;
          b.v = 0;
          write(i);
        }
      });
      if (!instant && !raf) raf = requestAnimationFrame(step);
    };
    return () => cancelAnimationFrame(raf);
  }, []);

  // A track loads: the clock goes to its top (or to `startAt`, the first time), the playhead rewinds there
  // on the spring and the bars re-form. On the first frame the bars rise from flat.
  useLayoutEffect(() => {
    const first = loaded.current === -1;
    if (loaded.current === track) return;
    loaded.current = track;
    const { tracks, startAt } = props.current;
    const pos = first ? Math.min(Math.max(0, startAt), tracks[track].duration) : 0;
    clock.current = { pos, since: now(), running: clock.current.running };
    const a = audioRef.current;
    if (a && tracks[track].src) a.currentTime = pos;
    const still = reduced();
    reform.current!(peaksOf(tracks[track]), still);
    const permille = (pos / duration()) * 1000;
    if (first || still) {
      gliding.current = false;
      head.current!.jump(permille);
    } else {
      gliding.current = true;
      head.current!.set(permille);
    }
  }, [track]);

  /** Seconds to go to; by hand it lands at once, from the keys it travels on the spring. */
  function seek(to: number, hand: boolean) {
    const end = duration();
    const t = Math.min(end, Math.max(0, to));
    clock.current = { ...clock.current, pos: t, since: now() };
    const a = audioRef.current;
    if (a && current.src) a.currentTime = t;
    if (hand || reduced()) {
      gliding.current = false;
      head.current!.jump((t / end) * 1000);
    } else {
      gliding.current = true;
      head.current!.set((t / end) * 1000);
    }
  }

  /** The end of a track: on to the next, or stop at the end of the queue. */
  function ended() {
    const { tracks, track, onTrackChange, onPlayingChange } = props.current;
    if (track < tracks.length - 1) {
      sound("select", { gain: 0.4 });
      onTrackChange(track + 1);
      setAnnouncement(`Now playing ${tracks[track + 1].title}, ${tracks[track + 1].artist}`);
    } else {
      clock.current = { ...clock.current, pos: duration(), running: false };
      sound("stop", { gain: 0.6 });
      onPlayingChange(false);
      setAnnouncement("End of the queue");
    }
  }

  // The clock runs while playing. A frame loop draws while the strip is on screen; a slow check finds the end
  // of a track even while it isn't, as a real track would end behind a scrolled page.
  const follow = useEffectEvent(() => {
    const target = (position() / duration()) * 1000;
    const s = head.current!;
    if (gliding.current) {
      s.set(target);
      if (Math.abs(s.value - target) < 1) gliding.current = false;
    } else s.jump(target);
  });
  const checkEnd = useEffectEvent(() => {
    if (!current.src && position() >= duration()) ended();
  });
  const startAudio = useEffectEvent((on: boolean) => {
    const a = audioRef.current;
    if (!a || !current.src) return;
    if (on) a.play().catch(() => props.current.onPlayingChange(false));
    else a.pause();
  });

  useEffect(() => {
    const c = clock.current;
    if (playing && !c.running) clock.current = { pos: c.pos, since: now(), running: true };
    else if (!playing && c.running) clock.current = { pos: Math.min(c.pos + (now() - c.since) / 1000, props.current.tracks[track].duration), since: now(), running: false };
    startAudio(playing);
    if (!playing) return;

    let raf = 0;
    const frame = () => {
      raf = 0;
      if (!visible.current) return;
      follow();
      raf = requestAnimationFrame(frame);
    };
    wake.current = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    wake.current();
    const id = setInterval(checkEnd, 100);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(id);
      wake.current = null;
    };
  }, [playing, track]);

  // The scope. One loop reads the music at the playhead, lets each band fall away as a meter's bar does,
  // lifts the bar under the playhead, swells its glow and draws the screen. Paused, it runs on with the
  // trace off until the trail has faded, then stops; a new track's palette sweeps in on the same loop.
  const music = useEffectEvent(() => {
    const { tracks, track } = props.current;
    return { on: playing, track, ...bandsAt(position(), duration(), peaksOf(tracks[track]), bpmOf(tracks[track])) };
  });
  useEffect(() => {
    const root = rootRef.current!;
    const host = screenRef.current!;
    const bars = [...barsRef.current!.querySelectorAll<HTMLElement>("[data-bar]")];
    // Made here rather than rendered: the cleanup loses its context for good, so every mount needs its own.
    const canvas = document.createElement("canvas");
    // Drawn, the screen keeps a quiet grayscale of its trail, as Gradient Keys' does.
    canvas.className = "block size-full drawn:opacity-60!";
    host.append(canvas);
    const scope = createScope(canvas);
    scope?.resize();
    const still = reduced();
    const first = music();
    const level = { kick: 0, snare: 0, hat: 0, env: 0, lv: 0 };
    const palette = { track: first.track, from: paletteOf(props.current.tracks[first.track]).flatMap(rgb), to: [] as number[], mix: 1 };
    palette.to = palette.from;
    let time = 0;
    let idle = FADE_OUT;
    let at = -1;
    let raf = 0;
    let last = 0;

    function step(dt: number) {
      const m = music();
      if (m.track !== palette.track) {
        const shown = palette.from.map((v, i) => v + (palette.to[i] - v) * palette.mix);
        palette.track = m.track;
        palette.from = shown;
        palette.to = paletteOf(props.current.tracks[m.track]).flatMap(rgb);
        palette.mix = still ? 1 : 0;
      }
      palette.mix = Math.min(1, palette.mix + dt / RECOLOUR);
      idle = m.on ? 0 : idle + dt;
      for (const band of ["kick", "snare", "hat"] as const) level[band] = Math.max(m.on ? m[band] : 0, level[band] - BAND_FALL * dt);
      level.env = m.on ? m.env : Math.max(0, level.env - BAND_FALL * dt);
      level.lv = Math.max(m.on ? 0.42 * m.env + 0.5 * Math.max(m.kick, m.snare) : 0, level.lv - BAND_FALL * dt);
      root.style.setProperty("--lv", Math.min(1, level.lv).toFixed(3));
      // The bar the playhead is on: the last one it has reached.
      const next = m.on ? passed(head.current!.value / 1000) - 1 : -1;
      if (next !== at) {
        if (at >= 0) delete bars[at].dataset.at;
        if (next >= 0) bars[next].dataset.at = "";
        at = next;
      }
      time += dt;
      scope?.frame({ time, ...level, on: m.on || still ? 1 : 0, from: palette.from, to: palette.to, mix: palette.mix });
      return m.on || idle < FADE_OUT || palette.mix < 1;
    }

    /** Reduced motion: no loop, a still of the music built up over a second. */
    function hold() {
      for (let i = 0; i < 60; i++) step(1 / 60);
      root.style.setProperty("--lv", "0");
    }

    function frame(t: number) {
      raf = 0;
      const dt = last ? Math.min(0.05, (t - last) / 1000) : 1 / 60;
      last = t;
      if (step(dt) && visible.current) raf = requestAnimationFrame(frame);
      else last = 0;
    }

    wakeScope.current = () => {
      if (still) hold();
      else if (!raf && visible.current) raf = requestAnimationFrame(frame);
    };
    const resize = new ResizeObserver(() => {
      scope?.resize();
      if (still) hold();
      else wakeScope.current?.();
    });
    resize.observe(canvas);
    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
      wakeScope.current = null;
      scope?.dispose();
      canvas.remove();
    };
  }, []);
  useEffect(() => wakeScope.current?.(), [playing, track]);

  // Off screen, the frame loop rests; the clock keeps time.
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      visible.current = entry.isIntersecting;
      if (visible.current) {
        wake.current?.();
        wakeScope.current?.();
      }
    });
    observer.observe(rootRef.current!);
    return () => observer.disconnect();
  }, []);

  // Autoplay: start on the first frame, unless the viewer prefers less motion or the host's tape is stopped.
  // Then follow the host: its PLAY starts the strip, its STOP stops it. Paused, it plays on, quietly.
  const setPlaying = useEffectEvent((on: boolean) => props.current.onPlayingChange(on));
  useEffect(() => {
    if (!autoPlay) return;
    const root = rootRef.current;
    const start = requestAnimationFrame(() => {
      if (!reduced() && hostTransport(root) !== "stop") setPlaying(true);
    });
    const host = root?.closest("[data-transport]");
    let last = hostTransport(root);
    const observer = new MutationObserver(() => {
      const next = hostTransport(root);
      if (next === last) return;
      last = next;
      if (next === "play" && !reduced()) setPlaying(true);
      else if (next === "stop") setPlaying(false);
    });
    if (host) observer.observe(host, { attributes: true, attributeFilter: ["data-transport"] });
    return () => {
      cancelAnimationFrame(start);
      observer.disconnect();
    };
  }, [autoPlay]);

  /* --- Moves -------------------------------------------------------------- */

  function toggle() {
    play(playing ? "stop" : "start", { gain: playing ? 0.6 : 0.8 });
    if (!playing && position() >= duration()) seek(0, true);
    onPlayingChange(!playing);
    setAnnouncement(playing ? "Paused" : `Playing ${current.title}, ${current.artist}`);
  }

  function previous() {
    if (position() > RESTART) return seek(0, false);
    if (track === 0) return play("bump", { gain: 0.6 });
    onTrackChange(track - 1);
    setAnnouncement(`${tracks[track - 1].title}, ${tracks[track - 1].artist}`);
  }

  function next() {
    if (track === tracks.length - 1) return play("bump", { gain: 0.6 });
    onTrackChange(track + 1);
    setAnnouncement(`${tracks[track + 1].title}, ${tracks[track + 1].artist}`);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      return toggle();
    }
    const delta = { ArrowRight: SEEK, ArrowUp: SEEK, ArrowLeft: -SEEK, ArrowDown: -SEEK, PageUp: PAGE, PageDown: -PAGE }[e.key];
    const at = position();
    const end = duration();
    let to: number;
    if (delta) to = at + delta;
    else if (e.key === "Home") to = 0;
    else if (e.key === "End") to = end;
    else return;
    e.preventDefault();
    if ((to <= 0 && at <= 0) || (to >= end && at >= end)) return play("bump", { gain: 0.6 });
    seek(to, false);
  }

  /** The pointer's place along the waveform, from 0 to 1. */
  function along(e: PointerEvent<HTMLElement>) {
    const r = barsRef.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    focusQuietly(e.currentTarget);
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = e.pointerId;
    play("press", { gain: 0.6 });
    seek(along(e) * duration(), true);
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (dragging.current === e.pointerId) seek(along(e) * duration(), true);
  }
  function onPointerEnd(e: PointerEvent<HTMLDivElement>) {
    if (dragging.current !== e.pointerId) return;
    dragging.current = null;
    play("release", { gain: 0.6 });
    // Let go at the very end: the track is over.
    if (playing && position() >= duration()) ended();
  }

  /* --- Render ------------------------------------------------------------- */

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label="Now playing"
      onPointerDownCapture={() => (touched.current = true)}
      onKeyDownCapture={() => (touched.current = true)}
      className={cx("@container w-full max-w-[380px] select-none", className)}
    >
      {/* A plate cut from the player's body: the same bead-blasted finish and lit top edge. */}
      <div data-part="plate" className="relative isolate flex animate-enter flex-col gap-[0.7em] overflow-hidden rounded-[1.25em] p-[0.9em] text-[clamp(11px,4cqw,14px)] [background:var(--device-body)] shadow-[var(--device-body-edge),0_1px_2px_rgb(0_0_0/0.06),0_16px_32px_-18px_rgb(0_0_0/0.3)]">
        <div aria-hidden className="device-grain pointer-events-none absolute inset-0 -z-10 rounded-[inherit]" />

        {/* The screen: the scope behind glass, in a black bezel. */}
        <div data-part="bezel" className="rounded-[1.05em] bg-(--device-rim) p-[0.3em] shadow-[0_1px_0_rgb(255_255_255/0.7),inset_0_1px_2px_rgb(0_0_0/0.6)] dark:shadow-[0_1px_0_rgb(255_255_255/0.06),inset_0_1px_2px_rgb(0_0_0/0.6)]">
          <div data-part="screen" className="relative aspect-[3/1] rounded-[0.75em] bg-black">
            <span ref={screenRef} aria-hidden className="absolute inset-0 overflow-hidden rounded-[inherit]" />
            <span aria-hidden data-part="glass" className="pointer-events-none absolute inset-0 rounded-[inherit] [background:var(--screen-glass)] shadow-(--device-lcd-edge)" />
          </div>
        </div>

        {/* The LCD: the state, the track and the clock. The clock is written by the playhead's spring. */}
        <div aria-hidden data-part="lcd" className="flex min-w-0 flex-col gap-[0.45em] overflow-hidden rounded-[0.7em] px-[0.8em] pb-[0.6em] pt-[0.6em] text-(--device-lcd-ink) [background:var(--device-lcd)] shadow-(--device-lcd-edge)">
          <div className="flex items-center gap-[0.5em]">
            <span data-part="chip" className="inline-flex items-center gap-[0.35em] rounded-[0.4em] bg-white px-[0.42em] py-[0.24em] text-black">
              {playing ? (
                <span className="size-[0.55em] animate-pulse rounded-full bg-(--device-rec) drawn:bg-(--device-rec)!" />
              ) : (
                <span className="flex h-[0.55em] gap-[0.12em]">
                  <span className="w-[0.17em] bg-current drawn:bg-(--device-draw-ink)!" />
                  <span className="w-[0.17em] bg-current drawn:bg-(--device-draw-ink)!" />
                </span>
              )}
              <span className="text-[0.58em] font-semibold uppercase leading-none tracking-[0.02em]">{playing ? "Play" : "Pause"}</span>
            </span>
            <span className="ml-auto text-[0.66em] tabular-nums text-(--device-lcd-dim) drawn:text-[color-mix(in_oklab,var(--device-draw-ink)_70%,transparent)]!">
              {pad(track + 1)} / {pad(tracks.length)}
            </span>
          </div>
          <div className="flex min-w-0 flex-col gap-[0.3em]">
            <span className="truncate text-[1.05em] font-light leading-[1.1] tracking-[-0.01em]">{current.title}</span>
            <span className="flex items-baseline gap-[0.6em]">
              <span className="min-w-0 flex-1 truncate text-[0.72em] leading-none text-(--device-lcd-dim) drawn:text-[color-mix(in_oklab,var(--device-draw-ink)_70%,transparent)]!">{current.artist}</span>
              <span ref={clockRef} className="shrink-0 text-[0.78em] font-light leading-none tabular-nums tracking-[-0.02em]">
                {(["M", "S", "F"] as const).map((unit, i) => (
                  <span key={unit} className={i ? "ml-[0.3em]" : undefined}>
                    <span data-figure>00</span>
                    <span className="text-[0.7em] text-(--device-lcd-dim) drawn:text-[color-mix(in_oklab,var(--device-draw-ink)_70%,transparent)]!">{unit}</span>
                  </span>
                ))}
              </span>
            </span>
          </div>
        </div>

        {/* The waveform, pressed into the plate: a slider over the track. Bars the playhead has passed are lit. */}
        <div
          ref={sliderRef}
          role="slider"
          tabIndex={0}
          aria-label="Seek"
          aria-describedby={`${ids}-seek`}
          aria-orientation="horizontal"
          aria-valuemin={0}
          aria-valuemax={Math.round(current.duration)}
          // The playhead's spring keeps the value (and its text) current; React only seeds it.
          aria-valuenow={0}
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          data-part="well"
          className="relative h-[3.6em] cursor-pointer touch-none rounded-[1.05em] bg-(--device-well) shadow-(--device-recess) outline-offset-2"
        >
          <div ref={barsRef} className="absolute inset-x-[0.85em] inset-y-[0.6em] flex items-center justify-between">
            {peaks.map((_, i) => (
              <span
                key={i}
                aria-hidden
                data-bar
                className="w-[1.4%] rounded-full bg-(--device-meter-off) data-at:[scale:1_calc(1+var(--lv,0)*0.45)] data-played:bg-(--device-meter-on) drawn:bg-(--device-draw-line)! drawn:data-played:bg-(--device-draw-ink)!"
                style={{ height: "max(0.2em, calc(var(--h, 0) * 100%))" }}
              />
            ))}
            {/* The playhead: red, as the tape's is, and lit. */}
            <span
              aria-hidden
              data-part="light"
              className="absolute -inset-y-[0.2em] left-(--p,0%) -ml-px w-[2px] rounded-full bg-(--device-rec) shadow-[0_0_calc(0.3em+var(--lv,0)*0.5em)_var(--device-rec)] drawn:bg-(--device-rec)!"
            />
          </div>
        </div>

        {/* The transport: previous and next round PLAY, a cap seated in a collar. */}
        <div className="flex items-center justify-center gap-[0.9em]">
          <button type="button" data-sound="key" aria-label="Previous track" onPointerDown={focusOnPress} onClick={previous} data-part="key" className="group/key h-[2.6em] w-[3.4em] rounded-[0.7em] outline-offset-2">
            <span className={face}>
              <SkipGlyph back />
            </span>
          </button>

          <button
            type="button"
            aria-label={playing ? "Pause" : "Play"}
            onPointerDown={focusOnPress}
            onClick={toggle}
            data-part="collar"
            className="group/key grid size-[3.7em] shrink-0 place-items-center rounded-full bg-black/[0.035] p-[0.26em] shadow-(--device-recess) outline-offset-2 dark:bg-black/30"
          >
            <span data-part="cap" className="grid size-full place-items-center rounded-full [background:var(--device-wheel-face)] shadow-(--device-key-shadow) transition-[transform,box-shadow] duration-(--duration-exit) ease-out group-active/key:translate-y-[2px] group-active/key:shadow-(--device-key-shadow-pressed) group-active/key:duration-75">
              {playing ? (
                <span aria-hidden data-part="lettering" className="flex h-[1em] gap-[0.22em]">
                  <span className="w-[0.3em] rounded-[0.08em] bg-(--device-key-ink) drawn:bg-(--device-draw-ink)!" />
                  <span className="w-[0.3em] rounded-[0.08em] bg-(--device-key-ink) drawn:bg-(--device-draw-ink)!" />
                </span>
              ) : (
                <svg aria-hidden data-part="lettering" viewBox="0 0 16 16" className="ml-[0.12em] size-[1.25em] fill-(--device-rec)">
                  <path d="M4.5 2.4 13.2 8l-8.7 5.6z" />
                </svg>
              )}
            </span>
          </button>

          <button type="button" data-sound="key" aria-label="Next track" onPointerDown={focusOnPress} onClick={next} data-part="key" className="group/key h-[2.6em] w-[3.4em] rounded-[0.7em] outline-offset-2">
            <span className={face}>
              <SkipGlyph />
            </span>
          </button>
        </div>
      </div>

      {current.src && <audio ref={audioRef} src={current.src} preload="metadata" onEnded={ended} />}
      <p id={`${ids}-seek`} className="sr-only">
        Arrow keys seek {SEEK} seconds, Page Up and Page Down {PAGE}. Space plays or pauses.
      </p>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

/* --- Demo: side A, from the last seconds of its first track ----------------- */

const SIDE_A: Track[] = [
  { title: "Low thock", artist: "The Detents", duration: 211, palette: PALETTES[2] },
  { title: "Over centre", artist: "The Detents", duration: 178, palette: PALETTES[1] },
  { title: "Unity gain", artist: "The Detents", duration: 252, palette: PALETTES[0] },
  { title: "Room tone", artist: "The Detents", duration: 185, palette: PALETTES[3] },
];

export default function Demo() {
  const [track, setTrack] = useState(0);
  const [playing, setPlaying] = useState(false);
  return (
    <NowPlaying
      tracks={SIDE_A}
      track={track}
      onTrackChange={setTrack}
      playing={playing}
      onPlayingChange={setPlaying}
      autoPlay
      // Two and a half seconds from the end, so the first four show the queue moving on.
      startAt={SIDE_A[0].duration - 2.5}
    />
  );
}
