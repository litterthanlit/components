import type { Metadata } from "next";
import Link from "next/link";
import { SpoolFullscreen, type SpoolFrame } from "@/registry/components/spool";
import { site } from "@/site.config";

export const metadata: Metadata = { title: "Spool" };

/**
 * The roll: 16:9 images in public/spool/, served under the base path. A frame
 * of another shape is cropped to 16:9 about its centre. With the list empty,
 * the page plays the study's painted roll.
 */
const frame = (file: string, alt: string): SpoolFrame => ({ src: `${site.basePath}/spool/${file}`, alt });

const FRAMES: SpoolFrame[] = [
  frame("01.webp", "Blue ink blooming through white haze, a faint smear of orange low on the right"),
  frame("02.webp", "A blue flower blurred outward from a dark, orange-lit centre"),
  frame("03.webp", "A band of deep blue across pale light, orange at the horizon"),
  frame("04.webp", "A blue streak torn diagonally across white"),
  frame("05.webp", "Blue-grey light sweeping right to a point of red, printed with a white border"),
];

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
