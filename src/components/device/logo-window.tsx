"use client";

import { fade, filmSrc, posterSrc, useHoverPlay } from "@/components/gallery/logo";
import { cn } from "@/design-system";

/**
 * The maker's window: smoked glass set deep into the body, with the Litt
 * mark glowing behind it and a red light that comes on while the tape
 * plays. The mark rests on its brush-drawn poster and animates only while
 * a mouse is over the window (useHoverPlay), so nothing on the deck moves
 * that the viewer didn't start. It is a nameplate, the size of a key, so the maker stays quiet
 * beside the controls. The mark is the only lettering the body needs.
 *
 * The artwork is black on white, so it is inverted and screened onto the
 * glass: the ink lights up and the paper disappears.
 */
export function LogoWindow({ live, className }: { live: boolean; className?: string }) {
  const { video, playing, reduced, hover } = useHoverPlay();
  const art = "relative w-[82%] max-w-[300px] [filter:invert(1)_contrast(1.25)] mix-blend-screen";

  return (
    // The recess, pressed into the body like the readout's well.
    <div {...hover} className={cn("flex rounded-[0.85em] bg-(--device-well) p-[0.3em] shadow-(--device-recess)", className)}>
      <div className="relative isolate grid h-[2.7em] w-[4.2em] place-items-center overflow-hidden rounded-[0.6em] [background:var(--device-window)] shadow-(--device-window-edge)">
        {/* A fine grille behind the glass, and the light the mark gives off. */}
        <div aria-hidden className="absolute inset-0 -z-10 [background-image:radial-gradient(rgb(255_255_255/0.07)_0.7px,transparent_0.9px)] [background-size:5px_5px]" />
        <div aria-hidden className="absolute inset-0 -z-10 [background:radial-gradient(55%_40%_at_50%_50%,rgb(255_255_255/0.09),transparent)]" />

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={posterSrc} alt="" width={240} height={170} className={cn(art, fade(!playing))} />
        {!reduced && (
          <video ref={video} src={filmSrc} muted loop playsInline preload="auto" aria-hidden width={240} height={170} className={cn(art, fade(playing))} />
        )}

        {/* Glass: a sheen where the light catches it. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 [background:linear-gradient(112deg,rgb(255_255_255/0.08)_0%,rgb(255_255_255/0.025)_44%,transparent_44.2%)]" />
        {/* On air. */}
        <span
          aria-hidden
          className={cn(
            "absolute right-[0.45em] top-[0.45em] size-[0.34em] rounded-full transition-[background-color,box-shadow] duration-(--duration-enter)",
            live ? "bg-(--device-rec) shadow-[0_0_6px_1px_var(--device-rec)]" : "bg-white/15",
          )}
        />
      </div>
    </div>
  );
}
