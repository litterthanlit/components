"use client";

import { useState } from "react";
import type { Finish } from "@/components/anatomy/anatomy";
import { useWalk } from "@/components/anatomy/walk";
import { Dot } from "@/design-system";
import type { StageBackground } from "@/registry";
import { partInfo } from "@/registry/anatomy";
import { Preview } from "./preview";

/**
 * A capture frame's stage with the study taken apart: it opens at once, at
 * the spread asked for, and either rests on one floor (`layer`) or walks
 * down the stack, so a recording moves on its own. The watermark names the
 * floor on show beside the study.
 */
export function CaptureStage({
  slug,
  title,
  handle,
  background,
  zoom,
  spread: initial,
  finish,
  layer,
  label,
}: {
  slug: string;
  title: string;
  handle: string;
  background: StageBackground;
  zoom: number;
  /** 0 to 1. */
  spread: number;
  finish: Finish;
  layer?: string;
  label: boolean;
}) {
  const [spread, setSpread] = useState(initial);
  const [kinds, setKinds] = useState<string[]>([]);
  const [picked, setPicked] = useState<string | null>(layer ?? null);
  const walk = useWalk(!layer, kinds, setPicked);
  const info = picked ? partInfo(slug, picked) : null;

  return (
    <>
      <div className="absolute inset-0">
        <Preview
          slug={slug}
          background={background}
          zoom={zoom}
          className="h-full"
          anatomy={{
            slug,
            open: true,
            finish,
            spread,
            picked,
            label: `Layers of ${title}`,
            onKinds: (next) => setKinds((prev) => (prev.join() === next.join() ? prev : next)),
            onPick: (kind) => {
              walk.touch();
              setPicked(kind);
            },
            onSpread: (v) => {
              walk.touch();
              setSpread(v);
            },
            onClose: () => {},
          }}
        />
      </div>
      {label && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between px-8 pb-7 text-[15px]">
          <p className="flex items-center gap-2.5 font-medium text-ink">
            <Dot className="scale-125" />
            {title}
            {info && <span key={info.name} className="animate-enter font-normal text-muted">· {info.name}</span>}
          </p>
          <p className="text-muted">{handle}</p>
        </div>
      )}
    </>
  );
}
