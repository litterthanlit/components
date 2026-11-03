import type { SpoolFrame } from "@/registry/components/spool";
import { site } from "@/site.config";

/**
 * The photographs Spool plays, on the player and on its page of its own. The
 * files are in public/spool/, served under the base path. Each screen crops a
 * frame to its own shape about the centre: 3:4 on the player, 16:9 on the page.
 * Kept out of the study so its file stays one file, with the painted roll as
 * its fallback.
 */
const frame = (file: string, alt: string): SpoolFrame => ({ src: `${site.basePath}/spool/${file}`, alt });

export const spoolRoll: readonly SpoolFrame[] = [
  frame("01.webp", "Blue ink blooming through white haze, a faint smear of orange low on the right"),
  frame("02.webp", "A blue flower blurred outward from a dark, orange-lit centre"),
  frame("03.webp", "A band of deep blue across pale light, orange at the horizon"),
  frame("04.webp", "A blue streak torn diagonally across white"),
  frame("05.webp", "Blue-grey light sweeping right to a point of red, printed with a white border"),
];
