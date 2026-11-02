import type { Metadata } from "next";
import Link from "next/link";
import { SpoolFullscreen } from "@/registry/components/spool";
import { spoolRoll } from "@/registry/spool-roll";

export const metadata: Metadata = { title: "Spool" };

/** Spool full screen, outside the player: the strip fills the window, and a hold anywhere spools it. */
export default function SpoolPage() {
  return (
    <main className="fixed inset-0 overflow-hidden">
      <SpoolFullscreen frames={spoolRoll} />
      <Link href="/c/spool" className="fixed right-6 top-5 text-meta text-white/55 transition-colors duration-(--duration-exit) hover:text-white hover:duration-(--duration-enter)">
        Close
      </Link>
    </main>
  );
}
