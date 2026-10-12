"use client";

import { useRef, useState, useSyncExternalStore, type PointerEvent } from "react";
import { site } from "@/site.config";

const query = "(prefers-reduced-motion: reduce)";
const subscribe = (cb: () => void) => {
  const mq = window.matchMedia(query);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

/**
 * Plays the animated mark only while a mouse or pen is over it. At rest the
 * poster shows, the brush-drawn mark; the film fades in over it on hover and
 * starts from the top, and when the pointer leaves it fades out and pauses
 * where it was, so the fade never jumps a frame. Touch has no hover, so on a
 * phone the mark stays still, as it does under reduced motion.
 */
export function useHoverPlay() {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const reduced = useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);

  function start(e: PointerEvent) {
    const v = video.current;
    if (reduced || e.pointerType === "touch" || !v) return;
    v.currentTime = 0;
    setPlaying(true);
    v.play().catch(() => setPlaying(false));
  }

  function stop() {
    setPlaying(false);
    video.current?.pause();
  }

  return { video, playing, reduced, hover: { onPointerEnter: start, onPointerLeave: stop } };
}

/** The poster and the film stacked in one grid cell, the film shown only while it plays. */
export const posterSrc = `${site.basePath}/logo-poster.png`;
export const filmSrc = `${site.basePath}/logo.mp4`;
export const fade = (on: boolean) =>
  `[grid-area:1/1] transition-opacity ease-out ${on ? "opacity-100 duration-(--duration-enter)" : "opacity-0 duration-(--duration-exit)"}`;

/**
 * The animated "Litt" mark from litt.design. Shipped as a 190 KB MP4 instead
 * of the 5 MB GIF, and played only on hover (useHoverPlay). Black-on-white
 * artwork is blended into the canvas (multiply in light, inverted + screen in
 * dark), so it never shows a box.
 */
export function Logo({ className = "" }: { className?: string }) {
  const { video, playing, reduced, hover } = useHoverPlay();
  const blend = "mix-blend-multiply dark:invert dark:mix-blend-screen";

  return (
    <span {...hover} className="inline-grid align-middle">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={posterSrc} alt="" width={240} height={170} className={`${blend} ${className} ${fade(!playing)}`} />
      {!reduced && (
        <video
          ref={video}
          src={filmSrc}
          muted
          loop
          playsInline
          preload="auto"
          aria-hidden
          width={240}
          height={170}
          className={`${blend} ${className} ${fade(playing)}`}
        />
      )}
    </span>
  );
}
