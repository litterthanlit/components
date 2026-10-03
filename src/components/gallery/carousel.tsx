"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { createSpring, springs, type Spring } from "@/design-system";
import { ClickWheel } from "./click-wheel";
import { CloserLook } from "./closer-look";
import { Preview } from "./preview";

type Entry = { slug: string; title: string };

const AUTOPLAY = 5000;
// Neighbours shrink and fade to these. --slide-step below assumes the scale:
// (1 + 0.84) / 2 = 0.92 puts the gap between their facing edges.
const NEIGHBOUR_SCALE = 0.84;
const NEIGHBOUR_OPACITY = 0.35;
// A touch has to travel this far sideways before it becomes a swipe.
const SWIPE_SLOP = 8;

/** Clicks on these belong to the demo, so they never open the closer look. */
const INTERACTIVE =
  "a, button, input, select, textarea, label, summary, [contenteditable], [tabindex], [role=button], [role=link], [role=radio], [role=checkbox], [role=switch], [role=slider], [role=tab], [role=menuitem], [role=option]";

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Signed distance from `pos` to slide `i` around a ring of `n`, in [-n/2, n/2). */
function ringOffset(i: number, pos: number, n: number) {
  return mod(i - pos + n / 2, n) - n / 2;
}

/** Where a slide sits, how big and how bright, at a (fractional) offset from the centre. */
function slideStyle(offset: number) {
  const d = Math.min(Math.abs(offset), 2);
  const scale = 1 - (1 - NEIGHBOUR_SCALE) * Math.min(d, 1);
  const opacity = d <= 1 ? 1 - (1 - NEIGHBOUR_OPACITY) * d : NEIGHBOUR_OPACITY * (2 - d);
  const x = Math.max(-2, Math.min(2, offset)).toFixed(4);
  return {
    transform: `translateX(calc(${x} * var(--slide-step))) scale(${scale.toFixed(4)})`,
    opacity: opacity.toFixed(3),
    visibility: d >= 2 ? "hidden" : "visible",
  } as const;
}

function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}

function subscribeVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

/**
 * The home page slideshow. One large live demo in the centre with its
 * neighbours peeking either side; a click wheel steps, pauses and opens a
 * closer look. Positions run on one spring (the design system's
 * createSpring), written straight to each slide's style, so moving never
 * re-renders React and a swipe can pick the motion up mid-flight.
 *
 * Only the centre slide and its neighbours mount their demo (WebGL is heavy).
 */
