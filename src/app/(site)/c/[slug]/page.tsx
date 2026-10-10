import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CodeBlock } from "@/components/gallery/code-block";
import { DetailStage } from "@/components/gallery/detail-stage";
import { Container, SectionLabel } from "@/design-system";
import { getEntry, getNeighbors, registry } from "@/registry";

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

const quietLink =
  "rounded-md text-body text-muted transition-colors duration-(--duration-exit) hover:text-ink hover:duration-(--duration-enter)";

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
        <Link href="/" className={quietLink}>
          ← Components
        </Link>

        {/* Just the name; the faded number lets the title read first. */}
        <h1 className="pb-6 pt-16 text-display font-medium text-ink sm:pb-8 sm:pt-24">
          <span aria-hidden className="mr-3 tabular-nums text-subtle">
            {number}
          </span>
          {entry.title}
        </h1>

        <DetailStage slug={slug} title={entry.title} initial={entry.background} />

        <section aria-labelledby="source-heading" className="mt-20">
          <SectionLabel id="source-heading" className="mb-4">
            Source
          </SectionLabel>
          <CodeBlock code={source} filename={filename} />
        </section>

        <nav aria-label="More components" className="mt-20 grid grid-cols-2 gap-4 border-t border-line pt-5">
          {prev ? (
            <Link href={`/c/${prev.slug}`} rel="prev" className={quietLink}>
              ← {prev.title}
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link href={`/c/${next.slug}`} rel="next" className={`${quietLink} justify-self-end text-right`}>
              {next.title} →
            </Link>
          )}
        </nav>
      </article>
    </Container>
  );
}
