import type { ReactNode } from "react";
import { cn } from "@/design-system";
import { site } from "@/site.config";

/*
 * The player's hardware, rendered from its tokens and put together the way
 * the deck and the studies put it together: a plate of the body's finish,
 * wells pressed into it, keys, caps, an LCD and lights seated in the wells,
 * and lettering printed on the body. Everything is sized in em from the
 * plate's one font size, so it scales as one object.
 *
 * Keys and caps are real buttons: they sink 2px under the hand and click
 * (data-sound="key"), so this stays a server component.
 */

/** Captions printed on the body: tiny tracked capitals, quiet. */
const engraved = "font-semibold uppercase leading-none tracking-[0.16em] [text-shadow:var(--device-engrave)]";
/** Lettering on keys and under caps. */
const lettering = "text-[0.8em] font-medium uppercase leading-none tracking-[0.03em] [text-shadow:var(--device-engrave)]";
/** 2px of travel: down in 75ms, back at exit speed. */
const sink =
  "transition-[transform,box-shadow] duration-(--duration-exit) ease-out group-active/key:translate-y-[2px] group-active/key:shadow-(--device-key-shadow-pressed) group-active/key:duration-75 group-data-pressed/key:translate-y-[2px] group-data-pressed/key:shadow-(--device-key-shadow-pressed)";

function Part({ caption, children, className }: { caption: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-[0.75em]", className)}>
      {children}
      <span className={cn(engraved, "text-[0.6em] text-(--device-label-quiet)")}>{caption}</span>
    </div>
  );
}

function Key({ pressed, children }: { pressed?: boolean; children: ReactNode }) {
  return (
    <button type="button" data-sound="key" data-pressed={pressed || undefined} className="group/key rounded-[0.7em] outline-offset-2">
      <span className={cn("grid h-[2.5em] min-w-[2.5em] place-items-center rounded-[0.7em] px-[0.95em] text-(--device-key-ink) [background:var(--device-key-face)] shadow-(--device-key-shadow)", sink)}>
        <span className={lettering}>{children}</span>
      </span>
    </button>
  );
}

function Cap({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <button type="button" data-sound="key" className="group/key flex flex-col items-center gap-[0.7em] rounded-full outline-offset-4">
      {/* The collar, cut from the well; the cap seated in it. */}
      <span className="grid size-[5.4em] place-items-center rounded-full bg-black/[0.035] p-[0.32em] shadow-(--device-recess) dark:bg-black/30">
        <span className={cn("grid size-full place-items-center rounded-full [background:var(--device-wheel-face)] shadow-(--device-key-shadow)", sink)}>{children}</span>
      </span>
      <span className={cn(lettering, "text-(--device-label)")}>{caption}</span>
    </button>
  );
}

function Light({ className }: { className: string }) {
  return (
    <span aria-hidden className="grid size-[1.1em] place-items-center rounded-full bg-black/[0.05] shadow-(--device-recess) dark:bg-black/40">
      <span className={cn("size-[0.6em] rounded-full", className)} />
    </span>
  );
}

function Meter({ channel, level, peak }: { channel: string; level: number; peak: number }) {
  return (
    <div className="flex items-center gap-[0.5em]">
      <span className="w-[0.8em] text-[0.66em] font-medium text-(--device-label)">{channel}</span>
      <span className="relative h-[0.72em] flex-1 text-(--device-meter-on)">
        <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-(--device-meter-off)" />
        <span className="meter-ticks absolute inset-0" style={{ clipPath: `inset(0 ${100 - level}% 0 0)` }} />
        <span className="absolute -inset-y-[12%] w-[2px] rounded-[1px] bg-current" style={{ left: `calc(${peak}% - 1px)` }} />
      </span>
    </div>
  );
}

const unit = "mr-[0.45em] ml-[0.1em] text-[0.3em] font-normal text-(--device-lcd-dim) last:mr-0";

