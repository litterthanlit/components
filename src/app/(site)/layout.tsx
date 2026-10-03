import { SiteFooter, SiteHeader } from "@/components/gallery/site-header";
import { SoundRuntime } from "@/components/sound/sound-runtime";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div aria-hidden className="atmosphere pointer-events-none fixed inset-0 -z-10" />
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-ink px-3 py-1.5 text-body text-canvas focus:not-sr-only focus:fixed focus:left-4 focus:top-3"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
      <SoundRuntime />
    </>
  );
}
