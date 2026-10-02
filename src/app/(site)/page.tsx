import { GalleryGrid } from "@/components/gallery/gallery-grid";
import { Container } from "@/design-system";
import { allTags, registry } from "@/registry";
import { site } from "@/site.config";

export default function Home() {
  return (
    <Container>
      <section className="max-w-[560px] pb-20 pt-12 sm:pb-28 sm:pt-24">
        <h1 className="animate-enter text-body">
          <span className="font-medium text-ink">{site.name}</span>
          <span className="text-muted"> · {site.author}</span>
        </h1>
        <p className="mt-3 animate-enter text-lead text-ink [animation-delay:var(--stagger)]">{site.description}</p>
        <p className="mt-4 animate-enter text-body text-muted [animation-delay:calc(2*var(--stagger))]">
          Posted on{" "}
          <a href={site.links.x} target="_blank" rel="noreferrer" className="text-ink underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-ink">
            X
          </a>{" "}
          as I make them. Source on{" "}
          <a href={site.links.github} target="_blank" rel="noreferrer" className="text-ink underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-ink">
            GitHub
          </a>
          .
        </p>
      </section>

      <GalleryGrid entries={registry} tags={allTags} />
    </Container>
  );
}
