"use client";

/**
 * UI sound: short, synthesized clicks for the device on the home page and the
 * site's physical keys. No audio files; everything is made with Web Audio.
 *
 * This is the contract. Callers fire-and-forget `play(name)`; it must never
 * throw, never block, and do nothing until the page has had a user gesture
 * (browsers keep audio locked until then) or while muted.
 *
 * How it sounds: a 2009 click wheel, a little warmer. Every sound is a few
 * milliseconds of filtered noise (the mechanism) plus, where it helps, a short
 * sine or triangle (the body, or a tonal "confirm"). Everything runs through
 * one bus: a conservative master level (peaks near -18 dBFS), a faint
 * generated room for warmth, and a compressor that keeps stacked sounds from
 * clipping. On touch screens the bus sits 2.5 dB lower: phone speakers are
 * small, bright and close to the ear, and a tap on glass needs less.
 *
 * Volume (`setVolume`, eleven steps, 2 dB apart) scales the bus; the default
 * step is the level every sound was tuned at. `readLevels` reports what
 * leaves the bus, for the device's level meters.
 *
 * Physical keys elsewhere on the site (`Button`, `ButtonLink`, `IconButton`)
 * carry `data-sound="key" | "soft"`; the delegated listeners below give them
 * press and release sounds without making the primitives client components.
 * Pass `data-sound="off"` to a primitive that plays its own sounds.
 */

import { useSyncExternalStore } from "react";

export type SoundName =
  /** One detent of the click wheel. Fired rapidly while turning; keep it tiny. */
  | "tick"
  /** A physical key or wheel segment going down. */
  | "press"
  /** The same key coming back up. */
  | "release"
  /** The centre button: choosing a menu item or opening a prototype. */
  | "select"
  /** MENU: going back a level. */
  | "back"
  /** A prototype filling the screen. */
  | "open"
  /** Leaving a prototype. */
  | "close"
  /** A switch flipping (the hold / mute switch, theme). */
  | "toggle"
  /** Hitting the end of a list: a duller tick. */
  | "bump"
  /** The transport engaging: the tape starts rolling. */
  | "start"
  /** The transport letting go: stop, or a softer pause. */
  | "stop"
  /** First interaction: the device waking. Played at most once per page load. */
  | "wake";

export type PlayOptions = {
  /** Multiplies the base pitch, e.g. 1.05 to vary repeated ticks. Default 1. */
  pitch?: number;
  /** Multiplies the base gain (0–1). Default 1. */
  gain?: number;
};

/** Every sound, in the order the /system page shows them. */
export const soundNames: readonly SoundName[] = ["tick", "bump", "press", "release", "select", "back", "open", "close", "toggle", "start", "stop", "wake"];

/* ------------------------------------------------------------------------ */
/* Synthesis. Works on any BaseAudioContext, so sounds render offline too.   */
/* ------------------------------------------------------------------------ */

/** Master level: a single tick peaks around -24 dBFS, a press around -18. */
const LEVEL = 0.5;
/** Touch screens: about -2.5 dB. */
const TOUCH_TRIM = 0.75;
/** Room send. Low: it should read as warmth, not as reverb. */
const WET = 0.07;
const SILENT = 0.0001;

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();
const roomBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

/** One second of white noise per context, generated once and reused at random offsets. */
function noiseBuffer(ctx: BaseAudioContext) {
  let buffer = noiseBuffers.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffers.set(ctx, buffer);
  }
  return buffer;
}

/** A small, dark room: 300ms of decaying stereo noise, low-passed. */
function roomBuffer(ctx: BaseAudioContext) {
  let buffer = roomBuffers.get(ctx);
  if (!buffer) {
    const length = Math.floor(ctx.sampleRate * 0.3);
    buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const data = buffer.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < length; i++) {
        lp += 0.35 * (Math.random() * 2 - 1 - lp);
        data[i] = lp * Math.pow(1 - i / length, 4);
      }
    }
    roomBuffers.set(ctx, buffer);
  }
  return buffer;
}

type Bus = { input: GainNode; master: GainNode; meters?: [AnalyserNode, AnalyserNode] };

