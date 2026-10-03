"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/design-system";
import type { StageBackground } from "@/registry";
import { previews } from "@/registry/previews";

type PreviewProps = {
  slug: string;
  /** Draws a panel with this pattern behind the demo. Leave unset for no frame. */
  background?: StageBackground;
  /** "bottom" seats the demo on the box's lower edge, so a caption below reads as its own. */
  align?: "center" | "bottom";
  /** Only mount the demo once it scrolls near the viewport. */
  lazy?: boolean;
  className?: string;
  /** Applied with CSS zoom — enlarges demos for capture frames. */
  zoom?: number;
};

export function Preview({ slug, background, align = "center", lazy = false, className, zoom }: PreviewProps) {
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
    <div
      ref={ref}
      className={cn(
        "relative isolate flex justify-center overflow-hidden",
        align === "bottom" ? "items-end" : "items-center",
        background && "bg-panel",
        className,
      )}
    >
      {/* Pattern fades out toward the edges so it sits behind the component. */}
      {background && (
        <div aria-hidden className={`pointer-events-none absolute inset-0 -z-10 stage-${background} stage-vignette`} />
      )}
      <div className={cn("flex w-full items-center justify-center", align === "bottom" ? "px-6 pb-3 pt-6" : "p-6")} style={zoom ? { zoom } : undefined}>
        {visible && Demo ? <Demo /> : null}
      </div>
    </div>
  );
}
