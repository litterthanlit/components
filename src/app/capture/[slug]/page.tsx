import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Preview } from "@/components/gallery/preview";
import { getEntry, type StageBackground } from "@/registry";
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

  return (
    <main className="grid min-h-screen place-items-center bg-[color-mix(in_oklab,var(--bg)_88%,var(--fg))]">
      <div
        id="capture-frame"
        className="relative overflow-hidden bg-bg"
        style={{ width, height }}
      >
        <div className="absolute inset-0">
          <Preview slug={slug} background={background} zoom={zoom} className="h-full" />
        </div>
        {showLabel && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between px-8 pb-7 text-[15px]">
            <p className="flex items-center gap-2.5 font-medium tracking-tight text-fg">
              <span aria-hidden className="size-2 rounded-full bg-accent" />
              {entry.title}
            </p>
            <p className="font-mono text-[13px] text-subtle">{site.handle}</p>
          </div>
        )}
      </div>
    </main>
  );
}
