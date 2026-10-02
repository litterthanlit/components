"use client";

import { useEffect, useRef, useState } from "react";

type CopyButtonProps = {
  value: string;
  label?: string;
  className?: string;
};

/**
 * Copies `value` to the clipboard. The two icons share a slot and cross-fade
 * with a little scale and blur, and the checkmark draws itself in. A visually
 * hidden live region announces the result.
 */
export function CopyButton({ value, label = "Copy to clipboard", className = "" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      return;
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1800);
  }

  const icon = "absolute inset-0 m-auto size-4 transition-[opacity,transform,filter] duration-300 ease-out-expo";

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={label}
      className={`relative inline-grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg active:scale-95 ${className}`}
    >
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        fill="none"
        className={icon}
        style={{ opacity: copied ? 0 : 1, transform: copied ? "scale(0.5)" : "none", filter: copied ? "blur(3px)" : "none" }}
      >
        <rect x="5.5" y="5.5" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.3" />
        <path d="M10.5 3.5v-.25A1.75 1.75 0 0 0 8.75 1.5h-5.5A1.75 1.75 0 0 0 1.5 3.25v5.5c0 .97.78 1.75 1.75 1.75h.25" stroke="currentColor" strokeWidth="1.3" />
      </svg>
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        fill="none"
        className={`${icon} text-accent`}
        style={{ opacity: copied ? 1 : 0, transform: copied ? "none" : "scale(0.5)", filter: copied ? "none" : "blur(3px)" }}
      >
        <path
          d="m3 8.5 3.2 3L13 4.5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={copied ? 0 : 1}
          className="transition-[stroke-dashoffset] delay-100 duration-500 ease-out-expo"
        />
      </svg>
      <span className="sr-only" role="status">
        {copied ? "Copied" : ""}
      </span>
    </button>
  );
}

const command = "npx shadcn add spotlight-card";

export default function Demo() {
  return (
    <div className="flex w-full max-w-sm items-center gap-3 rounded-xl border border-border bg-surface py-1.5 pl-4 pr-1.5 font-mono text-[13px] shadow-[0_12px_32px_-16px_rgb(0_0_0/0.3)]">
      <span aria-hidden className="select-none text-subtle">$</span>
      <code className="min-w-0 flex-1 truncate text-fg">{command}</code>
      <CopyButton value={command} label="Copy install command" />
    </div>
  );
}
