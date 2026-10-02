import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CodeBlock } from "@/components/gallery/code-block";
import { DetailStage } from "@/components/gallery/detail-stage";
import { Container, Dot, Label } from "@/design-system";
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
    <Container>
      <article className="pt-8 sm:pt-12">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-sm font-mono text-label uppercase text-muted transition-colors duration-(--duration-exit) hover:text-ink hover:duration-(--duration-enter)"
        >
          ← Index
        </Link>

        <header className="grid gap-6 pb-12 pt-10 lg:grid-cols-[1fr_minmax(0,420px)] lg:items-end lg:gap-16">
          <div>
            <Label as="p" className="flex items-center gap-2">
              {entry.status && <Dot />}
              <span className="text-ink">No. {number}</span>
              <span aria-hidden>/</span>
              <time dateTime={entry.date}>{formatDate(entry.date)}</time>
            </Label>
            <h1 className="mt-3 font-display text-[clamp(2.75rem,6vw,4.5rem)] leading-[0.98] tracking-[-0.02em] text-ink">
              {entry.title}
            </h1>
          </div>
          <div>
            <p className="text-body text-muted">{entry.description}</p>
            <ul aria-label="Tags" className="mt-4 flex flex-wrap gap-x-3 gap-y-1">
              {entry.tags.map((tag) => (
                <li key={tag}>
                  <Label>#{tag}</Label>
                </li>
              ))}
            </ul>
          </div>
        </header>

        <DetailStage slug={slug} initial={entry.background} />

        <section aria-labelledby="source-heading" className="mt-24">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-4">
            <div>
              <Label as="p">Source · 1 file</Label>
              <h2 id="source-heading" className="mt-2 font-display text-heading text-ink">
                Copy the plate
              </h2>
            </div>
            <Label as="p">React + Tailwind · no deps</Label>
          </div>
          <CodeBlock code={source} filename={filename} />
        </section>

        <nav aria-label="More components" className="mt-24 grid grid-cols-2 gap-4 border-t border-line pt-6">
          {prev ? (
            <Link href={`/c/${prev.slug}`} className="group rounded-sm">
              <Label as="p">← Previous</Label>
              <span className="mt-1 block font-display text-[1.75rem] leading-tight text-ink transition-colors group-hover:text-proof">
                {prev.title}
              </span>
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link href={`/c/${next.slug}`} className="group rounded-sm text-right">
              <Label as="p">Next →</Label>
              <span className="mt-1 block font-display text-[1.75rem] leading-tight text-ink transition-colors group-hover:text-proof">
                {next.title}
              </span>
            </Link>
          )}
        </nav>
      </article>
    </Container>
  );
}
