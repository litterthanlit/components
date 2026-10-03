"use client";

import type { MouseEvent } from "react";
import { cn } from "@/design-system";

type ClickWheelProps = {
  index: number;
  count: number;
  playing: boolean;
  /** Title of the current slide, for the centre button's name. */
  title: string;
  /** id of the slides this wheel steps through. */
  controls: string;
  onPrev: () => void;
  onNext: () => void;
  onToggle: () => void;
  onLook: (event: MouseEvent<HTMLButtonElement>) => void;
};

/*
 * Ring positions sit in the band between the rim and the centre well. The
 * ring is one key (see --key-* in tokens.css): pressing a side sinks it onto
 * its base and rocks it toward that side, as an iPod's wheel does.
 */
const segment =
  "absolute grid size-9 place-items-center rounded-full text-(--key-ink) [filter:var(--key-engrave-glyph)] transition-colors duration-(--duration-exit) hover:text-ink hover:duration-(--duration-enter)";

const rock =
  "has-[[data-ring]:active]:shadow-(--key-shadow-pressed) has-[[data-ring]:active]:duration-75 has-[[data-ring=prev]:active]:[transform:translateY(2px)_rotateY(-7deg)] has-[[data-ring=next]:active]:[transform:translateY(2px)_rotateY(7deg)] has-[[data-ring=toggle]:active]:[transform:translateY(2px)_rotateX(-7deg)]";

/** Slideshow controls after the iPod classic's click wheel. */
export function ClickWheel({ index, count, playing, title, controls, onPrev, onNext, onToggle, onLook }: ClickWheelProps) {
  return (
    <div className="[perspective:420px]">
      <div
        className={cn(
          "relative size-[136px] select-none rounded-full [background:var(--key-face)] shadow-(--key-shadow) transition-[transform,box-shadow] duration-(--duration-exit) ease-out",
          rock,
        )}
      >
        {/* Where the iPod says MENU: a quiet position, not a control. */}
        <span
          aria-hidden
          className="absolute inset-x-0 top-[13px] text-center text-meta font-medium tabular-nums text-(--key-ink) [text-shadow:var(--key-engrave)]"
        >
          {index + 1} / {count}
        </span>
        <button
          type="button"
          data-ring="prev"
          data-wheel="prev"
          aria-label="Previous component"
          aria-controls={controls}
          onClick={onPrev}
          className={cn(segment, "left-[3px] top-[50px]")}
        >
          <svg aria-hidden viewBox="0 0 16 16" className="size-3 fill-current">
            <path d="M2 3.5h1.6v9H2zM8.6 3.5 3.8 8l4.8 4.5zM14 3.5 9.2 8l4.8 4.5z" />
          </svg>
        </button>
        <button
          type="button"
          data-ring="next"
          data-wheel="next"
          aria-label="Next component"
          aria-controls={controls}
          onClick={onNext}
          className={cn(segment, "right-[3px] top-[50px]")}
        >
          <svg aria-hidden viewBox="0 0 16 16" className="size-3 fill-current">
            <path d="M12.4 3.5H14v9h-1.6zM7.4 3.5 12.2 8l-4.8 4.5zM2 3.5 6.8 8 2 12.5z" />
          </svg>
        </button>
        <button
          type="button"
          data-ring="toggle"
          data-wheel="toggle"
          data-playing={playing}
          aria-label={playing ? "Pause slideshow" : "Play slideshow"}
          onClick={onToggle}
          className={cn(segment, "bottom-[3px] left-[50px]")}
        >
          <svg aria-hidden viewBox="0 0 16 16" className="size-3 fill-current">
            {playing ? <path d="M4 3h2.6v10H4zM9.4 3H12v10H9.4z" /> : <path d="M4.5 2.75 13 8l-8.5 5.25z" />}
          </svg>
        </button>
        {/* The centre button sits in a well, a key of its own. */}
        <div className="absolute inset-0 m-auto size-[58px] rounded-full shadow-(--key-shadow-pressed)">
          <button
            type="button"
            data-wheel="look"
            aria-label={`Take a closer look at ${title}`}
            aria-haspopup="dialog"
            onClick={onLook}
            className="absolute inset-[5px] grid place-items-center rounded-full text-(--key-ink) [background:var(--key-face)] shadow-(--key-shadow) transition-[transform,box-shadow,color] duration-(--duration-exit) ease-out hover:text-ink hover:duration-(--duration-enter) active:translate-y-[2px] active:shadow-(--key-shadow-pressed) active:duration-75"
          >
            <svg aria-hidden viewBox="0 0 16 16" fill="none" className="size-3 [filter:var(--key-engrave-glyph)]">
              <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