/**
 * input → (dry + faint room) → master level → compressor → destination.
 * With `meter`, the compressor's output is also split into two analysers, so
 * level meters show exactly what leaves the speakers.
 */
function createBus(ctx: BaseAudioContext, destination: AudioNode, level: number, meter = false): Bus {
  const input = ctx.createGain();
  const master = ctx.createGain();
  master.gain.value = level;

  const room = ctx.createConvolver();
  room.buffer = roomBuffer(ctx);
  const wet = ctx.createGain();
  wet.gain.value = WET;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -14;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.12;

  input.connect(master);
  input.connect(room).connect(wet).connect(master);
  master.connect(limiter).connect(destination);
  if (!meter) return { input, master };

  const split = ctx.createChannelSplitter(2);
  // Silent sink: some engines only process nodes with a path to the destination.
  const sink = ctx.createGain();
  sink.gain.value = 0;
  sink.connect(destination);
  const meters = [0, 1].map((channel) => {
    const analyser = ctx.createAnalyser();
    // ~21ms at 48kHz: longer than a frame, so a 5ms tick is never missed between reads.
    analyser.fftSize = 1024;
    split.connect(analyser, channel);
    analyser.connect(sink);
    return analyser;
  }) as [AnalyserNode, AnalyserNode];
  limiter.connect(split);
  return { input, master, meters };
}

type NoiseLayer = {
  at?: number;
  filter: BiquadFilterType;
  freq: number;
  /** Sweep the filter to this frequency over the layer. */
  freqTo?: number;
  q?: number;
  peak: number;
  attack?: number;
  decay: number;
};

type ToneLayer = {
  at?: number;
  type?: OscillatorType;
  freq: number;
  /** Glide to this frequency over `glide` seconds (default: the decay). */
  freqTo?: number;
  glide?: number;
  peak: number;
  attack?: number;
  decay: number;
  /** Optional lowpass on the tone, swept from `lowpass` to `lowpassTo`. */
  lowpass?: number;
  lowpassTo?: number;
};

/**
 * One sounding event: a few layers on their own gain node, scheduled from
 * `t0`. Every node is disconnected when the last source ends.
 */
class Voice {
  private nodes: AudioNode[] = [];
  private last: AudioScheduledSourceNode | null = null;
  end = 0;
  readonly output: GainNode;

  constructor(
    private ctx: BaseAudioContext,
    destination: AudioNode,
    private t0: number,
    private pitch: number,
    gain: number,
  ) {
    this.output = ctx.createGain();
    this.output.gain.value = gain;
    this.output.connect(destination);
    this.nodes.push(this.output);
  }

  private envelope(start: number, peak: number, attack: number, decay: number) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(peak, start + attack);
    g.gain.exponentialRampToValueAtTime(SILENT, start + attack + decay);
    g.gain.setValueAtTime(0, start + attack + decay);
    this.nodes.push(g);
    return g;
  }

  private schedule(source: AudioScheduledSourceNode, start: number, stop: number, offset?: number) {
    if (offset !== undefined && source instanceof AudioBufferSourceNode) source.start(start, offset);
    else source.start(start);
    source.stop(stop);
    this.nodes.push(source);
    if (stop - this.t0 >= this.end) {
      this.end = stop - this.t0;
      this.last = source;
    }
  }

  noise({ at = 0, filter, freq, freqTo, q = 1, peak, attack = 0.0004, decay }: NoiseLayer) {
    const start = this.t0 + at;
    const stop = start + attack + decay + 0.005;
    const buffer = noiseBuffer(this.ctx);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const f = this.ctx.createBiquadFilter();
    f.type = filter;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq * this.pitch, start);
    if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo * this.pitch, start + attack + decay);
    this.nodes.push(f);
    src.connect(f).connect(this.envelope(start, peak, attack, decay)).connect(this.output);
    // Random offset so repeated ticks never sound identical.
    this.schedule(src, start, stop, Math.random() * (buffer.duration - 0.3));
  }

  tone({ at = 0, type = "sine", freq, freqTo, glide, peak, attack = 0.0008, decay, lowpass, lowpassTo }: ToneLayer) {
    const start = this.t0 + at;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq * this.pitch, start);
    if (freqTo) osc.frequency.exponentialRampToValueAtTime(freqTo * this.pitch, start + (glide ?? attack + decay));
    let node: AudioNode = osc;
    if (lowpass) {
      const f = this.ctx.createBiquadFilter();
      f.type = "lowpass";
      f.Q.value = 0.5;
      f.frequency.setValueAtTime(lowpass * this.pitch, start);
      if (lowpassTo) f.frequency.exponentialRampToValueAtTime(lowpassTo * this.pitch, start + attack + decay * 0.6);
      this.nodes.push(f);
      node = osc.connect(f);
    }
    node.connect(this.envelope(start, peak, attack, decay)).connect(this.output);
    this.schedule(osc, start, start + attack + decay + 0.005);
  }

  /** Disconnects every node once the last source has finished. */
  done(onEnded?: () => void) {
    const nodes = this.nodes;
    const cleanup = () => {
      for (const n of nodes) {
        try {
          n.disconnect();
        } catch {}
      }
      onEnded?.();
    };
    if (this.last) this.last.onended = cleanup;
    else cleanup();
    return this;
  }
}

