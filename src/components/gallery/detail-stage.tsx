"use client";

import { useState } from "react";
import type { StageBackground } from "@/registry";
import { SegmentedControl } from "@/registry/components/segmented-control";
import { Preview } from "./preview";
import { useTheme } from "./theme-toggle";

const backgrounds = [
  { value: "grid", label: "Grid" },
  { value: "dots", label: "Dots" },
  { value: "glow", label: "Glow" },
  { value: "plain", label: "Plain" },
];

/** The large interactive stage on a component page, with capture controls. */
export function DetailStage({ slug, initial = "grid" }: { slug: string; initial?: StageBackground }) {
  const [background, setBackground] = useState<StageBackground>(initial);
  const [replay, setReplay] = useState(0);
  const theme = useTheme();

  const captureHref = `/capture/${slug}?bg=${background}&theme=${theme}`;

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-3 py-2.5">
        <SegmentedControl
          label="Stage background"
          options={backgrounds}
          value={background}
          onChange={(v) => setBackground(v as StageBackground)}
        />
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setReplay((n) => n + 1)}
            className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] text-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <svg aria-hidden viewBox="0 0 16 16" fill="none" className="size-3.5">
              <path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9M2.5 2.5v2.75h2.75" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Replay
          </button>
          <a
            href={captureHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-fg px-3.5 text-[13px] font-medium text-bg transition-opacity hover:opacity-85"
          >
            <svg aria-hidden viewBox="0 0 16 16" fill="none" className="size-3.5">
              <path d="M1.5 5V3a1.5 1.5 0 0 1 1.5-1.5h2M11 1.5h2A1.5 1.5 0 0 1 14.5 3v2M14.5 11v2a1.5 1.5 0 0 1-1.5 1.5h-2M5 14.5H3A1.5 1.5 0 0 1 1.5 13v-2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            Capture frame
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </div>
      </div>
      <Preview key={replay} slug={slug} background={background} className="aspect-[4/3] sm:aspect-video" />
    </div>
  );
}
