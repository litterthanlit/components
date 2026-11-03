"use client";

import { useEffect, useEffectEvent, useId, useLayoutEffect, useRef, useState, type DragEvent, type KeyboardEvent, type PointerEvent } from "react";
import { createSpring, focusQuietly, type Spring } from "@/design-system";
import { hostTransport, play, type SoundName } from "@/lib/sound";

/*
 * A music player after a hi-fi deck's display: a spectrum analyser on a dot
 * matrix behind a black bezel, over a slim waveform pressed into a well as
 * the scrubber, with a red playhead, and one row of controls: PLAY, a cap
 * seated in a collar; the track and its clock on a small LCD; Next; Eject.
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
 * The matrix is 32 columns of twelve dots, in the LCD's ink over ghosts at
 * 8%, with a meter's ballistics: a column rises at once and falls at 26 dB a
 * second, and a peak dot holds 900 ms before it falls at 12 dB a second.
 * Its bands are spaced by ratio from 30 Hz to 16 kHz. When a track's audio
 * can be listened to (a local file, a path on this site, or a source sent
 * with CORS), an analyser on the audio graph fills them; otherwise a model
 * does: the waveform's envelope under the track's own beat, a kick on every
 * beat, a snare on two and four and hats on the eighths, at a tempo seeded
 * from its title. The same level lifts the bar under the playhead and
 * swells its glow. Paused, the columns fall to rest and the loop stops;
 * under reduced motion the matrix holds a still of the music.
 *
 * Given `onLoad`, an Eject key opens a file picker and the plate takes audio
 * files dropped on it; its light turns orange while a file is held over it.
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
};

const COLS = 32; // the matrix's bands, spaced by ratio from 30 Hz to 16 kHz
const ROWS = 12;
const FALL = 0.65; // of the matrix's height a second: 26 dB on its 40 dB scale
const HOLD = 0.9; // s a peak dot waits before it falls
const PEAK_FALL = 0.3; // 12 dB a second

/** The matrix's dots, on a 4-unit pitch, row 0 at the bottom. Integers, so the server and the browser agree. */
const DOTS = Array.from({ length: COLS * ROWS }, (_, i) => ({ c: i % COLS, r: Math.floor(i / COLS), x: (i % COLS) * 4 + 2, y: (ROWS - 1 - Math.floor(i / COLS)) * 4 + 2 }));

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
  /**
   * Sent with every `src`. Absolute URLs are only analysed with it, and their server must answer with CORS
   * headers: a browser silences cross-origin audio routed through an analyser without them.
   */
  crossOrigin?: "anonymous" | "use-credentials";
  /** Audio files chosen with the Eject key or dropped on the plate. Without it, neither is offered. */
  onLoad?: (files: File[]) => void;
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
const BAND_FALL = 3.5; // the playhead's level drops by this much a second: a meter's bar, not a gate

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

/* --- Listening: an analyser on the audio graph --------------------------------- */

/**
 * Whether a source can be analysed without silencing it: a local file (blob:, data:), a path on this site,
 * or anything sent with CORS. Decided from the string alone, so the server and the browser agree.
 */
const listenable = (src: string | undefined, crossOrigin?: string) =>
  !!src && (!!crossOrigin || /^(blob:|data:)/.test(src) || (!src.startsWith("//") && !/^[a-z][a-z0-9+.-]*:/i.test(src)));

type Ear = { context: AudioContext; analyser: AnalyserNode; spectrum: Uint8Array<ArrayBuffer>; wave: Uint8Array<ArrayBuffer>; slow: number[] };

/** One graph per media element: a browser lets an element be a source only once, for good. */
const ears = new WeakMap<HTMLMediaElement, Ear>();

function earFor(el: HTMLMediaElement): Ear {
  let ear = ears.get(el);
  if (!ear) {
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024; // 512 bins of about 47 Hz at 48 kHz
    analyser.smoothingTimeConstant = 0.55;
    analyser.minDecibels = -85;
    analyser.maxDecibels = -20;
    context.createMediaElementSource(el).connect(analyser);
    analyser.connect(context.destination);
    ear = { context, analyser, spectrum: new Uint8Array(analyser.frequencyBinCount), wave: new Uint8Array(analyser.fftSize), slow: [0, 0, 0] };
    ears.set(el, ear);
  }
  return ear;
}

