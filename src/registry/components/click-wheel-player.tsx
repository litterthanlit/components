"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useReducer,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from "react";

/*
 * A pocket music player after the 2009 classic: a brushed aluminium front, a
 * 320×240 colour screen and a click wheel you actually turn. Everything is
 * CSS and inline SVG, drawn at the real device's proportions (61.8 × 103.5 mm)
 * on a fixed 400 × 670 design grid and scaled as one piece, so the wheel, the
 * screen and the type keep their relationship at any size.
 *
 * Turning the wheel (pointer capture, the angle swept around its centre, one
 * detent every 15°) moves the selection in menus and changes the volume on
 * Now Playing. MENU goes back, ⏮ ⏭ skip, ⏯ plays or pauses and the centre
 * button selects. Playback is simulated: a timer moves the progress bar and
 * rolls on to the next track.
 *
 * For assistive tech the ring is a slider (its value is the highlighted item,
 * or the volume) and the keyboard drives everything from it: Up/Down turn,
 * Enter selects, Escape or Backspace is MENU, Space plays or pauses,
 * Left/Right skip. The five buttons are real buttons, left out of the tab
 * order because the ring already covers them, so the device is one tab stop.
 * Screen changes and new tracks are announced politely. Under reduced motion
 * nothing slides, pans or scrolls.
 */

/* --- Library ------------------------------------------------------------ */

/** Abstract cover art, drawn with gradients and shapes. */
export type Art = { kind: "sun" | "rings" | "quarters" | "hills" | "horizon"; colors: string[] };
export type Album = { id: string; title: string; artist: string; art: Art };
export type Track = { id: string; title: string; album: string; /** seconds */ duration: number };
export type Playlist = { title: string; tracks: string[] };
export type Library = { albums: Album[]; tracks: Track[]; playlists?: Playlist[] };

// A small, entirely fictional library.
export const LIBRARY: Library = {
  albums: [
    { id: "tide", title: "Low Tide Radio", artist: "Harbor Lights", art: { kind: "sun", colors: ["#f7c873", "#ec6f4f", "#2d3a6b", "#121936"] } },
    { id: "paper", title: "Paper Satellites", artist: "Mira Okafor", art: { kind: "rings", colors: ["#1e2a52", "#efe5d0", "#ff6a55", "#ffd166"] } },
    { id: "orchard", title: "Neon Orchard", artist: "The Velvet Arcade", art: { kind: "quarters", colors: ["#f2ece1", "#e63e4c", "#1f3b73", "#f4b928", "#2a9d8f"] } },
    { id: "cedar", title: "Rain on Cedar", artist: "Kodama Collective", art: { kind: "hills", colors: ["#93ada3", "#dfe8e1", "#4d7a63", "#1f3d32"] } },
    { id: "glass", title: "Glass Highway", artist: "Juniper Hale", art: { kind: "horizon", colors: ["#26104f", "#d53a9d", "#130a2c", "#ff7ad9"] } },
  ],
  tracks: [
    { id: "t1", title: "Salt in the Wires", album: "tide", duration: 221 },
    { id: "t2", title: "Lantern Season", album: "tide", duration: 245 },
    { id: "t3", title: "Ferry Lights at Six", album: "tide", duration: 198 },
    { id: "t4", title: "Paper Satellites", album: "paper", duration: 232 },
    { id: "t5", title: "Kitchen Floor Disco", album: "paper", duration: 187 },
    { id: "t6", title: "Quarter to Four", album: "paper", duration: 266 },
    { id: "t7", title: "Neon Orchard", album: "orchard", duration: 214 },
    { id: "t8", title: "Static Bloom", album: "orchard", duration: 178 },
    { id: "t9", title: "Rain on Cedar", album: "cedar", duration: 312 },
    { id: "t10", title: "Slow Moss", album: "cedar", duration: 280 },
    { id: "t11", title: "Glass Highway", album: "glass", duration: 207 },
    { id: "t12", title: "Last Exit North", album: "glass", duration: 254 },
  ],
  playlists: [
    { title: "Morning Walk", tracks: ["t2", "t11", "t5", "t7", "t9"] },
    { title: "After Hours", tracks: ["t6", "t10", "t3", "t8"] },
  ],
};

/* --- Geometry ----------------------------------------------------------- */

// The design grid: 400 × 670 is 61.8 × 103.5 mm at 6.47 px/mm, which makes
// the screen exactly 320 × 240.
const W = 400;
const H = 670;
const SCREEN = { left: 32, top: 36, width: 336, height: 268 };
const LCD = { width: 320, height: 240, bar: 22, row: 27, rows: 8 };
const BODY_H = LCD.height - LCD.bar;
const WHEEL = { size: 252, centre: 96, top: 361 };
const DETENT = 15; // degrees of turn per click
const VOLUME_MAX = 20;
const LCD_FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const EASE = "cubic-bezier(0.23, 1, 0.32, 1)"; // --ease-out

/* --- State -------------------------------------------------------------- */

type Screen =
  | { kind: "music" }
  | { kind: "playlists" }
  | { kind: "artists" }
  | { kind: "albums" }
  | { kind: "tracks"; title: string; ids: string[] }
  | { kind: "now" };

type Action = { kind: "push"; screen: Screen } | { kind: "play"; ids: string[]; at: number } | { kind: "shuffle" } | { kind: "now" };
type Item = { label: string; chevron: boolean; action: Action };
type Frame = { screen: Screen; index: number; top: number };

type State = {
  stack: Frame[];
  queue: string[];
  at: number;
  position: number;
  playing: boolean;
  volume: number;
  /** Bumped on every volume change; the bar hides a moment after the last one. */
  volumeNonce: number;
  volumeOpen: boolean;
  /** 1 when the last navigation went deeper, -1 when it came back. */
  direction: 1 | -1;
  announcement: string;
};

type Msg =
  | { type: "turn"; steps: number }
  | { type: "jump"; to: "first" | "last" }
  | { type: "select"; order: string[] }
  | { type: "menu" }
  | { type: "prev" }
  | { type: "next" }
  | { type: "toggle" }
  | { type: "tick"; dt: number }
  | { type: "hideVolume"; nonce: number };

type Lookup = ReturnType<typeof index>;

function index(library: Library) {
  const albums = new Map(library.albums.map((a) => [a.id, a]));
  const tracks = new Map(library.tracks.map((t) => [t.id, t]));
  const byTitle = (ids: string[]) => [...ids].sort((a, b) => tracks.get(a)!.title.localeCompare(tracks.get(b)!.title));
  const songs = byTitle(library.tracks.map((t) => t.id));
  const artists = [...new Set(library.albums.map((a) => a.artist))].sort((a, b) => a.localeCompare(b));
  return { library, albums, tracks, songs, artists, byTitle };
}

function titleOf(screen: Screen) {
  if (screen.kind === "tracks") return screen.title;
  return { music: "Music", playlists: "Playlists", artists: "Artists", albums: "Albums", now: "Now Playing" }[screen.kind];
}