/** A short, bright contact click: the mechanism. */
function click(v: Voice, at: number, freq: number, peak: number, decay = 0.004) {
  v.noise({ at, filter: "bandpass", freq, q: 1.2, peak, attack: 0.0003, decay });
}

const synths: Record<SoundName, (v: Voice) => void> = {
  // A piezo detent, warmed up: 4ms of band-passed noise plus a 5ms falling blip.
  tick(v) {
    click(v, 0, 5200, 1.2, 0.005);
    v.tone({ freq: 2900, freqTo: 2400, peak: 0.16, attack: 0.0003, decay: 0.006 });
  },
  // The same detent hitting a stop: lower, softer, no sparkle.
  bump(v) {
    v.noise({ filter: "lowpass", freq: 1400, q: 0.8, peak: 1.2, attack: 0.0006, decay: 0.009 });
    v.tone({ freq: 380, freqTo: 290, peak: 0.45, attack: 0.0008, decay: 0.02 });
  },
  // Key down: a low thock with a little body, plus the contact.
  press(v) {
    v.noise({ filter: "lowpass", freq: 1100, q: 0.9, peak: 1.1, attack: 0.0008, decay: 0.028 });
    v.tone({ freq: 175, freqTo: 105, glide: 0.03, peak: 0.6, attack: 0.001, decay: 0.045 });
    click(v, 0, 2800, 0.5, 0.003);
  },
  // Key up: lighter, higher, quieter.
  release(v) {
    click(v, 0, 3600, 0.9, 0.005);
    v.tone({ type: "triangle", freq: 1100, freqTo: 900, peak: 0.08, decay: 0.01 });
    v.tone({ freq: 320, peak: 0.16, decay: 0.012 });
  },
  // Centre button: a firm click, then two quick rising partials (E6, B6).
  select(v) {
    click(v, 0, 4200, 1.2, 0.004);
    v.tone({ freq: 240, freqTo: 160, peak: 0.45, decay: 0.025 });
    v.tone({ at: 0.012, freq: 1318.5, peak: 0.12, attack: 0.003, decay: 0.06 });
    v.tone({ at: 0.05, freq: 1975.5, peak: 0.09, attack: 0.003, decay: 0.08 });
  },
  // Menu: a softer click, then two falling partials (G6, D6).
  back(v) {
    click(v, 0, 3400, 0.8, 0.004);
    v.tone({ freq: 200, freqTo: 140, peak: 0.32, decay: 0.022 });
    v.tone({ at: 0.012, freq: 1568, peak: 0.08, attack: 0.003, decay: 0.05 });
    v.tone({ at: 0.045, freq: 1174.7, freqTo: 1120, peak: 0.075, attack: 0.003, decay: 0.07 });
  },
  // Screen taking over: a soft click, then air sweeping up.
  open(v) {
    click(v, 0, 3000, 0.6, 0.004);
    v.tone({ freq: 260, peak: 0.22, decay: 0.018 });
    v.noise({ filter: "bandpass", freq: 500, freqTo: 4200, q: 0.8, peak: 0.3, attack: 0.07, decay: 0.12 });
  },
  // Screen letting go: a soft click, then air sweeping down.
  close(v) {
    click(v, 0, 2600, 0.6, 0.004);
    v.tone({ freq: 220, peak: 0.22, decay: 0.018 });
    v.noise({ filter: "bandpass", freq: 3800, freqTo: 450, q: 0.8, peak: 0.28, attack: 0.03, decay: 0.13 });
  },
  // A switch: two tiny clicks 16ms apart, the second lower.
  toggle(v) {
    click(v, 0, 4500, 0.9, 0.0035);
    v.tone({ freq: 700, peak: 0.12, decay: 0.006 });
    click(v, 0.016, 3000, 0.75, 0.004);
    v.tone({ at: 0.016, freq: 520, peak: 0.12, decay: 0.008 });
  },
  // Tape rolling: the transport latching (a firm thock), then a short rising
  // two-note beep (A5, E6), the way a recorder confirms it is running.
  start(v) {
    v.noise({ filter: "lowpass", freq: 1200, q: 0.9, peak: 1, attack: 0.0008, decay: 0.022 });
    v.tone({ freq: 190, freqTo: 120, glide: 0.03, peak: 0.5, attack: 0.001, decay: 0.04 });
    click(v, 0, 3600, 0.7, 0.004);
    v.tone({ at: 0.035, type: "triangle", freq: 880, peak: 0.07, attack: 0.003, decay: 0.05, lowpass: 2600 });
    v.tone({ at: 0.085, type: "triangle", freq: 1318.5, peak: 0.065, attack: 0.003, decay: 0.08, lowpass: 3200 });
  },
  // Transport letting go: a heavier, duller thock and a low partial winding
  // down, like reels coming to rest.
  stop(v) {
    v.noise({ filter: "lowpass", freq: 850, q: 0.9, peak: 1.2, attack: 0.0008, decay: 0.035 });
    v.tone({ freq: 150, freqTo: 68, glide: 0.09, peak: 0.6, attack: 0.001, decay: 0.1 });
    click(v, 0, 2300, 0.6, 0.004);
  },
  // Power on: open fifths (D5, A5, E6) blooming in turn and settling into
  // pitch, over a filtered triangle that opens like a screen warming up.
  wake(v) {
    v.noise({ filter: "lowpass", freq: 900, q: 0.7, peak: 0.2, attack: 0.001, decay: 0.012 });
    v.tone({ type: "triangle", freq: 293.66, peak: 0.07, attack: 0.08, decay: 0.34, lowpass: 400, lowpassTo: 2400 });
    v.tone({ freq: 587.33 * 0.97, freqTo: 587.33, glide: 0.12, peak: 0.09, attack: 0.06, decay: 0.36 });
    v.tone({ at: 0.05, freq: 880 * 0.97, freqTo: 880, glide: 0.12, peak: 0.065, attack: 0.06, decay: 0.34 });
    v.tone({ at: 0.1, freq: 1318.5 * 0.97, freqTo: 1318.5, glide: 0.12, peak: 0.045, attack: 0.06, decay: 0.32 });
  },
};