const BANDS: [number, number][] = [
  [35, 150], // the kick
  [300, 2500], // the snare's body and crack
  [5000, 12000], // the hats
];

/**
 * The music as the analyser hears it, in the model's terms. Each band is its loudness plus three times its
 * rise over a running average of the last 0.4 s, so a sustained bass hums while a kick still punches.
 */
function listen(ear: Ear, dt: number) {
  const { analyser, context, spectrum, wave, slow } = ear;
  analyser.getByteFrequencyData(spectrum);
  analyser.getByteTimeDomainData(wave);
  const hz = context.sampleRate / analyser.fftSize;
  const k = 1 - Math.exp(-dt / 0.4);
  const [kick, snare, hat] = BANDS.map(([lo, hi], b) => {
    const from = Math.max(1, Math.floor(lo / hz));
    const to = Math.min(spectrum.length - 1, Math.ceil(hi / hz));
    let sum = 0;
    for (let i = from; i <= to; i++) sum += spectrum[i];
    const v = sum / (to - from + 1) / 255;
    slow[b] += (v - slow[b]) * k;
    return Math.min(1, 0.4 * v + 3 * Math.max(0, v - slow[b]));
  });
  let power = 0;
  for (let i = 0; i < wave.length; i++) power += ((wave[i] - 128) / 128) ** 2;
  return { env: Math.min(1, Math.sqrt(power / wave.length) * 3.5), kick, snare, hat };
}

/** The analyser's bins as the matrix's bands, spaced by ratio, each the loudest bin it covers. */
function heardSpectrum(ear: Ear, out: Uint8Array) {
  const hz = ear.context.sampleRate / ear.analyser.fftSize;
  for (let i = 0; i < COLS; i++) {
    const lo = Math.max(1, Math.floor((30 * (16000 / 30) ** (i / COLS)) / hz));
    const hi = Math.max(lo, Math.min(ear.spectrum.length - 1, Math.floor((30 * (16000 / 30) ** ((i + 1) / COLS)) / hz)));
    let v = 0;
    for (let b = lo; b <= hi; b++) v = Math.max(v, ear.spectrum[b]);
    // Bent down a little, so the loudest bins don't sit pinned at the top.
    out[i] = Math.round((v / 255) ** 1.4 * 255);
  }
}

/** Without an analyser, a spectrum shaped from the model's bands: the kick low, the snare in the middle, hats high. */
function modelSpectrum(m: { env: number; kick: number; snare: number; hat: number }, out: Uint8Array) {
  for (let i = 0; i < COLS; i++) {
    const x = i / (COLS - 1);
    const v = m.kick * Math.exp(-x * 9) + m.snare * 0.8 * Math.exp(-((x - 0.38) ** 2) / 0.02) + m.hat * 0.6 * Math.max(0, (x - 0.6) / 0.4) + m.env * 0.25 * (1 - x);
    // Lifted by the square root, as the analyser's decibels are, so the model fills the matrix as music does.
    out[i] = Math.min(255, Math.round(Math.sqrt(v) * (0.8 + 0.2 * grain()) * 255));
  }
}
const grain = () => Math.random();

/** Focus that follows the hand: no ring, and the keys pick up where the hand left off. */
const focusOnPress = (e: PointerEvent<HTMLElement>) => {
  if (e.button === 0) focusQuietly(e.currentTarget);
};

/** A raised key's face, sinking 2px onto its base. */
const face =
  "grid size-full place-items-center rounded-[0.7em] text-(--device-key-ink) [background:var(--device-key-face)] shadow-(--device-key-shadow) transition-[transform,box-shadow] duration-(--duration-exit) ease-out group-active/key:translate-y-[2px] group-active/key:shadow-(--device-key-shadow-pressed) group-active/key:duration-75";

/** Next: a triangle and a bar, printed on the key. */
function SkipGlyph() {
  return (
    <svg aria-hidden data-part="lettering" viewBox="0 0 16 16" className="size-[1.05em] fill-current [filter:var(--device-engrave-glyph)] drawn:fill-(--device-draw-ink)!">
      <path d="M3 3.2 10.6 8 3 12.8z" />
      <rect x="11.2" y="3.2" width="1.9" height="9.6" rx="0.4" />
    </svg>
  );
}

