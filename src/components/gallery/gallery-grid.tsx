"use client";

import Link from "next/link";
import { useState } from "react";
import { Dot, SectionLabel, cn } from "@/design-system";
import { formatDate, type RegistryEntry } from "@/registry";
import { Preview } from "./preview";

const statusLabel = { new: "New", "in-progress": "In progress" } as const;

const tagLabels: Record<string, string> = { a11y: "Accessibility", css: "CSS", svg: "SVG", webgl: "WebGL" };
const tagLabel = (tag: string) => tagLabels[tag] ?? tag[0].toUpperCase() + tag.slice(1);

export function GalleryGrid({ entries, tags }: { entries: RegistryEntry[]; tags: string[] }) {
  const [active, setActive] = useState<string | null>(null);
  const filtered = active ? entries.filter((e) => e.tags.includes(active)) : entries;

  return (
    <section aria-labelledby="components-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SectionLabel id="components-heading">
          Components <span className="tabular-nums text-subtle">{filtered.length}</span>
        </SectionLabel>
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
                  "h-6 rounded-full px-2.5 text-meta transition-[background-color,color,box-shadow] duration-(--duration-exit) ease-out hover:duration-(--duration-enter) active:scale-[0.97]",
                  pressed ? "bg-ink text-canvas" : "text-muted hover:bg-panel hover:text-ink",
                )}
              >
                {tag ? tagLabel(tag) : "All"}
              </button>
            );
          })}
        </div>
      </div>

      <ul className="mt-6 grid grid-cols-1 gap-x-5 gap-y-10 md:grid-cols-2">
        {filtered.map((entry) => (
          <li key={entry.slug} className="group/card flex animate-enter flex-col">
            <Preview
              slug={entry.slug}
              background={entry.background}
              lazy
              className="aspect-[16/11] rounded-xl shadow-[inset_0_0_0_1px_var(--line)] transition-shadow duration-(--duration-exit) group-hover/card:shadow-[inset_0_0_0_1px_var(--line-strong)] group-hover/card:duration-(--duration-enter) max-sm:aspect-auto max-sm:min-h-[22rem]"
            />
            <Link href={`/c/${entry.slug}`} className="mt-3 block rounded-md">
              <span className="flex items-baseline justify-between gap-4">
                <span className="flex items-center gap-2 text-body font-medium text-ink">
                  {entry.status && <Dot />}
                  {entry.title}
                  {entry.status && (
                    <span className="font-normal text-muted">({statusLabel[entry.status]})</span>
                  )}
                  <span
                    aria-hidden
                    className="text-muted opacity-0 transition-[opacity,transform] duration-(--duration-exit) ease-out group-hover/card:translate-x-0.5 group-hover/card:opacity-100 group-hover/card:duration-(--duration-enter)"
                  >
                    →
                  </span>
                </span>
                <time dateTime={entry.date} className="shrink-0 text-meta tabular-nums text-muted">
                  {formatDate(entry.date)}
                </time>
              </span>
              <span className="mt-0.5 block text-body text-muted">{entry.tagline ?? entry.description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
