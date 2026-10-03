"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { Dot, SectionLabel, cn } from "@/design-system";
import { formatDate, type RegistryEntry } from "@/registry";
import { Preview } from "./preview";

const statusLabel = { new: "New", "in-progress": "In progress" } as const;

const tagLabels: Record<string, string> = { a11y: "Accessibility", css: "CSS", svg: "SVG", webgl: "WebGL", ai: "AI" };
const tagLabel = (tag: string) => tagLabels[tag] ?? tag[0].toUpperCase() + tag.slice(1);

export function GalleryGrid({ entries, tags }: { entries: RegistryEntry[]; tags: string[] }) {
  const [active, setActive] = useState<string | null>(null);
  const filtered = active ? entries.filter((e) => e.tags.includes(active)) : entries;

  return (
    // In the cs theme this becomes a VGUI window: title bar, tabs, sunken body.
    <section aria-labelledby="components-heading" className="cs:bg-surface cs:p-1 cs:shadow-lg">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between cs:gap-2 cs:sm:flex-col cs:sm:items-stretch">
        <div className="flex items-center justify-between cs:px-2 cs:pt-1.5">
          <SectionLabel id="components-heading" className="cs:font-bold cs:text-ink">
            Components <span className="tabular-nums text-subtle cs:font-normal cs:text-muted">{filtered.length}</span>
          </SectionLabel>
          {/* Decorative window close box. */}
          <span aria-hidden className="hidden size-4 place-items-center bg-surface text-[10px] leading-none text-ink shadow-sm cs:grid">
            ×
          </span>
        </div>
        <div role="group" aria-label="Filter by tag" className="flex flex-wrap gap-1 cs:gap-0.5 cs:px-1">
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
                  "cs:h-7 cs:rounded-none cs:px-3 cs:active:scale-100",
                  pressed
                    ? "bg-ink text-canvas cs:bg-surface cs:text-cs-select cs:bevel-out"
                    : "text-muted hover:bg-panel hover:text-ink cs:bg-surface cs:bevel-out cs:hover:bg-surface cs:hover:text-cs-select cs:active:bevel-in",
                )}
              >
                {tag ? tagLabel(tag) : "All"}
              </button>
            );
          })}
        </div>
      </div>

      <ul className="mt-6 grid grid-cols-1 gap-x-5 gap-y-10 md:grid-cols-2 cs:mt-1 cs:bg-panel cs:p-4 cs:bevel-in cs:sm:p-5">
        {filtered.map((entry, index) => (
          // Keyed by filter too, so changing the filter replays the staggered entrance.
          <li
            key={`${active ?? "all"}:${entry.slug}`}
            className="group/card flex animate-enter flex-col [animation-delay:calc(min(var(--i),8)*var(--stagger))]"
            style={{ "--i": index } as CSSProperties}
          >
            <Preview
              slug={entry.slug}
              background={entry.background}
              lazy
              className="aspect-[16/11] rounded-xl shadow-[inset_0_0_0_1px_var(--line)] transition-shadow duration-(--duration-exit) group-hover/card:shadow-[inset_0_0_0_1px_var(--line-strong)] group-hover/card:duration-(--duration-enter) max-sm:aspect-auto max-sm:min-h-[22rem] cs:bevel-in cs:group-hover/card:shadow-[inset_0_0_0_1px_var(--cs-select)]"
            />
            <Link href={`/c/${entry.slug}`} className="mt-3 block rounded-md">
              <span className="flex items-baseline justify-between gap-4">
                <span className="flex items-center gap-2 text-body font-medium text-ink transition-colors cs:font-bold cs:group-hover/card:text-cs-select">
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
