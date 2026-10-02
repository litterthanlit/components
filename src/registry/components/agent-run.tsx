"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/*
 * One agent turn, start to finish: think, run tools, collapse the work into
 * "Thought for 4s", stream the answer. Built from plain state + CSS, with
 * the design system's shimmer, caret, enter and stagger tokens.
 */

type Step = { verb: string; target: string; detail?: ReactNode };

type AgentRunProps = {
  steps: Step[];
  answer: string;
  /** Ms spent "thinking" before the first tool call. */
  think?: number;
  /** Ms each tool step runs. */
  stepTime?: number;
  /** Ms per streamed word. */
  wordTime?: number;
  /** Restart after this many ms once finished; omit to stop. */
  loopAfter?: number;
};

type Phase = "thinking" | "working" | "answering" | "done";

function Shimmer({ children }: { children: ReactNode }) {
  return (
    <span
      className="animate-shimmer bg-clip-text text-transparent motion-reduce:animate-none motion-reduce:text-muted"
      style={{
        backgroundImage:
          "linear-gradient(90deg, var(--muted) 0%, var(--muted) 40%, var(--ink) 50%, var(--muted) 60%, var(--muted) 100%)",
        backgroundSize: "200% 100%",
      }}
    >
      {children}
    </span>
  );
}

/** Spinning arc while running; a check that draws itself when done. */
function StepIcon({ done }: { done: boolean }) {
  return (
    <span className="relative grid size-4 place-items-center" aria-hidden>
      <svg
        viewBox="0 0 16 16"
        fill="none"
        className="absolute size-4 animate-spin text-muted transition-opacity duration-(--duration-exit) motion-reduce:animate-none"
        style={{ opacity: done ? 0 : 1, animationDuration: "0.8s" }}
      >
        <circle cx="8" cy="8" r="6" stroke="var(--line-strong)" strokeWidth="1.5" />
        <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <svg viewBox="0 0 16 16" fill="none" className="absolute size-4 text-accent-strong">
        <path
          d="m4 8.5 2.6 2.5L12 5.5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={done ? 0 : 1}
          className="transition-[stroke-dashoffset] duration-(--duration-move) ease-out"
        />
      </svg>
    </span>
  );
}

