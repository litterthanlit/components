import { GalleryCarousel } from "@/components/gallery/carousel";
import { Container } from "@/design-system";
import { registry } from "@/registry";
import { site } from "@/site.config";

export default function Home() {
  return (
    <>
      <Container>
        <section className="pb-6 pt-10 sm:pb-8 sm:pt-16">
          <h1 className="max-w-[18ch] animate-enter text-display font-medium text-ink">{site.intro}</h1>
        </section>
      </Container>

      {/* Full width, so the neighbouring slides can peek in from the edges. */}
      <GalleryCarousel entries={registry.map(({ slug, title }) => ({ slug, title }))} />
    </>
  );
}
