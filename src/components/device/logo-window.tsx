"use client";

import { cn } from "@/design-system";
import { site } from "@/site.config";
import { useReducedMotion } from "./hooks";
import { engraved } from "./keys";

/**
 * The maker's window: smoked glass set deep into the body, with the animated
 * Litt mark glowing behind it and a red light that comes on while the tape
 * plays. On roomy decks it stands tall beside the readout, balancing the
 * transport keys on the other side; elsewhere it shrinks to a nameplate.
 *
 * The artwork is black on white, so it is inverted and screened onto the
 * glass: the ink lights up and the paper disappears.
 */
export function LogoWindow({ live, className }: { live: boolean; className?: string }) {
  const reduced = useReducedMotion();
  const art = "relative w-[82%] max-w-[300px] [filter:invert(1)_contrast(1.25)] mix-blend-screen roomy:w-[74%]";

  return (
    <div className={cn("flex items-center gap-[0.75em] roomy:flex-col roomy:items-stretch roomy:gap-[0.8em]", className)}>
      {/* The recess, pressed into the body like the readout's well. */}
      <div className="rounded-[0.85em] bg-(--device-well) p-[0.3em] shadow-(--device-recess) roomy:flex-1 roomy:rounded-[1.05em] roomy:p-[0.45em]">
        <div className="relative isolate grid h-[2.7em] w-[4.2em] place-items-center overflow-hidden rounded-[0.6em] [background:var(--device-window)] shadow-(--device-window-edge) roomy:size-full roomy:rounded-[0.75em]">
          {/* A fine grille behind the glass, and the light the mark gives off. */}
          <div aria-hidden className="absolute inset-0 -z-10 [background-image:radial-gradient(rgb(255_255_255/0.07)_0.7px,transparent_0.9px)] [background-size:5px_5px]" />
          <div aria-hidden className="absolute inset-0 -z-10 [background:radial-gradient(55%_40%_at_50%_50%,rgb(255_255_255/0.09),transparent)]" />

          {reduced ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`${site.basePath}/logo-poster.png`} alt="" width={240} height={170} className={art} />
          ) : (
            <video
              src={`${site.basePath}/logo.mp4`}
              poster={`${site.basePath}/logo-poster.png`}
              autoPlay
              muted
              loop
              playsInline
              aria-hidden
              width={240}
              height={170}
              className={art}
            />
          )}

          {/* Glass: a sheen where the light catches it. */}
          <div aria-hidden className="pointer-events-none absolute inset-0 [background:linear-gradient(112deg,rgb(255_255_255/0.08)_0%,rgb(255_255_255/0.025)_44%,transparent_44.2%)]" />
          {/* On air. */}
          <span
            aria-hidden
            className={cn(
              "absolute right-[0.45em] top-[0.45em] size-[0.34em] rounded-full transition-[background-color,box-shadow] duration-(--duration-enter) roomy:right-[0.8em] roomy:top-[0.8em] roomy:size-[0.42em]",
              live ? "bg-(--device-rec) shadow-[0_0_6px_1px_var(--device-rec)]" : "bg-white/15",
            )}
          />
        </div>
      </div>
      <span aria-hidden className={cn(engraved, "roomy:text-center")}>
        Studies
      </span>
    </div>
  );
}