export function AgentRun({ steps, answer, think = 1400, stepTime = 900, wordTime = 45, loopAfter }: AgentRunProps) {
  const words = answer.split(/(?<=\s)/);
  const [run, setRun] = useState(0);
  const [phase, setPhase] = useState<Phase>("thinking");
  const [revealed, setRevealed] = useState(0); // steps shown
  const [finished, setFinished] = useState(0); // steps done
  const [streamed, setStreamed] = useState(0); // words shown
  const [open, setOpen] = useState(true);
  const [seconds, setSeconds] = useState(0);
  const started = useRef(0);
  const reduced = useRef(false);

  // The script: each phase schedules the next.
  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));

    if (reduced.current) {
      // Show the finished turn, no motion.
      at(0, () => {
        setPhase("done");
        setRevealed(steps.length);
        setFinished(steps.length);
        setStreamed(words.length);
        setOpen(false);
        setSeconds(Math.round((think + steps.length * stepTime) / 1000));
      });
      return () => timers.forEach(clearTimeout);
    }

    at(0, () => {
      started.current = Date.now();
      setPhase("thinking");
      setRevealed(0);
      setFinished(0);
      setStreamed(0);
      setOpen(true);
      setSeconds(0);
    });
    let t = think;
    steps.forEach((_, i) => {
      at(t, () => {
        setPhase("working");
        setRevealed(i + 1);
      });
      t += stepTime;
      at(t, () => setFinished(i + 1));
    });
    at(t + 250, () => {
      setSeconds(Math.max(1, Math.round((Date.now() - started.current) / 1000)));
      setPhase("answering");
      setOpen(false);
    });
    t += 500;
    words.forEach((_, i) => at(t + i * wordTime, () => setStreamed(i + 1)));
    t += words.length * wordTime;
    at(t, () => setPhase("done"));
    if (loopAfter) at(t + loopAfter, () => setRun((r) => r + 1));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the script restarts per run
  }, [run]);

  // Live elapsed counter while working.
  useEffect(() => {
    if (phase !== "thinking" && phase !== "working") return;
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - started.current) / 1000)), 250);
    return () => clearInterval(id);
  }, [phase]);

  const busy = phase === "thinking" || phase === "working";
  const current = steps[Math.max(0, revealed - 1)];
  const status = phase === "thinking" ? "Thinking" : `${current.verb} ${current.target}`;

  return (
    <section aria-label="Agent" aria-busy={busy} className="w-full max-w-md rounded-xl bg-surface p-4 shadow-md">
      <p className="sr-only" aria-live="polite">
        {busy ? status : phase === "done" ? `Answer ready. ${answer}` : ""}
      </p>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        aria-expanded={open}
        className="-mx-1 flex w-[calc(100%+0.5rem)] items-center gap-2 rounded-md px-1 py-0.5 text-left text-body disabled:cursor-default"
      >
        {busy ? (
          <>
            <span className="min-w-0 truncate font-medium">
              <Shimmer>{phase === "thinking" ? "Thinking" : current.verb}</Shimmer>
              {phase === "working" && <span className="ml-1.5 font-mono text-[13px] text-muted">{current.target}</span>}
            </span>
            <span className="ml-auto font-mono text-meta tabular-nums text-muted">{seconds}s</span>
          </>
        ) : (
          <>
            <span className="text-muted transition-colors hover:text-ink">Thought for {seconds}s</span>
            <svg
              aria-hidden
              viewBox="0 0 16 16"
              fill="none"
              className="size-3.5 text-muted transition-transform duration-(--duration-enter) ease-out"
              style={{ transform: open ? "rotate(90deg)" : "none" }}
            >
              <path d="m6 4 4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </>
        )}
      </button>

      {/* Collapsible steps: grid-rows 1fr ↔ 0fr animates to the content's real height. */}
      <div
        className="grid transition-[grid-template-rows,opacity] duration-(--duration-move) ease-out"
        style={{ gridTemplateRows: open && revealed ? "1fr" : "0fr", opacity: open ? 1 : 0 }}
      >
        <ol className="min-h-0 overflow-hidden">
          {steps.slice(0, revealed).map((step, i) => (
            <li key={`${run}-${i}`} className="relative flex animate-enter items-center gap-2.5 pt-3 text-body">
              {i < revealed - 1 && (
                <span aria-hidden className="absolute left-[7.5px] top-[30px] h-[calc(100%-18px)] w-px bg-line" />
              )}
              <StepIcon done={i < finished} />
              <span className="font-medium text-ink">{step.verb}</span>
              <span className="min-w-0 truncate font-mono text-[13px] text-muted">{step.target}</span>
              {step.detail && i < finished && (
                <span className="ml-auto shrink-0 animate-enter font-mono text-meta text-muted">{step.detail}</span>
              )}
            </li>
          ))}
        </ol>
      </div>

      {streamed > 0 && (
        <p className="mt-3 border-t border-line pt-3 text-body text-ink">
          {words.slice(0, streamed).join("")}
          {phase === "answering" && (
            <span aria-hidden className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[2px] animate-caret bg-ink" />
          )}
        </p>
      )}
    </section>
  );
}

export default function Demo() {
  return (
    <AgentRun
      loopAfter={3500}
      steps={[
        { verb: "Read", target: "src/registry/index.ts", detail: "142 lines" },
        { verb: "Search", target: "createSpring", detail: "4 results" },
        {
          verb: "Edit",
          target: "segmented-control.tsx",
          detail: (
            <>
              <span className="text-accent-strong">+18</span> <span className="text-danger">−9</span>
            </>
          ),
        },
      ]}
      answer="The indicator now springs between options. Position and width are separate springs, so it stretches slightly in flight and quick clicks flow into each other."
    />
  );
}
