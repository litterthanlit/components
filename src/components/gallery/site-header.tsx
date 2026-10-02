import Link from "next/link";
import { site } from "@/site.config";
import { ThemeToggle } from "./theme-toggle";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-bg/70 backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="group flex items-center gap-2.5 rounded-md text-sm font-medium tracking-tight">
          <span aria-hidden className="relative grid size-5 place-items-center">
            <span className="absolute inset-0 rounded-full bg-accent/20 transition-transform duration-500 ease-out-expo group-hover:scale-125" />
            <span className="size-2 rounded-full bg-accent" />
          </span>
          {site.author}
          <span className="text-subtle">/</span>
          <span className="text-muted">{site.name}</span>
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-1 text-sm">
          <a
            href={site.links.x}
            target="_blank"
            rel="noreferrer"
            className="hidden rounded-full px-3 py-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-fg sm:inline-flex"
          >
            X / Twitter
          </a>
          <a
            href={site.links.portfolio}
            target="_blank"
            rel="noreferrer"
            className="hidden rounded-full px-3 py-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-fg sm:inline-flex"
          >
            Portfolio
          </a>
          <a
            href={site.links.github}
            target="_blank"
            rel="noreferrer"
            aria-label="Source on GitHub"
            className="inline-grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <svg aria-hidden viewBox="0 0 16 16" className="size-4" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
            </svg>
          </a>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-8 text-xs text-subtle sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <p>
          Designed &amp; built by {site.author}. Components are free to use.
        </p>
        <p className="font-mono">
          <a href={site.links.x} target="_blank" rel="noreferrer" className="transition-colors hover:text-fg">
            {site.handle}
          </a>
        </p>
      </div>
    </footer>
  );
}
