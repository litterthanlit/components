"use client";

import { cn } from "@/design-system";

export type Transport = "play" | "pause" | "stop";

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

/**
 * The readout: one strip of LCD in a well pressed into the body, with the
 * transport's state and the take on the tape, as a CD player shows its
 * track. The screen already names the study and the tape already shows where
 * in it the playhead is, so the LCD says only these two things. Callers set
 * its display, so they can hide it.
 */
export function Readout({ at, n, transport, className }: { at: number; n: number; transport: Transport; className?: string }) {
  return (
    <div className={cn("rounded-[1.05em] bg-(--device-well) p-[0.45em] shadow-(--device-recess)", className)}>
      {/* The LCD mirrors what the status line and announcements already say, so it stays out of the reading order. */}
      <div
        aria-hidden
        className="relative flex h-[3.6em] w-[17em] items-center justify-between overflow-hidden rounded-[0.7em] px-[0.9em] text-(--device-lcd-ink) [background:var(--device-lcd)] shadow-(--device-lcd-edge) roomy:w-[19em]"
      >
        <span className="inline-flex items-center gap-[0.35em] rounded-[0.4em] bg-white px-[0.42em] py-[0.24em] text-black">
          <ChipGlyph transport={transport} />
          <span className="text-[0.6em] font-semibold uppercase leading-none tracking-[0.02em]">{chip[transport]}</span>
        </span>
        <p className="flex items-baseline gap-[0.35em] leading-none tabular-nums">
          <span key={at} className="animate-enter text-[1.9em] font-light tracking-[-0.03em]">
            {String(at + 1).padStart(2, "0")}
          </span>
          <span className="text-[0.66em] text-(--device-lcd-dim)">/ {n}</span>
        </p>
      </div>
    </div>
  );
}
