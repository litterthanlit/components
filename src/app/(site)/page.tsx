import { GalleryGrid } from "@/components/gallery/gallery-grid";
import { Container, Dot, Halftone, Label, Plate } from "@/design-system";
import { allTags, formatDate, registry } from "@/registry";
import { site } from "@/site.config";

// The hero print: a low sun over a horizon, in ink. Dark = more ink. The
// screen thresholds at 50% grey, so keep the darkest stop near #9c9c9c or
// the dots merge into a solid.
const heroImage = [
  "radial-gradient(circle at 74% 46%, #9c9c9c 0, #a2a2a2 19%, #dadada 20.5%, #f2f2f2 28%, #fff 36%)",
  "linear-gradient(180deg, #fff 0%, #fff 58%, #bdbdbd 58.4%, #f2f2f2 100%)",
].join(", ");

export default function Home() {
  const latest = registry.reduce((a, b) => (a.date > b.date ? a : b));
  const webgl = registry.filter((e) => e.tags.includes("webgl")).length;

  return (
    <>
      {/* Card on bleed: a proof sheet laid on a full-bleed halftone print. */}
      <section aria-labelledby="hero-heading" className="relative isolate overflow-hidden border-y border-line bg-panel">
        <Halftone image={heroImage} pitch={7} density={0.55} className="absolute inset-0 -z-10" />
        <Container className="py-14 sm:py-24">
          <Plate className="max-w-[640px] animate-enter rounded-xl bg-surface p-6 shadow-lg sm:p-10">
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
              <Label>Proof sheet · Vol. 01</Label>
              <Label className="flex items-center gap-2">
                <Dot pulse /> Last pull {formatDate(latest.date)}
              </Label>
            </div>

            <h1
              id="hero-heading"
              className="mt-8 font-display text-headline text-ink"
            >
              Small studies in motion, feedback <em className="text-muted">&amp;</em> touch.
            </h1>

            <p className="mt-6 max-w-[46ch] text-lead text-muted">
              Interface components by {site.author}. Each one is pulled like a proof: inked, checked, then pinned up
              as a single file you can copy.
            </p>

            <p className="mt-4 text-body text-muted">
              Posted on{" "}
              <a href={site.links.x} target="_blank" rel="noreferrer" className="text-ink underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-proof">
                X<span className="sr-only"> (opens in a new tab)</span>
              </a>{" "}
              as I make them. Source on{" "}
              <a href={site.links.github} target="_blank" rel="noreferrer" className="text-ink underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-proof">
                GitHub<span className="sr-only"> (opens in a new tab)</span>
              </a>
              .
            </p>

            {/* KPI strip: the proof's slug line. */}
            <dl className="mt-10 grid grid-cols-3 border-t border-line pt-4">
              {[
                ["Plates", String(registry.length).padStart(2, "0")],
                ["WebGL", String(webgl).padStart(2, "0")],
                ["Deps", "React + TW"],
              ].map(([term, value]) => (
                <div key={term} className="flex flex-col gap-1">
                  <Label as="dt">{term}</Label>
                  <dd className="font-mono text-body tabular-nums text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          </Plate>
        </Container>
      </section>

      <Container className="pt-16 sm:pt-24">
        <GalleryGrid entries={registry} tags={allTags} />
      </Container>
    </>
  );
}