/** The rows a menu screen shows. Song rows have no chevron, like the original. */
function itemsFor(screen: Screen, db: Lookup, hasQueue: boolean): Item[] {
  const push = (label: string, next: Screen): Item => ({ label, chevron: true, action: { kind: "push", screen: next } });
  switch (screen.kind) {
    case "music":
      return [
        push("Playlists", { kind: "playlists" }),
        push("Artists", { kind: "artists" }),
        push("Albums", { kind: "albums" }),
        push("Songs", { kind: "tracks", title: "Songs", ids: db.songs }),
        { label: "Shuffle Songs", chevron: false, action: { kind: "shuffle" } },
        ...(hasQueue ? [{ label: "Now Playing", chevron: true, action: { kind: "now" } } as Item] : []),
      ];
    case "playlists":
      return (db.library.playlists ?? []).map((p) => push(p.title, { kind: "tracks", title: p.title, ids: p.tracks }));
    case "artists":
      return db.artists.map((artist) =>
        push(artist, {
          kind: "tracks",
          title: artist,
          ids: db.library.tracks.filter((t) => db.albums.get(t.album)?.artist === artist).map((t) => t.id),
        }),
      );
    case "albums":
      return [...db.library.albums]
        .sort((a, b) => a.title.localeCompare(b.title))
        .map((album) =>
          push(album.title, { kind: "tracks", title: album.title, ids: db.library.tracks.filter((t) => t.album === album.id).map((t) => t.id) }),
        );
    case "tracks":
      return screen.ids.map((id, at) => ({ label: db.tracks.get(id)!.title, chevron: false, action: { kind: "play", ids: screen.ids, at } }));
    case "now":
      return [];
  }
}

const describeTrack = (db: Lookup, id: string | undefined) => {
  const track = id ? db.tracks.get(id) : undefined;
  return track ? `${track.title} by ${db.albums.get(track.album)?.artist}` : "";
};

/** Keeps the highlighted row inside the visible window. */
function scrolled(frame: Frame, index: number): Frame {
  const top = Math.min(Math.max(frame.top, index - LCD.rows + 1), index);
  return { ...frame, index, top };
}

function reduce(state: State, msg: Msg, db: Lookup): State {
  const frame = state.stack[state.stack.length - 1];
  const onNow = frame.screen.kind === "now";
  const items = onNow ? [] : itemsFor(frame.screen, db, state.queue.length > 0);
  const replaceTop = (next: Frame) => [...state.stack.slice(0, -1), next];
  const startPlaying = (queue: string[], at: number): State => ({
    ...state,
    queue,
    at,
    position: 0,
    playing: true,
    stack: [...state.stack, { screen: { kind: "now" }, index: 0, top: 0 }],
    direction: 1,
    announcement: `Now playing ${describeTrack(db, queue[at])}`,
  });
  const skipTo = (at: number, position = 0): State => ({
    ...state,
    at,
    position,
    announcement: at === state.at ? state.announcement : `${state.playing ? "Now playing" : "Cued"} ${describeTrack(db, state.queue[at])}`,
  });

  switch (msg.type) {
    case "turn": {
      if (onNow) {
        const volume = Math.min(VOLUME_MAX, Math.max(0, state.volume + msg.steps));
        return { ...state, volume, volumeOpen: true, volumeNonce: state.volumeNonce + 1 };
      }
      if (!items.length) return state;
      // The original stops at the ends of a list rather than wrapping.
      const next = Math.min(items.length - 1, Math.max(0, frame.index + msg.steps));
      return next === frame.index ? state : { ...state, stack: replaceTop(scrolled(frame, next)) };
    }
    case "jump": {
      if (onNow) {
        const volume = msg.to === "first" ? 0 : VOLUME_MAX;
        return { ...state, volume, volumeOpen: true, volumeNonce: state.volumeNonce + 1 };
      }
      if (!items.length) return state;
      return { ...state, stack: replaceTop(scrolled(frame, msg.to === "first" ? 0 : items.length - 1)) };
    }
    case "select": {
      const action = items[frame.index]?.action;
      if (!action) return state;
      if (action.kind === "push") {
        const count = itemsFor(action.screen, db, state.queue.length > 0).length;
        return {
          ...state,
          stack: [...state.stack, { screen: action.screen, index: 0, top: 0 }],
          direction: 1,
          announcement: `${titleOf(action.screen)}, ${count} ${count === 1 ? "item" : "items"}`,
        };
      }
      if (action.kind === "play") return startPlaying(action.ids, action.at);
      if (action.kind === "shuffle") return startPlaying(msg.order, 0);
      return {
        ...state,
        stack: [...state.stack, { screen: { kind: "now" }, index: 0, top: 0 }],
        direction: 1,
        announcement: `Now Playing: ${describeTrack(db, state.queue[state.at])}`,
      };
    }
    case "menu": {
      if (state.stack.length < 2) return state;
      const stack = state.stack.slice(0, -1);
      return { ...state, stack, direction: -1, volumeOpen: false, announcement: titleOf(stack[stack.length - 1].screen) };
    }
    case "prev":
      if (!state.queue.length) return state;
      // Past the first few seconds, ⏮ restarts the track; otherwise it goes back one.
      return state.position > 3 || state.at === 0 ? { ...state, position: 0 } : skipTo(state.at - 1);
    case "next":
      if (!state.queue.length) return state;
      return skipTo((state.at + 1) % state.queue.length);
    case "toggle": {
      if (!state.queue.length) return state;
      const playing = !state.playing;
      return { ...state, playing, announcement: playing ? `Playing ${describeTrack(db, state.queue[state.at])}` : "Paused" };
    }
    case "tick": {
      if (!state.playing) return state;
      const duration = db.tracks.get(state.queue[state.at])?.duration ?? 0;
      const position = state.position + msg.dt;
      if (position < duration) return { ...state, position };
      return skipTo((state.at + 1) % state.queue.length);
    }
    case "hideVolume":
      return msg.nonce === state.volumeNonce ? { ...state, volumeOpen: false } : state;
  }
}

function shuffled<T>(list: T[]) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const time = (s: number) => {
  const whole = Math.max(0, Math.floor(s));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};

/* --- Hooks -------------------------------------------------------------- */

const motionQuery = "(prefers-reduced-motion: reduce)";
function subscribeMotion(callback: () => void) {
  const mq = window.matchMedia(motionQuery);
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}
function useReducedMotion() {
  return useSyncExternalStore(subscribeMotion, () => window.matchMedia(motionQuery).matches, () => false);
}

/**
 * The wheel's click: a few milliseconds of filtered noise, very quiet. The
 * AudioContext is created on the first press (browsers only allow audio after
 * a gesture) and never before.
 */
