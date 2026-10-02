"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { Dot, Halftone, Label, Plate, cn } from "@/design-system";
import { formatDate, registry, type RegistryEntry } from "@/registry";
import { Preview } from "./preview";

const statusLabel = { new: "New", "in-progress": "In progress" } as const;

const tagLabels: Record<string, string> = { a11y: "A11y", css: "CSS", svg: "SVG", webgl: "WebGL", ai: "AI" };
const tagLabel = (tag: string) => tagLabels[tag] ?? tag[0].toUpperCase() + tag.slice(1);

/** Plate number, stable across filters: its position in the full registry. */
const plateNo = (slug: string) => String(registry.findIndex((e) => e.slug === slug) + 1).padStart(2, "0");

export function GalleryGrid({ entries, tags }: { entries: RegistryEntry[]; tags: string[] }) {
  const [active, setActive] = useState<string | null>(null);
  const filtered = active ? entries.filter((e) => e.tags.includes(active)) : entries;

  return (
    <section aria-labelledby="components-heading">
      <div className="flex flex-col gap-5 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Label as="p">Index · {String(filtered.length).padStart(2, "0")} plates</Label>
          <h2 id="components-heading" className="mt-2 font-display text-heading text-ink">
            {active ? tagLabel(active) : "Every proof"}
          </h2>
        </div>
        <div role="group" aria-label="Filter by tag" className="flex flex-wrap gap-1">
          {[null, ...tags].map((tag) => {
            const pressed = active === tag;
            return (
              <button
                key={tag ?? "all"}
                type="button"
                aria-pressed={pressed}
                onClick={() => setActive(tag)}
                className={cn(
                  "h-7 rounded-sm px-2 font-mono text-label uppercase transition-[background-color,color,box-shadow] duration-(--duration-exit) ease-out hover:duration-(--duration-enter) active:scale-[0.97]",
                  pressed ? "bg-ink text-canvas" : "text-muted shadow-[inset_0_0_0_1px_var(--line)] hover:text-ink hover:shadow-[inset_0_0_0_1px_var(--line-strong)]",
                )}
              >
                {tag ? tagLabel(tag) : "All"}
              </button>
            );
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyPlate onReset={() => setActive(null)} />
      ) : (
        <ul className="mt-12 grid grid-cols-1 gap-x-8 gap-y-16 md:grid-cols-2">
          {filtered.map((entry, index) => {
            // The newest plate leads, full width: an editorial opener.
            const lead = index === 0 && !active;
            return (
              // Keyed by filter too, so changing the filter replays the staggered entrance.
              <li
                key={`${active ?? "all"}:${entry.slug}`}
                className={cn(
                  "group/card flex animate-enter flex-col [animation-delay:calc(min(var(--i),8)*var(--stagger))]",
                  lead && "md:col-span-2",
                )}
                style={{ "--i": index } as CSSProperties}
              >
                <Plate className="rounded-xl">
                  <Preview
                    slug={entry.slug}
                    background={entry.background}
                    lazy
                    className={cn(
                      "rounded-xl shadow-[inset_0_0_0_1px_var(--line)] max-sm:aspect-auto max-sm:min-h-[22rem]",
                      lead ? "aspect-[16/11] md:aspect-[21/9]" : "aspect-[16/11]",
                    )}
                  />
                </Plate>
                <Link href={`/c/${entry.slug}`} className="mt-5 block rounded-sm">
                  <span className="flex items-center justify-between gap-4">
                    <Label className="flex items-center gap-2">
                      <span className="text-ink">No. {plateNo(entry.slug)}</span>
                      <span aria-hidden>/</span>
                      {entry.tags.slice(0, 2).map(tagLabel).join(" · ")}
                    </Label>
                    <Label>
                      <time dateTime={entry.date}>{formatDate(entry.date)}</time>
                    </Label>
                  </span>
                  <span className="mt-2 flex items-baseline gap-3">
                    <span className={cn("font-display text-ink", lead ? "text-[2.5rem] leading-none" : "text-[1.875rem] leading-[1.05]")}>
                      {entry.title}
                    </span>
                    {entry.status && (
                      <span className="inline-flex items-center gap-1.5 text-meta text-muted">
                        <Dot />
                        {statusLabel[entry.status]}
                      </span>
                    )}
                    <span
                      aria-hidden
                      className="ml-auto text-proof opacity-0 transition-[opacity,transform] duration-(--duration-exit) ease-out group-hover/card:translate-x-0.5 group-hover/card:opacity-100 group-hover/card:duration-(--duration-enter)"
                    >
                      →
                    </span>
                  </span>
                  <span className="mt-1.5 block max-w-[52ch] text-body text-muted">{entry.tagline ?? entry.description}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Empty state: a blank plate, still held by its crop marks. */
function EmptyPlate({ onReset }: { onReset: () => void }) {
  return (
    <Plate className="relative mt-12 grid min-h-72 place-items-center overflow-hidden rounded-xl bg-panel p-10 text-center">
      <Halftone
        image="radial-gradient(circle at 50% 50%, #666 0, #fff 60%)"
        pitch={8}
        density={0.35}
        className="absolute inset-0"
      />
      <div className="relative">
        <Label as="p">Nothing pulled</Label>
        <p className="mt-2 font-display text-heading text-ink">No proofs for this tag yet.</p>
        <button type="button" onClick={onReset} className="mt-4 text-body text-ink underline decoration-line-strong underline-offset-4 hover:decoration-proof">
          Show every plate
        </button>
      </div>
    </Plate>
  );
}