function synthesize(name: SoundName, ctx: BaseAudioContext, destination: AudioNode, when: number, options: PlayOptions = {}) {
  const pitch = clamp(options.pitch ?? 1, 0.25, 4);
  const gain = clamp(options.gain ?? 1, 0, 1);
  const voice = new Voice(ctx, destination, when, pitch, gain);
  synths[name](voice);
  return voice;
}

/**
 * Renders a sound offline through the same bus, for tests and tooling.
 * Resolves to the rendered buffer and the sound's designed length in seconds,
 * or null where OfflineAudioContext is missing.
 */
export async function renderSound(
  name: SoundName,
  options?: PlayOptions & { touch?: boolean },
  sampleRate = 48000,
): Promise<{ buffer: AudioBuffer; duration: number } | null> {
  try {
    if (typeof OfflineAudioContext === "undefined") return null;
    const offline = new OfflineAudioContext(2, Math.ceil(sampleRate * 1), sampleRate);
    const bus = createBus(offline, offline.destination, LEVEL * (options?.touch ? TOUCH_TRIM : 1));
    const voice = synthesize(name, offline, bus.input, 0, options).done();
    const buffer = await offline.startRendering();
    return { buffer, duration: voice.end };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------------ */
/* Playback: one shared context, unlocked by the first gesture.              */
/* ------------------------------------------------------------------------ */

/** Minimum spacing per sound, in ms. Extra calls inside it are dropped, not queued. */
const minGap: Record<SoundName, number> = {
  tick: 14,
  bump: 40,
  press: 20,
  release: 20,
  select: 40,
  back: 40,
  open: 80,
  close: 80,
  toggle: 40,
  start: 80,
  stop: 80,
  wake: 0,
};
const MAX_VOICES = 8;

let ctx: AudioContext | null = null;
let bus: Bus | null = null;
let gestured = false;
let resumedAt = 0;
let wakeUsed = false;
const lastPlayed: Partial<Record<SoundName, number>> = {};
const voiceEnds: number[] = [];

const isBrowser = () => typeof window !== "undefined" && typeof document !== "undefined";

/** Sticky user activation: true once the viewer has pressed, clicked or typed. */
function hasActivation() {
  try {
    const ua = navigator.userActivation;
    if (ua) return ua.hasBeenActive;
  } catch {}
  return gestured;
}

function isTouch() {
  try {
    return window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  } catch {
    return false;
  }
}

/** The shared context, created on first use after a gesture. */
function context(): AudioContext | null {
  if (ctx) return ctx.state === "closed" ? null : ctx;
  if (!hasActivation()) return null;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC({ latencyHint: "interactive" });
    bus = createBus(ctx, ctx.destination, masterLevel(), true);
    noiseBuffer(ctx);
    resumedAt = performance.now();
    if (ctx.state !== "running") ctx.resume().catch(() => {});
    return ctx;
  } catch {
    ctx = null;
    bus = null;
    return null;
  }
}

/**
 * Whether the context can take a sound now. A suspended context is asked to
 * resume; sounds are only let through for a moment after asking, so nothing
 * piles up and bursts out later.
 */
function ready(ac: AudioContext) {
  if (ac.state === "running") return true;
  if (ac.state === "closed") return false;
  const now = performance.now();
  if (now - resumedAt > 1000) {
    resumedAt = now;
    ac.resume().catch(() => {});
  }
  return now - resumedAt < 250;
}

function start(name: SoundName, options: PlayOptions | undefined, limited: boolean) {
  try {
    if (!isBrowser() || isMuted() || getVolume() === 0) return;
    if (document.visibilityState === "hidden") return;
    const ac = context();
    if (!ac || !bus || !ready(ac)) return;

    const now = performance.now();
    if (limited) {
      const last = lastPlayed[name];
      if (last !== undefined && now - last < minGap[name]) return;
    }

    const t = ac.currentTime;
    while (voiceEnds.length && voiceEnds[0] <= t) voiceEnds.shift();
    if (voiceEnds.length >= MAX_VOICES) return;

    lastPlayed[name] = now;
    const voice = synthesize(name, ac, bus.input, t, options).done();
    const end = t + voice.end;
    const i = voiceEnds.findIndex((e) => e > end);
    voiceEnds.splice(i === -1 ? voiceEnds.length : i, 0, end);
  } catch {}
}

/** Plays a UI sound. A no-op on the server, before the first gesture, or while muted. */
export function play(name: SoundName, options?: PlayOptions): void {
  if (!isSound(name)) return;
  if (name === "wake") {
    // Spent by the first call that gets past the gesture gate, muted or not,
    // so unmuting later never sets off a stray power-on.
    if (wakeUsed || !isBrowser() || !hasActivation()) return;
    wakeUsed = true;
  }
  start(name, options, true);
}

/**
 * Plays a sound for auditioning (the /system page): skips the per-sound rate
 * limit and the once-per-load rule for `wake`, but still waits for a gesture
 * and respects mute.
 */
export function audition(name: SoundName, options?: PlayOptions): void {
  if (!isSound(name)) return;
  start(name, options, false);
}

/* ------------------------------------------------------------------------ */
/* Mute: persisted per viewer, shared across tabs.                           */
/* ------------------------------------------------------------------------ */

const STORAGE_KEY = "sound-muted";
let muted: boolean | null = null;
const listeners = new Set<() => void>();

function readStored() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "1" || value === "true";
  } catch {
    return false;
  }
}

