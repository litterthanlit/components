import Link from "next/link";
import { Container } from "@/design-system";
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
          {/* Same domain, different app: a plain <a> for a full page load. */}
          <a
            href={site.links.portfolio}
            className="hidden rounded-md px-2 py-1 text-muted transition-colors duration-(--duration-exit) hover:text-ink hover:duration-(--duration-enter) sm:inline-block"
          >
            litt.design
          </a>
          <ThemeToggle className="ml-1" />
        </nav>
      </Container>
    </header>
  );
}

const quietLink =
  "text-muted transition-colors duration-(--duration-exit) hover:text-ink hover:duration-(--duration-enter)";

const footerLinks = [
  { href: site.links.x, label: "X" },
  { href: site.links.linkedin, label: "LinkedIn" },
  { href: site.links.contra, label: "Contra" },
  { href: site.links.github, label: "GitHub" },
];

export function SiteFooter() {
  return (
    <footer className="mt-auto">
      <Container className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3 pb-12 pt-32 text-body">
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {footerLinks.map((link) => (
            <li key={link.label}>
              <a href={link.href} target="_blank" rel="noreferrer" className={quietLink}>
                {link.label}
              </a>
            </li>
          ))}
        </ul>
        <a href={`mailto:${site.email}`} className={quietLink}>
          {site.email}
        </a>
      </Container>
    </footer>
  );
}
