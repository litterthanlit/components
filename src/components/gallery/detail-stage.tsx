"use client";

import { useRef, useState, type MouseEvent } from "react";
import type { Finish } from "@/components/anatomy/anatomy";
import { useWalk } from "@/components/anatomy/walk";
import { Button, buttonClass, cn } from "@/design-system";
import { site } from "@/site.config";
import type { StageBackground } from "@/registry";
import { anatomy, partInfo } from "@/registry/anatomy";
import { SegmentedControl } from "@/registry/components/segmented-control";
import { Preview } from "./preview";
import { useTheme } from "./theme-toggle";

const backgrounds = [
  { value: "grid", label: "Grid" },
  { value: "dots", label: "Dots" },
  { value: "glow", label: "Glow" },
  { value: "plain", label: "Plain" },
];

// Background picker and frame capture are authoring tools, so they only show in dev.
const authoring = process.env.NODE_ENV === "development";

const SPREAD = 0.6; // how far apart the layers open

const finishes = [
  { value: "drawing", label: "Drawing" },
  { value: "materials", label: "Materials" },
];

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The large interactive stage on a component page, with a replay button and,
 * for studies that can be taken apart, an Anatomy key: it latches down, the
 * study restarts and comes apart in its layers, drawn as a technical drawing
 * (or in its own materials, one switch away), and the layer the hand is on is
 * named under the stage. Untouched, it walks down the stack once.
 */
export function DetailStage({ slug, title, initial = "grid" }: { slug: string; title: string; initial?: StageBackground }) {
  const [background, setBackground] = useState<StageBackground>(initial);
  const [replay, setReplay] = useState(0);
  const [open, setOpen] = useState(false);
  const [spread, setSpread] = useState(SPREAD);
  const [finish, setFinish] = useState<Finish>("drawing");
  const [picked, setPicked] = useState<string | null>(null);
  const [kinds, setKinds] = useState<string[]>([]);
  const theme = useTheme();
  const rootRef = useRef<HTMLDivElement>(null);
  const walk = useWalk(open, kinds, setPicked);

  const canOpen = slug in anatomy;
  const info = picked ? partInfo(slug, picked) : null;

  // A plain <a> (new tab), so basePath isn't added for us. Taken apart, the frame is too.
  const captureHref = `${site.basePath}/capture/${slug}?bg=${background}&theme=${theme}${open ? `&anatomy=${Math.round(spread * 100)}&finish=${finish}` : ""}`;

  const touch = () => walk.touch();

  function toggle(e: MouseEvent<HTMLButtonElement>) {
    if (open) return close();
    walk.reset();
    setReplay((n) => n + 1); // the study restarts, so it runs its show while it comes apart
    setSpread(SPREAD);
    setPicked(null);
    setOpen(true);
    // Opened from the keyboard: the keys move on to the layers.
    if (e.detail === 0) requestAnimationFrame(() => rootRef.current?.querySelector<HTMLElement>('[role="listbox"]')?.focus());
  }

  function close() {
    walk.touch();
    setOpen(false);
    if (rootRef.current?.contains(document.activeElement)) rootRef.current.querySelector<HTMLElement>("[data-anatomy-key]")?.focus();
  }

  return (
    <div ref={rootRef}>
      <div onPointerDownCapture={open ? touch : undefined} onKeyDownCapture={open ? touch : undefined}>
        <Preview
          key={replay}
          slug={slug}
          background={authoring ? background : undefined}
          className={cn("min-h-[22rem] sm:h-[28rem]", authoring && "rounded-xl shadow-[inset_0_0_0_1px_var(--line)]")}
          anatomy={
            canOpen
              ? {
                  slug,
                  open,
                  finish,
                  spread,
                  picked,
                  label: `Layers of ${title}`,
                  // The study remounts on opening and reports the same kinds again: keep the list that's there.
                  onKinds: (next) => setKinds((prev) => (prev.join() === next.join() ? prev : next)),
                  onPick: (kind) => {
                    touch();
                    setPicked(kind);
                  },
                  onSpread: (v) => {
                    touch();
                    setSpread(v);
                  },
                  onClose: close,
                }
              : undefined
          }
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        {authoring && (
          <SegmentedControl
            label="Stage background"
            options={backgrounds}
            value={background}
            onChange={(v) => setBackground(v as StageBackground)}
          />
        )}
        {open && (
          <SegmentedControl label="Finish" options={finishes} value={finish} onChange={(v) => setFinish(v as Finish)} />
        )}
        {open && (
          <label className="flex animate-enter items-center gap-3 text-meta text-muted">
            Spread
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(spread * 100)}
              aria-valuetext={`${Math.round(spread * 100)} %`}
              onChange={(e) => {
                touch();
                setSpread(Number(e.target.value) / 100);
              }}
              className="range w-32 sm:w-40"
            />
            <span aria-hidden className="w-[4ch] text-right tabular-nums text-ink">
              {Math.round(spread * 100)} %
            </span>
          </label>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {canOpen && (
            // A latching key: it stays down while the study is apart.
            <Button
              size="sm"
              data-anatomy-key
              aria-pressed={open}
              onClick={toggle}
              className="aria-pressed:translate-y-[2px] aria-pressed:shadow-(--key-shadow-pressed)"
            >
              <svg aria-hidden viewBox="0 0 16 16" fill="none" className="size-3.5">
                <path d="M8 2.5 13.5 5 8 7.5 2.5 5zM2.5 8 8 10.5 13.5 8M2.5 11 8 13.5 13.5 11" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
              </svg>
              Anatomy
            </Button>
          )}
          <Button size="sm" onClick={() => setReplay((n) => n + 1)}>
            <svg aria-hidden viewBox="0 0 16 16" fill="none" className="size-3.5">
              <path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9M2.5 2.5v2.75h2.75" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Replay
          </Button>
          {authoring && (
            <a href={captureHref} target="_blank" rel="noreferrer" data-sound="key" className={buttonClass({ variant: "secondary", size: "sm" })}>
              Capture frame ↗<span className="sr-only">(opens in a new tab)</span>
            </a>
          )}
        </div>
      </div>

      {canOpen && (
        // The layer the hand is on: its name, the tokens that draw it and why. It opens with the anatomy.
        <div
          data-open={open || undefined}
          className="grid grid-rows-[0fr] opacity-0 transition-[grid-template-rows,opacity] duration-(--duration-exit) ease-out data-open:grid-rows-[1fr] data-open:opacity-100 data-open:duration-(--duration-enter)"
        >
          <div className="min-h-0 overflow-hidden">
            <div className="pt-5">
              <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-meta">
                <span className="tabular-nums text-muted">
                  {info ? `${pad(kinds.indexOf(picked!) + 1)} / ${pad(kinds.length)}` : `${pad(kinds.length)} layers`}
                </span>
                {info && <span className="font-medium text-ink">{info.name}</span>}
                {info && info.tokens.length > 0 && <span className="font-mono text-muted">{info.tokens.join(" · ")}</span>}
              </p>
              <p className="mt-1.5 min-h-[3.2em] max-w-[60ch] text-body text-muted">{info?.note}</p>
            </div>
          </div>
        </div>
      )}
      <p aria-live="polite" className="sr-only">
        {open ? `${title}, taken apart in ${kinds.length} layers.` : ""}
      </p>
    </div>
  );
}
