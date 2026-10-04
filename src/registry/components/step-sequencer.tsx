"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { focusQuietly } from "@/design-system";
import { hostTransport, play, type SoundName } from "@/lib/sound";

/*
 * A step sequencer whose drum kit is the player's own interface: the key's
 * thock, the wheel's detent, the bump at the end of a list and the centre
 * button's chime. Four tracks of sixteen steps.
 *
 * Notes are scheduled a moment ahead on the audio clock (play's `delay`), so
 * the groove never drifts with the frame rate, and the lights read the same
 * queue, so they land with the sound. On the home page's player it plays
 * aloud while the tape plays, keeps quiet while the tape is paused (until a
 * hand works it) and stays stopped after STOP. Anywhere else it just plays.
 * Under reduced motion it waits for PLAY.
 *
 * Narrow stages show eight steps at a time and page with the playhead; wide
 * ones show all sixteen. The pattern is one tab stop: arrows move, Space or
 * Enter toggles a step.
 */

type Track = { sound: SoundName; name: string; gain: number; pitch?: (step: number) => number };

/** The chime walks a pentatonic scale, so the bell line reads as a tune. */
const SCALE = [1, 1.125, 1.25, 1.5, 1.6875];

const TRACKS: Track[] = [
  { sound: "press", name: "Press", gain: 0.8 },
  { sound: "tick", name: "Tick", gain: 0.6, pitch: (s) => (s % 4 === 2 ? 1 : 0.94) },
  { sound: "bump", name: "Bump", gain: 0.75 },
  { sound: "select", name: "Select", gain: 0.4, pitch: (s) => SCALE[(s * 3) % SCALE.length] },
];

const STEPS = 16;
const PAGE = 8;
const LOOKAHEAD = 100; // ms of notes queued ahead on the audio clock
const INTERVAL = 25; // ms between scheduling passes
const LATE = 30; // ms past due before a note is dropped rather than played late
const PIN = 3000; // ms a page stays put after a hand turns to it
const WIDE = 528; // px of container (33rem) from which all sixteen steps show
const BPM = { min: 60, max: 180, initial: 112 };

const GROOVE = [
  [0, 3, 8, 10],
  [2, 6, 10, 14, 15],
  [4, 12],
  [0, 7, 11],
];
const groove = () => GROOVE.map((on) => Array.from({ length: STEPS }, (_, i) => on.includes(i)));

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");
/** A detent's pitch, varied a little so repeated ticks never sound identical. */
const detent = () => 0.97 + Math.random() * 0.06;
const msFromNow = (ms: number) => performance.now() + ms;

/** Lettering on the body: tiny tracked capitals, cut in. */
const engraved = "font-semibold uppercase leading-none tracking-[0.14em] [text-shadow:var(--device-engrave)]";

/** Focus that follows the hand: no ring, and Safari still hands the keys to the study. */
const focusOnPress = (e: PointerEvent<HTMLElement>) => {
  if (e.button === 0) focusQuietly(e.currentTarget);
};

