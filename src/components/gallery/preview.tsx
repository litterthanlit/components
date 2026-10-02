"use client";

import { useEffect, useRef, useState } from "react";
import { previews } from "@/registry/previews";
import type { StageBackground } from "@/registry";

type PreviewProps = {
  slug: string;
  background?: StageBackground;
  /** Only mount the demo once it scrolls near the viewport. */
  lazy?: boolean;
  className?: string;
  /** Applied with CSS zoom — enlarges demos for capture frames. */
  zoom?: number;
};

export function Preview({ slug, background = "grid", lazy = false, className = "", zoom }: PreviewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(!lazy);
  const Demo = previews[slug];

  useEffect(() => {
    if (visible || !ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <div ref={ref} className={`relative isolate flex items-center justify-center overflow-hidden stage-${background} ${className}`}>
      {/* Faded border on the pattern so it sits behind the component, not around it. */}
      <div aria-hidden className={`pointer-events-none absolute inset-0 -z-10 stage-${background} stage-vignette`} />
      <div className="flex w-full items-center justify-center p-6" style={zoom ? { zoom } : undefined}>
        {visible && Demo ? <Demo /> : null}
      </div>
    </div>
  );
}
