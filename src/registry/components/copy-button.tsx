"use client";

import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import { focusQuietly } from "@/design-system";
import { hostTransport, play, type SoundName } from "@/lib/sound";

/*
 * Copy, on a recorder's character LCD. A key copies the command and comes up
 * with a check that draws itself, and the LCD lets the command go: a wave runs
 * through it from right to left, each character scrambling through the
 * display's own glyphs before it clears. Half-width katakana sit in the
 * character ROM of the classic HD44780 LCD controller, so this is what such a
 * screen can show. When the check goes, the command decodes back in from the
 * left.
 *
 * The glitch is drawn from a frame loop straight to the DOM, so it never
 * re-renders React. Every character keeps its width while it is gone, so
 * nothing moves, and a second copy mid-flight turns the wave round from
 * wherever it is. Each character clicks as it settles, falling in pitch as
 * the command leaves and rising as it returns.
 *
 * `rehearse` shows the gesture once on mount, without touching the
 * clipboard. Screen readers get the plain command and one "Copied"; under
 * reduced motion the command simply clears and comes back.
 */

const HOLD = 1800; // ms the check stays before the command comes back
const STEP = 18; // ms between neighbouring characters as the wave travels…
const SPAN = 520; // …shortened for long text, so the wave never takes longer than this
/** Half-width katakana, figures and a few marks, as the HD44780's ROM has them. */
const GLYPHS = "ｦｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789:=*+<>";

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const pick = () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
const glitchLength = () => 140 + Math.random() * 200; // ragged, so the wave's edge is never a straight line
const swapAfter = () => 35 + Math.random() * 50;
const flicker = () => 0.6 + Math.random() * 0.4;

type Slot = {
  /** The state a character rests in before and after its glitch… */
  from: boolean;
  to: boolean;
  /** …and the glitch itself, in performance.now() time. */
  start: number;
  end: number;
  settled: boolean;
  glyph: string;
  flicker: number;
  nextSwap: number;
  /** What the DOM shows now, so a frame only writes what changed. */
  drawn: string;
};

const rest = (shown: boolean): Slot => ({ from: shown, to: shown, start: 0, end: 0, settled: true, glyph: "", flicker: 1, nextSwap: 0, drawn: "" });

type GlitchTextProps = {
  text: string;
  /** Hiding runs a wave of glyphs through the text from right to left; showing decodes it back from the left. */
  hidden?: boolean;
  /** Each character as it settles after its glitch: its index, the text's length, and whether it's now shown. */
  onSettle?: (index: number, count: number, shown: boolean) => void;
  className?: string;
};