function notify() {
  for (const l of [...listeners]) {
    try {
      l();
    } catch {}
  }
}

/** Whether UI sound is muted. Persisted per viewer. */
export function isMuted(): boolean {
  if (!isBrowser()) return false;
  if (muted === null) muted = readStored();
  return muted;
}

export function setMuted(muted_: boolean): void {
  if (!isBrowser()) return;
  const next = Boolean(muted_);
  try {
    localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  } catch {}
  if (next === muted) return;
  muted = next;
  notify();
}

/** Subscribes to mute changes, for useSyncExternalStore. Returns the unsubscribe. */
export function subscribeMuted(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

/* ------------------------------------------------------------------------ */
/* Volume: eleven steps, persisted per viewer, shared across tabs.           */
/* ------------------------------------------------------------------------ */

const VOLUME_KEY = "sound-volume";
export const VOLUME_MAX = 10;
/** The designed level: what every sound was tuned at. */
export const VOLUME_DEFAULT = 7;
let volume: number | null = null;
const volumeListeners = new Set<() => void>();

/** 2 dB a step around the default: 10 is +6 dB, 1 is -12 dB, 0 is silent. */
function volumeGain(step: number) {
  return step <= 0 ? 0 : Math.pow(10, (2 * (step - VOLUME_DEFAULT)) / 20);
}

function masterLevel() {
  return LEVEL * (isTouch() ? TOUCH_TRIM : 1) * volumeGain(getVolume());
}

function readStoredVolume() {
  try {
    const value = localStorage.getItem(VOLUME_KEY);
    if (value === null) return VOLUME_DEFAULT;
    const step = Math.round(Number(value));
    return Number.isFinite(step) ? Math.min(VOLUME_MAX, Math.max(0, step)) : VOLUME_DEFAULT;
  } catch {
    return VOLUME_DEFAULT;
  }
}

function applyVolume() {
  try {
    if (ctx && bus) bus.master.gain.setTargetAtTime(masterLevel(), ctx.currentTime, 0.008);
  } catch {}
}

function notifyVolume() {
  for (const l of [...volumeListeners]) {
    try {
      l();
    } catch {}
  }
}

/** The volume step, 0 (silent) to VOLUME_MAX. Independent of mute. */
export function getVolume(): number {
  if (!isBrowser()) return VOLUME_DEFAULT;
  if (volume === null) volume = readStoredVolume();
  return volume;
}

export function setVolume(step: number): void {
  if (!isBrowser() || !Number.isFinite(step)) return;
  const next = Math.min(VOLUME_MAX, Math.max(0, Math.round(step)));
  try {
    localStorage.setItem(VOLUME_KEY, String(next));
  } catch {}
  if (next === getVolume()) return;
  volume = next;
  applyVolume();
  notifyVolume();
}

/** Subscribes to volume changes, for useSyncExternalStore. Returns the unsubscribe. */
export function subscribeVolume(callback: () => void): () => void {
  volumeListeners.add(callback);
  return () => {
    volumeListeners.delete(callback);
  };
}

/* ------------------------------------------------------------------------ */
/* Levels: what the sounds are sending to the speakers, for meters.          */
/* ------------------------------------------------------------------------ */

let meterData: Float32Array<ArrayBuffer> | null = null;

/**
 * The peak level per channel over the last ~20ms, linear from 0 to 1, read
 * after the compressor. Writes into `out` (left, right) and returns it, so a
 * meter can call it every frame without allocating. Zeros until the first
 * sound has created the audio context, and whenever it isn't running.
 */
export function readLevels(out: [number, number] = [0, 0]): [number, number] {
  out[0] = 0;
  out[1] = 0;
  try {
    const meters = bus?.meters;
    if (!meters || !ctx || ctx.state !== "running") return out;
    if (!meterData || meterData.length !== meters[0].fftSize) meterData = new Float32Array(meters[0].fftSize);
    for (let c = 0; c < 2; c++) {
      meters[c].getFloatTimeDomainData(meterData);
      let peak = 0;
      for (let i = 0; i < meterData.length; i++) {
        const a = Math.abs(meterData[i]);
        if (a > peak) peak = a;
      }
      out[c] = peak;
    }
  } catch {}
  return out;
}

/** React binding: `const { muted, setMuted, play } = useSound()`. */
export function useSound() {
  const value = useSyncExternalStore(subscribeMuted, isMuted, () => false);
  return { muted: value, setMuted, play };
}

/* ------------------------------------------------------------------------ */
/* Browser wiring: unlock on the first gesture, key sounds, tabs, visibility. */
/* ------------------------------------------------------------------------ */

type KeyKind = "key" | "soft";

function soundTarget(target: EventTarget | null): { el: Element; kind: KeyKind } | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest("[data-sound]");
  if (!el) return null;
  const kind = el.getAttribute("data-sound");
  if (kind !== "key" && kind !== "soft") return null;
  if (el.matches(":disabled, [aria-disabled='true']")) return null;
  return { el, kind };
}

