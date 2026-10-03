import Link from "next/link";
import { Container, Dot } from "@/design-system";
import { site } from "@/site.config";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";

// The logo already links home, so the nav only lists what it can't reach.
const nav = [{ href: "/system", label: "System" }];

export function SiteHeader() {
  return (
    <header>
      <Container className="flex h-20 items-center justify-between sm:h-24">
        <Link href="/" aria-label={`${site.author}, ${site.name}`} className="-ml-1 rounded-md">
          <Logo className="h-11 w-auto sm:h-12" />
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-1 text-body">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-2 py-1 text-muted transition-colors duration-(--duration-exit) hover:text-ink hover:duration-(--duration-enter)"
            >
              {item.label}
            </Link>
          ))}
          <a
            href={site.links.portfolio}
            target="_blank"
            rel="noreferrer"
            className="hidden rounded-md px-2 py-1 text-muted transition-colors duration-(--duration-exit) hover:text-ink hover:duration-(--duration-enter) sm:inline-block"
          >
            litt.design ↗
          </a>
          <ThemeToggle className="ml-1" />
        </nav>
      </Container>
    </header>
  );
}

const footerLinks = [
  { href: site.links.x, label: "X" },
  { href: site.links.linkedin, label: "LinkedIn" },
  { href: site.links.contra, label: "Contra" },
  { href: site.links.github, label: "GitHub" },
];

export function SiteFooter() {
  return (
    <footer className="mt-auto">
      <Container className="grid gap-10 pb-12 pt-28 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <p className="text-lead text-ink">
            I build tools for creators.
            <br />
            <span className="text-muted">The craft is in what I leave out.</span>
          </p>
          <p className="mt-6 inline-flex items-center gap-1.5 text-meta text-muted">
            <Dot pulse />
            Available for projects
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:items-end">
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-body">
            {footerLinks.map((link) => (
              <li key={link.label}>
                <a
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted transition-colors duration-(--duration-exit) hover:text-ink hover:duration-(--duration-enter)"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
          <p className="select-all font-mono text-meta text-muted">{site.email}</p>
        </div>
      </Container>
    </footer>
  );
}
