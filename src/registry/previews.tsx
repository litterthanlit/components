"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

/**
 * Lazily-loaded demos, keyed by registry slug. Each demo is its own chunk,
 * so the home page only pays for what scrolls into view.
 */
const loading = () => (
  // Loading state: the plate inking up, a 3×3 screen of halftone dots.
  <span role="status" aria-label="Loading demo" className="grid grid-cols-3 gap-1.5">
    {Array.from({ length: 9 }, (_, i) => (
      <span
        key={i}
        aria-hidden
        className="size-1.5 animate-ink rounded-full bg-ink motion-reduce:animate-none motion-reduce:opacity-40"
        style={{ animationDelay: `${((i % 3) + Math.floor(i / 3)) * 120}ms` }}
      />
    ))}
  </span>
);

export const previews: Record<string, ComponentType> = {
  "gradient-card": dynamic(() => import("./components/gradient-card"), { loading }),
  "agent-run": dynamic(() => import("./components/agent-run"), { loading }),
  "agent-loaders": dynamic(() => import("./components/agent-loaders"), { loading }),
  "dither-card": dynamic(() => import("./components/dither-card"), { loading }),
  "spotlight-card": dynamic(() => import("./components/spotlight-card"), { loading }),
  "toast-stack": dynamic(() => import("./components/toast-stack"), { loading }),
  "hold-to-confirm": dynamic(() => import("./components/hold-to-confirm"), { loading }),
  "number-ticker": dynamic(() => import("./components/number-ticker"), { loading }),
  "segmented-control": dynamic(() => import("./components/segmented-control"), { loading }),
  "magnetic-button": dynamic(() => import("./components/magnetic-button"), { loading }),
  "copy-button": dynamic(() => import("./components/copy-button"), { loading }),
};