export function NowPlaying({ tracks, track, onTrackChange, playing, onPlayingChange, autoPlay = false, startAt = 0, crossOrigin, onLoad, className }: NowPlayingProps) {
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
  const wakeMatrix = useRef<(() => void) | null>(null); // and the matrix's
  const matrixRef = useRef<SVGSVGElement>(null);
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
    return a && tracks[track].src && Number.isFinite(a.duration) && a.duration > 0 ? a.duration : tracks[track].duration || 1;
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
    if (!a) return;
    if (!current.src || !on) return a.pause();
    // The graph is made on the first play, inside the press that asked for it, as a browser requires.
    if (listenable(current.src, crossOrigin)) void earFor(a).context.resume();
    a.play().catch(() => props.current.onPlayingChange(false));
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

  // The matrix. One loop reads the music at the playhead and gives each column a meter's ballistics; the
  // same level lifts the bar under the playhead and swells its glow. Paused, the columns fall to rest and
  // the loop stops. Frames write the dots' attributes, and only where a dot changes.
  const music = useEffectEvent((dt: number) => {
    const { tracks, track } = props.current;
    const a = audioRef.current;
    const ear = a && playing && listenable(tracks[track].src, crossOrigin) ? ears.get(a) : undefined;
    if (ear?.context.state === "running") return { on: playing, ear, ...listen(ear, dt) };
    return { on: playing, ear: null, ...bandsAt(position(), duration(), peaksOf(tracks[track]), bpmOf(tracks[track])) };
  });
  useEffect(() => {
    const root = rootRef.current!;
    const bars = [...barsRef.current!.querySelectorAll<HTMLElement>("[data-bar]")];
    const dots = [...matrixRef.current!.querySelectorAll<SVGCircleElement>("[data-dot]")];
    const lit = new Uint8Array(dots.length);
    const spectrum = new Uint8Array(COLS);
    const level = new Float32Array(COLS);
    const peak = new Float32Array(COLS);
    const held = new Float32Array(COLS);
    const still = reduced();
    let lv = 0;
    let at = -1;
    let raf = 0;
    let last = 0;

    /** One frame of the music; `show` reads it even while paused, for the still. Returns whether to go on. */
    function step(dt: number, show = false) {
      const m = music(dt);
      const on = m.on || show;
      if (m.ear) heardSpectrum(m.ear, spectrum);
      else modelSpectrum(m, spectrum);
      let resting = !on;
      for (let c = 0; c < COLS; c++) {
        level[c] = Math.max(on ? spectrum[c] / 255 : 0, level[c] - FALL * dt);
        if (level[c] >= peak[c]) {
          peak[c] = level[c];
          held[c] = 0;
        } else if ((held[c] += dt) > HOLD) peak[c] = Math.max(level[c], peak[c] - PEAK_FALL * dt);
        if (peak[c] > 0) resting = false;
        const top = Math.round(level[c] * ROWS);
        const dot = Math.min(ROWS - 1, Math.floor(peak[c] * ROWS));
        for (let r = 0; r < ROWS; r++) {
          const i = r * COLS + c;
          const on = r < top || (peak[c] > 0.04 && r === dot) ? 1 : 0;
          if (on === lit[i]) continue;
          lit[i] = on;
          dots[i].toggleAttribute("data-on", !!on);
        }
      }
      lv = Math.max(m.on ? 0.42 * m.env + 0.5 * Math.max(m.kick, m.snare) : 0, lv - BAND_FALL * dt);
      root.style.setProperty("--lv", Math.min(1, lv).toFixed(3));
      // The bar the playhead is on: the last one it has reached.
      const next = m.on ? passed(head.current!.value / 1000) - 1 : -1;
      if (next !== at) {
        if (at >= 0) delete bars[at].dataset.at;
        if (next >= 0) bars[next].dataset.at = "";
        at = next;
      }
      return !resting;
    }

    /** Reduced motion: no loop, a still of the music at the playhead. */
    function hold() {
      for (let i = 0; i < 20; i++) step(1 / 30, true);
      root.style.setProperty("--lv", "0");
    }

    function frame(t: number) {
      raf = 0;
      const dt = last ? Math.min(0.05, (t - last) / 1000) : 1 / 60;
      last = t;
      if (step(dt) && visible.current) raf = requestAnimationFrame(frame);
      else last = 0;
    }

    wakeMatrix.current = () => {
      if (still) hold();
      else if (!raf && visible.current) raf = requestAnimationFrame(frame);
    };
    wakeMatrix.current();
    return () => {
      cancelAnimationFrame(raf);
      wakeMatrix.current = null;
    };
  }, []);
  useEffect(() => wakeMatrix.current?.(), [playing, track]);

  // Off screen, the frame loop rests; the clock keeps time.
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      visible.current = entry.isIntersecting;
      if (visible.current) {
        wake.current?.();
        wakeMatrix.current?.();
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

  /* --- Loading ------------------------------------------------------------ */

  const [holding, setHolding] = useState(false); // a file is held over the plate
  const pickerRef = useRef<HTMLInputElement>(null);
  const audioFiles = (list: FileList | null) => [...(list ?? [])].filter((f) => f.type.startsWith("audio/"));

  function load(files: File[]) {
    if (!onLoad || !files.length) return play("bump", { gain: 0.6 });
    play("select", { gain: 0.5 });
    onLoad(files);
    setAnnouncement(files.length === 1 ? `Loading ${files[0].name}` : `Loading ${files.length} tracks`);
  }

  const dropProps = onLoad && {
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      if (!holding) setHolding(true);
    },
    onDragLeave: (e: DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHolding(false);
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setHolding(false);
      touched.current = true;
      load(audioFiles(e.dataTransfer.files));
    },
  };

  /* --- Render ------------------------------------------------------------- */

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label="Now playing"
      onPointerDownCapture={() => (touched.current = true)}
      onKeyDownCapture={() => (touched.current = true)}
      className={cx("@container w-full max-w-[380px] select-none", className)}
      {...dropProps}
    >
      {/* A plate cut from the player's body: the same bead-blasted finish and lit top edge. */}
      <div data-part="plate" className="relative isolate flex animate-enter flex-col gap-[0.7em] overflow-hidden rounded-[1.25em] p-[0.9em] text-[clamp(11px,4cqw,14px)] [background:var(--device-body)] shadow-[var(--device-body-edge),0_1px_2px_rgb(0_0_0/0.06),0_16px_32px_-18px_rgb(0_0_0/0.3)]">
        <div aria-hidden className="device-grain pointer-events-none absolute inset-0 -z-10 rounded-[inherit]" />

        {/* The display: a spectrum on a dot matrix, on the LCD's glass behind a black bezel, as a hi-fi deck's. */}
        <div data-part="bezel" className="rounded-[1.05em] bg-(--device-rim) p-[0.3em] shadow-[0_1px_0_rgb(255_255_255/0.7),inset_0_1px_2px_rgb(0_0_0/0.6)] dark:shadow-[0_1px_0_rgb(255_255_255/0.06),inset_0_1px_2px_rgb(0_0_0/0.6)]">
          <div data-part="lcd" className="relative overflow-hidden rounded-[0.75em] px-[0.8em] py-[0.75em] [background:var(--device-lcd)] shadow-(--device-lcd-edge)">
            {/* Drawn, the lit dots are ink and the ghosts the drawing's line. */}
            <svg ref={matrixRef} aria-hidden data-part="matrix" viewBox={`0 0 ${COLS * 4} ${ROWS * 4}`} className="block aspect-[8/3] w-full">
              {DOTS.map((d) => (
                <circle key={`${d.c}-${d.r}`} data-dot cx={d.x} cy={d.y} r={1.25} className="fill-white/[0.08] data-on:fill-(--device-lcd-ink) drawn:fill-(--device-draw-line)! drawn:data-on:fill-(--device-draw-ink)!" />
              ))}
            </svg>
            <div aria-hidden data-part="glass" className="pointer-events-none absolute inset-0 [background:var(--screen-glass)]" />
          </div>
        </div>

        {/* The waveform, pressed into the plate: a slim slider over the track. Bars the playhead has passed are lit. */}
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
          className="relative h-[2.2em] cursor-pointer touch-none rounded-[0.7em] bg-(--device-well) shadow-(--device-recess) outline-offset-2"
        >
          <div ref={barsRef} className="absolute inset-x-[0.7em] inset-y-[0.45em] flex items-center justify-between">
            {peaks.map((_, i) => (
              <span
                key={i}
                aria-hidden
                data-bar
                className="w-[1.4%] rounded-full bg-(--device-meter-off) data-at:[scale:1_calc(1+var(--lv,0)*0.45)] data-played:bg-(--device-meter-on) drawn:bg-(--device-draw-line)! drawn:data-played:bg-(--device-draw-ink)!"
                style={{ height: "max(0.18em, calc(var(--h, 0) * 100%))" }}
              />
            ))}
            {/* The playhead: red, as the tape's is, and lit. */}
            <span
              aria-hidden
              data-part="light"
              className="absolute -inset-y-[0.15em] left-(--p,0%) -ml-px w-[2px] rounded-full bg-(--device-rec) shadow-[0_0_calc(0.3em+var(--lv,0)*0.5em)_var(--device-rec)] drawn:bg-(--device-rec)!"
            />
          </div>
        </div>

        {/* One row: PLAY, the track on a small LCD, Next and Eject. */}
        <div className="flex items-center gap-[0.5em]">
          <button
            type="button"
            aria-label={playing ? "Pause" : "Play"}
            onPointerDown={focusOnPress}
            onClick={toggle}
            data-part="collar"
            className="group/key grid size-[3em] shrink-0 place-items-center rounded-full bg-black/[0.035] p-[0.22em] shadow-(--device-recess) outline-offset-2 dark:bg-black/30"
          >
            <span data-part="cap" className="grid size-full place-items-center rounded-full [background:var(--device-wheel-face)] shadow-(--device-key-shadow) transition-[transform,box-shadow] duration-(--duration-exit) ease-out group-active/key:translate-y-[2px] group-active/key:shadow-(--device-key-shadow-pressed) group-active/key:duration-75">
              {playing ? (
                <span aria-hidden data-part="lettering" className="flex h-[0.85em] gap-[0.2em]">
                  <span className="w-[0.26em] rounded-[0.08em] bg-(--device-key-ink) drawn:bg-(--device-draw-ink)!" />
                  <span className="w-[0.26em] rounded-[0.08em] bg-(--device-key-ink) drawn:bg-(--device-draw-ink)!" />
                </span>
              ) : (
                <svg aria-hidden data-part="lettering" viewBox="0 0 16 16" className="ml-[0.1em] size-[1.05em] fill-(--device-rec)">
                  <path d="M4.5 2.4 13.2 8l-8.7 5.6z" />
                </svg>
              )}
            </span>
          </button>

          {/* The LCD: the track, then the artist and the clock. The spring writes the clock. */}
          <div aria-hidden data-part="lcd" className="flex h-[3em] min-w-0 flex-1 flex-col justify-center gap-[0.35em] overflow-hidden rounded-[0.7em] px-[0.7em] text-(--device-lcd-ink) [background:var(--device-lcd)] shadow-(--device-lcd-edge)">
            <span className="truncate text-[0.92em] font-light leading-none tracking-[-0.01em]">{current.title}</span>
            <span className="flex items-baseline gap-[0.5em]">
              <span className="min-w-0 flex-1 truncate text-[0.66em] leading-none text-(--device-lcd-dim) drawn:text-[color-mix(in_oklab,var(--device-draw-ink)_70%,transparent)]!">{current.artist}</span>
              <span ref={clockRef} className="shrink-0 text-[0.66em] font-light leading-none tabular-nums tracking-[-0.02em]">
                {(["M", "S", "F"] as const).map((unit, i) => (
                  <span key={unit} className={i ? "ml-[0.25em]" : undefined}>
                    <span data-figure>00</span>
                    <span className="text-[0.75em] text-(--device-lcd-dim) drawn:text-[color-mix(in_oklab,var(--device-draw-ink)_70%,transparent)]!">{unit}</span>
                  </span>
                ))}
              </span>
            </span>
          </div>

          <button type="button" data-sound="key" aria-label="Next track" onPointerDown={focusOnPress} onClick={next} data-part="key" className="group/key h-[3em] w-[2.6em] shrink-0 rounded-[0.7em] outline-offset-2">
            <span className={face}>
              <SkipGlyph />
            </span>
          </button>

          {onLoad && (
            <button
              type="button"
              data-sound="key"
              aria-label="Load audio files"
              onPointerDown={focusOnPress}
              onClick={() => pickerRef.current?.click()}
              data-part="key"
              className="group/key h-[3em] w-[2.6em] shrink-0 rounded-[0.7em] outline-offset-2"
            >
              <span className={cx(face, "relative")}>
                {/* Orange while a file is held over the plate: a hand on it. Drawn, ink. */}
                <span
                  aria-hidden
                  data-part="light"
                  className={cx(
                    "absolute inset-x-[32%] top-[0.4em] h-[0.22em] rounded-full",
                    holding ? "bg-(--device-hold) shadow-[0_0_0.4em_var(--device-hold)] duration-0 drawn:bg-(--device-draw-ink)!" : "bg-(--device-meter-off) transition-[background-color,box-shadow] duration-(--duration-exit)",
                  )}
                />
                <svg aria-hidden data-part="lettering" viewBox="0 0 16 16" className="mt-[0.35em] size-[0.95em] fill-current [filter:var(--device-engrave-glyph)] drawn:fill-(--device-draw-ink)!">
                  <path d="M8 2.6 13.4 9H2.6z" />
                  <rect x="2.6" y="10.8" width="10.8" height="2.2" rx="0.4" />
                </svg>
              </span>
            </button>
          )}
        </div>
      </div>

      {/* One element for every track it can listen to, and another for those it can't: once routed through an
          analyser, an element would silence a cross-origin source sent without CORS. */}
      <audio key={listenable(current.src, crossOrigin) ? "heard" : "plain"} ref={audioRef} src={current.src} crossOrigin={crossOrigin} preload="metadata" onEnded={ended} />
      {onLoad && (
        <input
          ref={pickerRef}
          type="file"
          accept="audio/*"
          multiple
          hidden
          onChange={(e) => {
            load(audioFiles(e.currentTarget.files));
            e.currentTarget.value = "";
          }}
        />
      )}
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
  { title: "Low thock", artist: "The Detents", duration: 211 },
  { title: "Over centre", artist: "The Detents", duration: 178 },
  { title: "Unity gain", artist: "The Detents", duration: 252 },
  { title: "Room tone", artist: "The Detents", duration: 185 },
];

