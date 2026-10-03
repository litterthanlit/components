import Link from "next/link";
import { Device } from "@/components/device/device";
import { registry } from "@/registry";
import { site } from "@/site.config";

export default function Home() {
  return (
    <>
      <h1 className="sr-only">
        {site.name}: {site.intro}
      </h1>
      <Device studies={registry.map(({ slug, title, tagline, background }) => ({ slug, title, tagline: tagline ?? "", background }))} />

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