function useClicker(enabled: boolean) {
  const ctx = useRef<AudioContext | null>(null);
  const buffer = useRef<AudioBuffer | null>(null);

  useEffect(() => () => void ctx.current?.close(), []);

  const prime = useCallback(() => {
    if (!enabled || ctx.current || typeof AudioContext === "undefined") return;
    const ac = new AudioContext();
    const length = Math.round(ac.sampleRate * 0.006);
    const data = ac.createBuffer(1, length, ac.sampleRate);
    const samples = data.getChannelData(0);
    for (let i = 0; i < length; i++) samples[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 4;
    ctx.current = ac;
    buffer.current = data;
  }, [enabled]);

  const click = useCallback(() => {
    const ac = ctx.current;
    if (!enabled || !ac || !buffer.current) return;
    if (ac.state === "suspended") void ac.resume();
    const source = ac.createBufferSource();
    source.buffer = buffer.current;
    const filter = ac.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 2600;
    const gain = ac.createGain();
    gain.gain.value = 0.06;
    source.connect(filter).connect(gain).connect(ac.destination);
    source.start();
  }, [enabled]);

  return { prime, click };
}

/* --- Finishes ----------------------------------------------------------- */

export type Finish = "silver" | "black";

// Fine horizontal brushing: fractal noise stretched almost flat, blended over
// the plate's gradient so it lightens and darkens without tinting.
const BRUSH = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><filter id="b" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.0025 0.45" numOctaves="3" seed="4"/><feColorMatrix type="saturate" values="0"/></filter><rect width="100%" height="100%" filter="url(#b)"/></svg>`,
)}")`;

const FINISHES: Record<Finish, Record<string, string | number>> = {
  silver: {
    plate: "linear-gradient(180deg, #e2e3e6 0%, #d1d3d7 42%, #c3c6ca 100%)",
    plateShadow: "inset 0 1.5px 0 rgb(255 255 255 / 0.9), inset 0 -1px 0 rgb(0 0 0 / 0.12), inset 0 0 0 1px rgb(0 0 0 / 0.1)",
    brush: 0.42,
    sheen: "linear-gradient(118deg, transparent 18%, rgb(255 255 255 / 0.3) 40%, transparent 62%)",
    lip: "0 1px 0 rgb(255 255 255 / 0.75), 0 -0.5px 0 rgb(0 0 0 / 0.25)",
    wheel: "radial-gradient(120% 120% at 50% 18%, #f4f4f5 0%, #e7e8ea 52%, #dadbde 100%)",
    wheelShadow:
      "0 0 0 1px rgb(0 0 0 / 0.1), 0 1.5px 0 rgb(255 255 255 / 0.8), inset 0 1px 1px rgb(255 255 255 / 0.95), inset 0 -4px 8px rgb(0 0 0 / 0.05)",
    glyph: "#a2a5aa",
    centre: "radial-gradient(110% 110% at 50% 12%, #e8e9eb 0%, #d4d6d9 58%, #c8cacd 100%)",
    centreShadow: "0 0 0 1px rgb(0 0 0 / 0.13), 0 1.5px 2px rgb(0 0 0 / 0.16), inset 0 1px 0 rgb(255 255 255 / 0.85), inset 0 0 0 0 transparent",
    centrePressed: "0 0 0 1px rgb(0 0 0 / 0.17), 0 0 0 rgb(0 0 0 / 0), inset 0 1px 0 rgb(255 255 255 / 0), inset 0 2px 5px rgb(0 0 0 / 0.2)",
    press: "rgb(0 0 0 / 0.07)",
  },
  black: {
    plate: "linear-gradient(180deg, #36373b 0%, #27282c 45%, #1c1d20 100%)",
    plateShadow: "inset 0 1.5px 0 rgb(255 255 255 / 0.16), inset 0 -1px 0 rgb(0 0 0 / 0.5), inset 0 0 0 1px rgb(0 0 0 / 0.55)",
    brush: 0.22,
    sheen: "linear-gradient(118deg, transparent 18%, rgb(255 255 255 / 0.07) 40%, transparent 62%)",
    lip: "0 1px 0 rgb(255 255 255 / 0.1), 0 -0.5px 0 rgb(0 0 0 / 0.6)",
    wheel: "radial-gradient(120% 120% at 50% 18%, #2c2d31 0%, #1e1f22 55%, #161719 100%)",
    wheelShadow:
      "0 0 0 1px rgb(0 0 0 / 0.65), 0 1.5px 0 rgb(255 255 255 / 0.08), inset 0 1px 1px rgb(255 255 255 / 0.09), inset 0 -4px 8px rgb(0 0 0 / 0.3)",
    glyph: "#8a8d93",
    centre: "radial-gradient(110% 110% at 50% 12%, #38393d 0%, #27282b 58%, #1f2023 100%)",
    centreShadow: "0 0 0 1px rgb(0 0 0 / 0.7), 0 1.5px 2px rgb(0 0 0 / 0.45), inset 0 1px 0 rgb(255 255 255 / 0.1), inset 0 0 0 0 transparent",
    centrePressed: "0 0 0 1px rgb(0 0 0 / 0.75), 0 0 0 rgb(0 0 0 / 0), inset 0 1px 0 rgb(255 255 255 / 0), inset 0 2px 5px rgb(0 0 0 / 0.6)",
    press: "rgb(255 255 255 / 0.05)",
  },
};

// The polished steel back shows as a thin bright rim around the front plate.
const CHROME = "linear-gradient(160deg, #fdfdfd 0%, #b5b8bd 16%, #f4f5f6 34%, #8c9095 56%, #eceef0 76%, #a3a6ab 100%)";

/* --- Cover art ---------------------------------------------------------- */

