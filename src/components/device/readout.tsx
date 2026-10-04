"use client";

import { useEffect, useRef, type RefObject } from "react";
import { cn } from "@/design-system";
import { readLevels } from "@/lib/sound";
import type { Study } from "./screen";

export type Transport = "play" | "pause" | "stop";

/* --- Meters ---------------------------------------------------------------- */

/** The meters' scale, evenly spaced as on a recorder: the top end gets the room. */
const SCALE: [number, number][] = [
  [-60, 0],
  [-40, 0.2],
  [-20, 0.4],
  [-12, 0.6],
  [-6, 0.8],
  [0, 1],
];

function toScale(db: number) {
  if (db <= SCALE[0][0]) return 0;
  for (let i = 1; i < SCALE.length; i++) {
    const [d1, f1] = SCALE[i];
    const [d0, f0] = SCALE[i - 1];
    if (db <= d1) return f0 + ((db - d0) / (d1 - d0)) * (f1 - f0);
  }
  return 1;
}

const FALL = 26; // dB per second the bar drops
const HOLD = 900; // ms the peak marker waits before it falls
const PEAK_FALL = 12; // dB per second

/**
 * Left and right level meters. They show what the device's sounds are really
 * sending to the speakers (read from the sound bus every frame), what the
 * hand is doing on the screen (`activity`, 0 to 1, which the meters let decay)
 * and, under both, a faint room tone that rises while the tape plays. Drawn
 * by writing CSS variables, so React never re-renders for them.
 */
