"use client";

import { fade, filmSrc, posterSrc, useHoverPlay } from "@/components/gallery/logo";
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

const art = "relative w-[78%] max-w-[300px] [filter:invert(1)_contrast(1.25)] mix-blend-screen";

/**
 * The readout: one strip of LCD in a well pressed into the body. The maker's
 * mark glows at its left end, behind a fine grille, and the rest says the
 * transport's state and the take on the tape, as a CD player shows its
 * track. The screen already names the study and the tape already shows where
 * in it the playhead is, so the LCD says only these two things.
 *
 * Phones give its room to the screen: there the strip is only the mark, and
 * a light beside it comes on while the tape plays, because nothing else on
 * the deck says so. On wider decks the chip says it, and the light stays off.
 *
 * The mark rests on its brush-drawn poster and plays its film only while a
 * mouse or pen is over the strip (useHoverPlay), so nothing on the deck moves
 * that the viewer didn't start. The artwork is black on white, so it is
 * inverted and screened onto the glass: the ink lights up and the paper
 * disappears.
 */
export function Readout({ at, n, transport, className }: { at: number; n: number; transport: Transport; className?: string }) {
  const { video, playing, reduced, hover } = useHoverPlay();
  return (
    <div {...hover} className={cn("flex rounded-[1.05em] bg-(--device-well) p-[0.4em] shadow-(--device-recess)", className)}>
      <div className="relative isolate flex h-[2.7em] overflow-hidden rounded-[0.7em] text-(--device-lcd-ink) [background:var(--device-lcd)] shadow-(--device-lcd-edge) wide:h-[3.6em]">
        {/* The mark, at the glass's left end: a fine grille behind it, and the light it gives off. */}
        <div className="relative grid w-[4.2em] shrink-0 place-items-center wide:w-[5.2em]">
          <div aria-hidden className="absolute inset-0 -z-10 [background-image:radial-gradient(rgb(255_255_255/0.07)_0.7px,transparent_0.9px)] [background-size:5px_5px]" />
          <div aria-hidden className="absolute inset-0 -z-10 [background:radial-gradient(55%_40%_at_50%_50%,rgb(255_255_255/0.08),transparent)]" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={posterSrc} alt="" width={240} height={170} className={cn(art, fade(!playing))} />
          {!reduced && (
            <video ref={video} src={filmSrc} muted loop playsInline preload="auto" aria-hidden width={240} height={170} className={cn(art, fade(playing))} />
          )}
          {/* On air, on phones only: wider decks have the chip. */}
          <span
            aria-hidden
            className={cn(
              "absolute right-[0.45em] top-[0.45em] size-[0.34em] rounded-full transition-[background-color,box-shadow] duration-(--duration-enter) wide:hidden",
              transport === "play" ? "bg-(--device-rec) shadow-[0_0_6px_1px_var(--device-rec)]" : "bg-white/15",
            )}
          />
        </div>

        {/* The LCD mirrors what the status line and announcements already say, so it stays out of the reading order. */}
        <div aria-hidden className="hidden w-[16em] items-center justify-between border-l border-white/[0.08] px-[0.9em] wide:flex roomy:w-[18em]">
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
    </div>
  );
}
