"use client";

import { useEffect, useRef, useState } from "react";

const ROUND = 115; // 1:55, a full round in classic competitive.
const MONEY_START = 800; // Pistol round…
const MONEY_MAX = 16000; // …to the cap.

const format = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/**
 * Counter-Strike 1.6 heads-up display, shown only in the cs theme.
 * Health and armour bottom-left, the round timer centred, money and ammo
 * bottom-right. Money climbs from $800 to $16000 as you scroll the page;
 * ammo is how many components there are. Purely decorative: aria-hidden,
 * click-through, and the timer holds still under reduced motion.
 */
export function CsHud({ count }: { count: number }) {
  const [time, setTime] = useState(ROUND);
  const moneyRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setTime((t) => (t <= 0 ? ROUND : t - 1)), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const progress = max > 0 ? Math.min(1, window.scrollY / max) : 1;
      const money = Math.round((MONEY_START + (MONEY_MAX - MONEY_START) * progress) / 50) * 50;
      if (moneyRef.current) moneyRef.current.textContent = String(money);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 hidden select-none cs:block"
    >
      {/* Fade the page under the HUD so the numerals always read. */}
      <div className="absolute inset-x-0 bottom-0 h-28 bg-linear-to-t from-canvas/90 to-transparent" />
      <div className="hud-glow relative mx-auto flex max-w-[1400px] items-end justify-between gap-4 px-4 pb-3 font-stencil text-cs-hud sm:px-6 sm:pb-4">
        <div className="flex items-center gap-5 sm:gap-8">
          <Stat icon={<Cross />} value="100" />
          <Stat icon={<Shield />} value="100" className="max-sm:hidden" />
        </div>

        <Stat
          icon={<Clock />}
          value={format(time)}
          className={`max-md:hidden ${time <= 10 ? "text-cs-t" : ""}`}
        />

        <div className="flex flex-col items-end gap-1">
          <p className="flex items-baseline gap-1.5 text-[22px] leading-none sm:text-[26px]">
            <span className="text-[0.8em]">$</span>
            <span ref={moneyRef} className="tabular-nums">
              {MONEY_START}
            </span>
          </p>
          <p className="flex items-center gap-2 text-[26px] leading-none tabular-nums sm:text-[32px]">
            <span>{count}</span>
            <span className="h-[0.9em] w-[3px] bg-current opacity-70" />
            <span>90</span>
            <Bullets />
          </p>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, value, className = "" }: { icon: React.ReactNode; value: string; className?: string }) {
  return (
    <p className={`flex items-center gap-2 text-[26px] leading-none tabular-nums sm:text-[32px] ${className}`}>
      {icon}
      <span>{value}</span>
    </p>
  );
}

const iconClass = "size-[0.85em] shrink-0";

function Cross() {
  return (
    <svg viewBox="0 0 16 16" className={iconClass} fill="currentColor">
      <path d="M5.5 0h5v5.5H16v5h-5.5V16h-5v-5.5H0v-5h5.5z" />
    </svg>
  );
}

function Shield() {
  return (
    <svg viewBox="0 0 16 16" className={iconClass} fill="currentColor">
      <path d="M8 0 15 2.5V8c0 4-3 6.6-7 8-4-1.4-7-4-7-8V2.5z" />
    </svg>
  );
}

function Clock() {
  return (
    <svg viewBox="0 0 16 16" className={iconClass} fill="none" stroke="currentColor" strokeWidth="2.2">
      <circle cx="8" cy="8" r="6.6" />
      <path d="M8 4v4.4l2.8 1.8" strokeLinecap="square" />
    </svg>
  );
}

function Bullets() {
  return (
    <svg viewBox="0 0 18 16" className="ml-1 h-[0.85em] w-auto shrink-0" fill="currentColor">
      {[0, 6, 12].map((x) => (
        <path key={x} d={`M${x + 1} 16V6c0-3 1.2-5 2-6 .8 1 2 3 2 6v10z`} />
      ))}
    </svg>
  );
}