/** A file from this device as a track: its real length and its real waveform, decoded here. */
async function trackOf(file: File): Promise<Track> {
  const src = URL.createObjectURL(file);
  const title = file.name.replace(/\.[^.]+$/, "");
  try {
    const audio = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(await file.arrayBuffer());
    const data = audio.getChannelData(0);
    const bins = 160;
    const size = Math.floor(data.length / bins);
    const raw = Array.from({ length: bins }, (_, b) => {
      let peak = 0;
      for (let i = b * size; i < (b + 1) * size; i += 16) peak = Math.max(peak, Math.abs(data[i]));
      return peak;
    });
    const top = Math.max(...raw, 0.001);
    // Lifted by the square root, as the player's covers are, so quiet passages still draw.
    return { title, artist: "From this device", duration: audio.duration, src, peaks: raw.map((v) => Math.max(0.12, Math.sqrt(v / top))) };
  } catch {
    return { title, artist: "From this device", duration: 0, src };
  }
}

export default function Demo() {
  const [queue, setQueue] = useState(SIDE_A);
  const [track, setTrack] = useState(0);
  const [playing, setPlaying] = useState(false);
  const urls = useRef<string[]>([]);

  useEffect(() => {
    const made = urls.current;
    return () => made.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  async function load(files: File[]) {
    const at = queue.length;
    const added = await Promise.all(files.map(trackOf));
    urls.current.push(...added.map((t) => t.src!));
    setQueue((q) => [...q, ...added]);
    setTrack(at);
    setPlaying(true);
  }

  return (
    <NowPlaying
      tracks={queue}
      track={track}
      onTrackChange={setTrack}
      playing={playing}
      onPlayingChange={setPlaying}
      onLoad={load}
      autoPlay
      // Two and a half seconds from the end, so the first four show the queue moving on.
      startAt={SIDE_A[0].duration - 2.5}
    />
  );
}
