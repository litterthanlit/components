"use client";

import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";

/* A tiny damped spring (the design system's createSpring, inlined so this
   file stays copy-paste ready). It keeps velocity when the target changes,
   so quick successive clicks flow into each other instead of restarting. */
function createSpring(stiffness: number, damping: number, onUpdate: (value: number) => void) {
  let value = 0, velocity = 0, target = 0, raf = 0, last = 0;
  function frame(now: number) {
    let dt = Math.min(0.064, last ? (now - last) / 1000 : 1 / 240);
    last = now;
    while (dt > 0) {
      const h = Math.min(1 / 240, dt);
      velocity += (-stiffness * (value - target) - damping * velocity) * h;
      value += velocity * h;
      dt -= h;
    }
    const resting = Math.abs(velocity) < 0.01 && Math.abs(value - target) < 0.01;
    if (resting) value = target;
    onUpdate(value);
    raf = resting ? 0 : requestAnimationFrame(frame);
    if (resting) last = 0;
  }
  return {
    set(next: number) {
      target = next;
      if (!raf) raf = requestAnimationFrame(frame);
    },
    jump(next: number) {
      cancelAnimationFrame(raf);
      raf = last = velocity = 0;
      value = target = next;
      onUpdate(value);
    },
    stop: () => cancelAnimationFrame(raf),
  };
}

type Option = { value: string; label: string };

type SegmentedControlProps = {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  label: string;
};

type Springs = { left: ReturnType<typeof createSpring>; width: ReturnType<typeof createSpring> } | null;

function measure(list: HTMLElement | null, s: Springs, placed: { current: boolean }, animate: boolean) {
  const active = list?.querySelector<HTMLElement>('[aria-checked="true"]');
  const indicator = list?.querySelector<HTMLElement>("[data-indicator]");
  if (!active || !indicator || !s) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const move = animate && placed.current && !reduced ? "set" : "jump";
  s.left[move](active.offsetLeft);
  s.width[move](active.offsetWidth);
  placed.current = true;
  indicator.style.opacity = "1";
}

/**
 * A radio group with a single indicator that springs between options
 * (position and width are separate springs, so it stretches slightly).
 * Follows the WAI-ARIA radio group pattern: one tab stop, arrow keys move
 * selection, Home/End jump to the ends.
 */
export function SegmentedControl({ options, value, onChange, label }: SegmentedControlProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const springs = useRef<Springs>(null);
  const placed = useRef(false);

  // Layout effect so the springs exist before the first measurement below.
  useLayoutEffect(() => {
    const el = indicatorRef.current!;
    const left = createSpring(520, 40, (v) => (el.style.transform = `translateX(${v}px)`));
    const width = createSpring(420, 34, (v) => (el.style.width = `${v}px`));
    springs.current = { left, width };
    return () => {
      left.stop();
      width.stop();
      placed.current = false;
    };
  }, []);

  // Spring to the selected option whenever the value changes.
  useLayoutEffect(() => {
    measure(listRef.current, springs.current, placed, true);
  }, [value]);

  // Snap (no spring) when the control itself resizes, e.g. fonts loading.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    let width = list.offsetWidth;
    const observer = new ResizeObserver(() => {
      if (list.offsetWidth === width) return;
      width = list.offsetWidth;
      measure(list, springs.current, placed, false);
    });
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = options.findIndex((o) => o.value === value);
    let next = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % options.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + options.length) % options.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = options.length - 1;
    else return;
    event.preventDefault();
    onChange(options[next].value);
    listRef.current?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
  }

  return (
    <div
      ref={listRef}
      role="radiogroup"
      aria-label={label}
      onKeyDown={handleKeyDown}
      className="relative inline-flex items-center rounded-full bg-panel p-1 shadow-[inset_0_0_0_1px_var(--line)]"
    >
      <span
        ref={indicatorRef}
        data-indicator
        aria-hidden
        className="absolute inset-y-1 left-0 rounded-full bg-surface opacity-0 shadow-sm will-change-transform"
      />
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={`relative z-10 h-7 rounded-full px-3.5 text-meta font-medium transition-colors duration-(--duration-enter) ${
              checked ? "text-ink" : "text-muted hover:text-ink"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

const plans = [
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
  { value: "lifetime", label: "Lifetime" },
];

const prices: Record<string, { amount: string; note: string }> = {
  monthly: { amount: "$12", note: "per month, billed monthly" },
  yearly: { amount: "$96", note: "per year — two months free" },
  lifetime: { amount: "$249", note: "once, yours forever" },
};

export default function Demo() {
  const [plan, setPlan] = useState("yearly");
  return (
    <div className="flex flex-col items-center gap-6">
      <SegmentedControl label="Billing period" options={plans} value={plan} onChange={setPlan} />
      <p className="flex flex-col items-center gap-1" aria-live="polite">
        <span key={plan} className="animate-enter font-mono text-display tracking-tight tabular-nums text-ink">
          {prices[plan].amount}
        </span>
        <span className="text-meta text-muted">{prices[plan].note}</span>
      </p>
    </div>
  );
}