/** Abstract album art from a recipe of gradients and shapes; fills its box. */
function Cover({ art, size, style }: { art: Art; size: number; style?: CSSProperties }) {
  const [a, b, c, d, e] = art.colors;
  const fill: CSSProperties = { position: "absolute", inset: 0 };
  let body: ReactNode = null;

  if (art.kind === "sun") {
    // A sun setting into a striped sea.
    body = (
      <>
        <div style={{ ...fill, background: `linear-gradient(180deg, ${a} 0%, ${b} 56%, ${c} 56%, ${d} 100%)` }} />
        <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: "56%", overflow: "hidden" }}>
          <div
            style={{
              position: "absolute",
              left: "50%",
              bottom: 0,
              width: "48%",
              aspectRatio: "1",
              transform: "translate(-50%, 50%)",
              borderRadius: "50%",
              background: "radial-gradient(circle, #fff7d6 0%, #ffd27a 55%, #ffb25e 100%)",
            }}
          />
        </div>
        <div
          style={{
            position: "absolute",
            left: "26%",
            right: "26%",
            top: "57%",
            bottom: "6%",
            background: "repeating-linear-gradient(180deg, rgb(255 205 130 / 0.75) 0 4%, transparent 4% 11%)",
            maskImage: "radial-gradient(60% 100% at 50% 0%, #000 30%, transparent 100%)",
          }}
        />
      </>
    );
  } else if (art.kind === "rings") {
    // Orbits around an off-centre point, a planet and a moon.
    body = (
      <>
        <div style={{ ...fill, background: `repeating-radial-gradient(circle at 26% 76%, ${b} 0 1.3%, ${a} 1.8% 6%, ${b} 6.5%)` }} />
        <div style={{ position: "absolute", left: "56%", top: "12%", width: "28%", aspectRatio: "1", borderRadius: "50%", background: c }} />
        <div style={{ position: "absolute", left: "80%", top: "44%", width: "8%", aspectRatio: "1", borderRadius: "50%", background: d }} />
      </>
    );
  } else if (art.kind === "quarters") {
    // A 2×2 of quarter circles, each turned a different way.
    const tiles = [
      { bg: b, fg: a, radius: "100% 0 0 0" },
      { bg: a, fg: c, radius: "0 0 0 100%" },
      { bg: d, fg: c, radius: "0 100% 0 0" },
      { bg: e, fg: a, radius: "0 0 100% 0" },
    ];
    body = (
      <div style={{ ...fill, display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr" }}>
        {tiles.map((t, i) => (
          <div key={i} style={{ background: t.bg, position: "relative" }}>
            <div style={{ position: "absolute", inset: 0, background: t.fg, borderRadius: t.radius }} />
          </div>
        ))}
      </div>
    );
  } else if (art.kind === "hills") {
    // Layered hills under slanting rain.
    const hill = (left: string, width: string, height: string, color: string): CSSProperties => ({
      position: "absolute",
      left,
      width,
      height,
      bottom: 0,
      background: color,
      borderRadius: "50% 50% 0 0 / 100% 100% 0 0",
    });
    body = (
      <>
        <div style={{ ...fill, background: `linear-gradient(180deg, ${b} 0%, ${a} 100%)` }} />
        <div style={hill("-25%", "95%", "62%", c)} />
        <div style={{ ...hill("35%", "95%", "48%", c), opacity: 0.75 }} />
        <div style={hill("-10%", "120%", "28%", d)} />
        <div style={{ ...fill, background: "repeating-linear-gradient(102deg, rgb(255 255 255 / 0.28) 0 0.7%, transparent 0.7% 6%)" }} />
      </>
    );
  } else {
    // A banded sun over a grid running to the horizon.
    body = (
      <>
        <div style={{ ...fill, background: `linear-gradient(180deg, ${a} 0%, ${b} 58%, ${c} 58%)` }} />
        <div
          style={{
            position: "absolute",
            left: "27%",
            top: "14%",
            width: "46%",
            aspectRatio: "1",
            borderRadius: "50%",
            background: "linear-gradient(180deg, #ffe08a 0%, #ff8a6b 60%, #ff4f9a 100%)",
            maskImage: "linear-gradient(180deg, #000 50%, transparent 50%), repeating-linear-gradient(180deg, #000 0 7%, transparent 7% 11%)",
            maskComposite: "add",
          }}
        />
        <div style={{ position: "absolute", left: 0, right: 0, top: "58%", bottom: 0, overflow: "hidden", perspective: size * 0.5 }}>
          <div
            style={{
              position: "absolute",
              left: "-60%",
              right: "-60%",
              top: 0,
              height: "220%",
              transformOrigin: "50% 0",
              transform: "rotateX(62deg)",
              backgroundImage: `linear-gradient(${d} 1.5px, transparent 1.5px), linear-gradient(90deg, ${d} 1.5px, transparent 1.5px)`,
              backgroundSize: `100% ${size * 0.11}px, ${size * 0.11}px 100%`,
            }}
          />
        </div>
      </>
    );
  }

  return (
    <div style={{ position: "relative", width: size, height: size, overflow: "hidden", flexShrink: 0, ...style }}>
      {body}
      {/* A soft sheen, as printed artwork under the screen's glass. */}
      <div style={{ ...fill, background: "linear-gradient(160deg, rgb(255 255 255 / 0.16), transparent 45%)" }} />
    </div>
  );
}

/* --- Screen ------------------------------------------------------------- */

const SELECTED: CSSProperties = {
  // The classic blue highlight: a cool gradient with a lit top edge.
  background: "linear-gradient(180deg, #74b4f9 0%, #3f8ff0 48%, #2b7be6 52%, #1f6ad8 100%)",
  boxShadow: "inset 0 1px 0 rgb(255 255 255 / 0.35), inset 0 -1px 0 rgb(0 0 0 / 0.18)",
  color: "#fff",
  textShadow: "0 -1px 0 rgb(0 0 0 / 0.25)",
};

function Chevron() {
  return (
    <svg aria-hidden viewBox="0 0 7 12" width="7" height="12" className="shrink-0">
      <path d="M1.2 1.2 5.6 6l-4.4 4.8" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="square" />
    </svg>
  );
}

function StatusBar({ title, playing, cued }: { title: string; playing: boolean; cued: boolean }) {
  return (
    <div
      className="relative flex items-center justify-center"
      style={{
        height: LCD.bar,
        background: "linear-gradient(180deg, #ffffff 0%, #eceef0 52%, #d6d9dd 100%)",
        borderBottom: "1px solid #8e959c",
      }}
    >
      <span style={{ font: `700 13px/1 ${LCD_FONT}`, letterSpacing: "-0.01em", color: "#111" }}>{title}</span>
      {cued && (
        <svg aria-hidden viewBox="0 0 12 12" width="12" height="12" className="absolute" style={{ left: 7, top: 4 }}>
          <defs>
            <linearGradient id="cwp-status" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#7cc0ff" />
              <stop offset="1" stopColor="#1a5ccc" />
            </linearGradient>
          </defs>
          {playing ? (
            <path d="M2 1.2v9.6L10.6 6z" fill="url(#cwp-status)" stroke="#164a9e" strokeWidth="0.8" strokeLinejoin="round" />
          ) : (
            <g fill="url(#cwp-status)" stroke="#164a9e" strokeWidth="0.8">
              <rect x="2" y="1.4" width="3" height="9.2" rx="0.5" />
              <rect x="7" y="1.4" width="3" height="9.2" rx="0.5" />
            </g>
          )}
        </svg>
      )}
      {/* Battery: a glossy green charge in a grey case. */}
      <svg aria-hidden viewBox="0 0 26 12" width="26" height="12" className="absolute" style={{ right: 6, top: 4 }}>
        <defs>
          <linearGradient id="cwp-charge" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#c8f59a" />
            <stop offset="0.5" stopColor="#78d43f" />
            <stop offset="1" stopColor="#3f9a17" />
          </linearGradient>
        </defs>
        <rect x="0.6" y="0.6" width="22" height="10.8" rx="2" fill="#f4f4f4" stroke="#6f757c" strokeWidth="1.2" />
        <rect x="23.2" y="3.6" width="2.2" height="4.8" rx="0.8" fill="#6f757c" />
        <rect x="2.2" y="2.2" width="15" height="7.6" rx="1" fill="url(#cwp-charge)" />
      </svg>
    </div>
  );
}

function MenuList({ items, index, top, width }: { items: Item[]; index: number; top: number; width: number }) {
  const scroll = items.length > LCD.rows;
  const rowsWidth = scroll ? width - 9 : width;
  return (
    <div className="relative overflow-hidden" style={{ width, height: BODY_H }}>
      <div style={{ width: rowsWidth, transform: `translateY(${-top * LCD.row}px)` }}>
        {items.map((item, i) => (
          <div
            key={`${item.label}-${i}`}
            className="flex items-center justify-between gap-2"
            style={{
              height: LCD.row,
              padding: "0 9px 0 8px",
              font: `700 16px/1 ${LCD_FONT}`,
              letterSpacing: "-0.015em",
              color: "#0b0b0b",
              ...(i === index ? SELECTED : null),
            }}
          >
            <span className="min-w-0 truncate">{item.label}</span>
            {item.chevron && <Chevron />}
          </div>
        ))}
      </div>
      {scroll && (
        // The scroll bar: a grey track with a darker, rounded thumb.
        <div
          className="absolute right-0 top-0"
          style={{ width: 9, height: BODY_H, background: "linear-gradient(90deg, #dfe2e5, #fbfbfc)", borderLeft: "1px solid #aab0b6" }}
        >
          <div
            style={{
              position: "absolute",
              left: 1,
              right: 1,
              top: (BODY_H * top) / items.length + 1,
              height: (BODY_H * LCD.rows) / items.length - 2,
              borderRadius: 3,
              background: "linear-gradient(90deg, #5d6874, #8d99a6 60%, #7a8693)",
              boxShadow: "inset 0 0 0 0.5px rgb(0 0 0 / 0.3)",
            }}
          />
        </div>
      )}
    </div>
  );
}

/** One line of text that scrolls sideways when it doesn't fit (never under reduced motion). */
function Marquee({ text, style, reduced }: { text: string; style: CSSProperties; reduced: boolean }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const line = textRef.current;
    if (!box || !line || reduced) return;
    const over = line.scrollWidth - box.clientWidth;
    if (over <= 0) return;
    line.style.maxWidth = "none";
    const anim = line.animate(
      [
        { transform: "translateX(0)", offset: 0 },
        { transform: "translateX(0)", offset: 0.2 },
        { transform: `translateX(${-over - 12}px)`, offset: 0.8 },
        { transform: `translateX(${-over - 12}px)`, offset: 1 },
      ],
      { duration: 2400 + over * 45, iterations: Infinity, easing: "linear" },
    );
    return () => {
      anim.cancel();
      line.style.maxWidth = "";
    };
  }, [text, reduced]);

  return (
    <div ref={boxRef} className="overflow-hidden whitespace-nowrap" style={style}>
      <span ref={textRef} className="inline-block max-w-full truncate align-top">
        {text}
      </span>
    </div>
  );
}

