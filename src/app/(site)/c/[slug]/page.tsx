import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CodeBlock } from "@/components/gallery/code-block";
import { DetailStage } from "@/components/gallery/detail-stage";
import { Badge, Container, Dot, SectionLabel } from "@/design-system";
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
          className="inline-flex items-center gap-1 rounded-md text-body text-muted transition-colors duration-(--duration-exit) hover:text-ink hover:duration-(--duration-enter)"
        >
          ← Components
        </Link>

        <header className="max-w-[560px] pb-10 pt-10">
          <p className="flex items-center gap-2 text-meta text-muted">
            {entry.status && <Dot />}
            <span className="tabular-nums">No. {number}</span>
            <span aria-hidden>·</span>
            <time dateTime={entry.date}>{formatDate(entry.date)}</time>
          </p>
          <h1 className="mt-2 text-title font-medium text-ink">{entry.title}</h1>
          <p className="mt-2 text-body text-muted">{entry.description}</p>
          <ul aria-label="Tags" className="mt-4 flex flex-wrap gap-1.5">
            {entry.tags.map((tag) => (
              <li key={tag}>
                <Badge>{tag}</Badge>
              </li>
            ))}
          </ul>
        </header>

        <DetailStage slug={slug} initial={entry.background} />

        <section aria-labelledby="source-heading" className="mt-20">
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <SectionLabel id="source-heading">Source</SectionLabel>
            <p className="text-meta text-muted">One file. React and Tailwind, nothing else.</p>
          </div>
          <CodeBlock code={source} filename={filename} />
        </section>

        <nav aria-label="More components" className="mt-20 grid grid-cols-2 gap-4 border-t border-line pt-5">
          {prev ? (
            <Link href={`/c/${prev.slug}`} className="group rounded-md">
              <span className="text-meta text-muted">Previous</span>
              <span className="block text-body font-medium text-ink">← {prev.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link href={`/c/${next.slug}`} className="group rounded-md text-right">
              <span className="text-meta text-muted">Next</span>
              <span className="block text-body font-medium text-ink">{next.title} →</span>
            </Link>
          )}
        </nav>
      </article>
    </Container>
  );
}
