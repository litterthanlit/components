import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CodeBlock } from "@/components/gallery/code-block";
import { DetailStage } from "@/components/gallery/detail-stage";
import { formatDate, getEntry, getNeighbors, registry } from "@/registry";

export const dynamicParams = false;

export function generateStaticParams() {
  return registry.map((entry) => ({ slug: entry.slug }));
}

export async function generateMetadata({ params }: PageProps<"/c/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const entry = getEntry(slug);
  if (!entry) return {};
  return { title: entry.title, description: entry.tagline ?? entry.description };
}

export default async function ComponentPage({ params }: PageProps<"/c/[slug]">) {
  const { slug } = await params;
  const entry = getEntry(slug);
  if (!entry) notFound();

  const filename = `${slug}.tsx`;
  const source = await readFile(path.join(process.cwd(), "src/registry/components", filename), "utf8");
  const { prev, next } = getNeighbors(slug);
  const number = String(registry.indexOf(entry) + 1).padStart(2, "0");

  return (
    <article className="mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
      <nav aria-label="Breadcrumb" className="pt-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-full py-1 text-sm text-muted transition-colors hover:text-fg"
        >
          <svg aria-hidden viewBox="0 0 16 16" fill="none" className="size-3.5">
            <path d="M13 8H3m0 0 4-4M3 8l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Index
        </Link>
      </nav>

      <header className="grid grid-cols-1 gap-8 pb-10 pt-10 lg:grid-cols-12 lg:pt-16">
        <div className="lg:col-span-7">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-subtle">No. {number}</p>
          <h1 className="mt-4 text-4xl font-medium tracking-[-0.04em] text-fg sm:text-5xl">{entry.title}</h1>
          <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted">{entry.description}</p>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 self-end border-t border-border pt-5 text-sm lg:col-span-4 lg:col-start-9">
          <div>
            <dt className="text-xs text-subtle">Published</dt>
            <dd className="mt-1 text-fg">
              <time dateTime={entry.date}>{formatDate(entry.date)}</time>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-subtle">Stack</dt>
            <dd className="mt-1 text-fg">React · Tailwind</dd>
          </div>
          <div className="col-span-2">
            <dt className="sr-only">Tags</dt>
            <dd className="flex flex-wrap gap-1.5">
              {entry.tags.map((tag) => (
                <span key={tag} className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted">
                  {tag}
                </span>
              ))}
            </dd>
          </div>
        </dl>
      </header>

      <DetailStage slug={slug} initial={entry.background} />

      <section aria-labelledby="source-heading" className="mt-16 grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-3">
          <h2 id="source-heading" className="text-sm font-medium text-fg">
            Source
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            One file, no dependencies beyond React and Tailwind. Copy it into your project and adjust the tokens.
          </p>
        </div>
        <div className="min-w-0 lg:col-span-9">
          <CodeBlock code={source} filename={filename} />
        </div>
      </section>

      <nav aria-label="More components" className="mt-20 grid grid-cols-2 gap-4 border-t border-border pt-6">
        {prev ? (
          <Link href={`/c/${prev.slug}`} className="group rounded-lg">
            <span className="text-xs text-subtle">← Previous</span>
            <span className="mt-1 block text-sm font-medium text-fg group-hover:text-accent">{prev.title}</span>
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link href={`/c/${next.slug}`} className="group rounded-lg text-right">
            <span className="text-xs text-subtle">Next →</span>
            <span className="mt-1 block text-sm font-medium text-fg group-hover:text-accent">{next.title}</span>
          </Link>
        )}
      </nav>
    </article>
  );
}
