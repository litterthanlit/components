"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createSpring } from "@/design-system";
import { hostTransport, play } from "@/lib/sound";

/*
 * A number on a tape counter's drums: white figures on black drums, set in a
 * window pressed into the body. Separators and symbols come from
 * Intl.NumberFormat, so any locale or currency works; they're printed on the
 * frame between the drums, as on the real thing.
 *
 * Each drum turns on its own spring and clicks once for every figure that
 * passes the window. Counting up, drums roll forward through 9 to 0, as a
 * mechanical counter carries; counting down they roll back. Drums mount at 0
 * and roll to their figure on the first frame. Screen readers get the
 * formatted value; the drums are hidden. Under reduced motion they snap.
 */

/** Two turns of figures, so a drum can roll forward through 9 to 0 and back. */
const FIGURES = Array.from({ length: 20 }, (_, i) => String(i % 10));
const STAGGER = 45; // ms between one drum starting and the next, from the right

function Drum({ figure, direction, order }: { figure: number; direction: 1 | -1; order: number }) {
  const stripRef = useRef<HTMLSpanElement>(null);
  const spring = useRef<ReturnType<typeof createSpring> | null>(null);
  const at = useRef(0); // the figure in the window, as a position on the strip
  const target = useRef(0);

  useLayoutEffect(() => {
    const strip = stripRef.current!;
    let shown = 0;
    const s = createSpring(0, { stiffness: 150, damping: 21 }, (pos) => {
      at.current = pos;
      strip.style.transform = `translateY(${(-pos * 5).toFixed(3)}%)`;
      // A click for each figure that passes the window. Only while the host's tape plays (see hostTransport).
      const passing = Math.round(pos);
      if (passing !== shown) {
        shown = passing;
        if (hostTransport(strip) === "play") play("tick", { gain: 0.35, pitch: 1.05 - order * 0.04 });
      }
      // Arrived on the second turn: fold back onto the first, so the next roll has room either way.
      if (pos === target.current && pos >= 10) {
        target.current = pos - 10;
        shown = pos - 10;
        s.jump(pos - 10);
      }
    });
    spring.current = s;
    return () => s.stop();
  }, [order]);

  useEffect(() => {
    const s = spring.current!;
    const from = Math.round(at.current) % 10;
    if (from === figure) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      target.current = figure;
      return s.jump(figure);
    }
    // Forward through 9 to 0 when counting up, back through 0 to 9 when counting down.
    const start = direction < 0 && figure > from ? from + 10 : from;
    const to = direction > 0 && figure < from ? figure + 10 : figure;
    if (start !== from) s.jump(start);
    const id = setTimeout(() => {
      target.current = to;
      s.set(to);
    }, order * STAGGER);
    return () => clearTimeout(id);
  }, [figure, direction, order]);

  return (
    <span data-part="drum" className="relative h-[1.32em] w-[0.74em] overflow-hidden [background:linear-gradient(#0d0d0e,#1d1d1f_30%,#232325_50%,#1d1d1f_70%,#0d0d0e)]">
      <span ref={stripRef} className="absolute inset-x-0 top-0 flex flex-col will-change-transform">
        {FIGURES.map((d, i) => (
          <span key={i} className="grid h-[1.32em] place-items-center leading-none text-[#f2f2f2]">
            {d}
          </span>
        ))}
      </span>
      {/* The drum's curve: figures dim as they turn away, and a fine line of light across the middle. Drawn, the curve is two hairlines the figures roll between. */}
      <span aria-hidden className="pointer-events-none absolute inset-0 [background:linear-gradient(rgb(0_0_0/0.75),transparent_32%,transparent_68%,rgb(0_0_0/0.75))] drawn:inset-y-[0.2em]! drawn:border-y!" />
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-[46%] h-px bg-white/[0.06]" />
    </span>
  );
}

type NumberTickerProps = {
  value: number;
  /** Intl options, e.g. { style: "currency", currency: "USD" } */
  format?: Intl.NumberFormatOptions;
  locale?: string;
  className?: string;
};

