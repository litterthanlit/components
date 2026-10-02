"use client";

import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";

type Option = { value: string; label: string };

type SegmentedControlProps = {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  label: string;
};

/**
 * A radio group with a single indicator that glides between options.
 * Follows the WAI-ARIA radio group pattern: one tab stop, arrow keys move
 * selection, Home/End jump to the ends.
 */
export function SegmentedControl({ options, value, onChange, label }: SegmentedControlProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      const active = list.querySelector<HTMLElement>('[aria-checked="true"]');
      if (active) setIndicator({ left: active.offsetLeft, width: active.offsetWidth });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [value]);

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
      className="relative inline-flex items-center rounded-full border border-border bg-surface-2 p-1"
    >
      {indicator && (
        <span
          aria-hidden
          className="absolute inset-y-1 rounded-full bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.08),0_0_0_1px_var(--border)] transition-[left,width] duration-500 ease-out-expo"
          style={{ left: indicator.left, width: indicator.width }}
        />
      )}
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
            className={`relative z-10 h-8 rounded-full px-4 text-[13px] font-medium transition-colors duration-300 ${
              checked ? "text-fg" : "text-muted hover:text-fg"
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
        <span key={plan} className="animate-[fade-up_500ms_var(--ease-out-expo)] font-mono text-4xl tracking-tight text-fg">
          {prices[plan].amount}
        </span>
        <span className="text-xs text-subtle">{prices[plan].note}</span>
      </p>
      <style>{`@keyframes fade-up{from{opacity:0;transform:translateY(6px);filter:blur(4px)}to{opacity:1;transform:none;filter:none}}`}</style>
    </div>
  );
}
