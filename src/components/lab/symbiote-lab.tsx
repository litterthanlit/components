"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createSymbiote, DURATION, NEEDLES, SymbioteField, type SymbioteFrame, type SymbioteHandle, type SymbioteMode } from "@/registry/components/symbiote-field";

/*
 * The preview page. The artwork is dark in both themes, so the page is too:
 * the creature's own near-black canvas, white type at three strengths and
 * the creature's violet as the one accent, on the scrubber.
 */

const ink = "text-white";
const muted = "text-white/55";
const quiet = "text-white/35";

/** One segment of a two-way switch: a native radio under a label, so it is one tab stop with arrow keys. */
function Segment({ name, value, checked, onChange, children }: { name: string; value: string; checked: boolean; onChange: () => void; children: ReactNode }) {
  return (
    <label className="relative grid h-8 cursor-pointer place-items-center rounded-[10px] px-3 text-[13px] font-medium transition-colors duration-150 has-checked:bg-white/[0.12] has-checked:text-white has-focus-visible:outline-2 has-focus-visible:outline-offset-1 has-focus-visible:outline-[#8f78ff] text-white/55 hover:text-white">
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="sr-only" />
      {children}
    </label>
  );
}

const glass = "rounded-[18px] border border-white/[0.08] bg-white/[0.04] shadow-[0_20px_60px_-20px_rgb(0_0_0/0.8)] backdrop-blur-xl";

export function SymbioteLab() {
  const field = useRef<SymbioteHandle>(null);
  const rangeRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const [mode, setMode] = useState<SymbioteMode>("attract");
  const [motion, setMotion] = useState<"full" | "still">("full");
  const [scrub, setScrub] = useState<number | null>(null); // while dragging, the field is held here

  // Reduced motion starts the page still; the switch can show either.
  useEffect(() => {
    const id = requestAnimationFrame(() => matchMedia("(prefers-reduced-motion: reduce)").matches && setMotion("still"));
    return () => cancelAnimationFrame(id);
  }, []);

  /** The frame loop writes the scrubber and the time; React never hears about frames. */
  function onFrame(progress: number) {
    const range = rangeRef.current;
    if (range && scrub === null) range.value = String(Math.round(progress * 1000));
    if (timeRef.current) timeRef.current.textContent = (progress * DURATION).toFixed(1);
    range?.setAttribute("aria-valuetext", `${(progress * DURATION).toFixed(1)} of ${DURATION} seconds`);
  }

  /** Let go of the scrubber: the awakening plays on from where it was left. */
  function commit() {
    if (scrub === null) return;
    field.current?.seek(scrub);
    setScrub(null);
  }

  const still = motion === "still";

  return (
    <div className="bg-[#0b0b0e] text-white">
      {/* The stage: the creature, full bleed. */}
      <section aria-labelledby="symbiote-title" className="relative h-[100svh] min-h-[560px] overflow-hidden">
        <SymbioteField ref={field} mode={mode} progress={scrub ?? undefined} reducedMotion={still} onFrame={onFrame} className="absolute inset-0" />

        <header className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-6 p-4 sm:p-8">
          <div className="max-w-[28rem]">
            <p className={`text-[12px] font-medium uppercase tracking-[0.14em] ${quiet}`}>Study · WebGL</p>
            <h1 id="symbiote-title" className={`mt-3 text-[clamp(28px,4.4vw,48px)] font-medium leading-[1.02] tracking-[-0.025em] ${ink}`}>
              Symbiote Field
            </h1>
            <p className={`mt-3 text-[15px] leading-[1.5] ${muted}`}>A needle field that wakes up and notices you. Move over it; switch to repel and it shies away.</p>
          </div>
          <Link href="/c/symbiote-field" className={`pointer-events-auto shrink-0 rounded-md text-[14px] ${muted} transition-colors duration-150 hover:text-white`}>
            Source →
          </Link>
        </header>

        {/* The timeline: replay, scrub, the mode and the motion. */}
        <div className="absolute inset-x-0 bottom-0 flex justify-center p-4 sm:p-8">
          <div className={`${glass} flex w-full max-w-[760px] flex-wrap items-center gap-2 p-2`}>
            <button
              type="button"
              onClick={() => field.current?.replay()}
              disabled={still}
              className="h-8 rounded-[10px] bg-white px-3.5 text-[13px] font-medium text-black transition-opacity duration-150 hover:opacity-90 disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8f78ff]"
            >
              Replay
            </button>

            <div className="flex min-w-[200px] flex-1 items-center gap-3 px-2">
              <input
                ref={rangeRef}
                type="range"
                min={0}
                max={1000}
                defaultValue={0}
                aria-label="Awakening"
                disabled={still}
                onChange={(e) => setScrub(Number(e.currentTarget.value) / 1000)}
                onPointerUp={commit}
                onKeyUp={commit}
                onBlur={commit}
                className="h-8 min-w-0 flex-1 cursor-pointer accent-[#6d4dff] disabled:opacity-30"
              />
              <span className={`w-[5.5em] shrink-0 text-right text-[13px] tabular-nums ${muted}`}>
                <span ref={timeRef} className="text-white">
                  0.0
                </span>{" "}
                / {DURATION} s
              </span>
            </div>

            <div role="radiogroup" aria-label="Pointer" className="flex rounded-[12px] bg-black/30 p-0.5">
              <Segment name="mode" value="attract" checked={mode === "attract"} onChange={() => setMode("attract")}>
                Attract
              </Segment>
              <Segment name="mode" value="repel" checked={mode === "repel"} onChange={() => setMode("repel")}>
                Repel
              </Segment>
            </div>

            <div role="radiogroup" aria-label="Motion" className="flex rounded-[12px] bg-black/30 p-0.5">
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

      <ScrollSection />

      <section aria-labelledby="api-title" className="mx-auto grid max-w-[1120px] gap-10 px-4 py-28 sm:px-8 md:grid-cols-[1fr_1.4fr]">
        <div>
          <h2 id="api-title" className="text-[28px] font-medium tracking-[-0.02em]">
            Drop it in
          </h2>
          <p className={`mt-4 max-w-[26rem] text-[15px] leading-[1.6] ${muted}`}>
            One file, plain Three.js. The engine renders a frame from its time, progress, pointer and mode alone, so the same call scrubs it, drives it from scroll or renders it to video a frame at a time.
          </p>
        </div>
        <pre className="overflow-x-auto rounded-[18px] border border-white/[0.08] bg-white/[0.03] p-5 text-[13px] leading-[1.7] text-white/80">
          <code>{`import { SymbioteField } from "@/registry/components/symbiote-field";

// Plays the awakening by itself, then idles.
<SymbioteField mode="attract" />

// Scrubbed, or driven by scroll: progress 0 to 1.
<SymbioteField progress={scrollProgress} />

// Replay or jump through a ref.
ref.current.replay();
ref.current.seek(0.5);

// Offline, a frame at a time.
const engine = createSymbiote(canvas, { needles: ${NEEDLES} });
engine.resize(1920, 1080, 1);
engine.render({ time, progress, pointer, mode: 1 });`}</code>
        </pre>
      </section>
    </div>
  );
}

