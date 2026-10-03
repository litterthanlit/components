import Link from "next/link";
import type { CSSProperties } from "react";
import { Dot, SectionLabel } from "@/design-system";
import { formatDate, type RegistryEntry } from "@/registry";
import { Preview } from "./preview";

const statusLabel = { new: "New", "in-progress": "In progress" } as const;

export function GalleryGrid({ entries }: { entries: RegistryEntry[] }) {
  return (
    <section aria-labelledby="components-heading">
      <SectionLabel id="components-heading">
        Components <span className="tabular-nums text-subtle">{entries.length}</span>
      </SectionLabel>

      <ul className="mt-6 grid grid-cols-1 gap-x-5 gap-y-10 md:grid-cols-2">
        {entries.map((entry, index) => (
          <li
            key={entry.slug}
            className="group/card flex animate-enter flex-col [animation-delay:calc(min(var(--i),8)*var(--stagger))]"
            style={{ "--i": index } as CSSProperties}
          >
            <Preview
              slug={entry.slug}
              background={entry.background}
              lazy
              className="aspect-[16/11] rounded-xl shadow-[inset_0_0_0_1px_var(--line)] transition-shadow duration-(--duration-exit) group-hover/card:shadow-[inset_0_0_0_1px_var(--line-strong)] group-hover/card:duration-(--duration-enter) max-sm:aspect-auto max-sm:min-h-[22rem]"
            />
            <Link href={`/c/${entry.slug}`} className="mt-3 flex items-baseline justify-between gap-4 rounded-md">
              <span className="flex items-center gap-2 text-body font-medium text-ink">
                {entry.status && <Dot />}
                {entry.title}
                {entry.status && <span className="sr-only">({statusLabel[entry.status]})</span>}
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
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