export function StepSequencer({ className = "" }: { className?: string }) {
  const [pattern, setPattern] = useState(groove);
  const [bpm, setBpm] = useState(BPM.initial);
  const [running, setRunning] = useState(false);
  const [head, setHead] = useState({ step: -1, bar: 0 }); // the step under the playhead
  const [page, setPage] = useState(0);
  const [wide, setWide] = useState(false);
  const [cursor, setCursor] = useState({ row: 0, col: 0 });
  const [announcement, setAnnouncement] = useState("");
  const ids = useId();

  const rootRef = useRef<HTMLDivElement>(null);
  const patternRef = useRef(pattern);
  const bpmRef = useRef(bpm);
  const touched = useRef(false); // a hand has worked it: it may sound even while the host is paused
  const pinned = useRef(0); // until when the page ignores the playhead
  const refocus = useRef(false);
  const drag = useRef<{ id: number; x: number; y: number; from: number; at: number } | null>(null);

  useEffect(() => {
    patternRef.current = pattern;
  }, [pattern]);
  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);

  // Start on the first frame, unless the viewer prefers less motion or the host's tape is stopped.
  // Then follow the host: its PLAY starts the pattern, its STOP stops it.
  useEffect(() => {
    const root = rootRef.current;
    const start = requestAnimationFrame(() => {
      if (!matchMedia("(prefers-reduced-motion: reduce)").matches && hostTransport(root) !== "stop") setRunning(true);
    });
    const host = root?.closest("[data-transport]");
    let last = hostTransport(root);
    const observer = new MutationObserver(() => {
      const next = hostTransport(root);
      if (next === last) return;
      last = next;
      if (next === "play") {
        setHead({ step: -1, bar: 0 });
        setRunning(true);
      } else if (next === "stop") setRunning(false);
    });
    if (host) observer.observe(host, { attributes: true, attributeFilter: ["data-transport"] });
    return () => {
      cancelAnimationFrame(start);
      observer.disconnect();
    };
  }, []);

  // Sixteen steps once there's room for them.
  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWide(entry.contentRect.width >= WIDE));
    observer.observe(rootRef.current!);
    return () => observer.disconnect();
  }, []);

  // The scheduler: queue the next notes a moment ahead; the lights follow the same queue.
  useEffect(() => {
    if (!running) return;
    const root = rootRef.current;
    const queue: { step: number; at: number }[] = [];
    let at = performance.now() + 40;
    let step = 0;
    let raf = 0;

    function schedule() {
      const now = performance.now();
      // Back from a hidden tab or a long stall: pick the beat up from here instead of racing to catch up.
      if (at < now - 250) at = now + 20;
      const audible = touched.current || hostTransport(root) === "play";
      while (at < now + LOOKAHEAD) {
        if (audible && at >= now - LATE) {
          for (let t = 0; t < TRACKS.length; t++) {
            if (!patternRef.current[t][step]) continue;
            const track = TRACKS[t];
            play(track.sound, { delay: Math.max(0, at - now) / 1000, gain: track.gain, pitch: track.pitch?.(step) });
          }
        }
        queue.push({ step, at });
        step = (step + 1) % STEPS;
        at += 60000 / bpmRef.current / 4;
      }
    }

    function draw(now: number) {
      let shown = -1;
      while (queue.length && queue[0].at <= now) shown = queue.shift()!.step;
      if (shown >= 0) {
        setHead((h) => ({ step: shown, bar: shown === 0 ? h.bar + 1 : h.bar }));
        if (performance.now() > pinned.current) setPage(Math.floor(shown / PAGE));
      }
      raf = requestAnimationFrame(draw);
    }

    schedule();
    const id = setInterval(schedule, INTERVAL);
    raf = requestAnimationFrame(draw);
    return () => {
      clearInterval(id);
      cancelAnimationFrame(raf);
    };
  }, [running]);

  // Keyboard moves land on the step they moved to, once its page is showing.
  useLayoutEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    rootRef.current?.querySelector<HTMLElement>(`[data-cell="${cursor.row}-${cursor.col}"]`)?.focus();
  }, [cursor, page]);

  /* --- Moves -------------------------------------------------------------- */

  function pin() {
    pinned.current = msFromNow(PIN);
  }

  function toggle(row: number, col: number) {
    const on = !pattern[row][col];
    setPattern((p) => p.map((r, i) => (i === row ? r.map((v, j) => (j === col ? on : v)) : r)));
    setCursor({ row, col });
    pin();
    const track = TRACKS[row];
    if (on) play(track.sound, { gain: track.gain, pitch: track.pitch?.(col) });
    else play("release", { gain: 0.6 });
  }

  function onStepKey(e: KeyboardEvent<HTMLButtonElement>, row: number, col: number) {
    let r = row;
    let c = col;
    if (e.key === "ArrowRight") c++;
    else if (e.key === "ArrowLeft") c--;
    else if (e.key === "ArrowDown") r++;
    else if (e.key === "ArrowUp") r--;
    else if (e.key === "Home") c = 0;
    else if (e.key === "End") c = STEPS - 1;
    else return;
    e.preventDefault();
    if (r < 0 || r >= TRACKS.length || c < 0 || c >= STEPS || (r === row && c === col)) return play("bump", { gain: 0.6 });
    play("tick", { pitch: detent() });
    refocus.current = true;
    setCursor({ row: r, col: c });
    setPage(Math.floor(c / PAGE));
    pin();
  }

  function turnPage(p: number) {
    pin();
    if (p === page) return play("bump", { gain: 0.6 });
    play("toggle");
    setPage(p);
  }

  function toggleRun() {
    if (running) {
      setRunning(false);
      play("stop");
      setAnnouncement("Stopped");
    } else {
      setHead({ step: -1, bar: 0 });
      setRunning(true);
      play("start");
      setAnnouncement(`Playing, ${bpm} BPM`);
    }
  }

  function setTempo(next: number) {
    const value = Math.min(BPM.max, Math.max(BPM.min, Math.round(next)));
    if (value === bpm) return play("bump", { gain: 0.6 });
    setBpm(value);
    play("tick", { pitch: 0.85 + ((value - BPM.min) / (BPM.max - BPM.min)) * 0.3 });
  }

  function onTempoKey(e: KeyboardEvent<HTMLDivElement>) {
    const delta = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 }[e.key];
    if (delta) setTempo(bpm + delta);
    else if (e.key === "Home") setTempo(BPM.min);
    else if (e.key === "End") setTempo(BPM.max);
    else return;
    e.preventDefault();
  }

  // Drag the screen to set the tempo: right or up is faster, a beat per 4px.
  function onTempoDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    focusOnPress(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, from: bpm, at: bpm };
  }
  function onTempoMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const next = Math.min(BPM.max, Math.max(BPM.min, Math.round(d.from + (e.clientX - d.x - (e.clientY - d.y)) / 4)));
    if (next === d.at) return;
    d.at = next;
    setTempo(next);
  }
  function onTempoEnd(e: PointerEvent<HTMLDivElement>) {
    if (drag.current?.id === e.pointerId) drag.current = null;
  }

  /* --- Render ------------------------------------------------------------- */

  const lit = running ? head.step : -1;
  const cols = wide ? Array.from({ length: STEPS }, (_, i) => i) : Array.from({ length: PAGE }, (_, i) => page * PAGE + i);
  // The pattern's one tab stop, kept on a step that is showing.
  const stop = { row: cursor.row, col: cols.includes(cursor.col) ? cursor.col : cols[cursor.col % PAGE] };
  const template = { gridTemplateColumns: `3.9em repeat(${cols.length}, minmax(0, 1fr))` };
  const position = lit >= 0 ? `${String(head.bar).padStart(2, "0")}.${Math.floor(lit / 4) + 1}` : "01.1";

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label="Step sequencer"
      onPointerDownCapture={() => (touched.current = true)}
      onKeyDownCapture={() => (touched.current = true)}
      className={cx("@container w-full max-w-[560px] select-none", className)}
    >
      {/* A plate cut from the player's body: the same bead-blasted finish and lit top edge. */}
      <div className="relative isolate animate-enter overflow-hidden rounded-[1.25em] p-[0.9em] text-[clamp(11px,4.1cqw,13px)] [background:var(--device-body)] shadow-[var(--device-body-edge),0_1px_2px_rgb(0_0_0/0.06),0_16px_32px_-18px_rgb(0_0_0/0.3)] @[33rem]:p-[1.1em] @[33rem]:text-[clamp(12px,2.5cqw,14px)]">
        <div aria-hidden className="device-grain pointer-events-none absolute inset-0 -z-10 rounded-[inherit]" />

        {/* The tempo screen and the transport key. */}
        <div className="flex items-stretch gap-[0.7em]">
          <div
            role="slider"
            tabIndex={0}
            aria-label="Tempo"
            aria-describedby={`${ids}-tempo`}
            aria-orientation="horizontal"
            aria-valuemin={BPM.min}
            aria-valuemax={BPM.max}
            aria-valuenow={bpm}
            aria-valuetext={`${bpm} BPM`}
            onKeyDown={onTempoKey}
            onPointerDown={onTempoDown}
            onPointerMove={onTempoMove}
            onPointerUp={onTempoEnd}
            onPointerCancel={onTempoEnd}
            className="relative flex h-[3.7em] min-w-0 flex-1 cursor-ew-resize touch-none flex-col justify-between overflow-hidden rounded-[0.7em] px-[0.8em] pb-[0.55em] pt-[0.6em] text-(--device-lcd-ink) outline-offset-2 [background:var(--device-lcd)] shadow-(--device-lcd-edge)"
          >
            <div className="flex items-center gap-[0.5em]">
              <span className="inline-flex items-center gap-[0.35em] rounded-[0.4em] bg-white px-[0.42em] py-[0.24em] text-black">
                {running ? (
                  <span className="size-[0.55em] animate-pulse rounded-full bg-(--device-rec)" />
                ) : (
                  <span className="size-[0.5em] rounded-[1px] bg-current" />
                )}
                <span className="text-[0.58em] font-semibold uppercase leading-none tracking-[0.02em]">{running ? "Play" : "Stop"}</span>
              </span>
              <span className="ml-auto text-[0.66em] tabular-nums text-(--device-lcd-dim)">{position}</span>
            </div>
            <p className="flex items-baseline gap-[0.3em] leading-none">
              <span className="text-[1.55em] font-light tabular-nums tracking-[-0.03em]">{bpm}</span>
              <span className="text-[0.56em] text-(--device-lcd-dim)">BPM</span>
            </p>
          </div>

          {/* PLAY / STOP: a white cap seated in a collar, like the deck's transport keys. */}
          <button
            type="button"
            aria-label={running ? "Stop" : "Play"}
            aria-pressed={running}
            onPointerDown={focusOnPress}
            onClick={toggleRun}
            className="group/key grid size-[3.7em] shrink-0 place-items-center rounded-full bg-black/[0.035] p-[0.26em] shadow-(--device-recess) outline-offset-2 dark:bg-black/30"
          >
            <span className="grid size-full place-items-center rounded-full [background:var(--device-wheel-face)] shadow-(--device-key-shadow) transition-[transform,box-shadow] duration-(--duration-exit) ease-out group-active/key:translate-y-[2px] group-active/key:shadow-(--device-key-shadow-pressed) group-active/key:duration-75">
              {running ? (
                <span aria-hidden className="size-[0.9em] rounded-[0.14em] bg-(--device-key-ink)" />
              ) : (
                <svg aria-hidden viewBox="0 0 16 16" className="ml-[0.12em] size-[1.25em] fill-(--device-rec)">
                  <path d="M4.5 2.4 13.2 8l-8.7 5.6z" />
                </svg>
              )}
            </span>
          </button>
        </div>

        {/* The playhead: a red light over the step that is sounding. */}
        <div aria-hidden className="mt-[0.8em] grid items-center gap-x-[0.3em]" style={template}>
          <span />
          {cols.map((col) => (
            <span key={col} className="flex justify-center">
              <span
                className={cx(
                  "h-[0.26em] rounded-full transition-[background-color,box-shadow] duration-(--duration-exit)",
                  col % 4 === 0 ? "w-[0.9em]" : "w-[0.5em]",
                  col === lit ? "bg-(--device-rec) shadow-[0_0_0.4em_var(--device-rec)]" : "bg-(--device-meter-off)",
                )}
              />
            </span>
          ))}
        </div>

        {/* The pattern: one row of keys per sound. */}
        <div className="mt-[0.45em] flex flex-col gap-[0.3em]">
          {TRACKS.map((track, row) => {
            const firing = lit >= 0 && pattern[row][lit];
            return (
              <div key={track.sound} role="group" aria-labelledby={`${ids}-${track.sound}`} className="grid items-center gap-x-[0.3em]" style={template}>
                <span className="flex min-w-0 items-center gap-[0.4em]">
                  {/* The channel's light: it fires with the track. */}
                  <span
                    aria-hidden
                    className={cx(
                      "size-[0.36em] shrink-0 rounded-full transition-[background-color,box-shadow] duration-(--duration-exit)",
                      firing ? "bg-(--device-rec) shadow-[0_0_0.4em_var(--device-rec)]" : "bg-(--device-meter-off)",
                    )}
                  />
                  <span id={`${ids}-${track.sound}`} className={cx(engraved, "truncate text-[0.6em] text-(--device-label)")}>
                    {track.name}
                  </span>
                </span>
                {cols.map((col) => {
                  const on = pattern[row][col];
                  const fire = on && col === lit;
                  return (
                    <button
                      key={col}
                      type="button"
                      data-cell={`${row}-${col}`}
                      tabIndex={row === stop.row && col === stop.col ? 0 : -1}
                      aria-pressed={on}
                      aria-label={`${track.name}, step ${col + 1}`}
                      onPointerDown={focusOnPress}
                      onClick={() => toggle(row, col)}
                      onKeyDown={(e) => onStepKey(e, row, col)}
                      className="group/key relative h-[2.15em] rounded-[0.45em] outline-offset-1"
                    >
                      <span className="absolute inset-x-[0.12em] inset-y-[0.1em] rounded-[0.4em] [background:var(--device-key-face)] shadow-(--device-key-shadow) transition-[transform,box-shadow] duration-(--duration-exit) ease-out group-active/key:translate-y-[2px] group-active/key:shadow-(--device-key-shadow-pressed) group-active/key:duration-75">
                        <span
                          className={cx(
                            "absolute inset-x-[28%] top-[0.42em] h-[0.26em] rounded-full transition-[background-color,box-shadow] duration-(--duration-exit)",
                            fire ? "bg-(--device-rec) shadow-[0_0_0.45em_var(--device-rec)]" : on ? "bg-(--device-meter-on)" : "bg-(--device-meter-off)",
                          )}
                        />
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Narrow stages: two pages of eight. Each key lights red while the playhead is on its page. */}
        {!wide && (
          <div className="mt-[0.75em] flex items-center gap-[0.45em]">
            <span className={cx(engraved, "mr-auto text-[0.58em] text-(--device-label-quiet)")}>Steps</span>
            {[0, 1].map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={page === p}
                aria-label={`Steps ${p * PAGE + 1} to ${p * PAGE + PAGE}`}
                onPointerDown={focusOnPress}
                onClick={() => turnPage(p)}
                className="group/key flex h-[2.2em] items-center gap-[0.45em] rounded-[0.6em] px-[0.7em] text-(--device-label) outline-offset-2 transition-[background-color,box-shadow,transform] duration-(--duration-exit) ease-out active:translate-y-px aria-pressed:bg-(--device-well) aria-pressed:shadow-(--device-recess)"
              >
                <span
                  aria-hidden
                  className={cx(
                    "size-[0.36em] rounded-full transition-[background-color,box-shadow] duration-(--duration-exit)",
                    lit >= 0 && Math.floor(lit / PAGE) === p ? "bg-(--device-rec) shadow-[0_0_0.4em_var(--device-rec)]" : "bg-(--device-meter-off)",
                  )}
                />
                <span className={cx(engraved, "text-[0.62em] tabular-nums tracking-[0.06em]")}>
                  {p * PAGE + 1}–{p * PAGE + PAGE}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <p id={`${ids}-tempo`} className="sr-only">
        Drag the screen, or use the arrow keys, to set the tempo.
      </p>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

export default function Demo() {
  return <StepSequencer />;
}
