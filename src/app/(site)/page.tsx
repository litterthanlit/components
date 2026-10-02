import { GalleryGrid } from "@/components/gallery/gallery-grid";
import { allTags, formatDate, registry } from "@/registry";
import { site } from "@/site.config";

export default function Home() {
  const latest = registry.reduce((a, b) => (a.date > b.date ? a : b));

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <section className="grid grid-cols-1 gap-10 pb-16 pt-16 sm:pt-24 lg:grid-cols-12 lg:gap-8 lg:pb-24 lg:pt-32">
        <div className="lg:col-span-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-subtle">
            Vol. 01 — Interface studies
          </p>
          <h1 className="mt-6 text-[clamp(2.5rem,6vw,4.75rem)] font-medium leading-[0.98] tracking-[-0.045em] text-fg">
            Small details,
            <br />
            <span className="text-subtle">carefully made.</span>
          </h1>
        </div>
        <div className="flex flex-col justify-end gap-8 lg:col-span-4">
          <p className="max-w-sm text-[15px] leading-relaxed text-muted">{site.description}</p>
          <dl className="grid max-w-sm grid-cols-2 gap-6 border-t border-border pt-5">
            <div>
              <dt className="text-xs text-subtle">Components</dt>
              <dd className="mt-1 font-mono text-2xl tracking-tight text-fg">
                {String(registry.length).padStart(2, "0")}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-subtle">Last drop</dt>
              <dd className="mt-1 text-sm text-fg">
                <time dateTime={latest.date}>{formatDate(latest.date)}</time>
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <div className="pb-24">
        <GalleryGrid entries={registry} tags={allTags} />
      </div>
    </div>
  );
}
