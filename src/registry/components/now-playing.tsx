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

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");
const now = () => performance.now();
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const pad = (n: number) => String(n).padStart(2, "0");

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
  // FNV-1a over the title seeds a small xorshift, so the same track always draws the same waveform, on the server too.
  let h = 2166136261;
  for (const ch of track.title) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
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

  // Off screen, the frame loop rests; the clock keeps time.
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      visible.current = entry.isIntersecting;
      if (visible.current) wake.current?.();
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
                className="w-[1.4%] rounded-full bg-(--device-meter-off) data-played:bg-(--device-meter-on) drawn:bg-(--device-draw-line)! drawn:data-played:bg-(--device-draw-ink)!"
                style={{ height: "max(0.2em, calc(var(--h, 0) * 100%))" }}
              />
            ))}
            {/* The playhead: red, as the tape's is, and lit. */}
            <span
              aria-hidden
              data-part="light"
              className="absolute -inset-y-[0.2em] left-(--p,0%) -ml-px w-[2px] rounded-full bg-(--device-rec) shadow-[0_0_0.45em_var(--device-rec)] drawn:bg-(--device-rec)!"
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
  { title: "Low thock", artist: "The Detents", duration: 211 },
  { title: "Over centre", artist: "The Detents", duration: 178 },
  { title: "Unity gain", artist: "The Detents", duration: 252 },
  { title: "Room tone", artist: "The Detents", duration: 185 },
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
