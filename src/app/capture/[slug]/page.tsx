import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CaptureStage } from "@/components/gallery/capture-stage";
import { Preview } from "@/components/gallery/preview";
import { Dot } from "@/design-system";
import { getEntry, type StageBackground } from "@/registry";
import { anatomy } from "@/registry/anatomy";
import { site } from "@/site.config";

export const metadata: Metadata = { robots: { index: false } };

const BACKGROUNDS: StageBackground[] = ["grid", "dots", "glow", "plain"];

function num(value: string | string[] | undefined, fallback: number) {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * A chrome-free, fixed-size frame for screenshots and screen recordings.
 * Defaults to 1200×675 (16:9, X/Twitter's in-feed image size).
 *
 * Query params:
 *   theme=light|dark  bg=grid|dots|glow|plain  w=1200  h=675
 *   zoom=1.6          label=0 (hide the watermark)
 *   anatomy=60        take the study apart, this far (0 to 100), for a study
 *                     in src/registry/anatomy.ts
 *   layer=cap         rest on one floor rather than walking down the stack
 */
export default async function CapturePage({ params, searchParams }: PageProps<"/capture/[slug]">) {
  const { slug } = await params;
  const query = await searchParams;
  const entry = getEntry(slug);
  if (!entry) notFound();

  const bgParam = String(query.bg ?? "");
  const background = BACKGROUNDS.includes(bgParam as StageBackground)
    ? (bgParam as StageBackground)
    : (entry.background ?? "grid");
  const width = num(query.w, 1200);
  const height = num(query.h, 675);
  const zoom = num(query.zoom, 1.6);
  const showLabel = query.label !== "0";
  const spread = slug in anatomy && query.anatomy !== undefined ? Math.min(100, Math.max(0, Number(query.anatomy) || 60)) / 100 : null;
  const layer = typeof query.layer === "string" ? query.layer : undefined;

  return (
    <main className="grid min-h-screen place-items-center bg-[color-mix(in_oklab,var(--canvas)_90%,var(--ink))]">
      <div
        id="capture-frame"
        className="relative overflow-hidden bg-panel"
        style={{ width, height }}
      >
        {spread !== null ? (
          <CaptureStage slug={slug} title={entry.title} handle={site.handle} background={background} zoom={zoom} spread={spread} layer={layer} label={showLabel} />
        ) : (
          <div className="absolute inset-0">
            <Preview slug={slug} background={background} zoom={zoom} className="h-full" />
          </div>
        )}
        {spread === null && showLabel && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between px-8 pb-7 text-[15px]">
            <p className="flex items-center gap-2.5 font-medium text-ink">
              <Dot className="scale-125" />
              {entry.title}
            </p>
            <p className="text-muted">{site.handle}</p>
          </div>
        )}
      </div>
    </main>
  );
}
