import Link from "next/link";
import type { CSSProperties } from "react";
import { Dot } from "@/design-system";
import type { RegistryEntry } from "@/registry";
import { Preview } from "./preview";

const statusLabel = { new: "New", "in-progress": "In progress" } as const;

export function GalleryGrid({ entries }: { entries: RegistryEntry[] }) {
  return (
    <section aria-labelledby="components-heading">
      <h2 id="components-heading" className="sr-only">
        Components
      </h2>

      <ul className="grid grid-cols-1 gap-x-12 gap-y-20 md:grid-cols-2">
        {entries.map((entry, index) => (
          <li
            key={entry.slug}
            className="group/card flex animate-enter flex-col [animation-delay:calc(min(var(--i),8)*var(--stagger))]"
            style={{ "--i": index } as CSSProperties}
          >
            <Preview
              slug={entry.slug}
              align="bottom"
              lazy
              className="aspect-[16/11] max-sm:aspect-auto max-sm:min-h-[22rem]"
            />
            <Link href={`/c/${entry.slug}`} className="mt-3 flex items-center gap-2 self-start rounded-md text-body font-medium text-ink">
              {entry.status && <Dot />}
              {entry.title}
              {entry.status && <span className="sr-only">({statusLabel[entry.status]})</span>}
              <span
                aria-hidden
                className="text-muted opacity-0 transition-[opacity,transform] duration-(--duration-exit) ease-out group-hover/card:translate-x-0.5 group-hover/card:opacity-100 group-hover/card:duration-(--duration-enter)"
              >
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
