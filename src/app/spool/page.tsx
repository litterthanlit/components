import type { Metadata } from "next";
import Link from "next/link";
import { SpoolFullscreen, type SpoolFrame } from "@/registry/components/spool";

export const metadata: Metadata = { title: "Spool" };

/**
 * Frames of your own: put 16:9 images in public/spool/ and list them here,
 * as { src: "/studies/spool/01.jpg", alt: "What the image shows" } (public
 * files are served under the base path). While it's empty the page plays the
 * study's painted roll.
 */
const FRAMES: SpoolFrame[] = [];

/** Spool full screen, outside the player: the strip fills the window, and a hold anywhere spools it. */
export default function SpoolPage() {
  return (
    <main className="fixed inset-0 overflow-hidden">
      <SpoolFullscreen frames={FRAMES} />
      <Link href="/c/spool" className="fixed right-6 top-5 text-meta text-white/55 transition-colors duration-(--duration-exit) hover:text-white hover:duration-(--duration-enter)">
        Close
      </Link>
    </main>
  );
}
