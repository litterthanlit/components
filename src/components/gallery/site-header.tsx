import Link from "next/link";
import { Container, Dot } from "@/design-system";
import { site } from "@/site.config";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";

const nav = [
  { href: "/", label: "Components" },
  { href: "/system", label: "System" },
];

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
      <CsConsole />
      <Container className="grid gap-10 pb-12 pt-28 cs:hidden sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <p className="text-lead text-ink">
            I build tools for creators.
            <br />
            <span className="text-muted">The craft is in what I leave out.</span>
          </p>
          <p className="mt-6 flex flex-wrap items-center gap-x-2 text-meta text-muted">
            <span>Based in Europe, working remotely</span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1.5">
              <Dot pulse />
              Available for projects
            </span>
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

const prompt = "select-none text-subtle";

/**
 * The footer in the Counter-Strike theme: the developer console, answering
 * `status` with the same details as the default footer, links as VGUI buttons.
 */
function CsConsole() {
  return (
    <Container className="hidden pt-28 cs:block">
      <section aria-labelledby="console-heading" className="bg-surface p-1 shadow-lg">
        <div className="flex items-center justify-between px-2 py-1.5">
          <h2 id="console-heading" className="text-body font-bold text-ink">
            Console
          </h2>
          <span aria-hidden className="grid size-4 place-items-center bg-surface text-[10px] leading-none text-ink shadow-sm">
            ×
          </span>
        </div>
        <div className="bg-panel px-3 py-3 font-mono text-meta leading-relaxed text-ink bevel-in sm:px-4">
          <p>
            <span className={prompt}>] </span>status
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-muted [&_dt]:whitespace-pre">
            <dt>hostname:</dt>
            <dd className="text-ink">{site.links.portfolio.replace("https://", "")}</dd>
            <dt>player  :</dt>
            <dd className="text-ink">
              <span className="text-cs-ct">{site.author}</span> · {site.role}
            </dd>
            <dt>map     :</dt>
            <dd>europe (working remotely)</dd>
            <dt>status  :</dt>
            <dd className="inline-flex items-center gap-1.5 text-accent-strong">
              <Dot pulse />
              available for projects
            </dd>
          </dl>
          <p className="mt-3">
            <span className={prompt}>] </span>say
          </p>
          <p className="text-body text-ink">
            I build tools for creators. <span className="text-muted">The craft is in what I leave out.</span>
          </p>
          <p className="mt-3">
            <span className={prompt}>] </span>
            <span className="select-all">{site.email}</span>
          </p>
          <p aria-hidden>
            <span className={prompt}>] </span>
            <span className="inline-block h-[1.1em] w-[0.6em] translate-y-[0.2em] animate-caret bg-ink" />
          </p>
        </div>
        <ul className="flex flex-wrap justify-end gap-1 px-1 pb-1 pt-2">
          {footerLinks.map((link) => (
            <li key={link.label}>
              <a
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-7 min-w-20 items-center justify-center bg-surface px-3 text-meta text-ink bevel-out hover:text-cs-select active:bevel-in"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </Container>
  );
}