export function GalleryCarousel({ entries }: { entries: Entry[] }) {
  const n = entries.length;
  const [active, setActive] = useState(0);
  // Where the last move came to rest: slides near it stay mounted until the
  // spring arrives, so the one leaving fades out instead of blinking.
  const [settled, setSettled] = useState(0);
  const target = useRef(0); // unbounded: wrapping past the end keeps counting
  const spring = useRef<Spring | null>(null);
  const slides = useRef<(HTMLDivElement | null)[]>([]);
  const labels = useRef<(HTMLButtonElement | null)[]>([]);
  const spacer = useRef<HTMLSpanElement>(null);

  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const pageVisible = useSyncExternalStore(subscribeVisibility, () => !document.hidden, () => true);
  // The ⏯ button's say; until it's pressed, autoplay is on unless motion is reduced.
  const [choice, setChoice] = useState<boolean | null>(null);
  const playing = choice ?? !reduced;
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false); // keyboard focus inside
  const [nudge, setNudge] = useState(0); // any touch restarts the countdown
  const [look, setLook] = useState<Entry | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const refocus = useRef(false);
  const autoplaying = playing && !hovered && !focused && !look && pageVisible;

  useLayoutEffect(() => {
    const s = createSpring(target.current, springs.gentle, (pos) => {
      slides.current.forEach((el, i) => {
        if (el) Object.assign(el.style, slideStyle(ringOffset(i, pos, n)));
      });
      if (pos === target.current) setSettled(mod(Math.round(pos), n));
    });
    spring.current = s;
    return () => s.stop();
  }, [n]);

  /** Head for an (unbounded) position. */
  const move = useCallback(
    (next: number) => {
      target.current = next;
      setActive(mod(Math.round(next), n));
      if (reduced) spring.current?.jump(next);
      else spring.current?.set(next);
    },
    [n, reduced],
  );
  const step = useCallback((delta: number) => move(Math.round(target.current) + delta), [move]);
  const goTo = (i: number) => {
    const from = Math.round(target.current);
    move(from + ringOffset(i, from, n));
  };

  useEffect(() => {
    if (!autoplaying) return;
    const id = setTimeout(() => step(1), AUTOPLAY);
    return () => clearTimeout(id);
  }, [autoplaying, active, nudge, step]);

  // Arrow keys from the centre slide's label make that slide inert; keep focus
  // on the label that replaces it rather than dropping it on <body>.
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    labels.current[active]?.focus({ preventScroll: true });
  }, [active]);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const target = event.target as Element;
    // Demos and the dialog keep their own arrow keys.
    if (target.closest("[data-preview], dialog")) return;
    if (event.key === "ArrowLeft") step(-1);
    else if (event.key === "ArrowRight") step(1);
    else return;
    event.preventDefault();
    refocus.current = target.closest("[data-slide]") !== null;
  }

  // Keyboard focus arriving pauses autoplay until it leaves (or ⏯ is pressed);
  // a mouse click that focuses a button doesn't, hover covers that.
  function handleFocus(event: FocusEvent<HTMLElement>) {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    if ((event.target as Element).matches(":focus-visible")) setFocused(true);
  }
  function handleBlur(event: FocusEvent<HTMLElement>) {
    if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
  }

  /* Swipes. Only touch and pen: a mouse drag would fight the demos. */
  const drag = useRef<{ id: number; x: number; y: number; from: number; engaged: boolean; lastX: number; lastT: number; v: number } | null>(null);
  const swiped = useRef(false);

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    setNudge((k) => k + 1);
    swiped.current = false;
    if (event.pointerType === "mouse" || !event.isPrimary) return;
    const now = event.timeStamp;
    const from = spring.current?.value ?? target.current;
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, from, engaged: false, lastX: event.clientX, lastT: now, v: 0 };
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    const dx = event.clientX - d.x;
    if (!d.engaged) {
      const dy = event.clientY - d.y;
      if (Math.abs(dy) > SWIPE_SLOP && Math.abs(dy) > Math.abs(dx)) drag.current = null; // a scroll
      if (Math.abs(dx) < SWIPE_SLOP || Math.abs(dx) < Math.abs(dy)) return;
      d.engaged = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const dt = event.timeStamp - d.lastT;
    if (dt > 0) d.v = (event.clientX - d.lastX) / dt;
    d.lastX = event.clientX;
    d.lastT = event.timeStamp;
    const pos = d.from - dx / (spacer.current?.offsetWidth || 1);
    target.current = pos;
    spring.current?.jump(pos);
    setActive(mod(Math.round(pos), n));
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    drag.current = null;
    if (!d.engaged) return;
    swiped.current = true;
    // A flick carries on a little past where the finger let go; one slide per swipe.
    const projected = target.current - (d.v * 160) / (spacer.current?.offsetWidth || 1);
    const home = Math.round(d.from);
    move(Math.max(home - 1, Math.min(home + 1, Math.round(projected))));
  }

  // The click that ends a swipe shouldn't also press whatever is under it.
  function handleClickCapture(event: MouseEvent<HTMLDivElement>) {
    if (!swiped.current) return;
    swiped.current = false;
    event.preventDefault();
    event.stopPropagation();
  }

  function openLook(from: HTMLElement | null | undefined) {
    trigger.current = from ?? null;
    setLook(entries[active]);
  }

  function handleCardClick(event: MouseEvent<HTMLDivElement>) {
    const hit = (event.target as Element).closest(INTERACTIVE);
    if (hit && event.currentTarget.contains(hit)) return;
    openLook(labels.current[active]);
  }

  const origin = useCallback(() => slides.current[active]?.querySelector("[data-preview]"), [active]);
  const handleClose = useCallback(() => {
    setLook(null);
    trigger.current?.focus({ preventScroll: true });
  }, []);

  const current = entries[active];

  return (
    <section
      aria-roledescription="carousel"
      aria-labelledby="components-heading"
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onPointerEnter={(event) => event.pointerType === "mouse" && setHovered(true)}
      onPointerLeave={(event) => event.pointerType === "mouse" && setHovered(false)}
      className="overflow-x-clip"
    >
      <h2 id="components-heading" className="sr-only">
        Components
      </h2>

      <div
        id="components-slides"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClickCapture={handleClickCapture}
        className="relative grid animate-enter touch-pan-y [--slide:calc(100vw-6rem)] [--slide-step:calc(var(--slide)*0.92+0.75rem)] sm:[--slide:min(680px,calc(100vw-4rem))] sm:[--slide-step:calc(var(--slide)*0.92+3rem)]"
      >
        {/* Measures --slide-step in px for swipes. */}
        <span ref={spacer} aria-hidden className="invisible absolute w-(--slide-step)" />
        {entries.map((entry, i) => {
          const isActive = i === active;
          const near = Math.abs(ringOffset(i, active, n)) <= 1 || Math.abs(ringOffset(i, settled, n)) <= 1;
          return (
            <div
              key={entry.slug}
              ref={(el) => {
                slides.current[i] = el;
              }}
              data-slide={entry.slug}
              data-active={isActive || undefined}
              // Painted from the first slide until the spring takes over, so the
              // server HTML is already laid out. Constant across renders, so
              // React never overwrites what the spring writes.
              style={slideStyle(ringOffset(i, 0, n))}
              className="relative w-(--slide) justify-self-center will-change-transform [grid-area:1/1]"
            >
              <div
                role="group"
                aria-roledescription="slide"
                aria-label={`${i + 1} of ${n}: ${entry.title}`}
                inert={!isActive}
                className="group/slide flex flex-col items-center"
              >
                {/* The card: a click on anything but the demo's own controls takes a closer look. */}
                <div data-zoom onClick={isActive ? handleCardClick : undefined} className="w-full">
                  {near ? (
                    <Preview slug={entry.slug} align="bottom" className="h-72 sm:h-[23rem]" />
                  ) : (
                    <div className="h-72 sm:h-[23rem]" />
                  )}
                </div>
                <button
                  ref={(el) => {
                    labels.current[i] = el;
                  }}
                  type="button"
                  aria-haspopup="dialog"
                  onClick={(event) => openLook(event.currentTarget)}
                  className="mt-3 rounded-md px-1 text-body text-muted transition-colors duration-(--duration-exit) hover:text-ink group-hover/slide:text-ink group-hover/slide:duration-(--duration-enter)"
                >
                  {entry.title}
                </button>
              </div>
              {/* A peeking neighbour is inert, so this catches its click and brings it to the centre. */}
              {!isActive && <div aria-hidden onClick={() => goTo(i)} className="absolute inset-0 cursor-pointer" />}
            </div>
          );
        })}
      </div>

      <div className="mt-8 flex justify-center">
        <ClickWheel
          index={active}
          count={n}
          playing={playing}
          title={current.title}
          controls="components-slides"
          onPrev={() => step(-1)}
          onNext={() => step(1)}
          onToggle={() => {
            setChoice(!playing);
            // Pressing play is an explicit ask, even with keyboard focus inside.
            if (!playing) setFocused(false);
          }}
          onLook={(event) => openLook(event.currentTarget)}
        />
      </div>

      {/* Quiet during autoplay; announces manual moves. */}
      <p aria-live={autoplaying ? "off" : "polite"} aria-atomic className="sr-only">
        {`${active + 1} of ${n}: ${current.title}`}
      </p>

      {/* Every page stays one link away for crawlers and screen readers, with or without JS. */}
      <nav aria-label="All components" className="sr-only">
        <ul>
          {entries.map((entry) => (
            <li key={entry.slug}>
              <Link href={`/c/${entry.slug}`} prefetch={false} tabIndex={-1}>
                {entry.title}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <CloserLook entry={look} origin={origin} onClose={handleClose} />
    </section>
  );
}