function Meter({ value, style }: { value: number; style?: CSSProperties }) {
  return (
    <div
      className="relative overflow-hidden"
      style={{
        height: 10,
        background: "linear-gradient(180deg, #d5d8dc 0%, #f6f7f8 60%, #e8eaec 100%)",
        boxShadow: "inset 0 0 0 1px #7d848c",
        ...style,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          right: "auto",
          width: `${Math.min(1, Math.max(0, value)) * 100}%`,
          background: "linear-gradient(180deg, #9fd0ff 0%, #4d9af0 50%, #2f7fe0 51%, #2a70d2 100%)",
          boxShadow: "inset 0 0 0 1px #2a5fae",
        }}
      />
    </div>
  );
}

function Speaker({ loud }: { loud?: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 16 12" width="16" height="12" className="shrink-0">
      <path d="M1 4h3l4-3v10L4 8H1z" fill="#3a3f45" />
      {loud && <path d="M10.5 3.5a3.5 3.5 0 0 1 0 5M12.5 1.5a6.5 6.5 0 0 1 0 9" fill="none" stroke="#3a3f45" strokeWidth="1.3" strokeLinecap="round" />}
    </svg>
  );
}

function NowPlaying({ state, db, reduced }: { state: State; db: Lookup; reduced: boolean }) {
  const track = db.tracks.get(state.queue[state.at]);
  if (!track) return null;
  const album = db.albums.get(track.album)!;
  const info: CSSProperties = { font: `700 13px/16px ${LCD_FONT}`, color: "#3b3f44", letterSpacing: "-0.01em" };
  return (
    <div className="relative" style={{ width: LCD.width, height: BODY_H }}>
      <p className="absolute" style={{ left: 12, top: 6, font: `700 12px/14px ${LCD_FONT}`, color: "#2a2d31" }}>
        {state.at + 1} of {state.queue.length}
      </p>
      {/* The art and its reflection on the glass below. */}
      <div className="absolute" style={{ left: 12, top: 26 }}>
        <Cover art={album.art} size={104} style={{ boxShadow: "0 0 0 0.5px rgb(0 0 0 / 0.25)" }} />
        <div style={{ height: 42, overflow: "hidden", maskImage: "linear-gradient(180deg, rgb(0 0 0 / 0.38), transparent 90%)" }}>
          <Cover art={album.art} size={104} style={{ transform: "scaleY(-1)" }} />
        </div>
      </div>
      <div className="absolute" style={{ left: 130, right: 12, top: 34 }}>
        <Marquee text={track.title} reduced={reduced} style={{ font: `700 15px/19px ${LCD_FONT}`, color: "#0b0b0b", letterSpacing: "-0.015em" }} />
        <Marquee text={album.artist} reduced={reduced} style={{ ...info, marginTop: 5 }} />
        <Marquee text={album.title} reduced={reduced} style={{ ...info, marginTop: 3 }} />
      </div>
      {state.volumeOpen ? (
        <div className="absolute flex items-center gap-[7px]" style={{ left: 12, right: 12, top: 180 }}>
          <Speaker />
          <Meter value={state.volume / VOLUME_MAX} style={{ flex: 1 }} />
          <Speaker loud />
        </div>
      ) : (
        <div className="absolute" style={{ left: 12, right: 12, top: 176 }}>
          <Meter value={state.position / track.duration} />
          <div className="flex justify-between" style={{ marginTop: 4, font: `700 12px/14px ${LCD_FONT}`, color: "#2a2d31" }}>
            <span>{time(state.position)}</span>
            <span>-{time(track.duration - Math.floor(state.position))}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/** The split-screen Music menu's right half: the current cover, slowly panning. */
function SplitArt({ art, reduced }: { art: Art; reduced: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return;
    const anim = el.animate(
      [
        { transform: "translate(0, 0) scale(1.04)" },
        { transform: "translate(-22px, -10px) scale(1.18)" },
      ],
      { duration: 14000, iterations: Infinity, direction: "alternate", easing: "ease-in-out" },
    );
    return () => anim.cancel();
  }, [art, reduced]);
  return (
    <div className="absolute right-0 top-0 overflow-hidden" style={{ width: 152, height: BODY_H, boxShadow: "-3px 0 6px rgb(0 0 0 / 0.35)" }}>
      <div ref={ref} style={{ position: "absolute", left: -33, top: 0, transformOrigin: "40% 40%" }}>
        <Cover art={art} size={BODY_H} />
      </div>
    </div>
  );
}

/* --- Wheel glyphs ------------------------------------------------------- */

type WheelButton = "menu" | "prev" | "next" | "play" | "select";

const GLYPHS: Record<Exclude<WheelButton, "select">, { label: string; x: number; y: number; icon: ReactNode }> = {
  menu: {
    label: "Menu",
    x: 0,
    y: -91,
    icon: <span style={{ font: `700 16px/1 ${LCD_FONT}`, letterSpacing: "0.06em" }}>MENU</span>,
  },
  prev: {
    label: "Previous track",
    x: -91,
    y: 0,
    icon: (
      <svg aria-hidden viewBox="0 0 30 14" width="30" height="14">
        <path d="M2 1h2.8v12H2zM16 1v12L5.4 7zM27.6 1v12L17 7z" fill="currentColor" />
      </svg>
    ),
  },
  next: {
    label: "Next track",
    x: 91,
    y: 0,
    icon: (
      <svg aria-hidden viewBox="0 0 30 14" width="30" height="14">
        <path d="M28 1h-2.8v12H28zM14 1v12L24.6 7zM2.4 1v12L13 7z" fill="currentColor" />
      </svg>
    ),
  },
  play: {
    label: "Play or pause",
    x: 0,
    y: 92,
    icon: (
      <svg aria-hidden viewBox="0 0 28 14" width="28" height="14">
        <path d="M1.5 1v12L12 7zM15 1h3.6v12H15zM22 1h3.6v12H22z" fill="currentColor" />
      </svg>
    ),
  },
};

// Pressing a side of the wheel rocks it a few degrees toward that side.
const TILT: Partial<Record<WheelButton, string>> = {
  menu: "rotateX(3deg)",
  play: "rotateX(-3deg)",
  prev: "rotateY(-3deg)",
  next: "rotateY(3deg)",
};

/* --- ClickWheelPlayer --------------------------------------------------- */

type ClickWheelPlayerProps = {
  library?: Library;
  finish?: Finish;
  /** Rendered height in px; the device keeps its proportions (width ≈ 0.6 × height). */
  height?: number;
  /** A faint mechanical tick on each detent and press, after the first interaction. */
  clicker?: boolean;
  /** Start with a song cued and paused: its index in Songs, and how far in (seconds). */
  cue?: { index: number; position?: number };
  label?: string;
  className?: string;
};

/**
 * The player. One fixed-size design (400 × 670) scaled with a transform to
 * `height`, inside a box sized to the scaled result so it lays out like any
 * other element. Pointer angles come from getBoundingClientRect, which already
 * includes that scale.
 */
export function ClickWheelPlayer({
  library = LIBRARY,
  finish = "silver",
  height = 400,
  clicker = true,
  cue,
  label = "Music player",
  className = "",
}: ClickWheelPlayerProps) {
  const db = useMemo(() => index(library), [library]);
  const [state, dispatch] = useReducer(
    (s: State, m: Msg) => reduce(s, m, db),
    null,
    (): State => {
      const cued = cue && db.songs[cue.index] ? cue : null;
      return {
        stack: [{ screen: { kind: "music" }, index: 0, top: 0 }],
        queue: cued ? db.songs : [],
        at: cued ? cued.index : 0,
        position: cued?.position ?? 0,
        playing: false,
        volume: 13,
        volumeNonce: 0,
        volumeOpen: false,
        direction: 1,
        announcement: "",
      };
    },
  );
  const [pressed, setPressed] = useState<WheelButton | null>(null);
  // The ring takes focus on pointer presses too (so keys work straight after),
  // but only draws its focus ring once the keyboard is in use.
  const [keyboard, setKeyboard] = useState(true);
  const reduced = useReducedMotion();
  const { prime, click } = useClicker(clicker);
  const hintId = useId();

  const wheelRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; angle: number; acc: number; travel: number; button: WheelButton | null } | null>(null);
  const lastPointerPress = useRef(0);
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const frame = state.stack[state.stack.length - 1];
  const onNow = frame.screen.kind === "now";
  const items = onNow ? [] : itemsFor(frame.screen, db, state.queue.length > 0);
  const current = db.tracks.get(state.queue[state.at]);
  const currentArt = (current ? db.albums.get(current.album) : db.library.albums[0])?.art;
  const screenKey = `${state.stack.length}:${titleOf(frame.screen)}`;
  const f = FINISHES[finish];
  const scale = height / H;

  // Simulated playback: real elapsed time, sampled four times a second.
  useEffect(() => {
    if (!state.playing) return;
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      dispatch({ type: "tick", dt: (now - last) / 1000 });
      last = now;
    }, 250);
    return () => clearInterval(id);
  }, [state.playing]);

  // The volume bar gives the progress bar its place back shortly after the wheel stops.
  useEffect(() => {
    if (!state.volumeOpen) return;
    const id = setTimeout(() => dispatch({ type: "hideVolume", nonce: state.volumeNonce }), 1600);
    return () => clearTimeout(id);
  }, [state.volumeOpen, state.volumeNonce]);

  useEffect(() => () => clearTimeout(flashTimer.current), []);

  // Screens slide like the original: the old one leaves as the new one comes
  // in. The outgoing screen is a static clone of the last frame, animated in a
  // layer React never renders into, then dropped.
  const snapshot = useRef<HTMLElement | null>(null);
  const shownKey = useRef(screenKey);
  useLayoutEffect(() => {
    const body = bodyRef.current;
    const ghost = ghostRef.current;
    if (!body || !ghost) return;
    if (shownKey.current !== screenKey && snapshot.current && !reduced) {
      const old = snapshot.current;
      const timing = { duration: 260, easing: EASE };
      ghost.replaceChildren(old);
      body.animate([{ transform: `translateX(${state.direction * 100}%)` }, { transform: "translateX(0)" }], timing);
      old.animate([{ transform: "translateX(0)" }, { transform: `translateX(${-state.direction * 100}%)` }], timing).onfinish = () => old.remove();
    }
    shownKey.current = screenKey;
    snapshot.current = reduced ? null : (body.cloneNode(true) as HTMLElement);
  });

  const turn = useCallback(
    (steps: number) => {
      click();
      dispatch({ type: "turn", steps });
    },
    [click],
  );

  const press = useCallback(
    (button: WheelButton) => {
      click();
      if (button === "menu") dispatch({ type: "menu" });
      else if (button === "prev") dispatch({ type: "prev" });
      else if (button === "next") dispatch({ type: "next" });
      else if (button === "play") dispatch({ type: "toggle" });
      else dispatch({ type: "select", order: shuffled(db.songs) });
    },
    [click, db],
  );

  /** A brief pressed state for presses that have no pointer to hold them down. */
  function flash(button: WheelButton) {
    setPressed(button);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setPressed(null), 140);
  }

  function polar(e: PointerEvent) {
    const r = wheelRef.current!.getBoundingClientRect();
    const x = e.clientX - (r.left + r.width / 2);
    const y = e.clientY - (r.top + r.height / 2);
    return { angle: (Math.atan2(y, x) * 180) / Math.PI, distance: Math.hypot(x, y) / (r.width / 2) };
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || (e.target as Element).closest("[data-centre]")) return;
    const { angle, distance } = polar(e);
    if (distance > 1.02) return;
    prime();
    setKeyboard(false);
    // Keep the press from selecting text or moving focus to a button; the
    // ring takes focus instead, so the keyboard picks up where the hand left off.
    e.preventDefault();
    sliderRef.current?.focus({ preventScroll: true });
    e.currentTarget.setPointerCapture(e.pointerId);
    const button = ((e.target as HTMLElement).closest("[data-wheel-button]") as HTMLElement | null)?.dataset.wheelButton as WheelButton | undefined;
    drag.current = { id: e.pointerId, angle, acc: 0, travel: 0, button: button ?? null };
    setPressed(button ?? null);
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const g = drag.current;
    if (!g || g.id !== e.pointerId) return;
    const { angle } = polar(e);
    let delta = angle - g.angle;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    g.angle = angle;
    g.acc += delta;
    g.travel += Math.abs(delta);
    // A press that starts sliding becomes a turn, as on the real wheel.
    if (g.button && g.travel > 8) {
      g.button = null;
      setPressed(null);
    }
    let steps = 0;
    while (g.acc >= DETENT) {
      steps++;
      g.acc -= DETENT;
    }
    while (g.acc <= -DETENT) {
      steps--;
      g.acc += DETENT;
    }
    if (steps) turn(steps);
  }

  function onPointerEnd(e: PointerEvent<HTMLDivElement>, commit: boolean) {
    const g = drag.current;
    if (!g || g.id !== e.pointerId) return;
    drag.current = null;
    setPressed(null);
    if (commit && g.button) {
      lastPointerPress.current = performance.now();
      press(g.button);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    // Enter and Space on a focused button (screen readers can reach them) stay native.
    const onButton = (e.target as HTMLElement).tagName === "BUTTON";
    if (!keyboard && e.key !== "Shift") setKeyboard(true);
    switch (e.key) {
      case "ArrowDown":
        turn(onNow ? -1 : 1);
        break;
      case "ArrowUp":
        turn(onNow ? 1 : -1);
        break;
      case "PageDown":
        turn(onNow ? -4 : LCD.rows - 1);
        break;
      case "PageUp":
        turn(onNow ? 4 : -(LCD.rows - 1));
        break;
      case "Home":
        click();
        dispatch({ type: "jump", to: onNow ? "last" : "first" });
        break;
      case "End":
        click();
        dispatch({ type: "jump", to: onNow ? "first" : "last" });
        break;
      case "Enter":
        if (onButton || e.repeat) return;
        flash("select");
        press("select");
        break;
      case " ":
        if (onButton || e.repeat) return;
        flash("play");
        press("play");
        break;
      case "Escape":
      case "Backspace":
        // At the top menu there's nowhere to go back to, so Escape is left for
        // whatever hosts the player (a dialog, say) to close itself.
        if (state.stack.length < 2) return;
        flash("menu");
        press("menu");
        break;
      case "ArrowLeft":
        flash("prev");
        press("prev");
        break;
      case "ArrowRight":
        flash("next");
        press("next");
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  const selected = items[frame.index];
  const valueText = onNow
    ? `Volume ${Math.round((state.volume / VOLUME_MAX) * 100)}%`
    : selected
      ? `${selected.label}, ${frame.index + 1} of ${items.length}`
      : "Empty";

  return (
    <div
      role="group"
      aria-label={label}
      aria-roledescription="music player"
      onKeyDown={onKeyDown}
      onKeyDownCapture={prime}
      className={`relative shrink-0 select-none ${className}`}
      style={{ width: W * scale, height, "--s": scale } as CSSProperties}
    >
      <div
        className="absolute left-0 top-0 rounded-[46px]"
        style={{
          width: W,
          height: H,
          transform: `scale(${scale})`,
          transformOrigin: "0 0",
          background: CHROME,
          boxShadow: "0 2px 4px rgb(0 0 0 / 0.12), 0 28px 56px -18px rgb(0 0 0 / 0.5)",
        }}
      >
        {/* Front plate: anodized aluminium, brushed, with a soft raking sheen. */}
        <div className="absolute inset-[3px] overflow-hidden rounded-[43px]" style={{ background: f.plate as string, boxShadow: f.plateShadow as string }}>
          <div aria-hidden className="absolute inset-0 mix-blend-overlay" style={{ backgroundImage: BRUSH, backgroundSize: "100% 100%", opacity: f.brush }} />
          <div aria-hidden className="absolute inset-0" style={{ background: f.sheen as string }} />
        </div>

        {/* Screen: the LCD behind a black-bordered glass window. */}
        <div
          aria-hidden
          className="absolute overflow-hidden rounded-[7px]"
          style={{ ...SCREEN, background: "linear-gradient(180deg, #111215, #050506)", boxShadow: f.lip as string }}
        >
          <div className="absolute overflow-hidden bg-white" style={{ left: 8, top: 12, width: LCD.width, height: LCD.height, fontFamily: LCD_FONT }}>
            <StatusBar title={titleOf(frame.screen)} playing={state.playing} cued={state.queue.length > 0} />
            <div className="relative overflow-hidden" style={{ height: BODY_H }}>
              <div ref={bodyRef} className="absolute inset-0 bg-white">
                {onNow ? (
                  <NowPlaying state={state} db={db} reduced={reduced} />
                ) : frame.screen.kind === "music" && currentArt ? (
                  <>
                    <MenuList items={items} index={frame.index} top={frame.top} width={168} />
                    <SplitArt art={currentArt} reduced={reduced} />
                  </>
                ) : (
                  <MenuList items={items} index={frame.index} top={frame.top} width={LCD.width} />
                )}
              </div>
              <div ref={ghostRef} className="pointer-events-none absolute inset-0 [&>*]:bg-white" />
            </div>
          </div>
          {/* Glass: a lit top edge and a diagonal glare. */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: "linear-gradient(162deg, rgb(255 255 255 / 0.2) 0%, rgb(255 255 255 / 0.07) 40%, transparent 40.2%)",
              boxShadow: "inset 0 1px 0 rgb(255 255 255 / 0.18), inset 0 0 0 1px rgb(0 0 0 / 0.6)",
            }}
          />
        </div>

        {/* Click wheel. Handlers sit on the whole wheel so a press on a label can still turn into a turn. */}
        <div
          ref={wheelRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => onPointerEnd(e, true)}
          onPointerCancel={(e) => onPointerEnd(e, false)}
          onLostPointerCapture={(e) => onPointerEnd(e, false)}
          className="absolute touch-none rounded-full motion-safe:transition-transform motion-safe:duration-[90ms]"
          style={{
            left: (W - WHEEL.size) / 2,
            top: WHEEL.top,
            width: WHEEL.size,
            height: WHEEL.size,
            transform: `perspective(700px) ${(pressed && TILT[pressed]) || ""}`,
          }}
        >
          <div
            ref={sliderRef}
            role="slider"
            tabIndex={0}
            aria-label={onNow ? "Volume" : "Click wheel"}
            aria-describedby={hintId}
            aria-orientation="vertical"
            aria-valuemin={onNow ? 0 : 1}
            aria-valuemax={onNow ? VOLUME_MAX : Math.max(1, items.length)}
            aria-valuenow={onNow ? state.volume : frame.index + 1}
            aria-valuetext={valueText}
            className="absolute inset-0 cursor-grab rounded-full active:cursor-grabbing"
            style={{
              background: f.wheel as string,
              boxShadow: f.wheelShadow as string,
              // The site's focus ring, kept at 2px however small the device is drawn.
              outlineWidth: "calc(2px / var(--s))",
              outlineOffset: "calc(5px / var(--s))",
              outlineStyle: keyboard ? undefined : "none",
            }}
          >
            {/* The pressed side darkens slightly as it dips. */}
            {pressed && pressed !== "select" && (
              <div
                aria-hidden
                className="absolute inset-0 rounded-full"
                style={{
                  background: `radial-gradient(60% 60% at ${50 + GLYPHS[pressed].x / 2.5}% ${50 + GLYPHS[pressed].y / 2.5}%, ${f.press}, transparent 70%)`,
                }}
              />
            )}
          </div>

          {(Object.keys(GLYPHS) as (keyof typeof GLYPHS)[]).map((key) => {
            const g = GLYPHS[key];
            return (
              <button
                key={key}
                type="button"
                tabIndex={-1}
                data-wheel-button={key}
                aria-label={g.label}
                onClick={(e) => {
                  // Pointer presses are handled on pointerup (so a press can become a turn);
                  // this catches keyboard and assistive-tech activation.
                  if (e.detail && performance.now() - lastPointerPress.current < 800) return;
                  press(key);
                }}
                className="absolute flex items-center justify-center"
                style={{
                  left: WHEEL.size / 2 + g.x - 32,
                  top: WHEEL.size / 2 + g.y - 24,
                  width: 64,
                  height: 48,
                  color: f.glyph as string,
                  cursor: "inherit",
                }}
              >
                {g.icon}
              </button>
            );
          })}

          <button
            type="button"
            tabIndex={-1}
            data-centre
            aria-label="Select"
            onPointerDown={() => {
              prime();
              setKeyboard(false);
              click();
            }}
            onClick={() => {
              sliderRef.current?.focus({ preventScroll: true });
              dispatch({ type: "select", order: shuffled(db.songs) });
            }}
            className="group absolute rounded-full motion-safe:transition-[transform,box-shadow] motion-safe:duration-[90ms] active:translate-y-px active:scale-[0.985]"
            style={{
              left: (WHEEL.size - WHEEL.centre) / 2,
              top: (WHEEL.size - WHEEL.centre) / 2,
              width: WHEEL.centre,
              height: WHEEL.centre,
              background: f.centre as string,
              boxShadow: (pressed === "select" ? f.centrePressed : f.centreShadow) as string,
              transform: pressed === "select" ? "translateY(1px) scale(0.985)" : undefined,
            }}
          >
            <span
              aria-hidden
              className="absolute inset-0 rounded-full opacity-0 group-active:opacity-100"
              style={{ boxShadow: f.centrePressed as string }}
            />
          </button>
        </div>
      </div>

      <p id={hintId} className="sr-only">
        Turn the wheel, or use the Up and Down arrow keys, to move through menus, or to change the volume on Now Playing. Enter selects,
        Escape goes back, Space plays or pauses, Left and Right arrows skip tracks.
      </p>
      <p role="status" aria-live="polite" className="sr-only">
        {state.announcement}
      </p>
    </div>
  );
}

/* --- Demo --------------------------------------------------------------- */

function subscribeTheme(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}
const useDarkTheme = () => useSyncExternalStore(subscribeTheme, () => document.documentElement.dataset.theme === "dark", () => false);

const RATIO = W / H;
const PICKER = 24 + 14; // picker width plus its gap

/**
 * Sizes the device to the room it has. The stage it sits in (the nearest
 * ancestor that clips) is a fixed box on desktop and grows with its content on
 * phones, so rather than reading a height, this grows the device by the
 * stage's spare height — which settles at the stage's height when that is
 * fixed, and at its minimum when it isn't. Measurements are taken with
 * getBoundingClientRect and divided by any CSS zoom on the way (capture frames
 * zoom the demo).
 */
function useFitHeight(ref: RefObject<HTMLDivElement | null>, min: number, max: number) {
  const [height, setHeight] = useState(min);

  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    let stage = box.parentElement;
    while (stage && stage !== document.body && getComputedStyle(stage).overflowY === "visible") stage = stage.parentElement;
    let content: HTMLElement = box;
    while (stage && content.parentElement && content.parentElement !== stage) content = content.parentElement;

    const fit = () => {
      const rect = box.getBoundingClientRect();
      const zoom = box.offsetWidth ? rect.width / box.offsetWidth : 1;
      setHeight((h) => {
        const spare = stage && stage !== document.body ? (stage.getBoundingClientRect().height - content.getBoundingClientRect().height) / zoom : 0;
        const byWidth = (box.clientWidth - PICKER) / RATIO;
        const next = Math.floor(Math.max(min, Math.min(max, h + spare, byWidth)));
        return Math.abs(next - h) < 1 ? h : next;
      });
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    if (stage && stage !== document.body) observer.observe(stage);
    return () => observer.disconnect();
  }, [ref, min, max]);

  return height;
}