let pointerKey: number | null = null;
let keyboardKey: string | null = null;

function unlock() {
  gestured = true;
  const ac = context();
  if (ac && ac.state !== "running" && document.visibilityState !== "hidden") ready(ac);
}

function onPointerDown(e: PointerEvent) {
  unlock();
  if (e.button !== 0) return;
  const hit = soundTarget(e.target);
  if (!hit) return;
  if (hit.kind === "key") {
    play("press");
    pointerKey = e.pointerId;
  } else {
    play("tick", { gain: 0.5, pitch: 0.92 });
  }
}

function onPointerUp(e: PointerEvent) {
  unlock();
  if (pointerKey === null || e.pointerId !== pointerKey) return;
  pointerKey = null;
  play("release", e.type === "pointercancel" ? { gain: 0.5 } : undefined);
}

function onKeyDown(e: KeyboardEvent) {
  unlock();
  if (e.repeat || (e.key !== "Enter" && e.key !== " ")) return;
  const hit = soundTarget(e.target);
  if (!hit) return;
  // Space only activates buttons; Enter activates buttons and links.
  if (e.key === " " && hit.el.tagName !== "BUTTON") return;
  if (hit.kind === "key") {
    play("press");
    keyboardKey = e.key;
  } else {
    play("tick", { gain: 0.5, pitch: 0.92 });
  }
}

