"use client";

import Link from "next/link";
import { useState } from "react";
import { formatDate, type RegistryEntry } from "@/registry";
import { Preview } from "./preview";

export function GalleryGrid({ entries, tags }: { entries: RegistryEntry[]; tags: string[] }) {
  const [active, setActive] = useState<string | null>(null);
  const filtered = active ? entries.filter((e) => e.tags.includes(active)) : entries;

  return (
    <section aria-labelledby="index-heading">
      <div className="flex flex-col gap-4 border-y border-border py-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="index-heading" className="font-mono text-[11px] uppercase tracking-[0.16em] text-subtle">
          Index · <span className="text-fg">{String(filtered.length).padStart(2, "0")}</span>
        </h2>
        <div role="group" aria-label="Filter by tag" className="flex flex-wrap gap-1.5">
          {[null, ...tags].map((tag) => {
            const pressed = active === tag;
            return (
              <button
                key={tag ?? "all"}
                type="button"
                aria-pressed={pressed}
                onClick={() => setActive(tag)}
                className={`h-7 rounded-full border px-3 text-xs transition-[background-color,border-color,color] duration-200 ${
                  pressed
                    ? "border-fg bg-fg text-bg"
                    : "border-border text-muted hover:border-border-strong hover:text-fg"
                }`}
              >
                {tag ?? "All"}
              </button>
            );
          })}
        </div>
      </div>

      <ul className="mt-8 grid grid-cols-1 gap-x-5 gap-y-10 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((entry) => {
          const number = String(entries.indexOf(entry) + 1).padStart(2, "0");
          return (
            <li
              key={entry.slug}
              className={`group/card flex flex-col gap-4 ${entry.featured && !active ? "lg:col-span-2" : ""}`}
            >
              <Preview
                slug={entry.slug}
                background={entry.background}
                lazy
                className="min-h-[20rem] rounded-2xl border border-border transition-[border-color,box-shadow] duration-500 group-hover/card:border-border-strong group-hover/card:shadow-[0_30px_60px_-30px_rgb(0_0_0/0.35)] md:h-[22rem]"
              />
              <Link
                href={`/c/${entry.slug}`}
                className="flex items-start justify-between gap-4 rounded-lg px-1"
              >
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-[11px] text-subtle">{number}</span>
                  <div>
                    <h3 className="text-[15px] font-medium tracking-tight text-fg">{entry.title}</h3>
                    <p className="mt-1 line-clamp-1 text-sm text-muted">{entry.tagline ?? entry.description}</p>
                  </div>
                </div>
                <span className="flex shrink-0 items-center gap-2 pt-0.5 font-mono text-[11px] text-subtle">
                  <time dateTime={entry.date}>{formatDate(entry.date)}</time>
                  <svg
                    aria-hidden
                    viewBox="0 0 16 16"
                    fill="none"
                    className="size-3.5 -translate-x-1 opacity-0 transition-[transform,opacity] duration-300 ease-out-expo group-hover/card:translate-x-0 group-hover/card:opacity-100"
                  >
                    <path d="M3 8h10m0 0L9 4m4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
