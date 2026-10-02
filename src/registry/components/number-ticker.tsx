"use client";

import { useEffect, useState } from "react";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

function Digit({ value, delay }: { value: number; delay: number }) {
  return (
    <span className="relative inline-block h-[1em] w-[0.62em] overflow-hidden leading-none">
      <span
        className="absolute inset-x-0 top-0 flex flex-col transition-transform duration-[900ms] ease-out-expo"
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
    <div className="w-full max-w-xs rounded-2xl border border-border bg-surface p-5 shadow-[0_20px_40px_-24px_rgb(0_0_0/0.35)]">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted">Revenue · this week</p>
        <span
          className={`rounded-full px-2 py-0.5 font-mono text-[11px] transition-colors ${
            up ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-accent/10 text-accent"
          }`}
        >
          {up ? "▲" : "▼"} {Math.abs(delta).toLocaleString("en-US")}
        </span>
      </div>
      <p className="mt-3 text-4xl font-medium tracking-tight text-fg">
        <NumberTicker value={value} format={{ style: "currency", currency: "USD", maximumFractionDigits: 0 }} />
      </p>
    </div>
  );
}
