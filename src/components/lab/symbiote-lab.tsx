"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createSymbiote, ghost, NEEDLES, SymbioteField, type SymbioteActivity, type SymbioteFrame, type SymbioteHandle, type SymbioteMode } from "@/registry/components/symbiote-field";

/*
 * The preview page: a full page of paper to grow the symbiote on. The
 * artwork is ink on paper in both themes, so the page is too: white paper,
 * black type at three strengths, and nothing else.
 */

const ink = "text-black";
const muted = "text-black/55";
const quiet = "text-black/40";

/** One segment of a two-way switch: a native radio under a label, so it is one tab stop with arrow keys. */
function Segment({ name, value, checked, onChange, children }: { name: string; value: string; checked: boolean; onChange: () => void; children: ReactNode }) {
  return (
    <label className="relative grid h-8 cursor-pointer place-items-center rounded-[10px] px-3 text-[13px] font-medium text-black/55 transition-colors duration-150 hover:text-black has-checked:bg-black has-checked:text-white has-checked:hover:text-white has-focus-visible:outline-2 has-focus-visible:outline-offset-1 has-focus-visible:outline-black">
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="sr-only" />
      {children}
    </label>
  );
}

const glass = "rounded-[18px] border border-black/[0.08] bg-white/75 shadow-[0_20px_50px_-24px_rgb(0_0_0/0.25)] backdrop-blur-xl";
const HINT: Record<SymbioteActivity, string> = {
  ghost: "Growing by itself. Move over the page to take over.",
  hand: "",
  rest: "Move to grow it. Hold the button to pump it up. Switch to repel to push it around.",
};

export function SymbioteLab() {
  const field = useRef<SymbioteHandle>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const [mode, setMode] = useState<SymbioteMode>("attract");
  const [motion, setMotion] = useState<"full" | "still">("full");
  const [activity, setActivity] = useState<SymbioteActivity>("rest");

  // Reduced motion starts the page still; the switch can show either.
  useEffect(() => {
    const id = requestAnimationFrame(() => matchMedia("(prefers-reduced-motion: reduce)").matches && setMotion("still"));
    return () => cancelAnimationFrame(id);
  }, []);

  const still = motion === "still";
  const hint = activity === "hand" ? (mode === "attract" ? "Feeding it. Hold the button to pump it up." : "Pushing it around.") : HINT[activity];

  return (
    <div className="bg-white text-black">
      <section aria-labelledby="symbiote-title" className="relative h-[100svh] min-h-[560px] overflow-hidden">
        <SymbioteField
          ref={field}
          mode={mode}
          reducedMotion={still}
          onActivity={setActivity}
          onFrame={(t) => {
            if (timeRef.current) timeRef.current.textContent = `${Math.floor(t / 60)}:${String(Math.floor(t) % 60).padStart(2, "0")}`;
          }}
          className="absolute inset-0"
        />

        <header className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-6 p-4 sm:p-8">
          <div className="max-w-[28rem]">
            <p className={`text-[12px] font-medium uppercase tracking-[0.14em] ${quiet}`}>Study · Ink · WebGL</p>
            <h1 id="symbiote-title" className={`mt-3 text-[clamp(28px,4.4vw,48px)] font-medium leading-[1.02] tracking-[-0.025em] ${ink}`}>
              Symbiote Field
            </h1>
            <p aria-live="polite" className={`mt-3 min-h-[3em] text-[15px] leading-[1.5] ${muted}`}>
              {hint}
            </p>
          </div>
          <Link href="/c/symbiote-field" className={`pointer-events-auto shrink-0 rounded-md text-[14px] ${muted} transition-colors duration-150 hover:text-black`}>
            Source →
          </Link>
        </header>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-4 sm:p-8">
          <div className={`${glass} pointer-events-auto flex flex-wrap items-center gap-2 p-2`}>
            <button
              type="button"
              onClick={() => field.current?.clear()}
              className="h-8 rounded-[10px] bg-black px-3.5 text-[13px] font-medium text-white transition-opacity duration-150 hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
            >
              Clear
            </button>
            <span className={`w-[3.5em] text-center text-[13px] tabular-nums ${muted}`}>
              <span ref={timeRef}>0:00</span>
            </span>
            <div role="radiogroup" aria-label="Pointer" className="flex rounded-[12px] bg-black/[0.05] p-0.5">
              <Segment name="mode" value="attract" checked={mode === "attract"} onChange={() => setMode("attract")}>
                Attract
              </Segment>
              <Segment name="mode" value="repel" checked={mode === "repel"} onChange={() => setMode("repel")}>
                Repel
              </Segment>
            </div>
            <div role="radiogroup" aria-label="Motion" className="flex rounded-[12px] bg-black/[0.05] p-0.5">
              <Segment name="motion" value="full" checked={!still} onChange={() => setMotion("full")}>
                Full
              </Segment>
              <Segment name="motion" value="still" checked={still} onChange={() => setMotion("still")}>
                Reduced
              </Segment>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="api-title" className="mx-auto grid max-w-[1120px] gap-10 border-t border-black/[0.06] px-4 py-28 sm:px-8 md:grid-cols-[1fr_1.4fr]">
        <div>
          <h2 id="api-title" className="text-[28px] font-medium tracking-[-0.02em]">
            Drop it in
          </h2>
          <p className={`mt-4 max-w-[26rem] text-[15px] leading-[1.6] ${muted}`}>
            One file, plain Three.js. The creature lives in a float texture on the GPU, stepped 120 times a second: its mass, its territory and a reaction-diffusion pair for the veins. Each frame depends only on its time and the pointer’s path, so a scripted path renders the same film every time.
          </p>
        </div>
        <pre className="overflow-x-auto rounded-[18px] border border-black/[0.08] bg-black/[0.025] p-5 text-[13px] leading-[1.7] text-black/80">
          <code>{`import { SymbioteField } from "@/registry/components/symbiote-field";

// A ghost draws the first creature; then it's yours.
<SymbioteField mode="attract" />

// The pointer pushes it around instead.
<SymbioteField mode="repel" />

// A blank page again.
ref.current.clear();

// Offline, a frame at a time, with a scripted pointer.
const engine = createSymbiote(canvas, { needles: ${NEEDLES} });
engine.resize(1920, 1080, 1);
engine.render({ time, pointer: { x, z, presence, pressed }, mode: 1 });`}</code>
        </pre>
      </section>
    </div>
  );
}

declare global {
  interface Window {
    symbiote?: { frame: (frame: SymbioteFrame) => string; ghost: typeof ghost };
  }
}

/** A bare canvas for offline rendering: `window.symbiote.frame()` steps to a frame, draws it and hands it back as a PNG. */
export function SymbioteRender({ width, height, needles = NEEDLES }: { width: number; height: number; needles?: number }) {
  const hostRef = useRef<HTMLElement>(null);

  useEffect(() => {
    // A canvas a mount: disposing loses the context for good.
    const canvas = document.createElement("canvas");
    canvas.id = "symbiote-render";
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    hostRef.current!.append(canvas);
    const engine = createSymbiote(canvas, { needles });
    engine.resize(width, height, 1);
    window.symbiote = {
      ghost,
      // Read back in the same task as the draw, while the drawing buffer still holds it.
      frame: (frame) => {
        engine.render(frame);
        return canvas.toDataURL("image/png");
      },
    };
    canvas.dataset.ready = "true";
    return () => {
      delete window.symbiote;
      engine.dispose();
      canvas.remove();
    };
  }, [width, height, needles]);

  return <main ref={hostRef} className="grid min-h-screen place-items-center bg-white" />;
}
