"use client";

import { memo, useEffect, useRef, useState } from "react";

type CopyButtonProps = {
  value: string;
  label?: string;
  className?: string;
  /** Called with `true` on a successful copy and `false` when the check goes back to the copy icon. */
  onCopiedChange?: (copied: boolean) => void;
};

/**
 * Copies `value` to the clipboard. The two icons share a slot and cross-fade
 * with a little scale and blur, and the checkmark draws itself in. A visually
 * hidden live region announces the result.
 */
export function CopyButton({ value, label = "Copy to clipboard", className = "", onCopiedChange }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function update(next: boolean) {
    setCopied(next);
    onCopiedChange?.(next);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      return;
    }
    update(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => update(false), 1800);
  }

  const icon = "absolute inset-0 m-auto size-4 transition-[opacity,transform,filter] duration-(--duration-enter) ease-out";

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={label}
      className={`relative inline-grid size-8 place-items-center rounded-md text-muted transition-[background-color,color,transform] duration-(--duration-exit) ease-out hover:bg-panel hover:text-ink hover:duration-(--duration-enter) active:scale-[0.92] ${className}`}
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
        className={`${icon} text-accent-strong`}
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
          className="transition-[stroke-dashoffset] delay-75 duration-(--duration-move) ease-out"
        />
      </svg>
      <span className="sr-only" role="status">
        {copied ? "Copied" : ""}
      </span>
    </button>
  );
}

/** Half-width katakana, digits and a few marks: the falling code from the films. */
const GLYPHS = "ｦｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ012345789:=*+<>¦";
/** Delay between neighbouring characters as the wave travels, in ms… */
const STEP = 18;
/** …shortened for long strings so the wave never takes longer than this. */
const SPAN = 520;

type Slot = {
  /** The state the character rests in before and after its glitch. */
  from: boolean;
  to: boolean;
  /** Its glitch window, in performance.now() time. */
  start: number;
  end: number;
  glyph: string;
  alpha: number;
  nextSwap: number;
};

type Frame = { shown: boolean; glyph: string; alpha: number };

const rest = (shown: boolean): Slot => ({ from: shown, to: shown, start: 0, end: 0, glyph: "", alpha: 1, nextSwap: 0 });
const pick = () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)];

/**
 * Each character keeps its own width in the layout, visible or not, and the
 * glyph rides on top of it, so nothing around the text moves while it glitches.
 */
const Char = memo(function Char({ char, shown, glyph, alpha }: { char: string } & Frame) {
  return (
    <span className="relative">
      <span className={shown ? undefined : "invisible"}>{char}</span>
      {glyph ? (
        <span className="absolute inset-0 select-none text-center text-accent-strong" style={{ opacity: alpha }}>
          {glyph}
        </span>
      ) : null}
    </span>
  );
});

type GlitchTextProps = {
  text: string;
  /**
   * Hiding sends a wave of glitching glyphs through the text from right to
   * left, and each character it passes is gone. Showing it again decodes the
   * text back in from left to right. Interrupt it at any point and it turns
   * around from where it is.
   */
  hidden?: boolean;
  className?: string;
};

/**
 * Text that dissolves like falling code. Screen readers always get the plain
 * text; the glitching characters are decoration. Under reduced motion the
 * text simply hides and shows.
 */
export function GlitchText({ text, hidden = false, className = "" }: GlitchTextProps) {
  const chars = Array.from(text);
  const [frames, setFrames] = useState<Frame[]>(() => chars.map(() => ({ shown: !hidden, glyph: "", alpha: 1 })));
  const slots = useRef<Slot[]>([]);

  useEffect(() => {
    const target = !hidden;
    const now = performance.now();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const count = Array.from(text).length;

    // Keep each position's state when the text changes; new positions start settled.
    const list = Array.from({ length: count }, (_, i) => slots.current[i] ?? rest(target));
    slots.current = list;

    // Hiding runs right to left, showing left to right. Only characters that
    // still have to change count towards the wave, so a reversal starts at once.
    const step = Math.min(STEP, SPAN / Math.max(count, 1));
    let rank = 0;
    for (let k = 0; k < count; k++) {
      const slot = list[hidden ? count - 1 - k : k];
      const started = now >= slot.start;
      const heading = started ? slot.to : slot.from;
      if (heading === target) {
        // Already there, or on its way; drop a change that hasn't begun.
        if (!started) Object.assign(slot, rest(target));
        continue;
      }
      const glitching = started && now < slot.end;
      const delay = reduced ? 0 : rank++ * step;
      slot.from = heading;
      slot.to = target;
      slot.start = glitching ? now : now + delay;
      slot.end = reduced ? now : now + delay + 140 + Math.random() * 200;
      slot.nextSwap = 0;
    }

    let raf = 0;
    const tick = (t: number) => {
      let running = false;
      const next = list.map((slot): Frame => {
        if (t < slot.start) {
          running = true;
          return { shown: slot.from, glyph: "", alpha: 1 };
        }
        if (t >= slot.end) return { shown: slot.to, glyph: "", alpha: 1 };
        running = true;
        if (t >= slot.nextSwap) {
          slot.glyph = pick();
          slot.alpha = 0.6 + Math.random() * 0.4;
          slot.nextSwap = t + 35 + Math.random() * 50;
        }
        // Glyphs fade out as a character leaves and brighten as it arrives.
        const p = (t - slot.start) / (slot.end - slot.start);
        const fade = slot.to ? 0.35 + 0.65 * p : 1 - 0.7 * p;
        return { shown: false, glyph: slot.glyph, alpha: Math.round(slot.alpha * fade * 10) / 10 };
      });
      setFrames(next);
      if (running) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [hidden, text]);

  return (
    <span className={className}>
      <span className="sr-only select-none">{text}</span>
      <span aria-hidden>
        {chars.map((char, i) => {
          const frame = frames[i];
          return <Char key={i} char={char} shown={frame ? frame.shown : !hidden} glyph={frame?.glyph ?? ""} alpha={frame?.alpha ?? 1} />;
        })}
      </span>
    </span>
  );
}

const command = "npx shadcn add spotlight-card";

export default function Demo() {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex w-full max-w-sm items-center gap-3 rounded-xl bg-surface py-1.5 pl-4 pr-1.5 font-mono text-[13px] shadow-md">
      <span aria-hidden className="select-none text-subtle">$</span>
      <code className="min-w-0 flex-1 truncate text-ink">
        <GlitchText text={command} hidden={copied} />
      </code>
      <CopyButton value={command} label="Copy install command" onCopiedChange={setCopied} />
    </div>
  );
}
