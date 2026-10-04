import { stat } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import { Device } from "@/components/device/device";
import { registry } from "@/registry";
import { site } from "@/site.config";

export default async function Home() {
  // The readout shows each study's source file and its size, read at build time.
  const studies = await Promise.all(
    registry.map(async ({ slug, title, tagline, description, tags, date, background }) => {
      const file = `${slug}.tsx`;
      const { size } = await stat(path.join(process.cwd(), "src/registry/components", file));
      return { slug, title, tagline: tagline ?? "", description, tags, date, background, file, bytes: size };
    }),
  );

  return (
    <>
      <h1 className="sr-only">
        {site.name}: {site.intro}
      </h1>
      <Device studies={studies} />

      {/* Every page stays one link away for crawlers and screen readers, with or without JS. */}
      <nav aria-label="All components" className="sr-only">
        <ul>
          {registry.map((entry) => (
            <li key={entry.slug}>
              <Link href={`/c/${entry.slug}`} prefetch={false} tabIndex={-1}>
                {entry.title}
              </Link>
            </li>
          ))}
          <li>
            <Link href="/system" tabIndex={-1}>
              Design system
            </Link>
          </li>
        </ul>
      </nav>
    </>
  );
}
