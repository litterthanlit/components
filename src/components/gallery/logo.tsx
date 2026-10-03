"use client";

import { useSyncExternalStore } from "react";
import { site } from "@/site.config";

const query = "(prefers-reduced-motion: reduce)";
const subscribe = (cb: () => void) => {
  const mq = window.matchMedia(query);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

/**
 * The animated "Litt" mark from litt.design. Shipped as a 210 KB MP4 instead
 * of the 5 MB GIF. Black-on-white artwork is blended into the canvas
 * (multiply in light, inverted + screen in dark), so it never shows a box.
 */
export function Logo({ className = "" }: { className?: string }) {
  const reduced = useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
  const blend = "mix-blend-multiply dark:invert dark:mix-blend-screen";

  if (reduced) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`${site.basePath}/logo-poster.png`} alt="" width={240} height={170} className={`${blend} ${className}`} />;
  }
  return (
    <video
      src={`${site.basePath}/logo.mp4`}
      poster={`${site.basePath}/logo-poster.png`}
      autoPlay
      muted
      loop
      playsInline
      aria-hidden
      width={240}
      height={170}
      className={`${blend} ${className}`}
    />
  );
}