function Meters({ activity, playing, reduced }: { activity: RefObject<number>; playing: boolean; reduced: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const playingRef = useRef(playing);
  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    const rows = [...ref.current!.querySelectorAll<HTMLElement>("[data-meter]")];
    const levels: [number, number] = [0, 0];
    const shown = [-60, -60];
    const peak = [-60, -60];
    const peakAt = [0, 0];
    let last = performance.now();
    let raf = 0;

    const frame = (now: number) => {
      const dt = Math.min(100, now - last) / 1000;
      last = now;
      readLevels(levels);
      activity.current *= Math.exp(-dt / 0.28);
      const act = activity.current;
      for (let c = 0; c < 2; c++) {
        const audio = levels[c] > 0 ? 20 * Math.log10(levels[c]) : -90;
        const base = playingRef.current ? -30 : -42;
        const floor = reduced ? base : base + 5 * Math.sin(now / 730 + c * 1.7) + 2.5 * Math.sin(now / 290 + c * 4.1) + 1.5 * Math.sin(now / 97 + c);
        const hand = act > 0.002 ? -48 + act * 42 - c * 1.5 : -90;
        const target = Math.max(audio, floor, hand);
        shown[c] = target > shown[c] ? target : Math.max(target, shown[c] - FALL * dt);
        if (shown[c] >= peak[c]) {
          peak[c] = shown[c];
          peakAt[c] = now;
        } else if (now - peakAt[c] > HOLD) {
          peak[c] = Math.max(shown[c], peak[c] - PEAK_FALL * dt);
        }
        rows[c].style.setProperty("--l", toScale(shown[c]).toFixed(4));
        rows[c].style.setProperty("--pk", toScale(peak[c]).toFixed(4));
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [activity, reduced]);

  const meter = (channel: "L" | "R") => (
    <div data-meter className="flex items-center gap-[0.5em]">
      <span className="w-[0.8em] text-[0.66em] font-medium text-(--device-label)">{channel}</span>
      <span className="relative h-[0.72em] flex-1 text-(--device-meter-on)">
        {/* Unlit: a hairline. Lit: fine bars up to the level, and a heavier peak mark. */}
        <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-(--device-meter-off)" />
        <span className="meter-ticks absolute inset-0 [clip-path:inset(0_calc(100%_-_var(--l,0)_*_100%)_0_0)]" />
        <span className="absolute -inset-y-[12%] left-[calc(var(--pk,0)_*_100%_-_1px)] w-[2px] rounded-[1px] bg-current" />
      </span>
    </div>
  );

  return (
    <div ref={ref} aria-hidden className="flex flex-col gap-[0.55em]">
      {meter("L")}
      {meter("R")}
    </div>
  );
}

/* --- LCD ------------------------------------------------------------------ */

const chip: Record<Transport, string> = { play: "Play", pause: "Pause", stop: "Stop" };

function ChipGlyph({ transport }: { transport: Transport }) {
  if (transport === "play") return <span className="size-[0.62em] animate-pulse rounded-full bg-(--device-rec)" />;
  if (transport === "pause")
    return (
      <svg viewBox="0 0 10 10" className="size-[0.7em] fill-current">
        <path d="M2 1.5h2v7H2zM6 1.5h2v7H6z" />
      </svg>
    );
  return <span className="size-[0.58em] rounded-[1px] bg-current" />;
}

/** Digits and units on the LCD clock. The device writes the digits every frame (paintClock). */
function Clock({ clockRef }: { clockRef: RefObject<HTMLParagraphElement | null> }) {
  const unit = "mr-[0.45em] ml-[0.1em] text-[0.3em] font-normal text-(--device-lcd-dim) last:mr-0";
  return (
    <p ref={clockRef} className="flex items-baseline whitespace-nowrap text-[2.35em] font-light leading-none tracking-[-0.03em] tabular-nums">
      <span>00</span>
      <span className={unit}>M</span>
      <span>00</span>
      <span className={unit}>S</span>
      <span>00</span>
      <span className={unit}>F</span>
    </p>
  );
}

/** Writes a tape position into the clock: minutes, seconds and frames at 25 fps. */
export function paintClock(el: HTMLParagraphElement | null, seconds: number) {
  if (!el) return;
  const frames = Math.floor(seconds * 25);
  const parts = [Math.floor(frames / 1500), Math.floor(frames / 25) % 60, frames % 25];
  for (let i = 0; i < 3; i++) {
    const node = el.children[i * 2];
    const text = String(parts[i]).padStart(2, "0");
    if (node && node.textContent !== text) node.textContent = text;
  }
}

/**
 * The readout, after the recorder's: a black LCD with the transport, the
 * take's place on the tape and a running clock; beside it, the file it plays
 * and live level meters. Both sit in one well pressed into
 * the body.
 */
export function Readout({
  study,
  at,
  n,
  transport,
  clockRef,
  activity,
  reduced,
  className,
}: {
  study: Study;
  at: number;
  n: number;
  transport: Transport;
  clockRef: RefObject<HTMLParagraphElement | null>;
  activity: RefObject<number>;
  reduced: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex gap-[0.45em] rounded-[1.05em] bg-(--device-well) p-[0.45em] shadow-(--device-recess)", className)}>
      {/* The LCD mirrors what the status line and announcements already say, so it stays out of the reading order. */}
      <div
        aria-hidden
        className="relative flex h-[7.4em] w-[13.4em] shrink-0 flex-col justify-between overflow-hidden rounded-[0.7em] px-[0.8em] pb-[0.75em] pt-[0.7em] text-(--device-lcd-ink) [background:var(--device-lcd)] shadow-(--device-lcd-edge) wide:h-[8.2em] wide:w-[15em] wide:px-[0.9em] wide:pb-[0.85em] wide:pt-[0.8em]"
      >
        <div className="flex items-center gap-[0.55em]">
          <span className="inline-flex items-center gap-[0.35em] rounded-[0.4em] bg-white px-[0.42em] py-[0.24em] text-black">
            <ChipGlyph transport={transport} />
            <span className="text-[0.6em] font-semibold uppercase leading-none tracking-[0.02em]">{chip[transport]}</span>
          </span>
          <span className="ml-auto text-[0.66em] tabular-nums text-(--device-lcd-ink)">
            {at + 1}/{n}
          </span>
        </div>
        <Clock clockRef={clockRef} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-between px-[0.45em] py-[0.6em] wide:w-[11em] wide:flex-none wide:px-[0.6em]">
        <p key={study.slug} className="animate-enter truncate text-[0.9em] font-medium leading-tight text-ink">
          {study.file}
        </p>
        <Meters activity={activity} playing={transport === "play"} reduced={reduced} />
      </div>
    </div>
  );
}