/** A second field, its awakening tied to how far the page has scrolled through this section. */
function ScrollSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const section = sectionRef.current!;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const rect = section.getBoundingClientRect();
      const travel = rect.height - innerHeight;
      setProgress(Math.min(1, Math.max(0, -rect.top / Math.max(1, travel))));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    onScroll();
    return () => {
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section ref={sectionRef} aria-labelledby="scroll-title" className="relative h-[260vh] border-t border-white/[0.06]">
      <div className="sticky top-0 grid h-[100svh] items-center gap-8 px-4 py-10 sm:px-8 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)]">
        <div className="mx-auto w-full max-w-[26rem]">
          <p className={`text-[12px] font-medium uppercase tracking-[0.14em] ${quiet}`}>progress = scroll</p>
          <h2 id="scroll-title" className="mt-3 text-[28px] font-medium tracking-[-0.02em]">
            It wakes as you read
          </h2>
          <p className={`mt-4 text-[15px] leading-[1.6] ${muted}`}>
            The same awakening, held to this section’s scroll. Scroll back and it sinks into the floor again; the needles, the veins and the camera all follow the one number.
          </p>
          <p className={`mt-6 text-[13px] tabular-nums ${quiet}`}>{Math.round(progress * 100)}%</p>
        </div>
        <div className="relative h-[min(70svh,640px)] overflow-hidden rounded-[22px] border border-white/[0.06]">
          <SymbioteField progress={progress} className="absolute inset-0" label="The same creature, its awakening following the page's scroll." />
        </div>
      </div>
    </section>
  );
}

declare global {
  interface Window {
    symbiote?: { duration: number; frame: (frame: SymbioteFrame) => string };
  }
}

/** A bare canvas for offline rendering: `window.symbiote.frame()` draws one frame and hands it back as a PNG. */
export function SymbioteRender({ width, height, needles }: { width: number; height: number; needles: number }) {
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
      duration: DURATION,
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

  return <main ref={hostRef} className="grid min-h-screen place-items-center bg-black" />;
}
