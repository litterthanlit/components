import type { Metadata } from "next";
import { SymbioteLab, SymbioteRender } from "@/components/lab/symbiote-lab";

export const metadata: Metadata = {
  title: "Symbiote Field",
  description: "A needle field that wakes up and notices you.",
};

function num(value: string | string[] | undefined, fallback: number) {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * The Symbiote Field on its own: full bleed, with a timeline to scrub and
 * replay, and a second field driven by scroll.
 *
 * `?render=1` drops the page to a bare canvas of `w` × `h` with
 * `window.symbiote.frame(frame)`, which renders one frame and returns it as a
 * PNG. scripts/record-symbiote.mjs drives it to make a video.
 */
export default async function SymbiotePage({ searchParams }: PageProps<"/lab/symbiote-field">) {
  const query = await searchParams;
  if (query.render !== undefined) {
    return <SymbioteRender width={num(query.w, 1280)} height={num(query.h, 720)} needles={query.needles === undefined ? undefined : num(query.needles, 1)} />;
  }
  return <SymbioteLab />;
}
