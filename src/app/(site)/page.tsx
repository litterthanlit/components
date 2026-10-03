import { GalleryGrid } from "@/components/gallery/gallery-grid";
import { Container } from "@/design-system";
import { registry } from "@/registry";
import { site } from "@/site.config";

export default function Home() {
  return (
    <Container>
      <section className="pb-20 pt-16 sm:pb-28 sm:pt-28">
        <h1 className="max-w-[18ch] animate-enter text-display font-medium text-ink">{site.intro}</h1>
      </section>

      <GalleryGrid entries={registry} />
    </Container>
  );
}