export function NumberTicker({ value, format, locale = "en-US", className = "" }: NumberTickerProps) {
  // Which way the count went, kept with the value it was measured against.
  const [last, setLast] = useState({ value, direction: 1 as 1 | -1 });
  if (value !== last.value) setLast({ value, direction: value > last.value ? 1 : -1 });

  // Drums mount at 0 and roll to their figures once they're on screen.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const formatted = new Intl.NumberFormat(locale, format).format(value);
  const chars = formatted.split("");
  const drums = chars.filter((c) => /\d/.test(c)).length;
  let seen = 0;

  return (
    <span className={`inline-flex items-center tabular-nums ${className}`}>
      <span className="sr-only">{formatted}</span>
      {/* The window: a black bezel set into the body, the drums behind hairline dividers. */}
      <span
        aria-hidden
        data-part="bezel"
        className="inline-flex items-center gap-px overflow-hidden rounded-[0.16em] bg-(--device-rim) p-[0.06em] shadow-[0_1px_0_rgb(255_255_255/0.6),inset_0_1px_2px_rgb(0_0_0/0.6)] dark:shadow-[0_1px_0_rgb(255_255_255/0.06),inset_0_1px_2px_rgb(0_0_0/0.6)]"
      >
        {chars.map((char, i) => {
          if (!/\d/.test(char)) {
            // Printed on the frame between drums.
            return (
              <span key={`s-${i}`} className="grid h-[1.32em] place-items-center px-[0.06em] text-[0.5em] font-medium leading-none text-white/55">
                {char}
              </span>
            );
          }
          // Keyed from the right so drums stay put when the length changes.
          const fromRight = drums - seen++;
          return <Drum key={`d-${fromRight}`} figure={ready ? Number(char) : 0} direction={last.direction} order={fromRight - 1} />;
        })}
      </span>
    </span>
  );
}

export default function Demo() {
  const [value, setValue] = useState(12480);
  const [delta, setDelta] = useState(1240);

  useEffect(() => {
    const id = setInterval(() => {
      const change = Math.round((Math.random() - 0.35) * 2400);
      setDelta(change);
      setValue((v) => Math.max(1000, v + change));
    }, 2600);
    return () => clearInterval(id);
  }, []);

  const up = delta >= 0;

  return (
    <div className="@container w-full max-w-[320px] select-none">
      <div data-part="plate" className="relative isolate animate-enter overflow-hidden rounded-[1.25em] p-[1.1em] text-[clamp(11px,4.4cqw,14px)] [background:var(--device-body)] shadow-[var(--device-body-edge),0_1px_2px_rgb(0_0_0/0.06),0_16px_32px_-18px_rgb(0_0_0/0.3)]">
        <div aria-hidden className="device-grain pointer-events-none absolute inset-0 -z-10 rounded-[inherit]" />

        <div className="flex items-center justify-between gap-[0.8em]">
          <span data-part="lettering" className="text-[0.62em] font-semibold uppercase leading-none tracking-[0.16em] text-(--device-label) [text-shadow:var(--device-engrave)]">
            Revenue · this week
          </span>
          {/* The change since the last count: a light and a figure on a small screen. */}
          <span data-part="lcd" className="inline-flex shrink-0 items-center gap-[0.4em] rounded-[0.45em] px-[0.5em] py-[0.3em] text-[0.72em] leading-none tabular-nums text-(--device-lcd-ink) [background:var(--device-lcd)] shadow-(--device-lcd-edge)">
            {/* Drawn, up is a dot of ink and down stays red. */}
            <span aria-hidden data-part="light" className={`size-[0.45em] rounded-full ${up ? "bg-(--device-lcd-ink) drawn:bg-(--device-draw-ink)!" : "bg-(--device-rec) shadow-[0_0_0.4em_var(--device-rec)] drawn:bg-(--device-rec)!"}`} />
            <span className="sr-only">{up ? "Up" : "Down"}</span>
            {up ? "+" : "−"}
            {Math.abs(delta).toLocaleString("en-US")}
          </span>
        </div>

        <div data-part="well" className="mt-[0.9em] rounded-[0.9em] bg-(--device-well) px-[0.6em] py-[0.55em] shadow-(--device-recess)">
          <p className="text-center text-[2.5em] font-medium tracking-[-0.02em]">
            <NumberTicker value={value} format={{ style: "currency", currency: "USD", maximumFractionDigits: 0 }} />
          </p>
        </div>
      </div>
    </div>
  );
}