export function MaterialsPlate() {
  return (
    <div className="relative isolate overflow-hidden rounded-[1.25em] p-[1.1em] text-[13px] [background:var(--device-body)] shadow-[var(--device-body-edge),0_1px_2px_rgb(0_0_0/0.06),0_16px_32px_-18px_rgb(0_0_0/0.3)] sm:p-[1.6em] sm:text-[14px]">
      <div aria-hidden className="device-grain pointer-events-none absolute inset-0 -z-10 rounded-[inherit]" />

      <div className="flex flex-col gap-[1.6em]">
        <div className="flex flex-wrap items-start gap-[1.6em]">
          {/* The readout: an LCD and two meters sharing one well. */}
          <Part caption="Well · LCD · meters" className="flex-1 basis-[22em]">
            <div className="flex gap-[0.45em] rounded-[1.05em] bg-(--device-well) p-[0.45em] shadow-(--device-recess)">
              <div className="relative flex h-[7.4em] w-[13.4em] shrink-0 flex-col justify-between overflow-hidden rounded-[0.7em] px-[0.8em] pb-[0.75em] pt-[0.7em] text-(--device-lcd-ink) [background:var(--device-lcd)] shadow-(--device-lcd-edge)">
                <div className="flex items-center gap-[0.55em]">
                  {/* The white chip: the state, with its glyph. */}
                  <span className="inline-flex items-center gap-[0.35em] rounded-[0.4em] bg-white px-[0.42em] py-[0.24em] text-black">
                    <span className="size-[0.62em] animate-pulse rounded-full bg-(--device-rec)" />
                    <span className="text-[0.6em] font-semibold uppercase leading-none tracking-[0.02em]">Play</span>
                  </span>
                  <span className="ml-auto text-[0.66em] tabular-nums">4/20</span>
                </div>
                <p className="flex items-baseline whitespace-nowrap text-[2.35em] font-light leading-none tracking-[-0.03em] tabular-nums">
                  <span>00</span>
                  <span className={unit}>M</span>
                  <span>14</span>
                  <span className={unit}>S</span>
                  <span>06</span>
                  <span className={unit}>F</span>
                </p>
              </div>
              <div className="flex min-w-0 flex-1 flex-col justify-between px-[0.45em] py-[0.6em]">
                <p className="truncate text-[0.9em] font-medium leading-tight text-ink">take_04.wav</p>
                <div aria-hidden className="flex flex-col gap-[0.55em]">
                  <Meter channel="L" level={62} peak={78} />
                  <Meter channel="R" level={55} peak={71} />
                </div>
              </div>
            </div>
          </Part>

          {/* The maker's window: smoked glass set deeper than the LCD. */}
          <Part caption="Window">
            <div className="flex rounded-[0.85em] bg-(--device-well) p-[0.45em] shadow-(--device-recess)">
              <div className="relative isolate grid h-[7.4em] w-[10em] place-items-center overflow-hidden rounded-[0.6em] [background:var(--device-window)] shadow-(--device-window-edge)">
                <div aria-hidden className="absolute inset-0 -z-10 [background-image:radial-gradient(rgb(255_255_255/0.07)_0.7px,transparent_0.9px)] [background-size:5px_5px]" />
                <div aria-hidden className="absolute inset-0 -z-10 [background:radial-gradient(55%_40%_at_50%_50%,rgb(255_255_255/0.09),transparent)]" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`${site.basePath}/logo-poster.png`} alt="" width={240} height={170} className="relative w-[74%] [filter:invert(1)_contrast(1.25)] mix-blend-screen" />
                <div aria-hidden className="pointer-events-none absolute inset-0 [background:linear-gradient(112deg,rgb(255_255_255/0.08)_0%,rgb(255_255_255/0.025)_44%,transparent_44.2%)]" />
                <span aria-hidden className="absolute right-[0.6em] top-[0.6em] size-[0.4em] rounded-full bg-(--device-rec) shadow-[0_0_6px_1px_var(--device-rec)]" />
              </div>
            </div>
          </Part>
        </div>

        {/* Parts in a row, their captions printed on one line along the bottom. */}
        <div className="flex flex-wrap items-end justify-between gap-x-[2em] gap-y-[1.6em]">
          <Part caption="Keys · rest, pressed">
            <div className="flex w-fit items-center gap-[0.3em] rounded-[1.05em] bg-(--device-well) p-[0.4em] shadow-(--device-recess)">
              <Key>Rest</Key>
              <Key pressed>Pressed</Key>
            </div>
          </Part>
          <Part caption="Lights">
            <ul className="grid grid-cols-2 gap-x-[1.3em] gap-y-[0.75em]">
              {[
                { name: "Off", light: "bg-(--device-meter-off)" },
                { name: "On", light: "bg-(--device-meter-on)" },
                { name: "Rec", light: "bg-(--device-rec) shadow-[0_0_0.45em_var(--device-rec)]" },
                { name: "Hold", light: "bg-(--device-hold) shadow-[0_0_0.5em_var(--device-hold)]" },
              ].map((l) => (
                <li key={l.name} className="flex items-center gap-[0.5em]">
                  <Light className={l.light} />
                  <span className={cn(engraved, "text-[0.6em] text-(--device-label)")}>{l.name}</span>
                </li>
              ))}
            </ul>
          </Part>
          <Part caption="Lettering · label, quiet">
            <p className="flex flex-col gap-[0.6em]">
              <span className={cn(engraved, "text-[0.72em] text-(--device-label)")}>Hold to erase</span>
              <span className={cn(engraved, "text-[0.72em] text-(--device-label-quiet)")}>1 kHz · reads 0 VU</span>
            </p>
          </Part>
          <Part caption="Caps in collars">
            <div className="flex gap-[1.3em]">
              <Cap caption="Stop">
                <span aria-hidden className="size-[1.15em] rounded-[0.14em] bg-(--device-key-ink)" />
              </Cap>
              <Cap caption="Play">
                <svg aria-hidden viewBox="0 0 16 16" className="ml-[0.12em] size-[1.5em] fill-(--device-rec)">
                  <path d="M4.5 2.4 13.2 8l-8.7 5.6z" />
                </svg>
              </Cap>
            </div>
          </Part>
        </div>
      </div>
    </div>
  );
}
