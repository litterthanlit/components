import Link from "next/link";
import type { CSSProperties } from "react";
import type { RegistryEntry } from "@/registry";
import { site } from "@/site.config";

const link =
  "text-ink underline decoration-line-strong underline-offset-4 transition-colors hover:text-cs-select hover:decoration-cs-select";

/**
 * Home intro for the Counter-Strike theme: a stencil title like the 1.6 main
 * menu, the description as team chat, and the newest components as the
 * kill feed. Rendered alongside the default intro; CSS shows one or the other.
 */
export function CsHero({ latest }: { latest: RegistryEntry[] }) {
  return (
    <section className="hidden gap-12 pb-16 pt-10 cs:grid sm:pb-24 sm:pt-16 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
      <div className="min-w-0">
        <p className="animate-enter text-meta uppercase tracking-[0.32em] text-muted">{site.author} presents</p>
        <h1 className="mt-2 animate-enter font-stencil text-[clamp(2.75rem,11vw,5.25rem)] uppercase leading-[0.88] text-ink [animation-delay:var(--stagger)] [text-shadow:3px_3px_0_rgb(0_0_0/0.45)]">
          Components
        </h1>
        <p className="mt-3 animate-enter font-stencil text-body uppercase tracking-[0.2em] text-cs-hud [animation-delay:calc(2*var(--stagger))]">
          Interface Offensive · v1.6
        </p>

        <div className="mt-10 flex max-w-[600px] flex-col gap-2 animate-enter [animation-delay:calc(3*var(--stagger))]">
          <p className="text-lead text-ink">
            <span className="text-cs-ct">(Counter-Terrorist) {site.author}</span> : {site.description}
          </p>
          <p className="text-body text-muted">
            Console: Posted on{" "}
            <a href={site.links.x} target="_blank" rel="noreferrer" className={link}>
              X
            </a>{" "}
            as I make them. Source on{" "}
            <a href={site.links.github} target="_blank" rel="noreferrer" className={link}>
              GitHub
            </a>
            .
          </p>
        </div>
      </div>

      <aside aria-labelledby="killfeed-heading" className="lg:pt-2">
        <h2 id="killfeed-heading" className="sr-only">
          Latest components
        </h2>
        <ol className="flex flex-col items-start gap-1 lg:items-end">
          {latest.map((entry, i) => (
            <li
              key={entry.slug}
              className="animate-frag [animation-delay:calc(300ms+var(--i)*350ms)]"
              style={{ "--i": i } as CSSProperties}
            >
              <Link
                href={`/c/${entry.slug}`}
                className="group inline-flex items-center gap-2.5 bg-black/35 px-2.5 py-1 text-body whitespace-nowrap transition-colors hover:bg-black/55"
              >
                <span className="text-cs-ct">{site.author}</span>
                <span className="sr-only">shipped</span>
                <Rifle />
                {entry.status === "new" && <Headshot />}
                <span className="text-cs-t underline-offset-4 group-hover:underline">{entry.title}</span>
                {entry.status === "new" && <span className="sr-only">(new)</span>}
              </Link>
            </li>
          ))}
        </ol>
      </aside>
    </section>
  );
}

function Rifle() {
  return (
    <svg aria-hidden viewBox="0 0 40 14" className="h-3.5 w-auto shrink-0 text-cs-hud" fill="currentColor">
      <path d="M0 4 9 3h19v1h12v1.6H28v1.9h-6.5l1 5H19l-1.5-5H14l-1 4.5h-2.5l.5-4.5H9l-7 3H0z" />
      <path d="M35 2.4h1.4V4H35z" />
    </svg>
  );
}

/** Marks entries with status "new", like the headshot icon in the feed. */
function Headshot() {
  return (
    <svg aria-hidden viewBox="0 0 14 14" className="size-3.5 shrink-0 text-cs-hud" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="7" cy="6" r="4.2" />
      <path d="M4.5 13h5M1 1l3 3M13 1l-3 3" />
    </svg>
  );
}
