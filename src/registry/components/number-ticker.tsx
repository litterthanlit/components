"use client";

import { useEffect, useState } from "react";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

function Digit({ value, delay }: { value: number; delay: number }) {
  return (
    <span className="relative inline-block h-[1em] w-[0.62em] overflow-hidden leading-none">
      <span
        className="absolute inset-x-0 top-0 flex flex-col transition-transform duration-[800ms] ease-out"
        style={{ transform: `translateY(-${value * 10}%)`, transitionDelay: `${delay}ms` }}
      >
        {DIGITS.map((d) => (
          <span key={d} className="h-[1em] text-center leading-none">
            {d}
          </span>
        ))}
      </span>
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

/**
 * Rolls each digit into place like a mechanical counter. Separators and
 * symbols come from Intl.NumberFormat, so any locale or currency works.
 * Screen readers get the formatted value once; the reels are hidden.
 */
export function NumberTicker({ value, format, locale = "en-US", className = "" }: NumberTickerProps) {
  const formatted = new Intl.NumberFormat(locale, format).format(value);
  const chars = formatted.split("");
  const digitCount = chars.filter((c) => /\d/.test(c)).length;
  let digitIndex = 0;

  return (
    <span className={`inline-flex items-baseline tabular-nums ${className}`}>
      <span className="sr-only">{formatted}</span>
      <span aria-hidden className="inline-flex">
        {chars.map((char, i) => {
          if (!/\d/.test(char)) {
            return (
              <span key={`s-${i}`} className="inline-block leading-none">
                {char}
              </span>
            );
          }
          // Key from the right so reels stay stable when the length changes.
          const fromRight = digitCount - digitIndex++;
          return <Digit key={`d-${fromRight}`} value={Number(char)} delay={fromRight * 40} />;
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
    <div className="w-full max-w-xs rounded-xl bg-surface p-5 shadow-md">
      <div className="flex items-center justify-between">
        <p className="text-meta text-muted">Revenue, this week</p>
        <span
          className={`inline-flex h-5 items-center rounded-full px-2 text-meta tabular-nums transition-colors duration-(--duration-enter) ${
            up ? "bg-accent text-accent-ink" : "bg-danger/10 text-danger"
          }`}
        >
          {up ? "▲" : "▼"} {Math.abs(delta).toLocaleString("en-US")}
        </span>
      </div>
      <p className="mt-2 text-[2.25rem] font-medium tracking-[-0.04em] text-ink">
        <NumberTicker value={value} format={{ style: "currency", currency: "USD", maximumFractionDigits: 0 }} />
      </p>
    </div>
  );
}