/** Text that leaves and returns like a character LCD scrambling. Screen readers always get the plain text. */
export function GlitchText({ text, hidden = false, onSettle, className = "" }: GlitchTextProps) {
  const [startHidden] = useState(hidden);
  const rootRef = useRef<HTMLSpanElement>(null);
  const slots = useRef<Slot[]>([]);
  const settle = useRef(onSettle);

  useLayoutEffect(() => {
    settle.current = onSettle;
  });

  useLayoutEffect(() => {
    const cells = [...rootRef.current!.querySelectorAll<HTMLElement>("[data-cell]")];
    const count = cells.length;
    const target = !hidden;
    const now = performance.now();
    const reduced = reducedMotion();

    // Positions keep their state when the text changes; new ones start where the text is going.
    const list = cells.map((_, i) => slots.current[i] ?? rest(target));
    slots.current = list;

    // Only characters that still have to change join the wave, so a reversal starts at once.
    const step = Math.min(STEP, SPAN / Math.max(count, 1));
    let rank = 0;
    for (let k = 0; k < count; k++) {
      const slot = list[hidden ? count - 1 - k : k];
      const started = now >= slot.start;
      const heading = started ? slot.to : slot.from;
      if (heading === target) {
        // Already there or on its way: drop a change that hasn't begun.
        if (!started) Object.assign(slot, rest(target), { drawn: slot.drawn });
        continue;
      }
      const glitching = started && now < slot.end;
      const delay = reduced ? 0 : rank++ * step;
      slot.from = heading;
      slot.to = target;
      slot.start = glitching ? now : now + delay;
      slot.end = reduced ? now : now + delay + glitchLength();
      slot.settled = reduced;
      slot.nextSwap = 0;
    }

    const draw = (t: number) => {
      let running = false;
      list.forEach((slot, i) => {
        let shown = slot.to;
        let glyph = "";
        let alpha = 1;
        if (t < slot.start) {
          running = true;
          shown = slot.from;
        } else if (t < slot.end) {
          running = true;
          shown = false;
          if (t >= slot.nextSwap) {
            slot.glyph = pick();
            slot.flicker = flicker();
            slot.nextSwap = t + swapAfter();
          }
          // Leaving, a glyph fades as it goes; arriving, it brightens into the character.
          const p = (t - slot.start) / (slot.end - slot.start);
          glyph = slot.glyph;
          alpha = Math.round(slot.flicker * (slot.to ? 0.35 + 0.65 * p : 1 - 0.7 * p) * 10) / 10;
        } else if (!slot.settled) {
          slot.settled = true;
          settle.current?.(i, count, slot.to);
        }
        const state = `${+shown}${glyph}${alpha}`;
        if (state === slot.drawn) return;
        slot.drawn = state;
        const [char, mark] = cells[i].children as unknown as [HTMLElement, HTMLElement];
        char.style.visibility = shown ? "" : "hidden";
        mark.textContent = glyph;
        mark.style.opacity = String(alpha);
      });
      return running;
    };

    let raf = 0;
    const frame = (t: number) => {
      raf = draw(t) ? requestAnimationFrame(frame) : 0;
    };
    if (draw(now)) raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [hidden, text]);

  return (
    <span ref={rootRef} className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {Array.from(text, (char, i) => (
          // A character holds its width, shown or not; its glyph rides over it, so the line never moves.
          <span key={i} data-cell className="relative">
            <span style={startHidden ? { visibility: "hidden" } : undefined}>{char}</span>
            <span className="pointer-events-none absolute inset-0 text-center" />
          </span>
        ))}
      </span>
    </span>
  );
}

type CopyButtonProps = {
  value: string;
  /** What the key does, for screen readers: "Copy command". */
  label?: string;
  /** `true` when the check comes up, `false` when it goes. */
  onCopiedChange?: (copied: boolean) => void;
  /** Show the gesture once on mount: the key goes down and comes up checked. Nothing is copied. */
  rehearse?: boolean;
  className?: string;
};

/** A key that copies `value` and comes up with a check that draws itself. */
export function CopyButton({ value, label = "Copy", onCopiedChange, rehearse = false, className = "" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const [announce, setAnnounce] = useState(false);
  const [pressed, setPressed] = useState(false); // held down by a rehearsal
  const rootRef = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const touched = useRef(false); // a hand has worked it: the rehearsal is over for good
  const changed = useRef(onCopiedChange);

  useLayoutEffect(() => {
    changed.current = onCopiedChange;
  });
  useEffect(() => () => clearTimeout(timer.current), []);

  function check(real: boolean) {
    setCopied(true);
    setAnnounce(real); // a rehearsal copies nothing, so it says nothing
    changed.current?.(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setCopied(false);
      setAnnounce(false);
      changed.current?.(false);
    }, HOLD);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      return;
    }
    check(true);
  }

  // Rehearsal: after a beat the key goes down for 110ms and comes up checked. It waits while the host's
  // tape is stopped and starts with its PLAY; it sounds only while the tape plays.
  const ghostCheck = useEffectEvent(() => check(false));
  useEffect(() => {
    if (!rehearse || reducedMotion()) return;
    const root = rootRef.current;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let done = false;
    const sound = (name: SoundName) => hostTransport(root) === "play" && play(name);
    const run = () => {
      if (done || touched.current || hostTransport(root) === "stop") return;
      done = true;
      timers.push(
        setTimeout(() => {
          if (touched.current) return;
          setPressed(true);
          sound("press");
        }, 400),
        setTimeout(() => {
          setPressed(false);
          if (touched.current) return;
          sound("release");
          ghostCheck();
        }, 510),
      );
    };
    run();
    const host = root?.closest("[data-transport]");
    const observer = new MutationObserver(() => hostTransport(root) === "play" && run());
    if (host) observer.observe(host, { attributes: true, attributeFilter: ["data-transport"] });
    return () => {
      timers.forEach(clearTimeout);
      observer.disconnect();
    };
  }, [rehearse]);

  const icon = "absolute inset-0 m-auto size-[1.15em] transition-[opacity,transform,filter] duration-(--duration-enter) ease-out";

  return (
    <>
      <button
        ref={rootRef}
        type="button"
        data-sound="key"
        data-pressed={pressed || undefined}
        aria-label={label}
        onPointerDownCapture={() => (touched.current = true)}
        onKeyDownCapture={() => (touched.current = true)}
        onPointerDown={(e) => e.button === 0 && focusQuietly(e.currentTarget)}
        onClick={copy}
        className={`group/key size-[2.9em] shrink-0 rounded-[0.7em] outline-offset-2 ${className}`}
      >
        <span className="relative grid size-full place-items-center rounded-[0.7em] text-(--device-key-ink) [background:var(--device-key-face)] shadow-(--device-key-shadow) transition-[transform,box-shadow] duration-(--duration-exit) ease-out group-active/key:translate-y-[2px] group-active/key:shadow-(--device-key-shadow-pressed) group-active/key:duration-75 group-data-pressed/key:translate-y-[2px] group-data-pressed/key:shadow-(--device-key-shadow-pressed) group-data-pressed/key:duration-75">
          {/* The two glyphs share the face and cross-fade, printed into it like its lettering. */}
          <svg
            aria-hidden
            viewBox="0 0 16 16"
            fill="none"
            className={icon}
            style={{
              opacity: copied ? 0 : 1,
              transform: copied ? "scale(0.95)" : "none",
              filter: `var(--device-engrave-glyph) blur(${copied ? 2 : 0}px)`,
            }}
          >
            <rect x="5.5" y="5.5" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.3" />
            <path d="M10.5 3.5v-.25A1.75 1.75 0 0 0 8.75 1.5h-5.5A1.75 1.75 0 0 0 1.5 3.25v5.5c0 .97.78 1.75 1.75 1.75h.25" stroke="currentColor" strokeWidth="1.3" />
          </svg>
          <svg
            aria-hidden
            viewBox="0 0 16 16"
            fill="none"
            className={icon}
            style={{
              opacity: copied ? 1 : 0,
              transform: copied ? "none" : "scale(0.95)",
              filter: `var(--device-engrave-glyph) blur(${copied ? 0 : 2}px)`,
            }}
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
        </span>
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {announce ? "Copied" : ""}
      </span>
    </>
  );
}