function onKeyUp(e: KeyboardEvent) {
  if (keyboardKey === null || e.key !== keyboardKey) return;
  keyboardKey = null;
  play("release");
}

function onStorage(e: StorageEvent) {
  if (e.key === VOLUME_KEY || e.key === null) {
    const next = readStoredVolume();
    if (next !== volume) {
      volume = next;
      applyVolume();
      notifyVolume();
    }
  }
  if (e.key !== STORAGE_KEY && e.key !== null) return;
  const next = readStored();
  if (next === muted) return;
  muted = next;
  notify();
}

function onVisibility() {
  // Let the audio device sleep while nobody can hear it.
  if (document.visibilityState === "hidden" && ctx?.state === "running") ctx.suspend().catch(() => {});
}

let installed = false;

/** Adds the gesture, key, storage and visibility listeners. Idempotent; runs on import in the browser. */
export function installSound() {
  if (installed || !isBrowser()) return;
  installed = true;
  try {
    const opts: AddEventListenerOptions = { capture: true, passive: true };
    window.addEventListener("pointerdown", onPointerDown, opts);
    window.addEventListener("pointerup", onPointerUp, opts);
    window.addEventListener("pointercancel", onPointerUp, opts);
    window.addEventListener("keydown", onKeyDown, opts);
    window.addEventListener("keyup", onKeyUp, opts);
    window.addEventListener("touchend", unlock, opts);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisibility);
  } catch {}
}

function isSound(name: unknown): name is SoundName {
  return typeof name === "string" && Object.prototype.hasOwnProperty.call(synths, name);
}

function clamp(n: number, min: number, max: number) {
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : 1;
}

installSound();
