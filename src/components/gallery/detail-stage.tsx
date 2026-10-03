"use client";

import { useState } from "react";
import { Button, buttonClass, cn } from "@/design-system";
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

// Background picker and frame capture are authoring tools, so they only show in dev.
const authoring = process.env.NODE_ENV === "development";

/** The large interactive stage on a component page, with a replay button. */
export function DetailStage({ slug, initial = "grid" }: { slug: string; initial?: StageBackground }) {
  const [background, setBackground] = useState<StageBackground>(initial);
  const [replay, setReplay] = useState(0);
  const theme = useTheme();

  const captureHref = `/capture/${slug}?bg=${background}&theme=${theme}`;

  return (
    <div>
      <Preview
        key={replay}
        slug={slug}
        background={authoring ? background : undefined}
        className={cn("min-h-[22rem] sm:h-[28rem]", authoring && "rounded-xl shadow-[inset_0_0_0_1px_var(--line)]")}
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        {authoring && (
          <SegmentedControl
            label="Stage background"
            options={backgrounds}
            value={background}
            onChange={(v) => setBackground(v as StageBackground)}
          />
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <Button size="sm" onClick={() => setReplay((n) => n + 1)}>
            <svg aria-hidden viewBox="0 0 16 16" fill="none" className="size-3.5">
              <path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9M2.5 2.5v2.75h2.75" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Replay
          </Button>
          {authoring && (
            <a href={captureHref} target="_blank" rel="noreferrer" className={buttonClass({ variant: "secondary", size: "sm" })}>
              Capture frame ↗<span className="sr-only">(opens in a new tab)</span>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