const command = "npx shadcn add copy-button";

export default function Demo() {
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const touched = useRef(false); // a hand has worked it: it may sound while the host is paused

  // A click per character as it settles, its pitch following the character's place on the line.
  function tick(index: number, count: number) {
    if (touched.current || hostTransport(rootRef.current) === "play") play("tick", { gain: 0.3, pitch: 0.9 + (index / count) * 0.25 });
  }

  return (
    <div
      ref={rootRef}
      onPointerDownCapture={() => (touched.current = true)}
      onKeyDownCapture={() => (touched.current = true)}
      className="@container w-full max-w-[360px] select-none"
    >
      <div className="relative isolate flex animate-enter items-stretch gap-[0.55em] overflow-hidden rounded-[1.25em] p-[0.9em] text-[clamp(11px,4cqw,14px)] [background:var(--device-body)] shadow-[var(--device-body-edge),0_1px_2px_rgb(0_0_0/0.06),0_16px_32px_-18px_rgb(0_0_0/0.3)]">
        <div aria-hidden className="device-grain pointer-events-none absolute inset-0 -z-10 rounded-[inherit]" />

        {/* The LCD: a prompt and the command, in light figures on black glass. */}
        <div className="flex min-w-0 flex-1 items-center gap-[0.6em] overflow-hidden rounded-[0.7em] px-[0.85em] font-mono text-[0.9em] font-light tracking-[-0.01em] text-(--device-lcd-ink) [background:var(--device-lcd)] shadow-(--device-lcd-edge)">
          <span aria-hidden className="text-(--device-lcd-dim)">
            $
          </span>
          <code className="min-w-0 flex-1 truncate">
            <GlitchText text={command} hidden={copied} onSettle={tick} />
          </code>
        </div>

        <CopyButton value={command} label="Copy command" rehearse onCopiedChange={setCopied} />
      </div>
    </div>
  );
}