function FinishPicker({ value, onChange }: { value: Finish; onChange: (f: Finish) => void }) {
  const options: { value: Finish; label: string; swatch: string }[] = [
    { value: "silver", label: "Silver", swatch: "linear-gradient(180deg, #eceef0, #c3c6ca)" },
    { value: "black", label: "Black", swatch: "linear-gradient(180deg, #3a3b3f, #17181a)" },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Finish"
      className="flex flex-col gap-0.5"
      onKeyDown={(e) => {
        if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
        e.preventDefault();
        const next = value === "silver" ? "black" : "silver";
        onChange(next);
        e.currentTarget.querySelector<HTMLElement>(`[data-finish="${next}"]`)?.focus();
      }}
    >
      {options.map((o) => {
        const checked = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={o.label}
            data-finish={o.value}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(o.value)}
            className="grid size-6 place-items-center rounded-full"
          >
            <span
              aria-hidden
              className={`size-3 rounded-full transition-shadow duration-(--duration-enter) ${
                checked ? "shadow-[0_0_0_1px_var(--line-strong),0_0_0_3px_var(--canvas),0_0_0_4px_var(--ink)]" : "shadow-[0_0_0_1px_var(--line-strong)]"
              }`}
              style={{ background: o.swatch }}
            />
          </button>
        );
      })}
    </div>
  );
}

export default function Demo() {
  const dark = useDarkTheme();
  // Silver on light pages, black on dark ones, until someone picks.
  const [picked, setPicked] = useState<Finish | null>(null);
  const finish = picked ?? (dark ? "black" : "silver");
  const ref = useRef<HTMLDivElement>(null);
  const height = useFitHeight(ref, 180, 440);

  return (
    <div ref={ref} className="flex w-full animate-enter items-end justify-center gap-3.5">
      <ClickWheelPlayer finish={finish} height={height} cue={{ index: 2, position: 47 }} />
      <FinishPicker value={finish} onChange={setPicked} />
    </div>
  );
}
