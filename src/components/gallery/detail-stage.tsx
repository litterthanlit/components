"use client";

import { useState } from "react";
import { Button, Label, Plate, buttonClass } from "@/design-system";
import type { StageBackground } from "@/registry";
import { SegmentedControl } from "@/registry/components/segmented-control";
import { Preview } from "./preview";
import { useTheme } from "./theme-toggle";

const backgrounds = [
  { value: "grid", label: "Grid" },
  { value: "dots", label: "Dots" },
  { value: "glow", label: "Bloom" },
  { value: "plain", label: "Plain" },
];

/** The large interactive stage on a component page, with capture controls. */
export function DetailStage({ slug, initial = "grid" }: { slug: string; initial?: StageBackground }) {
  const [background, setBackground] = useState<StageBackground>(initial);
  const [replay, setReplay] = useState(0);
  const theme = useTheme();

  const captureHref = `/capture/${slug}?bg=${background}&theme=${theme}`;

  return (
    <div>
      <Plate active className="rounded-xl">
        <Preview
          key={replay}
          slug={slug}
          background={background}
          className="aspect-[4/3] rounded-xl shadow-[inset_0_0_0_1px_var(--line)] sm:aspect-[16/9]"
        />
      </Plate>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          label="Stage background"
          options={backgrounds}
          value={background}
          onChange={(v) => setBackground(v as StageBackground)}
        />
        <div className="flex items-center gap-1.5">
          <Label className="mr-2 hidden sm:inline">
            Stage / {background === "glow" ? "bloom" : background} · {theme}
          </Label>
          <Button variant="ghost" size="sm" onClick={() => setReplay((n) => n + 1)}>
            <svg aria-hidden viewBox="0 0 16 16" fill="none" className="size-3.5">
              <path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9M2.5 2.5v2.75h2.75" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Replay
          </Button>
          <a href={captureHref} target="_blank" rel="noreferrer" className={buttonClass({ variant: "secondary", size: "sm" })}>
            Capture frame ↗<span className="sr-only">(opens in a new tab)</span>
          </a>
        </div>
      </div>
    </div>
  );
}
